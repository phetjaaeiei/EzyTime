import { describe, expect, it } from "vitest";
import type { StockItem, StockMovement } from "../types";
import {
  buildDonutArcs,
  computeDailyStats,
  computeItemBalances,
  findLowStockItems,
  formatQuantity,
} from "./stock.calc";

function item(overrides: Partial<StockItem> = {}): StockItem {
  return {
    id: "item-1",
    name: "เนื้อสันคอ",
    unit: "กก.",
    category: "เนื้อ",
    low_stock_threshold: null,
    is_active: true,
    created_at: "2026-08-04T01:00:00.000Z",
    updated_at: "2026-08-04T01:00:00.000Z",
    ...overrides,
  };
}

function move(overrides: Partial<StockMovement> = {}): StockMovement {
  return {
    id: crypto.randomUUID(),
    item_id: "item-1",
    type: "in",
    quantity: 10,
    note: null,
    user_id: null,
    actor_name: null,
    created_at: "2026-08-04T02:00:00.000Z",
    ...overrides,
  };
}

describe("computeItemBalances", () => {
  it("upholds received = withdrawn + waste + onHand", () => {
    const items = [item()];
    const movements = [
      move({ type: "in", quantity: 20 }),
      move({ type: "in", quantity: 5 }),
      move({ type: "out", quantity: 8 }),
      move({ type: "waste", quantity: 2 }),
    ];
    const [balance] = computeItemBalances(items, movements);
    expect(balance.received).toBe(25);
    expect(balance.withdrawn).toBe(8);
    expect(balance.waste).toBe(2);
    expect(balance.onHand).toBe(15);
    expect(balance.received).toBe(balance.withdrawn + balance.waste + balance.onHand);
  });

  it("returns zeroed balance for an item with no movements", () => {
    const [balance] = computeItemBalances([item()], []);
    expect(balance.received).toBe(0);
    expect(balance.onHand).toBe(0);
    expect(balance.isLow).toBe(false);
  });

  it("flags low stock only when a threshold is set and onHand is at/under it", () => {
    const withThreshold = item({ id: "a", low_stock_threshold: 5 });
    const noThreshold = item({ id: "b", low_stock_threshold: null });
    const movements = [
      move({ item_id: "a", type: "in", quantity: 6 }),
      move({ item_id: "a", type: "out", quantity: 2 }), // onHand 4 <= 5 → low
      move({ item_id: "b", type: "in", quantity: 1 }),
    ];
    const balances = computeItemBalances([withThreshold, noThreshold], movements);
    expect(balances.find((b) => b.item.id === "a")?.isLow).toBe(true);
    expect(balances.find((b) => b.item.id === "b")?.isLow).toBe(false);
  });

  it("ignores movements whose item is not in the list", () => {
    const balances = computeItemBalances([item({ id: "x" })], [move({ item_id: "ghost" })]);
    expect(balances[0].received).toBe(0);
  });
});

describe("computeDailyStats", () => {
  it("buckets movements to the given local day only", () => {
    const movements = [
      move({ type: "in", quantity: 10, created_at: localIso("2026-08-04", 9) }),
      move({ type: "out", quantity: 3, created_at: localIso("2026-08-04", 12) }),
      move({ type: "waste", quantity: 1, created_at: localIso("2026-08-04", 15) }),
      move({ type: "out", quantity: 99, created_at: localIso("2026-08-05", 10) }), // other day
    ];
    const stats = computeDailyStats(movements, "2026-08-04");
    expect(stats.received).toBe(10);
    expect(stats.withdrawn).toBe(3);
    expect(stats.waste).toBe(1);
    expect(stats.movementCount).toBe(3);
  });
});

describe("findLowStockItems", () => {
  it("returns only items with isLow true", () => {
    const balances = [
      { item: item({ id: "a" }), received: 10, withdrawn: 5, waste: 0, onHand: 5, isLow: true },
      { item: item({ id: "b" }), received: 10, withdrawn: 0, waste: 0, onHand: 10, isLow: false },
      { item: item({ id: "c" }), received: 10, withdrawn: 9, waste: 0, onHand: 1, isLow: true },
    ];
    const lowItems = findLowStockItems(balances);
    expect(lowItems).toHaveLength(2);
    expect(lowItems[0].item.id).toBe("a");
    expect(lowItems[1].item.id).toBe("c");
  });
});

describe("buildDonutArcs", () => {
  it("splits the circumference proportionally and offsets sequentially", () => {
    const arcs = buildDonutArcs(
      [
        { label: "เบิกใช้", value: 25, color: "a" },
        { label: "คงเหลือ", value: 75, color: "b" },
      ],
      100,
    );
    expect(arcs[0].percent).toBeCloseTo(0.25);
    expect(arcs[0].dashArray).toBe("25 75");
    expect(arcs[0].dashOffset).toBe(0);
    expect(arcs[1].dashArray).toBe("75 25");
    expect(arcs[1].dashOffset).toBe(-25);
  });

  it("returns zero-length arcs when total is zero", () => {
    const arcs = buildDonutArcs([{ label: "x", value: 0, color: "a" }], 100);
    expect(arcs[0].percent).toBe(0);
    expect(arcs[0].dashArray).toBe("0 100");
  });
});

describe("formatQuantity", () => {
  it("shows integers without decimals and trims trailing zeros", () => {
    expect(formatQuantity(15)).toBe("15");
    expect(formatQuantity(12.5)).toBe("12.5");
    expect(formatQuantity(12.25)).toBe("12.25");
    expect(formatQuantity(0)).toBe("0");
  });
});

// helper: local-time ISO for a given yyyy-mm-dd + hour, matching getLocalDayRange semantics
function localIso(date: string, hour: number): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y, m - 1, d, hour, 0, 0, 0).toISOString();
}
