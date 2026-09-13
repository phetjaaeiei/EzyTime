-- Let employees record incoming stock ('in'), not just withdrawals. Balance
-- corrections are done append-only (an 'in' or 'out' adjustment entry), so
-- employees still get INSERT only — never UPDATE/DELETE on movement history.
begin;
drop policy if exists "Users record their own withdrawals" on public.stock_movements;
drop policy if exists "Users record their own stock movements" on public.stock_movements;
create policy "Users record their own stock movements" on public.stock_movements for insert to authenticated
with check (
  user_id = auth.uid()
  and (public.is_admin() or (type in ('in', 'out', 'waste') and public.can_manage_stock_item(item_id)))
);
commit;
