import { FormEvent, useEffect, useMemo, useState } from "react";
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
import { POSITIONS, type EmployeeSession, type EventType, type Position, type TimeLog } from "../types";
import {
  createTimeLog,
  getEmployeeSession,
  onEmployeeAuthChange,
  signInWithGoogle,
  signOutCurrentUser,
  updateEmployeeNickname,
} from "../lib/store";
import { isSupabaseConfigured } from "../lib/supabase";
import { getClockViewState, validateNickname } from "../lib/employee";
import { formatDateTime, formatTime, getEventLabel } from "../lib/time";

const defaultPosition: Position = POSITIONS[0];

export default function ClockPage() {
  if (!isSupabaseConfigured) {
    return <DemoClockForm />;
  }
  return <GoogleClockFlow />;
}

function GoogleClockFlow() {
  const [session, setSession] = useState<EmployeeSession | null | undefined>(undefined);
  const [isEditingNickname, setIsEditingNickname] = useState(false);

  useEffect(() => {
    let isMounted = true;

    getEmployeeSession()
      .then((nextSession) => {
        if (isMounted) setSession(nextSession);
      })
      .catch(() => {
        if (isMounted) setSession(null);
      });

    const unsubscribe = onEmployeeAuthChange(setSession);
    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, []);

  if (session === undefined) return <ClockSkeleton />;
  if (!session) return <GoogleSignInPanel />;

  const viewState = getClockViewState(true, session.nickname);
  if (viewState === "needs-nickname" || isEditingNickname) {
    return (
      <NicknameForm
        initialValue={session.nickname ?? ""}
        onSaved={(nickname) => {
          setSession({ ...session, nickname });
          setIsEditingNickname(false);
        }}
      />
    );
  }

  return <EmployeeClockForm session={session} onRequestEditNickname={() => setIsEditingNickname(true)} />;
}

function GoogleSignInPanel() {
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSignIn() {
    setError("");
    setIsSubmitting(true);
    try {
      await signInWithGoogle();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "เข้าสู่ระบบไม่สำเร็จ");
      setIsSubmitting(false);
    }
  }

  return (
    <section className="clock-layout" aria-labelledby="clock-signin-heading">
      <div className="form-panel">
        <span className="panel-icon" aria-hidden="true">
          <UserRound size={24} />
        </span>
        <h1 id="clock-signin-heading">เข้าสู่ระบบเพื่อบันทึกเวลา</h1>
        <p className="muted-copy">ใช้บัญชี Google ของคุณ ระบบจะจำชื่อให้ครั้งต่อไป</p>

        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}

        <button className="primary-button" type="button" onClick={handleSignIn} disabled={isSubmitting}>
          {isSubmitting ? <Loader2 className="spin" size={18} /> : <LogIn size={18} />}
          เข้าสู่ระบบด้วย Google
        </button>
      </div>
    </section>
  );
}

function NicknameForm({
  initialValue,
  onSaved,
}: {
  initialValue: string;
  onSaved: (nickname: string) => void;
}) {
  const [nickname, setNickname] = useState(initialValue);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const validationError = validateNickname(nickname);
    if (validationError) {
      setError(validationError);
      return;
    }

    setError("");
    setIsSubmitting(true);
    try {
      await updateEmployeeNickname(nickname);
      onSaved(nickname.trim());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "บันทึกชื่อเล่นไม่สำเร็จ");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="clock-layout" aria-labelledby="nickname-heading">
      <div className="form-panel">
        <span className="panel-icon" aria-hidden="true">
          <BadgeCheck size={24} />
        </span>
        <h1 id="nickname-heading">ตั้งชื่อเล่นของคุณ</h1>
        <p className="muted-copy">ใช้ชื่อนี้ทุกครั้งที่บันทึกเวลา ไม่ต้องพิมพ์ใหม่</p>

        <form className="clock-form" onSubmit={handleSubmit}>
          <label className="field">
            <span>
              <UserRound size={16} />
              ชื่อเล่น
            </span>
            <input
              autoComplete="nickname"
              inputMode="text"
              placeholder="เช่น มะลิ"
              value={nickname}
              onChange={(event) => setNickname(event.target.value)}
            />
          </label>

          {error ? (
            <p className="form-error" role="alert">
              {error}
            </p>
          ) : null}

          <button className="primary-button" type="submit" disabled={isSubmitting}>
            {isSubmitting ? <Loader2 className="spin" size={18} /> : <BadgeCheck size={18} />}
            บันทึกชื่อเล่น
          </button>
        </form>
      </div>
    </section>
  );
}

