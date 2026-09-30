import { beforeEach, expect, it, vi } from "vitest";
vi.mock("./supabase", () => ({ supabase: null }));
import { getEmployeeStockAccess, listStockEmployees, saveEmployeeStockPosition, savePositionStockItems, listPositionStockItems } from "./stock.permissions";

beforeEach(() => {
  const storage = new Map<string, string>();
  vi.stubGlobal("window", { localStorage: { getItem: (k: string) => storage.get(k) ?? null, setItem: (k: string, v: string) => storage.set(k, v) } });
});
it("denies stock access until an admin assigns both a position and items", async () => {
  expect((await getEmployeeStockAccess()).itemIds).toEqual([]);
  const [employee] = await listStockEmployees();
  await saveEmployeeStockPosition(employee.user_id, "พนักงานเสิร์ฟ");
  expect((await getEmployeeStockAccess()).itemIds).toEqual([]);
  await savePositionStockItems("พนักงานเสิร์ฟ", ["catalog-1", "catalog-2"]);
  expect((await getEmployeeStockAccess()).itemIds).toEqual(["catalog-1", "catalog-2"]);
});
it("replaces grants, isolates positions, and supports full revocation", async () => {
  const [employee] = await listStockEmployees();
  await saveEmployeeStockPosition(employee.user_id, "พนักงานเสิร์ฟ");
  await savePositionStockItems("พนักงานเตรียมของ", ["catalog-3"]);
  await savePositionStockItems("พนักงานเสิร์ฟ", ["catalog-1", "catalog-1"]);
  expect(await listPositionStockItems("พนักงานเสิร์ฟ")).toEqual(["catalog-1"]);
  await savePositionStockItems("พนักงานเสิร์ฟ", []);
  expect((await getEmployeeStockAccess()).itemIds).toEqual([]);
  await saveEmployeeStockPosition(employee.user_id, null);
  expect((await getEmployeeStockAccess()).position).toBeNull();
});
