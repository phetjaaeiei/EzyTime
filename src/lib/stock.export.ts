import type { ItemBalance } from "../types";
import { formatDateInput } from "./time";

export interface StockExportRow {
  category: string;
  name: string;
  unit: string;
  onHand: number;
  threshold: number | null;
  status: string;
}

const HEADERS = ["หมวดหมู่", "ชื่อสินค้า", "หน่วย", "คงเหลือ", "จุดแจ้งเตือน", "สถานะ"];

function statusOf(balance: ItemBalance): string {
  if (balance.onHand <= 0) return "หมด";
  if (balance.isLow) return "ใกล้หมด";
  return "ปกติ";
}

// Rows sorted by category (Thai collation) then name, so the sheet reads grouped by category.
export function buildStockExportRows(balances: ItemBalance[]): StockExportRow[] {
  return balances
    .map((balance) => ({
      category: balance.item.category?.trim() || "ไม่ระบุหมวดหมู่",
      name: balance.item.name,
      unit: balance.item.unit,
      onHand: balance.onHand,
      threshold: balance.item.low_stock_threshold,
      status: statusOf(balance),
    }))
    .sort((first, second) => first.category.localeCompare(second.category, "th-TH") || first.name.localeCompare(second.name, "th-TH"));
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// An HTML table saved with the Excel MIME type opens natively in Excel with real
// columns — no spreadsheet library (keeps the Workers bundle lean).
export function buildStockExcelHtml(rows: StockExportRow[]): string {
  const head = HEADERS.map((header) => `<th>${escapeHtml(header)}</th>`).join("");
  const body = rows
    .map((row) => {
      const cells = [
        escapeHtml(row.category),
        escapeHtml(row.name),
        escapeHtml(row.unit),
        String(row.onHand),
        row.threshold == null ? "" : String(row.threshold),
        escapeHtml(row.status),
      ];
      return `<tr>${cells.map((cell) => `<td>${cell}</td>`).join("")}</tr>`;
    })
    .join("");
  return `<html xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="utf-8"></head><body><table border="1"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></body></html>`;
}

export function stockExportFilename(date = new Date()): string {
  return `haekpak-shabu-stock-${formatDateInput(date)}.xls`;
}

export function exportStockExcel(balances: ItemBalance[]): void {
  const html = buildStockExcelHtml(buildStockExportRows(balances));
  const blob = new Blob(["﻿", html], { type: "application/vnd.ms-excel;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = stockExportFilename();
  anchor.click();
  URL.revokeObjectURL(url);
}
