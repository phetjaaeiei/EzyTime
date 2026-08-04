export const POSITIONS = [
  "พนักงานเสิร์ฟ",
  "พนักงานล้างจาน",
  "พนักงานสไลด์หมู",
  "พนักงานเตรียมของ",
] as const;

export type Position = (typeof POSITIONS)[number];

export type EventType = "clock_in" | "clock_out";

export interface TimeLog {
  id: string;
  employee_name: string;
  position: Position;
  event_type: EventType;
  scanned_at: string;
  created_at: string;
}

export interface NewTimeLog {
  employee_name: string;
  position: Position;
  event_type: EventType;
  scanned_at: string;
  user_id?: string;
}

export interface SummaryRow {
  key: string;
  employeeName: string;
  position: Position;
  clockIn?: string;
  clockOut?: string;
  totalMinutes?: number;
  status: "complete" | "missing_in" | "missing_out";
  rawLogs: TimeLog[];
}

export interface AuthSession {
  email?: string;
  isDemo: boolean;
}

export interface EmployeeSession {
  userId: string;
  nickname: string | null;
}

// ===== Stock module =====

export type MovementType = "in" | "out" | "waste";

export interface StockItem {
  id: string;
  name: string;
  unit: string;
  category: string | null;
  low_stock_threshold: number | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface NewStockItem {
  name: string;
  unit: string;
  category: string | null;
  low_stock_threshold: number | null;
}

export interface StockItemPatch {
  name?: string;
  unit?: string;
  category?: string | null;
  low_stock_threshold?: number | null;
  is_active?: boolean;
}

export interface StockMovement {
  id: string;
  item_id: string;
  type: MovementType;
  quantity: number;
  note: string | null;
  user_id: string | null;
  actor_name: string | null;
  created_at: string;
}

export interface NewMovement {
  item_id: string;
  type: MovementType;
  quantity: number;
  note?: string | null;
}

export interface ItemBalance {
  item: StockItem;
  received: number;
  withdrawn: number;
  waste: number;
  onHand: number;
  isLow: boolean;
}

export interface DailyStockStats {
  received: number;
  withdrawn: number;
  waste: number;
  movementCount: number;
}
