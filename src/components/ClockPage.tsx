import { FormEvent, useMemo, useState } from "react";
import {
  BadgeCheck,
  BriefcaseBusiness,
  CheckCircle2,
  Clock3,
  Loader2,
  LogIn,
  LogOut,
  RefreshCw,
  UserRound,
} from "lucide-react";
import { POSITIONS, type EventType, type Position, type TimeLog } from "../types";
import { createTimeLog } from "../lib/store";
import { formatDateTime, formatTime, getEventLabel } from "../lib/time";

const defaultPosition: Position = POSITIONS[0];

export default function ClockPage() {
  const [eventType, setEventType] = useState<EventType>("clock_in");
  const [employeeName, setEmployeeName] = useState("");
  const [position, setPosition] = useState<Position>(defaultPosition);
  const [scanTime, setScanTime] = useState(() => new Date());
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [savedLog, setSavedLog] = useState<TimeLog | null>(null);

  const eventCopy = useMemo(
    () =>
      eventType === "clock_in"
        ? {
            title: "บันทึกเข้างาน",
            icon: <LogIn size={18} />,
          }
        : {
            title: "บันทึกออกงาน",
            icon: <LogOut size={18} />,
          },
    [eventType],
  );

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (employeeName.trim().length < 2) {
      setError("กรุณากรอกชื่ออย่างน้อย 2 ตัวอักษร");
      return;
    }

    setIsSaving(true);
    try {
      const log = await createTimeLog({
        employee_name: employeeName,
        position,
        event_type: eventType,
        scanned_at: scanTime.toISOString(),
      });
      setSavedLog(log);
      setEmployeeName("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "บันทึกไม่สำเร็จ กรุณาลองอีกครั้ง");
    } finally {
      setIsSaving(false);
    }
  }

  function resetForNextPerson() {
    setSavedLog(null);
    setError("");
    setScanTime(new Date());
  }

  return (
    <section className="clock-layout" aria-labelledby="clock-heading">
      <div className="clock-hero">
        <div className="eyebrow-row">
          <span className="status-dot" />
          เวลาจาก QR
        </div>
        <h1 id="clock-heading">{eventCopy.title}</h1>
        <p className="lead-copy">ขอให้กะนี้ราบรื่น บันทึกเสร็จแล้วกลับไปทำงานต่อได้เลย</p>

        <div className="scan-ticket" aria-label="เวลาที่ระบบบันทึกจาก QR">
          <Clock3 size={22} />
          <div>
            <span className="ticket-label">เวลา scan</span>
            <strong>{formatDateTime(scanTime.toISOString())} น.</strong>
          </div>
          <button className="icon-text-button quiet" type="button" onClick={() => setScanTime(new Date())}>
            <RefreshCw size={17} />
            รีเฟรช
          </button>
        </div>
      </div>

      <div className="form-panel">
        {savedLog ? (
          <div className="success-state" role="status" aria-live="polite">
            <CheckCircle2 size={42} />
            <h2>บันทึกแล้ว</h2>
            <p>
              {savedLog.employee_name} {getEventLabel(savedLog.event_type)} เวลา {formatTime(savedLog.scanned_at)} น.
            </p>
            <button className="primary-button" type="button" onClick={resetForNextPerson}>
              <BadgeCheck size={18} />
              บันทึกคนถัดไป
            </button>
          </div>
        ) : (
          <form className="clock-form" onSubmit={handleSubmit}>
            <div className="segmented-control" aria-label="เลือกประเภทเวลา">
              <button
                className={eventType === "clock_in" ? "segment is-selected" : "segment"}
                type="button"
                onClick={() => setEventType("clock_in")}
              >
                <LogIn size={17} />
                เข้างาน
              </button>
              <button
                className={eventType === "clock_out" ? "segment is-selected" : "segment"}
                type="button"
                onClick={() => setEventType("clock_out")}
              >
                <LogOut size={17} />
                ออกงาน
              </button>
            </div>

            <label className="field">
              <span>
                <UserRound size={16} />
                ชื่อ
              </span>
              <input
                autoComplete="name"
                inputMode="text"
                placeholder="เช่น มะลิ"
                value={employeeName}
                onChange={(event) => setEmployeeName(event.target.value)}
              />
            </label>

            <label className="field">
              <span>
                <BriefcaseBusiness size={16} />
                ตำแหน่ง
              </span>
              <select value={position} onChange={(event) => setPosition(event.target.value as Position)}>
                {POSITIONS.map((positionOption) => (
                  <option key={positionOption} value={positionOption}>
                    {positionOption}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <span>
                <Clock3 size={16} />
                เวลา
              </span>
              <input value={`${formatDateTime(scanTime.toISOString())} น.`} readOnly />
            </label>

            {error ? (
              <p className="form-error" role="alert">
                {error}
              </p>
            ) : null}

            <button className="primary-button" type="submit" disabled={isSaving}>
              {isSaving ? <Loader2 className="spin" size={18} /> : eventCopy.icon}
              {isSaving ? "กำลังบันทึก" : "บันทึกเวลา"}
            </button>
          </form>
        )}
      </div>
    </section>
  );
}
