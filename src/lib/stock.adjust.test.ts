import { expect, it } from 'vitest';
import { planOnHandAdjustment } from './stock';

it('returns null when the target equals the current balance', () => {
  expect(planOnHandAdjustment(5, 5)).toBeNull();
  expect(planOnHandAdjustment(0, 0)).toBeNull();
});

it('records an incoming entry when the balance goes up', () => {
  expect(planOnHandAdjustment(2, 7)).toEqual({ type: 'in', quantity: 5 });
  expect(planOnHandAdjustment(0, 3)).toEqual({ type: 'in', quantity: 3 });
});

it('records an outgoing entry when the balance goes down (append-only, never deletes)', () => {
  expect(planOnHandAdjustment(10, 4)).toEqual({ type: 'out', quantity: 6 });
});
