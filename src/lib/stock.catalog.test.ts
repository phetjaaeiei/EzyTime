import { describe, expect, it } from "vitest";
import { STOCK_CATALOG } from "./stock.catalog";

describe("stock catalog", () => {
  it("contains unique ingredient names with valid units and categories", () => {
    expect(STOCK_CATALOG).toHaveLength(61);
    const normalizedNames = STOCK_CATALOG.map((item) => item.name.trim().toLocaleLowerCase("th-TH"));
    expect(new Set(normalizedNames).size).toBe(STOCK_CATALOG.length);
    expect(STOCK_CATALOG.every((item) => item.unit.trim() && item.category.trim())).toBe(true);
  });

  it("stores sushi and special dishes as ingredients instead of finished menu items", () => {
    const names = new Set(STOCK_CATALOG.map((item) => item.name));
    expect(names.has("ซูชิ")).toBe(false);
    expect(names.has("กุ้งดองซีอิ๊ว")).toBe(false);
    expect(names.has("แมงกะพรุนน้ำมันงา")).toBe(false);
    expect(["ข้าวซูชิ", "สาหร่ายโนริ", "ไข่กุ้ง", "ซีอิ๊วญี่ปุ่น", "น้ำมันงา"].every((name) => names.has(name))).toBe(true);
  });
});
