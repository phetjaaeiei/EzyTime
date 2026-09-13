import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('./supabase', () => ({ supabase: null }));
import { createItem, deleteStockItems, listItems, listMovements, recordMovement } from './stock';

beforeEach(() => {
  const storage = new Map<string, string>();
  vi.stubGlobal('window', { localStorage: { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value) } });
});
it('removes selected products and history permanently while keeping other products', async () => {
  const a = await createItem({ name: 'A', category: null, unit: 'unit', low_stock_threshold: 0 });
  const b = await createItem({ name: 'B', category: null, unit: 'unit', low_stock_threshold: 0 });
  const c = await createItem({ name: 'C', category: null, unit: 'unit', low_stock_threshold: 0 });
  for (const item of [a, b, c]) await recordMovement({ item_id: item.id, type: 'in', quantity: 10 });
  window.localStorage.setItem('ezytime.stock.permissions.v1', JSON.stringify({ position: [a.id, b.id, c.id] }));
  expect(await deleteStockItems([a.id, b.id, b.id])).toBe(2);
  expect((await listItems({ includeArchived: true })).filter(item => [a.id, b.id].includes(item.id))).toEqual([]);
  expect((await listMovements()).map(move => move.item_id)).toEqual([c.id]);
  expect(JSON.parse(window.localStorage.getItem('ezytime.stock.permissions.v1')!)).toEqual({ position: [c.id] });
});
it('rejects stale or empty selections before deleting anything', async () => {
  const [item] = await listItems();
  await expect(deleteStockItems([])).rejects.toThrow();
  await expect(deleteStockItems([item.id, 'missing'])).rejects.toThrow();
  expect((await listItems()).some(value => value.id === item.id)).toBe(true);
});
