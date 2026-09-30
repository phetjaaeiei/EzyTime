import { expect, it } from 'vitest';
import { matchesStockSearch } from './stock.search';

const item = { name: 'หมูสไลด์', category: 'เนื้อสัตว์' };

it('matches everything when the query is empty or whitespace', () => {
  expect(matchesStockSearch(item, '')).toBe(true);
  expect(matchesStockSearch(item, '   ')).toBe(true);
});

it('matches a partial, case-insensitive name', () => {
  expect(matchesStockSearch({ name: 'Beef Slice', category: null }, 'beef')).toBe(true);
  expect(matchesStockSearch({ name: 'Beef Slice', category: null }, 'SLICE')).toBe(true);
  expect(matchesStockSearch(item, 'สไลด์')).toBe(true);
});

it('matches the category as well as the name', () => {
  expect(matchesStockSearch(item, 'เนื้อ')).toBe(true);
});

it('trims surrounding whitespace from the query', () => {
  expect(matchesStockSearch(item, '  หมู  ')).toBe(true);
});

it('returns false when neither name nor category contains the query', () => {
  expect(matchesStockSearch(item, 'ผัก')).toBe(false);
  expect(matchesStockSearch({ name: 'Beef', category: undefined }, 'pork')).toBe(false);
});
