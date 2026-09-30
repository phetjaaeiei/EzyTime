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
