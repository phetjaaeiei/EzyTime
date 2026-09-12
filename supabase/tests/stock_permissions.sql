\set ON_ERROR_STOP on
begin;
insert into auth.users(id, email) values
('00000000-0000-0000-0000-000000000001', 'admin@test.invalid'),
('00000000-0000-0000-0000-000000000002', 'employee@test.invalid'),
('00000000-0000-0000-0000-000000000003', 'unassigned@test.invalid');
insert into public.admin_users(user_id) values ('00000000-0000-0000-0000-000000000001');
insert into public.stock_items(id, name, unit) values
('10000000-0000-0000-0000-000000000001', 'Assigned', 'unit'),
('10000000-0000-0000-0000-000000000002', 'Other', 'unit');
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', true);
insert into public.employee_stock_positions values ('00000000-0000-0000-0000-000000000002', 'พนักงานเสิร์ฟ');
select public.set_position_stock_items('พนักงานเสิร์ฟ', array['10000000-0000-0000-0000-000000000001']::uuid[]);
insert into public.stock_movements(item_id,type,quantity,user_id) values
('10000000-0000-0000-0000-000000000001','in',20,auth.uid()),
('10000000-0000-0000-0000-000000000002','in',20,auth.uid());
do $$ begin
  if (select count(*) from public.list_stock_employees()) <> 2 then raise exception 'Admin must see both employees'; end if;
  begin
    perform public.set_position_stock_items('พนักงานเสิร์ฟ', array['10000000-0000-0000-0000-000000000099']::uuid[]);
    raise exception 'Expected invalid item rejection';
  exception when raise_exception then
    if sqlerrm = 'Expected invalid item rejection' then raise; end if;
  end;
  if (select count(*) from public.position_stock_items) <> 1 then raise exception 'Failed save must preserve grants'; end if;
end $$;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', true);
do $$ begin
  if (select count(*) from public.stock_items) <> 1 then raise exception 'Employee must only see assigned item'; end if;
  if (select count(*) from public.get_stock_item_balances()) <> 1 then raise exception 'Balances must respect assignment'; end if;
  if (select count(*) from public.stock_movements) <> 0 then raise exception 'Other actors history leaked'; end if;
  begin
    insert into public.stock_movements(item_id,type,quantity,user_id) values ('10000000-0000-0000-0000-000000000002','out',1,auth.uid());
    raise exception 'Unassigned withdrawal allowed';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.stock_movements(item_id,type,quantity,user_id) values ('10000000-0000-0000-0000-000000000001','in',1,auth.uid());
    raise exception 'Employee received inventory';
  exception when insufficient_privilege then null; end;
  begin
    perform public.set_position_stock_items('พนักงานเสิร์ฟ', array['10000000-0000-0000-0000-000000000002']::uuid[]);
    raise exception 'Employee granted themselves permission';
  exception when insufficient_privilege then null; end;
  begin
    perform public.list_stock_employees();
    raise exception 'Employee read account directory';
  exception when insufficient_privilege then null; end;
  update public.employee_stock_positions set position = 'พนักงานเตรียมของ' where user_id = auth.uid();
  if (select position from public.employee_stock_positions where user_id = auth.uid()) <> 'พนักงานเสิร์ฟ' then raise exception 'Employee changed own position'; end if;
end $$;
insert into public.stock_movements(item_id,type,quantity,user_id) values
('10000000-0000-0000-0000-000000000001','out',1,auth.uid()),
('10000000-0000-0000-0000-000000000001','waste',1,auth.uid());
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000003', true);
do $$ begin
  if exists (select 1 from public.stock_items) or exists (select 1 from public.get_stock_item_balances()) then raise exception 'Unassigned user can view inventory'; end if;
end $$;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', true);
select public.set_position_stock_items('พนักงานเสิร์ฟ', '{}'::uuid[]);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', true);
do $$ begin
  begin
    insert into public.stock_movements(item_id,type,quantity,user_id) values ('10000000-0000-0000-0000-000000000001','out',1,auth.uid());
    raise exception 'Revoked employee can still withdraw';
  exception when insufficient_privilege then null; end;
end $$;
rollback;
