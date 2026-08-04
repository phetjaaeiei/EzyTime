import type { DailyStockStats, ItemBalance, StockItem, StockMovement } from "../types";
import { getLocalDayRange } from "./time";

export function computeItemBalances(items: StockItem[], movements: StockMovement[]): ItemBalance[] {
  const totals = new Map<string, { received: number; withdrawn: number; waste: number }>();
  for (const item of items) {
    totals.set(item.id, { received: 0, withdrawn: 0, waste: 0 });
  }

  for (const movement of movements) {
    const bucket = totals.get(movement.item_id);
    if (!bucket) continue;
    if (movement.type === "in") bucket.received += movement.quantity;
    else if (movement.type === "out") bucket.withdrawn += movement.quantity;
    else bucket.waste += movement.quantity;
  }

  return items.map((item) => {
    const bucket = totals.get(item.id)!;
    const onHand = bucket.received - bucket.withdrawn - bucket.waste;
    const isLow =
      item.low_stock_threshold !== null && onHand <= item.low_stock_threshold;
    return { item, received: bucket.received, withdrawn: bucket.withdrawn, waste: bucket.waste, onHand, isLow };
  });
}

export function computeDailyStats(movements: StockMovement[], dateInput: string): DailyStockStats {
  const { start, end } = getLocalDayRange(dateInput);
  const stats: DailyStockStats = { received: 0, withdrawn: 0, waste: 0, movementCount: 0 };

  for (const movement of movements) {
    const at = Date.parse(movement.created_at);
    if (at < start.getTime() || at >= end.getTime()) continue;
    stats.movementCount += 1;
    if (movement.type === "in") stats.received += movement.quantity;
    else if (movement.type === "out") stats.withdrawn += movement.quantity;
    else stats.waste += movement.quantity;
  }

  return stats;
}

export function findLowStockItems(balances: ItemBalance[]): ItemBalance[] {
  return balances.filter((balance) => balance.isLow);
}

export interface DonutSlice {
  label: string;
  value: number;
  color: string;
}

export interface DonutArc extends DonutSlice {
  percent: number;
  dashArray: string;
  dashOffset: number;
}

export function buildDonutArcs(slices: DonutSlice[], circumference: number): DonutArc[] {
  const total = slices.reduce((sum, slice) => sum + Math.max(0, slice.value), 0);
  let consumed = 0;
  return slices.map((slice) => {
    const percent = total > 0 ? Math.max(0, slice.value) / total : 0;
    const length = percent * circumference;
    const dashOffset = -consumed;
    consumed += length;
    return {
      ...slice,
      percent,
      dashArray: `${round(length)} ${round(circumference - length)}`,
      dashOffset: round(dashOffset),
    };
  });
}

export function formatQuantity(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/\.?0+$/, "");
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000 || 0;
}
