import { useEffect, useState, type ReactNode } from "react";
import { Clock3, Info, Menu, PackageMinus, X } from "lucide-react";

type EmployeeRoute = "clock" | "stock";

interface Props {
  route: EmployeeRoute;
  onNavigate: (path: "/clock" | "/stock") => void;
  children: ReactNode;
}

export default function EmployeeShell({ route, onNavigate, children }: Props) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

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

        <div className="employee-sidebar-note">
          <Info size={17} aria-hidden="true" />
          <span>ใช้บัญชี Google เดียวกันได้ทั้งสองเมนู</span>
        </div>
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
    </div>
  );
}