function EmployeeClockForm({
  session,
  onRequestEditNickname,
}: {
  session: EmployeeSession;
  onRequestEditNickname: () => void;
}) {
  const [eventType, setEventType] = useState<EventType>("clock_in");
  const [position, setPosition] = useState<Position>(defaultPosition);
  const [scanTime, setScanTime] = useState(() => new Date());
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [savedLog, setSavedLog] = useState<TimeLog | null>(null);

  const nickname = session.nickname ?? "";

  const eventCopy = useMemo(
    () =>
      eventType === "clock_in"
        ? { title: "บันทึกเข้างาน", icon: <LogIn size={18} /> }
        : { title: "บันทึกออกงาน", icon: <LogOut size={18} /> },
    [eventType],
  );

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setIsSaving(true);
    try {
      const log = await createTimeLog({
        employee_name: nickname,
        position,
        event_type: eventType,
        scanned_at: scanTime.toISOString(),
        user_id: session.userId,
      });
      setSavedLog(log);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "บันทึกไม่สำเร็จ กรุณาลองอีกครั้ง");
    } finally {
      setIsSaving(false);
    }
  }

  function resetForNextEvent() {
    setSavedLog(null);
    setError("");
    setScanTime(new Date());
  }

  function updateEventType(nextEventType: EventType) {
    setEventType(nextEventType);
    setPosition(defaultPosition);
    setError("");
  }

  async function handleSignOut() {
    await signOutCurrentUser();
  }

  return (
    <section className="clock-layout" aria-labelledby="clock-heading">
      <div className="clock-hero">
        <div className="eyebrow-row">
          <span className="status-dot" />
          สวัสดี {nickname}
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

        <div className="button-row">
          <button className="field-link-button" type="button" onClick={onRequestEditNickname}>
            แก้ไขชื่อ
          </button>
          <button className="field-link-button" type="button" onClick={handleSignOut}>
            ออกจากระบบ
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
            <button className="primary-button" type="button" onClick={resetForNextEvent}>
              <BadgeCheck size={18} />
              บันทึกอีกครั้ง
            </button>
          </div>
        ) : (
          <form className="clock-form" onSubmit={handleSubmit}>
            <div className="segmented-control" aria-label="เลือกประเภทเวลา">
              <button
                className={eventType === "clock_in" ? "segment is-selected" : "segment"}
                type="button"
                onClick={() => updateEventType("clock_in")}
              >
                <LogIn size={17} />
                เข้างาน
              </button>
              <button
                className={eventType === "clock_out" ? "segment is-selected" : "segment"}
                type="button"
                onClick={() => updateEventType("clock_out")}
              >
                <LogOut size={17} />
                ออกงาน
              </button>
            </div>

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

function ClockSkeleton() {
  return (
    <section className="clock-layout" aria-label="กำลังโหลด">
      <div className="skeleton-heading" />
    </section>
  );
}

function DemoClockForm() {
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
        ? { title: "บันทึกเข้างาน", icon: <LogIn size={18} /> }
        : { title: "บันทึกออกงาน", icon: <LogOut size={18} /> },
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

  function updateEventType(nextEventType: EventType) {
    setEventType(nextEventType);
    setEmployeeName("");
    setPosition(defaultPosition);
    setError("");
  }

  return (
    <section className="clock-layout" aria-labelledby="clock-heading">
      <div className="clock-hero">
        <div className="eyebrow-row">
          <span className="status-dot" />
          เวลาจาก QR (โหมดทดลอง)
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
                onClick={() => updateEventType("clock_in")}
              >
                <LogIn size={17} />
                เข้างาน
              </button>
              <button
                className={eventType === "clock_out" ? "segment is-selected" : "segment"}
                type="button"
                onClick={() => updateEventType("clock_out")}
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
