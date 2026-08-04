import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import {
  Boxes,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Copy,
  Download,
  LayoutDashboard,
  Loader2,
  LogOut,
  Menu,
  Printer,
  QrCode,
  RefreshCw,
  ShieldCheck,
  Timer,
  UserRoundCheck,
  UsersRound,
  X,
} from "lucide-react";
import type { AuthSession, SummaryRow, TimeLog } from "../types";
import StockDashboard from "./stock/StockDashboard";
import {
  exportLogsCsv,
  fetchLogsByDate,
  getCurrentSession,
  getDefaultDate,
  onAuthChange,
  signInAdmin,
  signOutCurrentUser,
} from "../lib/store";
import { isSupabaseConfigured } from "../lib/supabase";
import {
  buildDailySummary,
  formatDuration,
  formatThaiDate,
  formatTime,
  getEventLabel,
  sumWorkedMinutes,
} from "../lib/time";

type LoadState = "idle" | "loading" | "error";

export default function AdminDashboard() {
  const [session, setSession] = useState<AuthSession | null | undefined>(undefined);

  useEffect(() => {
    let isMounted = true;

    getCurrentSession()
      .then((currentSession) => {
        if (isMounted) setSession(currentSession);
      })
      .catch(() => {
        if (isMounted) setSession(null);
      });

    const unsubscribe = onAuthChange(setSession);
    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, []);

  if (session === undefined) {
    return <AdminSkeleton />;
  }

  if (!session) {
    return <LoginPanel onSignedIn={setSession} />;
  }

  return <AdminConsole session={session} onSignedOut={() => setSession(null)} />;
}

type AdminModule = "attendance" | "stock";

function AdminConsole({ session, onSignedOut }: { session: AuthSession; onSignedOut: () => void }) {
  const [module, setModule] = useState<AdminModule>("attendance");
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    if (!sidebarOpen) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setSidebarOpen(false);
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [sidebarOpen]);

  function selectModule(nextModule: AdminModule) {
    setModule(nextModule);
    setSidebarOpen(false);
  }

  async function handleSignOut() {
    await signOutCurrentUser();
    onSignedOut();
  }

  const currentLabel = module === "attendance" ? "Dashboard" : "สต๊อกสินค้า";

  return (
    <div className="admin-shell">
      <aside id="admin-sidebar" className={sidebarOpen ? "admin-sidebar is-open" : "admin-sidebar"}>
        <div className="admin-sidebar-head">
          <div>
            <strong>Admin</strong>
            <span>ระบบจัดการร้าน</span>
          </div>
          <button className="icon-button admin-sidebar-close" type="button" onClick={() => setSidebarOpen(false)} aria-label="ปิดเมนู">
            <X size={18} />
          </button>
        </div>

        <nav className="admin-sidebar-nav" aria-label="เมนูผู้ดูแลระบบ">
          <span className="admin-sidebar-label">เมนูหลัก</span>
          <button
            className={module === "attendance" ? "admin-sidebar-link is-active" : "admin-sidebar-link"}
            type="button"
            onClick={() => selectModule("attendance")}
            aria-current={module === "attendance" ? "page" : undefined}
          >
            <LayoutDashboard size={19} />
            <span><strong>Dashboard</strong><small>เวลาทำงานและการลงเวลา</small></span>
          </button>
          <button
            className={module === "stock" ? "admin-sidebar-link is-active" : "admin-sidebar-link"}
            type="button"
            onClick={() => selectModule("stock")}
            aria-current={module === "stock" ? "page" : undefined}
          >
            <Boxes size={19} />
            <span><strong>สต๊อกสินค้า</strong><small>คงเหลือ รับเข้า และเบิกออก</small></span>
          </button>
        </nav>

        <div className="admin-sidebar-account">
          <ShieldCheck size={18} aria-hidden="true" />
          <span><small>เข้าสู่ระบบเป็น</small><strong>{session.isDemo ? "โหมดทดลอง" : session.email}</strong></span>
          {isSupabaseConfigured ? (
            <button className="icon-button" type="button" onClick={handleSignOut} aria-label="ออกจากระบบ">
              <LogOut size={18} />
            </button>
          ) : null}
        </div>
      </aside>

      {sidebarOpen ? <button className="admin-sidebar-backdrop" type="button" onClick={() => setSidebarOpen(false)} aria-label="ปิดเมนู" /> : null}

      <div className="admin-workspace">
        <div className="admin-mobile-nav">
          <button
            className="icon-text-button"
            type="button"
            onClick={() => setSidebarOpen(true)}
            aria-controls="admin-sidebar"
            aria-expanded={sidebarOpen}
          >
            <Menu size={18} /> เมนู
          </button>
          <strong>{currentLabel}</strong>
        </div>
        {module === "attendance" ? <Dashboard /> : <StockDashboard />}
      </div>
    </div>
  );
}

