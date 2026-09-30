import { expect, it } from 'vitest';
import { computePeriodStats, defaultPeriodValue, percentChange, rangeFor } from './stock.stats';
import type { StockItem, StockMovement } from '../types';

it('builds half-open ranges for day, month and year', () => {
  const day = rangeFor('day', '2026-09-14');
  expect(day.start.getFullYear()).toBe(2026);
  const month = rangeFor('month', '2026-09');
  expect(month.start.getMonth()).toBe(8); // September = 8
  expect(month.end.getMonth()).toBe(9);   // October = 9
  const year = rangeFor('year', '2026');
  expect(year.start.getFullYear()).toBe(2026);
  expect(year.end.getFullYear()).toBe(2027);
});

it('offers previous/current default period values', () => {
  const now = new Date('2026-09-14T10:00:00');
  expect(defaultPeriodValue('month', 0, now)).toBe('2026-09');
  expect(defaultPeriodValue('month', -1, now)).toBe('2026-08');
  expect(defaultPeriodValue('year', -1, now)).toBe('2025');
});

const items: StockItem[] = [
  { id: 'a', name: 'A', unit: 'kg', category: 'meat', low_stock_threshold: null, is_active: true, created_at: '', updated_at: '' },
  { id: 'b', name: 'B', unit: 'kg', category: 'veg', low_stock_threshold: null, is_active: true, created_at: '', updated_at: '' },
];
function move(item_id: string, type: StockMovement['type'], quantity: number, created_at: string): StockMovement {
  return { id: `${item_id}-${created_at}-${type}`, item_id, type, quantity, note: null, user_id: null, actor_name: null, created_at };
}

it('sums each type per category for both periods', () => {
  const movements = [
    move('a', 'out', 5, '2026-09-11T09:00:00'), // period A
    move('a', 'out', 8, '2026-09-12T09:00:00'), // period B
    move('b', 'in', 3, '2026-09-12T10:00:00'),  // period B
  ];
  const stats = computePeriodStats(items, movements, rangeFor('day', '2026-09-11'), rangeFor('day', '2026-09-12'));
  expect(stats.totalA.withdrawn).toBe(5);
  expect(stats.totalB.withdrawn).toBe(8);
  expect(stats.totalB.received).toBe(3);
  const meat = stats.byCategory.find((c) => c.category === 'meat')!;
  expect(meat.a.withdrawn).toBe(5);
  expect(meat.b.withdrawn).toBe(8);
});

it('computes percent change (and null when growing from zero)', () => {
  expect(percentChange(10, 15)).toBe(50);
  expect(percentChange(10, 5)).toBe(-50);
  expect(percentChange(0, 0)).toBe(0);
  expect(percentChange(0, 4)).toBeNull();
});
