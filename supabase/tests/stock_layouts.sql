\set ON_ERROR_STOP on
begin;
insert into auth.users(id) values ('00000000-0000-0000-0000-000000000011'), ('00000000-0000-0000-0000-000000000012');
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000011', true);
insert into public.user_stock_layouts values (auth.uid(), array['10000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001']::uuid[]);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000012', true);
do $$ begin
 if exists(select 1 from public.user_stock_layouts) then raise exception 'Leaked another users layout'; end if;
 begin
  insert into public.user_stock_layouts values ('00000000-0000-0000-0000-000000000011', '{}');
  raise exception 'Can write another users layout';
 exception when insufficient_privilege then null; end;
 update public.user_stock_layouts set item_ids = '{}' where user_id = '00000000-0000-0000-0000-000000000011';
 delete from public.user_stock_layouts where user_id = '00000000-0000-0000-0000-000000000011';
end $$;
insert into public.user_stock_layouts values (auth.uid(), '{}');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000011', true);
do $$ begin
 if (select item_ids[1] from public.user_stock_layouts where user_id = auth.uid()) <> '10000000-0000-0000-0000-000000000002'::uuid then raise exception 'Original order modified by other user'; end if;
end $$;
update public.user_stock_layouts set item_ids = '{}' where user_id = auth.uid();
do $$ begin
 if (select cardinality(item_ids) from public.user_stock_layouts where user_id = auth.uid()) <> 0 then raise exception 'Cannot reset order'; end if;
end $$;
rollback;
