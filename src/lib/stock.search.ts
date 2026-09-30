// Shared product search used by both the admin dashboard and the employee page.
// Matches on name or category so a shopper can search either the item or its group.
export function matchesStockSearch(
  item: { name: string; category?: string | null },
  query: string,
): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  const name = item.name.toLowerCase();
  const category = (item.category ?? "").toLowerCase();
  return name.includes(needle) || category.includes(needle);
}
