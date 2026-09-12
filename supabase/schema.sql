-- EzyTime Supabase schema
-- Run this in Supabase SQL Editor after creating a project.

create extension if not exists pgcrypto;

create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'admin' check (role in ('admin', 'ceo', 'manager')),
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

-- Elevated roles (CEO/Manager) share admin access via is_admin(); only a primary
-- admin (role='admin') may manage roles. See migration 202609130005_staff_roles.
create or replace function public.is_primary_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admin_users where user_id = auth.uid() and role = 'admin');
$$;
revoke all on function public.is_primary_admin() from public;
grant execute on function public.is_primary_admin() to authenticated;

create or replace function public.list_staff_roles()
returns table (user_id uuid, display_name text, email text, role text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_primary_admin() then raise exception 'เฉพาะ admin เท่านั้น' using errcode = '42501'; end if;
  return query
    select account.id,
           coalesce(nullif(account.raw_user_meta_data->>'nickname', ''), nullif(account.raw_user_meta_data->>'full_name', ''), account.email),
           account.email::text,
           staff.role
    from auth.users account
    left join public.admin_users staff on staff.user_id = account.id
    where staff.role is null or staff.role <> 'admin'
    order by account.created_at;
end;
$$;
revoke all on function public.list_staff_roles() from public;
grant execute on function public.list_staff_roles() to authenticated;

create or replace function public.set_staff_role(target_user_id uuid, target_role text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_primary_admin() then raise exception 'เฉพาะ admin เท่านั้น' using errcode = '42501'; end if;
  if target_user_id is null then raise exception 'กรุณาเลือกผู้ใช้'; end if;
  if not exists (select 1 from auth.users where id = target_user_id) then
    raise exception 'ไม่พบบัญชีผู้ใช้';
  end if;
  if exists (select 1 from public.admin_users where user_id = target_user_id and role = 'admin') then
    raise exception 'ไม่สามารถแก้ไขสิทธิ์ของผู้ดูแลหลักได้';
  end if;
  if target_role is null or target_role = '' or target_role = 'none' then
    delete from public.admin_users where user_id = target_user_id and role in ('ceo', 'manager');
  elsif target_role in ('ceo', 'manager') then
    insert into public.admin_users (user_id, role) values (target_user_id, target_role)
      on conflict (user_id) do update set role = excluded.role
      where public.admin_users.role <> 'admin';
  else
    raise exception 'บทบาทไม่ถูกต้อง';
  end if;
end;
$$;
revoke all on function public.set_staff_role(uuid, text) from public;
grant execute on function public.set_staff_role(uuid, text) to authenticated;

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

-- Expose only aggregate stock balances to employees, without revealing other users' movement history.
create or replace function public.get_stock_item_balances()
returns table (item_id uuid, on_hand numeric)
language sql
stable
security definer
set search_path = public
as $$
  select
    item.id as item_id,
    coalesce(sum(
      case movement.type
        when 'in' then movement.quantity
        else -movement.quantity
      end
    ), 0)::numeric as on_hand
  from public.stock_items item
  left join public.stock_movements movement on movement.item_id = item.id
  where item.is_active = true
  group by item.id;
$$;

revoke all on function public.get_stock_item_balances() from public;
grant execute on function public.get_stock_item_balances() to authenticated;

-- Serialize withdrawals per item and reject any operation that would make stock negative.
create or replace function public.prevent_negative_stock()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  current_on_hand numeric;
begin
  if new.type not in ('out', 'waste') then
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(new.item_id::text, 0));
  select coalesce(sum(case when type = 'in' then quantity else -quantity end), 0)
  into current_on_hand
  from public.stock_movements
  where item_id = new.item_id;

  if new.quantity > current_on_hand then
    raise exception 'สินค้าเหลือไม่พอ มีคงเหลือ %', current_on_hand;
  end if;
  return new;
end;
$$;

drop trigger if exists prevent_negative_stock_before_insert on public.stock_movements;
create trigger prevent_negative_stock_before_insert
before insert on public.stock_movements
for each row execute function public.prevent_negative_stock();

-- After creating the admin user in Supabase Auth, paste that user's UUID here:
-- insert into public.admin_users (user_id) values ('00000000-0000-0000-0000-000000000000');
-- Admin-owned positions are independent of employee-entered attendance positions.
begin;
create table if not exists public.employee_stock_positions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  position text not null check (position in ('พนักงานเสิร์ฟ', 'พนักงานล้างจาน', 'พนักงานสไลด์หมู', 'พนักงานเตรียมของ'))
);
create table if not exists public.position_stock_items (
  position text not null check (position in ('พนักงานเสิร์ฟ', 'พนักงานล้างจาน', 'พนักงานสไลด์หมู', 'พนักงานเตรียมของ')),
  item_id uuid not null references public.stock_items(id) on delete cascade,
  primary key (position, item_id)
);
alter table public.employee_stock_positions enable row level security;
alter table public.position_stock_items enable row level security;
grant select, insert, update, delete on public.employee_stock_positions to authenticated;
grant select on public.position_stock_items to authenticated;
revoke insert, update, delete on public.position_stock_items from authenticated;

