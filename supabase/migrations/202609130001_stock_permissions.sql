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
