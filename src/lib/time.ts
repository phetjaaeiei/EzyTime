import type { EventType, SummaryRow, TimeLog } from "../types";

export function formatDateInput(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function getLocalDayRange(dateInput: string): { start: Date; end: Date } {
  const [year, month, day] = dateInput.split("-").map(Number);
  const start = new Date(year, month - 1, day, 0, 0, 0, 0);
  const end = new Date(year, month - 1, day + 1, 0, 0, 0, 0);
  return { start, end };
}

export function formatThaiDate(dateInput: string): string {
  const { start } = getLocalDayRange(dateInput);
  return new Intl.DateTimeFormat("th-TH", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(start);
}

export function formatTime(value?: string): string {
  if (!value) return "-";
  return new Intl.DateTimeFormat("th-TH", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

export function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("th-TH", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

export function formatDuration(minutes?: number): string {
  if (minutes === undefined || minutes < 0) return "-";
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (hours === 0) return `${remainder} นาที`;
  if (remainder === 0) return `${hours} ชม.`;
  return `${hours} ชม. ${remainder} นาที`;
}

export function getEventLabel(eventType: EventType): string {
  return eventType === "clock_in" ? "เข้างาน" : "ออกงาน";
}

export function minutesBetween(startIso: string, endIso: string): number {
  return Math.max(0, Math.round((Date.parse(endIso) - Date.parse(startIso)) / 60000));
}

export function buildDailySummary(logs: TimeLog[]): SummaryRow[] {
  const groups = new Map<string, TimeLog[]>();

  for (const log of logs) {
    const nameKey = log.employee_name.trim().toLocaleLowerCase("th-TH");
    const key = `${nameKey}::${log.position}`;
    groups.set(key, [...(groups.get(key) ?? []), log]);
  }

  return Array.from(groups.entries())
    .map(([key, groupLogs]) => {
      const sorted = [...groupLogs].sort(
        (first, second) => Date.parse(first.scanned_at) - Date.parse(second.scanned_at),
      );
      const clockIn = sorted.find((log) => log.event_type === "clock_in")?.scanned_at;
      const clockOut = [...sorted]
        .reverse()
        .find((log) => log.event_type === "clock_out" && (!clockIn || Date.parse(log.scanned_at) >= Date.parse(clockIn)))
        ?.scanned_at;
      const firstLog = sorted[0];
      const totalMinutes = clockIn && clockOut ? minutesBetween(clockIn, clockOut) : undefined;

      return {
        key,
        employeeName: firstLog.employee_name,
        position: firstLog.position,
        clockIn,
        clockOut,
        totalMinutes,
        status: clockIn && clockOut ? "complete" : clockIn ? "missing_out" : "missing_in",
        rawLogs: sorted,
      } satisfies SummaryRow;
    })
    .sort((first, second) => {
      const firstTime = first.clockIn ?? first.rawLogs[0]?.scanned_at ?? "";
      const secondTime = second.clockIn ?? second.rawLogs[0]?.scanned_at ?? "";
      return firstTime.localeCompare(secondTime, "th-TH");
    });
}

export function sumWorkedMinutes(rows: SummaryRow[]): number {
  return rows.reduce((total, row) => total + (row.totalMinutes ?? 0), 0);
}
