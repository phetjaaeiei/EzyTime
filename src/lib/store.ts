import type { AuthSession, EmployeeSession, NewTimeLog, TimeLog } from "../types";
import { formatDateInput, getLocalDayRange } from "./time";
import { extractNickname } from "./employee";
import { isSupabaseConfigured, supabase } from "./supabase";

const LOCAL_STORAGE_KEY = "ezytime.logs.v1";

function todayAt(hour: number, minute: number): string {
  const date = new Date();
  date.setHours(hour, minute, 0, 0);
  return date.toISOString();
}

const demoLogs: TimeLog[] = [
  {
    id: "demo-1",
    employee_name: "มะลิ",
    position: "พนักงานเสิร์ฟ",
    event_type: "clock_in",
    scanned_at: todayAt(9, 2),
    created_at: todayAt(9, 2),
  },
  {
    id: "demo-2",
    employee_name: "มะลิ",
    position: "พนักงานเสิร์ฟ",
    event_type: "clock_out",
    scanned_at: todayAt(17, 11),
    created_at: todayAt(17, 11),
  },
  {
    id: "demo-3",
    employee_name: "บีม",
    position: "พนักงานสไลด์หมู",
    event_type: "clock_in",
    scanned_at: todayAt(10, 0),
    created_at: todayAt(10, 0),
  },
  {
    id: "demo-4",
    employee_name: "นุ่น",
    position: "พนักงานเตรียมของ",
    event_type: "clock_in",
    scanned_at: todayAt(8, 36),
    created_at: todayAt(8, 36),
  },
  {
    id: "demo-5",
    employee_name: "นุ่น",
    position: "พนักงานเตรียมของ",
    event_type: "clock_out",
    scanned_at: todayAt(16, 48),
    created_at: todayAt(16, 48),
  },
];

function readLocalLogs(): TimeLog[] {
  const raw = window.localStorage.getItem(LOCAL_STORAGE_KEY);
  if (!raw) {
    window.localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(demoLogs));
    return demoLogs;
  }

  try {
    return JSON.parse(raw) as TimeLog[];
  } catch {
    window.localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(demoLogs));
    return demoLogs;
  }
}

function writeLocalLogs(logs: TimeLog[]): void {
  window.localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(logs));
}

export async function createTimeLog(input: NewTimeLog): Promise<TimeLog> {
  const scannedAt = input.scanned_at;
  const employeeName = input.employee_name.trim();

  if (supabase) {
    const { error } = await supabase.from("time_logs").insert({
      employee_name: employeeName,
      position: input.position,
      event_type: input.event_type,
      scanned_at: scannedAt,
      user_id: input.user_id,
    });

    if (error) throw new Error(error.message);

    return {
      id: crypto.randomUUID(),
      employee_name: employeeName,
      position: input.position,
      event_type: input.event_type,
      scanned_at: scannedAt,
      created_at: new Date().toISOString(),
    };
  }

  const now = new Date().toISOString();
  const newLog: TimeLog = {
    id: crypto.randomUUID(),
    employee_name: employeeName,
    position: input.position,
    event_type: input.event_type,
    scanned_at: scannedAt,
    created_at: now,
  };
  const nextLogs = [...readLocalLogs(), newLog];
  writeLocalLogs(nextLogs);
  return newLog;
}

export async function fetchLogsByDate(dateInput: string): Promise<TimeLog[]> {
  const { start, end } = getLocalDayRange(dateInput);

  if (supabase) {
    const { data, error } = await supabase
      .from("time_logs")
      .select("*")
      .gte("scanned_at", start.toISOString())
      .lt("scanned_at", end.toISOString())
      .order("scanned_at", { ascending: true });

    if (error) throw new Error(error.message);
    return data ?? [];
  }

  return readLocalLogs()
    .filter((log) => {
      const timestamp = Date.parse(log.scanned_at);
      return timestamp >= start.getTime() && timestamp < end.getTime();
    })
    .sort((first, second) => Date.parse(first.scanned_at) - Date.parse(second.scanned_at));
}

export function getDefaultDate(): string {
  return formatDateInput(new Date());
}

export async function signInAdmin(email: string, password: string): Promise<AuthSession> {
  if (!supabase) return { email: "demo@local", isDemo: true };

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw new Error(error.message);

  return { email: data.user.email ?? email, isDemo: false };
}

export async function signOutCurrentUser(): Promise<void> {
  if (supabase) {
    const { error } = await supabase.auth.signOut();
    if (error) throw new Error(error.message);
  }
}

async function isAdminUser(userId: string): Promise<boolean> {
  if (!supabase) return false;
  const { data, error } = await supabase.from("admin_users").select("user_id").eq("user_id", userId).maybeSingle();
  if (error) return false;
  return Boolean(data);
}

export async function getCurrentSession(): Promise<AuthSession | null> {
  if (!isSupabaseConfigured || !supabase) return { email: "demo@local", isDemo: true };

  const { data, error } = await supabase.auth.getSession();
  if (error) throw new Error(error.message);
  if (!data.session) return null;

  const isAdmin = await isAdminUser(data.session.user.id);
  if (!isAdmin) return null;

  return { email: data.session.user.email ?? undefined, isDemo: false };
}

export function onAuthChange(callback: (session: AuthSession | null) => void): () => void {
  if (!supabase) return () => undefined;

  const {
    data: { subscription },
  } = supabase.auth.onAuthStateChange((_event, session) => {
    if (!session) {
      callback(null);
      return;
    }

    isAdminUser(session.user.id).then((isAdmin) => {
      callback(isAdmin ? { email: session.user.email ?? undefined, isDemo: false } : null);
    });
  });

  return () => subscription.unsubscribe();
}

export async function signInWithGoogle(): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${window.location.origin}/clock` },
  });
  if (error) throw new Error(error.message);
}

export async function getEmployeeSession(): Promise<EmployeeSession | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.auth.getSession();
  if (error) throw new Error(error.message);
  if (!data.session) return null;
  return {
    userId: data.session.user.id,
    nickname: extractNickname(data.session.user.user_metadata),
  };
}

export function onEmployeeAuthChange(callback: (session: EmployeeSession | null) => void): () => void {
  if (!supabase) return () => undefined;

  const {
    data: { subscription },
  } = supabase.auth.onAuthStateChange((_event, session) => {
    callback(
      session ? { userId: session.user.id, nickname: extractNickname(session.user.user_metadata) } : null,
    );
  });

  return () => subscription.unsubscribe();
}

export async function updateEmployeeNickname(nickname: string): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.auth.updateUser({ data: { nickname: nickname.trim() } });
  if (error) throw new Error(error.message);
}

export function exportLogsCsv(rows: TimeLog[]): void {
  const headers = ["ชื่อ", "ตำแหน่ง", "ประเภท", "เวลา"];
  const csvRows = rows.map((log) =>
    [log.employee_name, log.position, log.event_type === "clock_in" ? "เข้างาน" : "ออกงาน", log.scanned_at]
      .map((value) => `"${value.replaceAll('"', '""')}"`)
      .join(","),
  );
  const blob = new Blob([[headers.join(","), ...csvRows].join("\n")], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `ezytime-${formatDateInput(new Date())}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}
