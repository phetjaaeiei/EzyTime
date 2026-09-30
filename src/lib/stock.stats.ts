import type { MovementType, StockItem, StockMovement } from "../types";
import { formatDateInput, getLocalDayRange } from "./time";

export type StatGranularity = "day" | "month" | "year";

export interface DateRange {
  start: Date;
  end: Date;
}

export interface PeriodTotals {
  received: number;
  withdrawn: number;
  waste: number;
}

export interface CategoryComparison {
  category: string;
  a: PeriodTotals;
  b: PeriodTotals;
}

export interface PeriodComparison {
  totalA: PeriodTotals;
  totalB: PeriodTotals;
  byCategory: CategoryComparison[];
}

// Half-open [start, end) range for a day ("YYYY-MM-DD"), month ("YYYY-MM") or year ("YYYY").
export function rangeFor(granularity: StatGranularity, value: string): DateRange {
  if (granularity === "day") return getLocalDayRange(value);
  if (granularity === "month") {
    const [year, month] = value.split("-").map(Number);
    return { start: new Date(year, month - 1, 1), end: new Date(year, month, 1) };
  }
  const year = Number(value);
  return { start: new Date(year, 0, 1), end: new Date(year + 1, 0, 1) };
}

// A sensible default period value; offset 0 = current, -1 = previous, etc.
export function defaultPeriodValue(granularity: StatGranularity, offset = 0, now: Date = new Date()): string {
  if (granularity === "day") {
    const day = new Date(now);
    day.setDate(day.getDate() + offset);
    return formatDateInput(day);
  }
  if (granularity === "month") {
    const month = new Date(now.getFullYear(), now.getMonth() + offset, 1);
    return `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, "0")}`;
  }
  return String(now.getFullYear() + offset);
}

function emptyTotals(): PeriodTotals {
  return { received: 0, withdrawn: 0, waste: 0 };
}

function addMovement(totals: PeriodTotals, type: MovementType, quantity: number): void {
  if (type === "in") totals.received += quantity;
  else if (type === "out") totals.withdrawn += quantity;
  else totals.waste += quantity;
}

export function computePeriodStats(
  items: StockItem[],
  movements: StockMovement[],
  rangeA: DateRange,
  rangeB: DateRange,
): PeriodComparison {
  const categoryOf = new Map(items.map((item) => [item.id, item.category?.trim() || "ไม่ระบุหมวดหมู่"]));
  const totalA = emptyTotals();
  const totalB = emptyTotals();
  const catMap = new Map<string, { a: PeriodTotals; b: PeriodTotals }>();
  const startA = rangeA.start.getTime(), endA = rangeA.end.getTime();
  const startB = rangeB.start.getTime(), endB = rangeB.end.getTime();

  for (const movement of movements) {
    const at = Date.parse(movement.created_at);
    const inA = at >= startA && at < endA;
    const inB = at >= startB && at < endB;
    if (!inA && !inB) continue;
    const category = categoryOf.get(movement.item_id) ?? "ไม่ระบุหมวดหมู่";
    let bucket = catMap.get(category);
    if (!bucket) { bucket = { a: emptyTotals(), b: emptyTotals() }; catMap.set(category, bucket); }
    if (inA) { addMovement(totalA, movement.type, movement.quantity); addMovement(bucket.a, movement.type, movement.quantity); }
    if (inB) { addMovement(totalB, movement.type, movement.quantity); addMovement(bucket.b, movement.type, movement.quantity); }
  }

  const byCategory = Array.from(catMap.entries())
    .map(([category, value]) => ({ category, a: value.a, b: value.b }))
    .sort((first, second) => first.category.localeCompare(second.category, "th-TH"));
  return { totalA, totalB, byCategory };
}

// Percent change from A to B. null when A is 0 but B is not (can't express as %).
export function percentChange(from: number, to: number): number | null {
  if (from === 0) return to === 0 ? 0 : null;
  return ((to - from) / from) * 100;
}
