import { POSITIONS, type Position } from "../types";
import { supabase } from "./supabase";

export interface StockEmployee {
  user_id: string;
  display_name: string;
  email: string | null;
  position: Position | null;
}
export interface EmployeeStockAccess {
  position: Position | null;
  isAdmin: boolean;
  itemIds: string[];
}
const EMPLOYEES_KEY = "ezytime.stock.employees.v1";
const PERMISSIONS_KEY = "ezytime.stock.permissions.v1";
const demoEmployees: StockEmployee[] = [
  { user_id: "demo-employee", display_name: "มะลิ (บัญชีทดลอง)", email: null, position: null },
  { user_id: "demo-employee-2", display_name: "บีม", email: null, position: null },
];
function readLocal<T>(key: string, fallback: T): T {
  const value = window.localStorage.getItem(key);
  return value ? JSON.parse(value) as T : fallback;
}
function validatePosition(position: Position) {
  if (!POSITIONS.includes(position)) throw new Error("ตำแหน่งไม่ถูกต้อง");
}
export async function listStockEmployees(): Promise<StockEmployee[]> {
  if (!supabase) return readLocal(EMPLOYEES_KEY, demoEmployees);
  const { data, error } = await supabase.rpc("list_stock_employees");
  if (error) throw new Error(error.message);
  return data ?? [];
}
export async function saveEmployeeStockPosition(userId: string, position: Position | null): Promise<void> {
  if (position !== null) validatePosition(position);
  if (supabase) {
    const { error } = position === null
      ? await supabase.from("employee_stock_positions").delete().eq("user_id", userId)
      : await supabase.from("employee_stock_positions").upsert({ user_id: userId, position });
    if (error) throw new Error(error.message);
    return;
  }
  const employees = await listStockEmployees();
  if (!employees.some((employee) => employee.user_id === userId)) throw new Error("ไม่พบพนักงาน");
  window.localStorage.setItem(EMPLOYEES_KEY, JSON.stringify(employees.map((employee) => employee.user_id === userId ? { ...employee, position } : employee)));
}
export async function listPositionStockItems(position: Position): Promise<string[]> {
  if (!supabase) return readLocal<Partial<Record<Position, string[]>>>(PERMISSIONS_KEY, {})[position] ?? [];
  const { data, error } = await supabase.from("position_stock_items").select("item_id").eq("position", position);
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => row.item_id);
}
export async function savePositionStockItems(position: Position, itemIds: string[]): Promise<void> {
  validatePosition(position);
  const uniqueIds = [...new Set(itemIds)];
  if (supabase) {
    const { error } = await supabase.rpc("set_position_stock_items", { target_position: position, target_item_ids: uniqueIds });
    if (error) throw new Error(error.message);
    return;
  }
  const permissions = readLocal<Partial<Record<Position, string[]>>>(PERMISSIONS_KEY, {});
  window.localStorage.setItem(PERMISSIONS_KEY, JSON.stringify({ ...permissions, [position]: uniqueIds }));
}
export async function getEmployeeStockAccess(): Promise<EmployeeStockAccess> {
  if (!supabase) {
    const [employee] = await listStockEmployees();
    return { position: employee.position, isAdmin: false, itemIds: employee.position ? await listPositionStockItems(employee.position) : [] };
  }
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError) throw new Error(authError.message);
  if (!auth.user) throw new Error("กรุณาเข้าสู่ระบบใหม่");
  const [admin, employee] = await Promise.all([
    supabase.from("admin_users").select("user_id").eq("user_id", auth.user.id).maybeSingle(),
    supabase.from("employee_stock_positions").select("position").eq("user_id", auth.user.id).maybeSingle(),
  ]);
  if (admin.error || employee.error) throw new Error(admin.error?.message ?? employee.error?.message);
  const position = employee.data?.position as Position | undefined;
  return { position: position ?? null, isAdmin: !!admin.data, itemIds: position ? await listPositionStockItems(position) : [] };
}