drop policy if exists "Read assigned position" on public.employee_stock_positions;
create policy "Read assigned position" on public.employee_stock_positions for select to authenticated
using (user_id = auth.uid() or public.is_admin());
drop policy if exists "Admins assign positions" on public.employee_stock_positions;
create policy "Admins assign positions" on public.employee_stock_positions for all to authenticated
using (public.is_admin()) with check (public.is_admin());
drop policy if exists "Read position stock assignments" on public.position_stock_items;
create policy "Read position stock assignments" on public.position_stock_items for select to authenticated
using (public.is_admin() or position in (select position from public.employee_stock_positions where user_id = auth.uid()));

create or replace function public.can_manage_stock_item(target_item_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_admin() or exists (
    select 1 from public.employee_stock_positions employee
    join public.position_stock_items permission on permission.position = employee.position
    join public.stock_items item on item.id = permission.item_id
    where employee.user_id = auth.uid() and item.id = target_item_id and item.is_active
  );
$$;
revoke all on function public.can_manage_stock_item(uuid) from public;
grant execute on function public.can_manage_stock_item(uuid) to authenticated;

-- Replace the former unrestricted employee read/write policies.
drop policy if exists "Authenticated can read stock items" on public.stock_items;
create policy "Authenticated can read stock items" on public.stock_items for select to authenticated
using (public.can_manage_stock_item(id));
drop policy if exists "Users record their own withdrawals" on public.stock_movements;
create policy "Users record their own withdrawals" on public.stock_movements for insert to authenticated
with check (user_id = auth.uid() and (public.is_admin() or (type in ('out', 'waste') and public.can_manage_stock_item(item_id))));

create or replace function public.get_stock_item_balances()
returns table (item_id uuid, on_hand numeric)
language sql stable security definer set search_path = public as $$
  select item.id, coalesce(sum(case movement.type when 'in' then movement.quantity else -movement.quantity end), 0)::numeric
  from public.stock_items item
  left join public.stock_movements movement on movement.item_id = item.id
  where item.is_active and public.can_manage_stock_item(item.id)
  group by item.id;
$$;
revoke all on function public.get_stock_item_balances() from public;
grant execute on function public.get_stock_item_balances() to authenticated;

-- List registered accounts for admin assignment, including people without time logs.
create or replace function public.list_stock_employees()
returns table (user_id uuid, display_name text, email text, "position" text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'เฉพาะ admin เท่านั้น' using errcode = '42501'; end if;
  return query
    select account.id, coalesce(nullif(account.raw_user_meta_data->>'nickname', ''), nullif(account.raw_user_meta_data->>'full_name', ''), account.email, 'พนักงาน'), account.email, employee.position
    from auth.users account
    left join public.employee_stock_positions employee on employee.user_id = account.id
    where not exists (select 1 from public.admin_users admin where admin.user_id = account.id)
    order by account.created_at;
end;
$$;
revoke all on function public.list_stock_employees() from public;
grant execute on function public.list_stock_employees() to authenticated;

-- Replace one position's selection atomically, including an empty selection.
create or replace function public.set_position_stock_items(target_position text, target_item_ids uuid[])
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'เฉพาะ admin เท่านั้น' using errcode = '42501'; end if;
  if target_position is null or target_position not in ('พนักงานเสิร์ฟ', 'พนักงานล้างจาน', 'พนักงานสไลด์หมู', 'พนักงานเตรียมของ') then
    raise exception 'ตำแหน่งไม่ถูกต้อง';
  end if;
  if target_item_ids is null then raise exception 'กรุณาระบุรายการสินค้า'; end if;
  perform pg_advisory_xact_lock(hashtextextended('stock-position:' || target_position, 0));
  if exists (select 1 from unnest(target_item_ids) as selected(id) where not exists (select 1 from public.stock_items item where item.id = selected.id and item.is_active)) then
    raise exception 'พบสินค้าที่ไม่มีอยู่หรือปิดใช้งานแล้ว กรุณารีเฟรช';
  end if;
  delete from public.position_stock_items where position = target_position;
  insert into public.position_stock_items(position, item_id) select target_position, id from (select distinct unnest(target_item_ids) as id) selected;
end;
$$;
revoke all on function public.set_position_stock_items(text, uuid[]) from public;
grant execute on function public.set_position_stock_items(text, uuid[]) to authenticated;
commit;
-- Personal display preferences never grant access to inventory.
begin;
create table if not exists public.user_stock_layouts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  item_ids uuid[] not null default '{}' check (cardinality(item_ids) <= 10000)
);
alter table public.user_stock_layouts enable row level security;
grant select, insert, update, delete on public.user_stock_layouts to authenticated;
drop policy if exists "Users manage own stock layout" on public.user_stock_layouts;
create policy "Users manage own stock layout" on public.user_stock_layouts
for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
commit;

-- Supabase auth.users.email is varchar(255); RETURN QUERY requires exact types.
begin;
create or replace function public.list_stock_employees()
returns table (user_id uuid, display_name text, email text, "position" text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'เฉพาะ admin เท่านั้น' using errcode = '42501'; end if;
  return query
    select account.id, coalesce(nullif(account.raw_user_meta_data->>'nickname', ''), nullif(account.raw_user_meta_data->>'full_name', ''), account.email, 'พนักงาน'), account.email::text, employee.position
    from auth.users account
    left join public.employee_stock_positions employee on employee.user_id = account.id
    where not exists (select 1 from public.admin_users admin where admin.user_id = account.id)
    order by account.created_at;
end;
$$;
revoke all on function public.list_stock_employees() from public;
grant execute on function public.list_stock_employees() to authenticated;

commit;
-- Explicit admin-only hard deletion; all dependent stock records in one transaction.
begin;
create or replace function public.delete_stock_items(target_item_ids uuid[])
returns integer language plpgsql security definer set search_path = public as $$
declare
  selected_ids uuid[];
  found_count integer;
begin
  if not public.is_admin() then raise exception 'เฉพาะ admin เท่านั้น' using errcode = '42501'; end if;
  if target_item_ids is null or cardinality(target_item_ids) = 0 or array_position(target_item_ids, null) is not null then
    raise exception 'กรุณาเลือกสินค้าที่ต้องการลบ' using errcode = '22023';
  end if;
  select array_agg(distinct id order by id) into selected_ids from unnest(target_item_ids) as selected(id);
  -- Row locks block new movements (FK key-share locks) until deletion completes.
  perform id from public.stock_items where id = any(selected_ids) order by id for update;
  get diagnostics found_count = row_count;
  if found_count <> cardinality(selected_ids) then
    raise exception 'บางสินค้าถูกลบไปแล้ว กรุณารีเฟรชและเลือกใหม่' using errcode = 'P0002';
  end if;
  delete from public.stock_movements where item_id = any(selected_ids);
  delete from public.stock_items where id = any(selected_ids);
  -- position_stock_items follows the existing FK ON DELETE CASCADE.
  -- Layouts ignore missing IDs on read; do not overwrite another user's preferences.
  return found_count;
end;
$$;
revoke all on function public.delete_stock_items(uuid[]) from public;
grant execute on function public.delete_stock_items(uuid[]) to authenticated;
commit;
