import { expect, it } from 'vitest';
import { buildStockExcelHtml, buildStockExportRows, stockExportFilename } from './stock.export';
import type { ItemBalance } from '../types';

function balance(name: string, category: string | null, onHand: number, isLow: boolean, low: number | null = null): ItemBalance {
  return {
    item: { id: name, name, unit: 'กก.', category, low_stock_threshold: low, is_active: true, created_at: '', updated_at: '' },
    received: 0,
    withdrawn: 0,
    waste: 0,
    onHand,
    isLow,
  };
}

const balances: ItemBalance[] = [
  balance('pork', 'meat', 5, false),
  balance('cabbage', 'veg', 0, false),
  balance('shrimp', 'veg', 2, true),
  balance('salt', null, 3, false),
];

it('sorts rows by category then name and derives status', () => {
  const rows = buildStockExportRows(balances);
  // th-TH collation sorts the Thai fallback category ahead of the Latin ones.
  expect(rows.map((r) => [r.category, r.name, r.status])).toEqual([
    ['ไม่ระบุหมวดหมู่', 'salt', 'ปกติ'],
    ['meat', 'pork', 'ปกติ'],
    ['veg', 'cabbage', 'หมด'],
    ['veg', 'shrimp', 'ใกล้หมด'],
  ]);
});

it('builds an Excel-openable HTML table with Thai headers and escaped values', () => {
  const html = buildStockExcelHtml(buildStockExportRows([balance('A & B <x>', 'meat', 1, false)]));
  expect(html).toContain('<table');
  expect(html).toContain('หมวดหมู่');
  expect(html).toContain('คงเหลือ');
  expect(html).toContain('A &amp; B &lt;x&gt;');
});

it('names the file with an .xls extension', () => {
  expect(stockExportFilename(new Date('2026-09-13T12:00:00'))).toMatch(/^haekpak-shabu-stock-\d{4}-\d{2}-\d{2}\.xls$/);
});
