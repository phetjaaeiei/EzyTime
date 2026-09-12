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