function LoginPanel({ onSignedIn }: { onSignedIn: (session: AuthSession) => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      const nextSession = await signInAdmin(email, password);
      onSignedIn(nextSession);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "เข้าสู่ระบบไม่สำเร็จ");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="login-layout" aria-labelledby="login-heading">
      <div className="login-panel">
        <span className="panel-icon" aria-hidden="true">
          <ShieldCheck size={24} />
        </span>
        <h1 id="login-heading">Admin login</h1>
        <p className="muted-copy">ใช้บัญชี admin ใน Supabase เพื่อดูข้อมูลรายวัน</p>

        <form className="login-form" onSubmit={handleSubmit}>
          <label className="field">
            <span>อีเมล</span>
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="admin@example.com"
              required
            />
          </label>
          <label className="field">
            <span>รหัสผ่าน</span>
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="กรอกรหัสผ่าน"
              required
            />
          </label>

          {error ? (
            <p className="form-error" role="alert">
              {error}
            </p>
          ) : null}

          <button className="primary-button" type="submit" disabled={isSubmitting}>
            {isSubmitting ? <Loader2 className="spin" size={18} /> : <ShieldCheck size={18} />}
            เข้าหน้า admin
          </button>
        </form>
      </div>
    </section>
  );
}

function Dashboard() {
  const [selectedDate, setSelectedDate] = useState(getDefaultDate);
  const [logs, setLogs] = useState<TimeLog[]>([]);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  const summaryRows = useMemo(() => buildDailySummary(logs), [logs]);
  const clockUrl = useMemo(() => `${window.location.origin}/clock`, []);
  const completeCount = summaryRows.filter((row) => row.status === "complete").length;
  const missingOutCount = summaryRows.filter((row) => row.status === "missing_out").length;
  const totalMinutes = sumWorkedMinutes(summaryRows);

  const loadLogs = useCallback(async () => {
    setError("");
    setLoadState("loading");

    try {
      const nextLogs = await fetchLogsByDate(selectedDate);
      setLogs(nextLogs);
      setLoadState("idle");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "โหลดข้อมูลไม่สำเร็จ");
      setLoadState("error");
    }
  }, [selectedDate]);

  useEffect(() => {
    let isCurrent = true;

    fetchLogsByDate(selectedDate)
      .then((nextLogs) => {
        if (!isCurrent) return;
        setLogs(nextLogs);
        setLoadState("idle");
      })
      .catch((cause) => {
        if (!isCurrent) return;
        setError(cause instanceof Error ? cause.message : "โหลดข้อมูลไม่สำเร็จ");
        setLoadState("error");
      });

    return () => {
      isCurrent = false;
    };
  }, [selectedDate]);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(clockUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  return (
    <section className="admin-layout" aria-labelledby="admin-heading">
      <div className="admin-heading-row">
        <div>
          <div className="eyebrow-row">
            <span className="status-dot" />
            Dashboard
          </div>
          <h1 id="admin-heading">สรุปเวลารายวัน</h1>
          <p className="muted-copy">{formatThaiDate(selectedDate)}</p>
        </div>

        <div className="admin-actions">
          <label className="date-control">
            <CalendarDays size={17} />
            <input
              type="date"
              value={selectedDate}
              onChange={(event) => {
                setError("");
                setLoadState("loading");
                setSelectedDate(event.target.value);
              }}
              aria-label="เลือกวันที่"
            />
          </label>
          <button className="icon-text-button" type="button" onClick={loadLogs} disabled={loadState === "loading"}>
            {loadState === "loading" ? <Loader2 className="spin" size={17} /> : <RefreshCw size={17} />}
            รีเฟรช
          </button>
        </div>
      </div>

      <div className="dashboard-grid">
        <aside className="qr-panel" aria-labelledby="qr-heading">
          <div className="panel-title">
            <QrCode size={19} />
            <h2 id="qr-heading">QR สำหรับพนักงาน</h2>
          </div>
          <div className="qr-box">
            <QRCodeSVG value={clockUrl} size={180} marginSize={2} />
          </div>
          <div className="qr-link">{clockUrl}</div>
          <div className="button-row">
            <button className="icon-text-button" type="button" onClick={handleCopy}>
              {copied ? <CheckCircle2 size={17} /> : <Copy size={17} />}
              {copied ? "คัดลอกแล้ว" : "คัดลอกลิงก์"}
            </button>
            <button className="icon-text-button quiet" type="button" onClick={() => window.print()}>
              <Printer size={17} />
              พิมพ์ QR
            </button>
          </div>
        </aside>

        <div className="summary-area">
          <div className="stat-grid" aria-label="ภาพรวมรายวัน">
            <StatCard icon={<UsersRound size={20} />} label="พนักงานวันนี้" value={`${summaryRows.length} คน`} />
            <StatCard icon={<UserRoundCheck size={20} />} label="บันทึกครบ" value={`${completeCount} คน`} />
            <StatCard icon={<ClipboardList size={20} />} label="รอออกงาน" value={`${missingOutCount} คน`} />
            <StatCard icon={<Timer size={20} />} label="รวมเวลาทำงาน" value={formatDuration(totalMinutes)} />
          </div>

          <section className="table-panel" aria-labelledby="table-heading">
            <div className="section-heading-row">
              <div>
                <h2 id="table-heading">ตารางสรุป</h2>
                <p className="muted-copy">ชื่อ ตำแหน่ง เวลาเข้า เวลาออก และเวลาทำงานทั้งหมด</p>
              </div>
              <button className="icon-text-button" type="button" onClick={() => exportLogsCsv(logs)} disabled={!logs.length}>
                <Download size={17} />
                Export CSV
              </button>
            </div>

            {loadState === "error" ? (
              <div className="inline-error" role="alert">
                {error}
              </div>
            ) : loadState === "loading" ? (
              <TableSkeleton />
            ) : summaryRows.length ? (
              <SummaryTable rows={summaryRows} />
            ) : (
              <EmptyState />
            )}
          </section>
        </div>
      </div>

      <section className="activity-panel" aria-labelledby="activity-heading">
        <div className="section-heading-row">
          <div>
            <h2 id="activity-heading">รายการล่าสุด</h2>
            <p className="muted-copy">เรียงตามเวลาที่ scan ในวันเดียวกัน</p>
          </div>
        </div>

        {logs.length ? (
          <ol className="activity-list">
            {logs.map((log) => (
              <li key={log.id}>
                <span className={log.event_type === "clock_in" ? "event-dot in" : "event-dot out"} />
                <div>
                  <strong>{log.employee_name}</strong>
                  <span>
                    {getEventLabel(log.event_type)} · {log.position}
                  </span>
                </div>
                <time>{formatTime(log.scanned_at)} น.</time>
              </li>
            ))}
          </ol>
        ) : (
          <p className="muted-copy">ยังไม่มีรายการในวันนี้</p>
        )}
      </section>
    </section>
  );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="stat-card">
      <span aria-hidden="true">{icon}</span>
      <div>
        <p>{label}</p>
        <strong>{value}</strong>
      </div>
    </div>
  );
}

