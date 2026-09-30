import type { ItemBalance, StockItem, StockMovement } from "../types";
import { computeItemBalances, formatQuantity } from "./stock.calc";
import { formatDateInput, getLocalDayRange } from "./time";

export interface StockExportRow {
  category: string;
  name: string;
  unit: string;
  onHand: number;
  threshold: number | null;
  status: string;
}

const HEADERS = ["หมวดหมู่", "ชื่อสินค้า", "คงเหลือ", "จุดแจ้งเตือน", "สถานะ"];
const LOW_FILL = "#FFCC80"; // ใกล้หมด → orange
const OUT_FILL = "#EF9A9A"; // หมด → red

function fillFor(status: string): string {
  if (status === "หมด") return OUT_FILL;
  if (status === "ใกล้หมด") return LOW_FILL;
  return "";
}

// Every cell is centered; a filled cell also gets its status color. `align`/
// `bgcolor` are kept alongside the inline style for Excel's HTML import.
function cellHtml(content: string, tag: "td" | "th", fill: string): string {
  const bg = fill ? ` bgcolor="${fill}"` : "";
  const style = `text-align:center;vertical-align:middle;${fill ? `background-color:${fill};` : ""}`;
  return `<${tag} align="center"${bg} style="${style}">${content}</${tag}>`;
}

function headerRowHtml(): string {
  return `<tr>${HEADERS.map((header) => cellHtml(escapeHtml(header), "th", "")).join("")}</tr>`;
}

// The on-hand value carries its unit inline (e.g. "3 ลิตร"), so there is no
// separate unit column. Only the status cell (last column) is tinted by status.
function bodyRowHtml(row: StockExportRow): string {
  const fill = fillFor(row.status);
  const cells = [
    escapeHtml(row.category),
    escapeHtml(row.name),
    escapeHtml(`${formatQuantity(row.onHand)} ${row.unit}`),
    row.threshold == null ? "" : String(row.threshold),
    escapeHtml(row.status),
  ];
  return `<tr>${cells.map((cell, index) => cellHtml(cell, "td", index === cells.length - 1 ? fill : "")).join("")}</tr>`;
}

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
  const body = rows.map(bodyRowHtml).join("");
  return `<html xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="utf-8"></head><body><table border="1"><thead>${headerRowHtml()}</thead><tbody>${body}</tbody></table></body></html>`;
}

export function stockExportFilename(date = new Date()): string {
  return `haekpak-shabu-stock-${formatDateInput(date)}.xls`;
}

export function exportStockExcel(balances: ItemBalance[]): void {
  triggerDownload(buildStockExcelHtml(buildStockExportRows(balances)), stockExportFilename());
}

export interface StockDaySheet {
  name: string;
  rows: StockExportRow[];
}

// One end-of-day snapshot per day from the first recorded movement to today,
// reconstructed from the movement ledger (no separate storage needed).
export function stockDailySnapshots(items: StockItem[], movements: StockMovement[], today: Date = new Date()): StockDaySheet[] {
  const todayStr = formatDateInput(today);
  let startStr = todayStr;
  for (const movement of movements) {
    const dayStr = formatDateInput(new Date(movement.created_at));
    if (dayStr < startStr) startStr = dayStr;
  }

  const sheets: StockDaySheet[] = [];
  const cursor = new Date(getLocalDayRange(startStr).start);
  const endBound = getLocalDayRange(todayStr).end.getTime();
  while (cursor.getTime() < endBound) {
    const dayStr = formatDateInput(cursor);
    const cutoff = getLocalDayRange(dayStr).end.getTime();
    // Every sheet lists every item — only the end-of-day balances differ per day.
    const movesAsOf = movements.filter((movement) => Date.parse(movement.created_at) < cutoff);
    sheets.push({ name: dayStr, rows: buildStockExportRows(computeItemBalances(items, movesAsOf)) });
    cursor.setDate(cursor.getDate() + 1);
  }
  return sheets;
}

// Multiple worksheets in one .xls: each <table> becomes a sheet, named in order
// by the <x:ExcelWorksheets> block (the classic Excel-HTML multi-sheet trick).
export function buildStockWorkbookHtml(sheets: StockDaySheet[]): string {
  const names = sheets
    .map((sheet) => `<x:ExcelWorksheet><x:Name>${escapeHtml(sheet.name)}</x:Name><x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions></x:ExcelWorksheet>`)
    .join("");
  const tables = sheets
    .map((sheet) => {
      const body = sheet.rows.map(bodyRowHtml).join("");
      return `<table border="1"><thead>${headerRowHtml()}</thead><tbody>${body}</tbody></table>`;
    })
    .join("");
  return `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="utf-8"><!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets>${names}</x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]--></head><body>${tables}</body></html>`;
}

export function exportStockDailyWorkbook(items: StockItem[], movements: StockMovement[]): void {
  triggerDownload(buildStockWorkbookHtml(stockDailySnapshots(items, movements)), stockExportFilename());
}

function triggerDownload(html: string, filename: string): void {
  const blob = new Blob(["﻿", html], { type: "application/vnd.ms-excel;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
