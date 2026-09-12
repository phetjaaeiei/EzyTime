import { expect, it } from 'vitest';
import { applyStockOrder, moveStockItem } from './stock.layout';
const items = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
it('places B before A without changing the input', () => {
  expect(applyStockOrder(items, ['b', 'a']).map(i => i.id)).toEqual(['b', 'a', 'c']);
  expect(items.map(i => i.id)).toEqual(['a', 'b', 'c']);
});
it('ignores missing or unauthorized IDs and adds new items at the end', () => {
  expect(applyStockOrder(items, ['gone', 'b', 'b', 'private']).map(i => i.id)).toEqual(['b', 'a', 'c']);
});
it('moves in both directions and ignores invalid drag targets', () => {
  expect(moveStockItem(['a', 'b', 'c'], 'b', 'a')).toEqual(['b', 'a', 'c']);
  expect(moveStockItem(['a', 'b', 'c'], 'a', 'c')).toEqual(['b', 'c', 'a']);
  expect(moveStockItem(['a', 'b'], 'missing', 'b')).toEqual(['a', 'b']);
});
it('restores the default ordering with an empty preference', () => {
  expect(applyStockOrder(items, [])).toEqual(items);
});
