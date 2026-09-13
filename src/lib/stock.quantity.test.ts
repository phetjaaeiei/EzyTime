import { expect, it } from 'vitest';
import { formatQuantity, parseQuantityInput } from './stock.calc';

it('keeps up to 3 decimals without spinner rounding', () => {
  expect(parseQuantityInput('1.875')).toBe(1.875);
  expect(parseQuantityInput('0.5')).toBe(0.5);
  expect(parseQuantityInput('12')).toBe(12);
});

it('rounds beyond 3 decimals to 3 places', () => {
  expect(parseQuantityInput('1.8759')).toBe(1.876);
});

it('accepts a comma as the decimal separator', () => {
  expect(parseQuantityInput('1,5')).toBe(1.5);
});

it('rejects non-numeric input like "/" or letters (never throws)', () => {
  expect(parseQuantityInput('/')).toBeNull();
  expect(parseQuantityInput('1/2')).toBeNull();
  expect(parseQuantityInput('abc')).toBeNull();
  expect(parseQuantityInput('')).toBeNull();
  expect(parseQuantityInput('.')).toBeNull();
});

it('formats quantities to at most 3 decimals, trimming trailing zeros', () => {
  expect(formatQuantity(1.875)).toBe('1.875');
  expect(formatQuantity(1.5)).toBe('1.5');
  expect(formatQuantity(2)).toBe('2');
});
