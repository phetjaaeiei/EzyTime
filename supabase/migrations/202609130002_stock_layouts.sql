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
