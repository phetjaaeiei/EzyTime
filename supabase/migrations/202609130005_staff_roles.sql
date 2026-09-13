-- Elevated staff roles: CEO and Manager get admin-equivalent access (is_admin()
-- already covers every admin_users row), but only a primary admin (role='admin')
-- may grant or revoke them. Existing admins default to 'admin'.
begin;
alter table public.admin_users add column if not exists role text not null default 'admin';
alter table public.admin_users drop constraint if exists admin_users_role_check;
alter table public.admin_users add constraint admin_users_role_check check (role in ('admin', 'ceo', 'manager'));

-- Only primary admins may manage roles.
create or replace function public.is_primary_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admin_users where user_id = auth.uid() and role = 'admin');
$$;
revoke all on function public.is_primary_admin() from public;
grant execute on function public.is_primary_admin() to authenticated;

-- List every non-primary-admin account with its current elevated role (null = none).
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

-- Grant or revoke CEO / Manager. Primary admins are protected from any change here.
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
commit;
