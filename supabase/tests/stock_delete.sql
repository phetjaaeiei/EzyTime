\set ON_ERROR_STOP on
begin;
insert into auth.users(id) values ('00000000-0000-0000-0000-000000000021'), ('00000000-0000-0000-0000-000000000022');
insert into public.admin_users(user_id) values ('00000000-0000-0000-0000-000000000021');
insert into public.stock_items(id,name,unit) values
('20000000-0000-0000-0000-000000000001','Delete A','unit'),
('20000000-0000-0000-0000-000000000002','Delete B','unit'),
('20000000-0000-0000-0000-000000000003','Keep C','unit');
insert into public.stock_movements(item_id,type,quantity) select id,'in',10 from public.stock_items;
insert into public.position_stock_items(position,item_id) select 'พนักงานเสิร์ฟ', id from public.stock_items;
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000022',true);
do $$ begin
 begin
  perform public.delete_stock_items(array['20000000-0000-0000-0000-000000000001']::uuid[]);
  raise exception 'Employee can delete inventory';
 exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000021',true);
do $$ begin
 begin
  perform public.delete_stock_items(array['20000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000099']::uuid[]);
  raise exception 'Missing item accepted';
 exception when no_data_found then null; end;
 if (select count(*) from public.stock_items) <> 3 then raise exception 'Partial delete on failure'; end if;
 if public.delete_stock_items(array['20000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000002']::uuid[]) <> 2 then raise exception 'Wrong deleted count'; end if;
 if (select count(*) from public.stock_items) <> 1 then raise exception 'Items not deleted'; end if;
 if (select count(*) from public.stock_movements) <> 1 then raise exception 'History not deleted'; end if;
 if (select count(*) from public.position_stock_items) <> 1 then raise exception 'Permissions not deleted'; end if;
 if not exists(select 1 from public.stock_items where name = 'Keep C') then raise exception 'Unselected item deleted'; end if;
end $$;
rollback;

-- A database failure during deletion must also restore movement history.
begin;
insert into auth.users(id) values ('00000000-0000-0000-0000-000000000021');
insert into public.admin_users(user_id) values ('00000000-0000-0000-0000-000000000021');
insert into public.stock_items(id,name,unit) values ('20000000-0000-0000-0000-000000000001','Rollback fixture','unit');
insert into public.stock_movements(item_id,type,quantity) values ('20000000-0000-0000-0000-000000000001','in',10);
create function public.reject_test_delete() returns trigger language plpgsql as $$ begin raise exception 'Simulated delete failure'; end $$;
create trigger reject_test_delete before delete on public.stock_items for each row execute function public.reject_test_delete();
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000021',true);
do $$ begin
 begin
  perform public.delete_stock_items(array['20000000-0000-0000-0000-000000000001']::uuid[]);
  raise exception 'Expected failure';
 exception when raise_exception then
  if sqlerrm <> 'Simulated delete failure' then raise; end if;
 end;
 if (select count(*) from public.stock_movements) <> 1 then raise exception 'Movement history lost on rollback'; end if;
 if (select count(*) from public.stock_items) <> 1 then raise exception 'Item lost on rollback'; end if;
end $$;
rollback;
