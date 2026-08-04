-- EzyTime Supabase schema
-- Run this in Supabase SQL Editor after creating a project.

create extension if not exists pgcrypto;

create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.time_logs (
  id uuid primary key default gen_random_uuid(),
  employee_name text not null check (char_length(trim(employee_name)) between 2 and 100),
  position text not null check (
    position in (
      'พนักงานเสิร์ฟ',
      'พนักงานล้างจาน',
      'พนักงานสไลด์หมู',
      'พนักงานเตรียมของ'
    )
  ),
  event_type text not null check (event_type in ('clock_in', 'clock_out')),
  user_id uuid references auth.users(id),
  scanned_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

-- Projects created before Google login shipped: add the column if the
-- table already existed without it.
alter table public.time_logs
  add column if not exists user_id uuid references auth.users(id);

create index if not exists time_logs_scanned_at_idx on public.time_logs (scanned_at);
create index if not exists time_logs_employee_day_idx on public.time_logs (employee_name, position, scanned_at);

alter table public.admin_users enable row level security;
alter table public.time_logs enable row level security;

grant usage on schema public to anon, authenticated;
grant insert on public.time_logs to authenticated;
revoke insert on public.time_logs from anon;
grant select on public.time_logs to authenticated;
grant select on public.admin_users to authenticated;

drop policy if exists "Admins can read their admin profile" on public.admin_users;
create policy "Admins can read their admin profile"
on public.admin_users
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "Anyone can submit QR time logs" on public.time_logs;
drop policy if exists "Authenticated employees can submit their own time logs" on public.time_logs;
create policy "Authenticated employees can submit their own time logs"
on public.time_logs
for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists "Admins can read time logs" on public.time_logs;
create policy "Admins can read time logs"
on public.time_logs
for select
to authenticated
using (
  exists (
    select 1
    from public.admin_users
    where admin_users.user_id = auth.uid()
  )
);

-- ===== Stock management module =====

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admin_users where user_id = auth.uid());
$$;

create table if not exists public.stock_items (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 1 and 100),
  unit text not null check (char_length(trim(unit)) between 1 and 20),
  category text,
  low_stock_threshold numeric check (low_stock_threshold >= 0),
  is_active boolean not null default true,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.stock_items(id) on delete restrict,
  type text not null check (type in ('in', 'out', 'waste')),
  quantity numeric not null check (quantity > 0),
  note text check (char_length(note) <= 300),
  user_id uuid references auth.users(id),
  actor_name text,
  created_at timestamptz not null default now()
);

create index if not exists stock_movements_item_idx on public.stock_movements (item_id);
create index if not exists stock_movements_created_at_idx on public.stock_movements (created_at);
create index if not exists stock_movements_user_idx on public.stock_movements (user_id);

alter table public.stock_items enable row level security;
alter table public.stock_movements enable row level security;

grant select on public.stock_items to authenticated;
grant insert, update, delete on public.stock_items to authenticated;
grant select, insert, update, delete on public.stock_movements to authenticated;

-- stock_items: everyone signed-in can read; only admins write.
drop policy if exists "Authenticated can read stock items" on public.stock_items;
create policy "Authenticated can read stock items"
on public.stock_items for select to authenticated using (true);

drop policy if exists "Admins manage stock items" on public.stock_items;
create policy "Admins manage stock items"
on public.stock_items for all to authenticated
using (public.is_admin()) with check (public.is_admin());

-- stock_movements: employees insert their own out/waste; admins insert anything.
drop policy if exists "Users record their own withdrawals" on public.stock_movements;
create policy "Users record their own withdrawals"
on public.stock_movements for insert to authenticated
with check (
  user_id = auth.uid()
  and (type in ('out', 'waste') or public.is_admin())
);

drop policy if exists "Read own movements or admin reads all" on public.stock_movements;
create policy "Read own movements or admin reads all"
on public.stock_movements for select to authenticated
using (user_id = auth.uid() or public.is_admin());

drop policy if exists "Admins correct movements" on public.stock_movements;
create policy "Admins correct movements"
on public.stock_movements for update to authenticated
using (public.is_admin()) with check (public.is_admin());

drop policy if exists "Admins delete movements" on public.stock_movements;
create policy "Admins delete movements"
on public.stock_movements for delete to authenticated
using (public.is_admin());

-- After creating the admin user in Supabase Auth, paste that user's UUID here:
-- insert into public.admin_users (user_id) values ('00000000-0000-0000-0000-000000000000');
