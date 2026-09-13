import { expect, it } from 'vitest';
import { applyStockOrder, groupByCategoryOrdered, moveStockItem } from './stock.layout';
const items = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];

const catItems = [
  { id: 'a', category: 'veg' },
  { id: 'b', category: 'meat' },
  { id: 'c', category: 'veg' },
  { id: 'd', category: '' },
];
const getId = (i: { id: string }) => i.id;
const getCat = (i: { category?: string | null }) => i.category;

it('keeps categories separate and applies the personal order within each', () => {
  const groups = groupByCategoryOrdered(catItems, ['c', 'a'], getId, getCat);
  // th-TH collation sorts the Thai fallback ahead of the Latin category names.
  expect(groups.map(([cat, its]) => [cat, its.map(getId)])).toEqual([
    ['ไม่ระบุหมวดหมู่', ['d']],
    ['meat', ['b']],
    ['veg', ['c', 'a']],
  ]);
});

it('falls back to the input order within a category when there is no preference', () => {
  const groups = groupByCategoryOrdered(catItems, [], getId, getCat);
  expect(groups.find(([cat]) => cat === 'veg')?.[1].map(getId)).toEqual(['a', 'c']);
});

it('never lets one category\'s order leak into another', () => {
  // 'b' (meat) sits between the two veg ids in the preference; it must not reorder veg.
  const groups = groupByCategoryOrdered(catItems, ['c', 'b', 'a'], getId, getCat);
  expect(groups.find(([cat]) => cat === 'veg')?.[1].map(getId)).toEqual(['c', 'a']);
  expect(groups.find(([cat]) => cat === 'meat')?.[1].map(getId)).toEqual(['b']);
});
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
