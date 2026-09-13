import { supabase } from "./supabase";
import type { StaffRole } from "../types";

export type AssignableRole = Exclude<StaffRole, "admin">; // "ceo" | "manager"
export const ASSIGNABLE_ROLES: AssignableRole[] = ["ceo", "manager"];

export interface StaffMember {
  user_id: string;
  display_name: string;
  email: string | null;
  role: AssignableRole | null;
}

export function staffRoleLabel(role: StaffRole | null): string {
  switch (role) {
    case "admin": return "Admin";
    case "ceo": return "CEO";
    case "manager": return "Manager";
    default: return "ไม่มีสิทธิ์ผู้ดูแล";
  }
}

const STAFF_KEY = "ezytime.staff.roles.demo.v1";
const demoStaff: StaffMember[] = [
  { user_id: "demo-employee", display_name: "มะลิ (บัญชีทดลอง)", email: "mali@example.com", role: null },
  { user_id: "demo-employee-2", display_name: "บีม", email: "beam@example.com", role: null },
  { user_id: "demo-employee-3", display_name: "นุ่น", email: "noon@example.com", role: null },
];

function readDemo(): StaffMember[] {
  const raw = window.localStorage.getItem(STAFF_KEY);
  if (!raw) return demoStaff;
  try { return JSON.parse(raw) as StaffMember[]; } catch { return demoStaff; }
}

export async function listStaffRoles(): Promise<StaffMember[]> {
  if (!supabase) return readDemo();
  const { data, error } = await supabase.rpc("list_staff_roles");
  if (error) throw new Error("โหลดรายชื่อทีมงานไม่สำเร็จ กรุณาลองอีกครั้ง");
  return (data ?? []).map((row: { user_id: string; display_name: string | null; email: string | null; role: string | null }) => ({
    user_id: row.user_id,
    display_name: row.display_name ?? row.email ?? "ผู้ใช้",
    email: row.email,
    role: row.role === "ceo" || row.role === "manager" ? row.role : null,
  }));
}

export async function setStaffRole(userId: string, role: AssignableRole | null): Promise<void> {
  if (!supabase) {
    const next = readDemo().map((member) => member.user_id === userId ? { ...member, role } : member);
    window.localStorage.setItem(STAFF_KEY, JSON.stringify(next));
    return;
  }
  const { error } = await supabase.rpc("set_staff_role", { target_user_id: userId, target_role: role });
  if (error) throw new Error(error.message);
}
