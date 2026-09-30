import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('./supabase', () => ({ supabase: null }));
import { loadStockOrder, saveStockOrder } from './stock.layout';
beforeEach(() => {
  const storage = new Map<string, string>();
  vi.stubGlobal('window', { localStorage: { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value) } });
});
it('persists custom order and resets to default', async () => {
  expect(await loadStockOrder()).toEqual([]);
  await saveStockOrder(['b', 'a', 'b']);
  expect(await loadStockOrder()).toEqual(['b', 'a']);
  await saveStockOrder([]);
  expect(await loadStockOrder()).toEqual([]);
});
it('recovers from invalid stored preferences', async () => {
  window.localStorage.setItem('ezytime.stock.layout.demo', 'invalid json');
  expect(await loadStockOrder()).toEqual([]);
  window.localStorage.setItem('ezytime.stock.layout.demo', '["b", 42, null, "a"]');
  expect(await loadStockOrder()).toEqual(['b', 'a']);
});
it('reports a storage failure instead of silently claiming success', async () => {
  window.localStorage.setItem = () => { throw new Error('Storage unavailable'); };
  await expect(saveStockOrder(['b', 'a'])).rejects.toThrow('Storage unavailable');
});
