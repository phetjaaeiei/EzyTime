import { expect, it } from 'vitest';
import { buildStockExcelHtml, buildStockExportRows, buildStockWorkbookHtml, stockDailySnapshots, stockExportFilename } from './stock.export';
import type { ItemBalance, StockItem, StockMovement } from '../types';

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

it('builds an Excel-openable HTML table; unit is merged into the on-hand cell (no unit column)', () => {
  const html = buildStockExcelHtml(buildStockExportRows([balance('A & B <x>', 'meat', 1, false)]));
  expect(html).toContain('<table');
  expect(html).toContain('หมวดหมู่');
  expect(html).toContain('คงเหลือ');
  expect(html).toContain('A &amp; B &lt;x&gt;');
  expect(html).toContain('1 กก.'); // value + unit together
  expect(html).not.toContain('<th>หน่วย</th>'); // unit column removed
});

it('centers every cell and colors only the status cell (orange low, red out)', () => {
  const html = buildStockExcelHtml(buildStockExportRows([
    balance('low', 'c', 2, true),  // ใกล้หมด
    balance('out', 'c', 0, false), // หมด
    balance('ok', 'c', 5, false),  // ปกติ
  ])).toLowerCase();
  expect(html).toContain('text-align:center');
  // exactly one tinted cell per low/out row (the status column), not the whole row
  expect((html.match(/background-color:#ffcc80/g) ?? []).length).toBe(1);
  expect((html.match(/background-color:#ef9a9a/g) ?? []).length).toBe(1);
});

it('names the file with an .xls extension', () => {
  expect(stockExportFilename(new Date('2026-09-13T12:00:00'))).toMatch(/^haekpak-shabu-stock-\d{4}-\d{2}-\d{2}\.xls$/);
});

const stockItem: StockItem = { id: 'a', name: 'A', unit: 'kg', category: 'c', low_stock_threshold: null, is_active: true, created_at: '2026-09-10T00:00:00', updated_at: '' };
function move(id: string, type: StockMovement['type'], quantity: number, created_at: string): StockMovement {
  return { id, item_id: 'a', type, quantity, note: null, user_id: null, actor_name: null, created_at };
}

it('builds one end-of-day snapshot sheet per day from first movement to today', () => {
  const movements = [move('m1', 'in', 10, '2026-09-11T09:00:00'), move('m2', 'out', 3, '2026-09-12T09:00:00')];
  const sheets = stockDailySnapshots([stockItem], movements, new Date('2026-09-12T15:00:00'));
  expect(sheets.map((s) => s.name)).toEqual(['2026-09-11', '2026-09-12']);
  expect(sheets[0].rows[0].onHand).toBe(10); // end of the 11th
  expect(sheets[1].rows[0].onHand).toBe(7);  // end of the 12th, after the -3
});

it('lists every item on every day sheet — only the balances differ', () => {
  const later: StockItem = { ...stockItem, id: 'b', name: 'B', created_at: '2026-09-20T00:00:00' };
  const movements = [move('m1', 'in', 10, '2026-09-11T09:00:00')];
  const sheets = stockDailySnapshots([stockItem, later], movements, new Date('2026-09-12T15:00:00'));
  for (const sheet of sheets) {
    expect(sheet.rows.map((r) => r.name).sort()).toEqual(['A', 'B']);
  }
  // 'B' has no movements yet, so it shows 0 on every sheet — but it is still present.
  expect(sheets.every((s) => s.rows.find((r) => r.name === 'B')!.onHand === 0)).toBe(true);
});

it('falls back to a single sheet (today) when there are no movements', () => {
  const sheets = stockDailySnapshots([stockItem], [], new Date('2026-09-12T15:00:00'));
  expect(sheets).toHaveLength(1);
  expect(sheets[0].name).toBe('2026-09-12');
});

it('emits one worksheet table per day, each named in the Excel worksheet block', () => {
  const html = buildStockWorkbookHtml([
    { name: '2026-09-11', rows: buildStockExportRows([]) },
    { name: '2026-09-12', rows: buildStockExportRows([]) },
  ]);
  expect((html.match(/<table/g) ?? []).length).toBe(2);
  expect(html).toContain('<x:Name>2026-09-11</x:Name>');
  expect(html).toContain('<x:Name>2026-09-12</x:Name>');
});
