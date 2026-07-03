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
