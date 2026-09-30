import { useEffect, useState, type ReactNode } from "react";
import { Clock3, Loader2, LogOut, Menu, PackageMinus, Pencil, UserRound, X } from "lucide-react";
import type { EmployeeSession } from "../types";
import { getEmployeeSession, onEmployeeAuthChange, signOutCurrentUser } from "../lib/store";
import { isSupabaseConfigured } from "../lib/supabase";
import EmployeeNameDialog from "./EmployeeNameDialog";

type EmployeeRoute = "clock" | "stock";

interface Props {
  route: EmployeeRoute;
  onNavigate: (path: "/clock" | "/stock") => void;
  children: ReactNode;
}

export default function EmployeeShell({ route, onNavigate, children }: Props) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [session, setSession] = useState<EmployeeSession | null | undefined>(() =>
    isSupabaseConfigured ? undefined : { userId: "demo", nickname: "โหมดทดลอง" },
  );
  const [editingName, setEditingName] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [accountError, setAccountError] = useState("");

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let mounted = true;
    getEmployeeSession()
      .then((nextSession) => {
        if (mounted) setSession(nextSession);
      })
      .catch(() => {
        if (mounted) setSession(null);
      });
    const unsubscribe = onEmployeeAuthChange(setSession);
    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!sidebarOpen) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setSidebarOpen(false);
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [sidebarOpen]);

  function selectRoute(path: "/clock" | "/stock") {
    onNavigate(path);
    setSidebarOpen(false);
  }

  const currentLabel = route === "clock" ? "ลงเวลา" : "เบิกของ";

  if (!session) {
    return <div className="employee-login-shell">{children}</div>;
  }

  async function handleSignOut() {
    setAccountError("");
    setSigningOut(true);
    try {
      await signOutCurrentUser();
    } catch (cause) {
      setAccountError(cause instanceof Error ? cause.message : "ออกจากระบบไม่สำเร็จ");
      setSigningOut(false);
    }
  }

  return (
    <div className="admin-shell employee-shell">
      <aside
        id="employee-sidebar"
        className={sidebarOpen ? "admin-sidebar employee-sidebar is-open" : "admin-sidebar employee-sidebar"}
      >
        <div className="admin-sidebar-head">
          <div>
            <strong>พนักงาน</strong>
            <span>เมนูใช้งานประจำวัน</span>
          </div>
          <button className="icon-button admin-sidebar-close" type="button" onClick={() => setSidebarOpen(false)} aria-label="ปิดเมนู">
            <X size={18} />
          </button>
        </div>

        <nav className="admin-sidebar-nav" aria-label="เมนูพนักงาน">
          <span className="admin-sidebar-label">เมนูหลัก</span>
          <button
            className={route === "clock" ? "admin-sidebar-link is-active" : "admin-sidebar-link"}
            type="button"
            onClick={() => selectRoute("/clock")}
            aria-current={route === "clock" ? "page" : undefined}
          >
            <Clock3 size={19} />
            <span><strong>ลงเวลา</strong><small>บันทึกเข้างานและออกงาน</small></span>
          </button>
          <button
            className={route === "stock" ? "admin-sidebar-link is-active" : "admin-sidebar-link"}
            type="button"
            onClick={() => selectRoute("/stock")}
            aria-current={route === "stock" ? "page" : undefined}
          >
            <PackageMinus size={19} />
            <span><strong>เบิกของ</strong><small>เบิกใช้หรือแจ้งของเสีย</small></span>
          </button>
        </nav>

        {isSupabaseConfigured ? (
          <div className="employee-sidebar-account">
            <UserRound size={18} aria-hidden="true" />
            <span><small>เข้าสู่ระบบเป็น</small><strong>{session.nickname ?? "พนักงาน"}</strong></span>
            <div className="employee-account-actions">
              <button className="icon-button" type="button" onClick={() => setEditingName(true)} aria-label="แก้ไขชื่อ" title="แก้ไขชื่อ">
                <Pencil size={17} />
              </button>
              <button className="icon-button employee-signout-button" type="button" onClick={() => void handleSignOut()} disabled={signingOut} aria-label="ออกจากระบบ" title="ออกจากระบบ">
                {signingOut ? <Loader2 className="spin" size={17} /> : <LogOut size={17} />}
              </button>
            </div>
            {accountError ? <p className="employee-account-error" role="alert">{accountError}</p> : null}
          </div>
        ) : null}
      </aside>

      {sidebarOpen ? <button className="admin-sidebar-backdrop" type="button" onClick={() => setSidebarOpen(false)} aria-label="ปิดเมนู" /> : null}

      <div className="admin-workspace employee-workspace">
        <div className="admin-mobile-nav">
          <button
            className="icon-text-button"
            type="button"
            onClick={() => setSidebarOpen(true)}
            aria-controls="employee-sidebar"
            aria-expanded={sidebarOpen}
          >
            <Menu size={18} /> เมนู
          </button>
          <strong>{currentLabel}</strong>
        </div>
        {children}
      </div>
      {editingName ? (
        <EmployeeNameDialog
          nickname={session.nickname ?? ""}
          onClose={() => setEditingName(false)}
          onSaved={(nickname) => {
            setSession({ ...session, nickname });
            setEditingName(false);
          }}
        />
      ) : null}
    </div>
  );
}