function SummaryTable({ rows }: { rows: SummaryRow[] }) {
  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th>ชื่อ</th>
            <th>ตำแหน่ง</th>
            <th>เวลาเข้า</th>
            <th>เวลาออก</th>
            <th>เวลาทำงานทั้งหมด</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key}>
              <td>
                <strong>{row.employeeName}</strong>
              </td>
              <td>{row.position}</td>
              <td>{formatTime(row.clockIn)} น.</td>
              <td>{formatTime(row.clockOut)} น.</td>
              <td>
                <span className={row.status === "complete" ? "work-chip complete" : "work-chip pending"}>
                  {formatDuration(row.totalMinutes)}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="empty-state">
      <QrCode size={30} />
      <h3>ยังไม่มีเวลาในวันนี้</h3>
      <p>เมื่อพนักงาน scan QR และบันทึกเวลา รายการจะแสดงที่นี่</p>
    </div>
  );
}

function TableSkeleton() {
  return (
    <div className="skeleton-table" aria-label="กำลังโหลดข้อมูล">
      {Array.from({ length: 5 }).map((_, index) => (
        <span key={index} />
      ))}
    </div>
  );
}

function AdminSkeleton() {
  return (
    <section className="admin-layout" aria-label="กำลังโหลดหน้า admin">
      <div className="skeleton-heading" />
      <TableSkeleton />
    </section>
  );
}
