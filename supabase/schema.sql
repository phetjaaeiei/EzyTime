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
  scanned_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists time_logs_scanned_at_idx on public.time_logs (scanned_at);
create index if not exists time_logs_employee_day_idx on public.time_logs (employee_name, position, scanned_at);

alter table public.admin_users enable row level security;
alter table public.time_logs enable row level security;

drop policy if exists "Admins can read their admin profile" on public.admin_users;
create policy "Admins can read their admin profile"
on public.admin_users
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "Anyone can submit QR time logs" on public.time_logs;
create policy "Anyone can submit QR time logs"
on public.time_logs
for insert
to anon, authenticated
with check (true);

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

-- After creating the admin user in Supabase Auth, paste that user's UUID here:
-- insert into public.admin_users (user_id) values ('00000000-0000-0000-0000-000000000000');
