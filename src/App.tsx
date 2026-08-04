import { useEffect, useState } from "react";
import { Clock3, LayoutDashboard } from "lucide-react";
import AdminDashboard from "./components/AdminDashboard";
import ClockPage from "./components/ClockPage";
import StockPage from "./components/StockPage";

type Route = "admin" | "clock" | "stock";

function getRouteFromPath(): Route {
  const path = window.location.pathname;
  if (path.startsWith("/clock")) return "clock";
  if (path.startsWith("/stock")) return "stock";
  return "admin";
}

export default function App() {
  const [route, setRoute] = useState<Route>(getRouteFromPath);
  const isEmployeeRoute = route === "clock" || route === "stock";

  useEffect(() => {
    const handlePopState = () => setRoute(getRouteFromPath());
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  function navigate(path: string) {
    window.history.pushState({}, "", path);
    setRoute(getRouteFromPath());
  }

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        ข้ามไปเนื้อหา
      </a>
      <header className="topbar">
        {isEmployeeRoute ? (
          <div className="brand-button" aria-label="EzyTime QR attendance">
            <span className="brand-mark" aria-hidden="true">
              <Clock3 size={20} strokeWidth={2.4} />
            </span>
            <span>
              <span className="brand-name">EzyTime</span>
              <span className="brand-caption">QR attendance</span>
            </span>
          </div>
        ) : (
          <button className="brand-button" type="button" onClick={() => navigate("/")}>
            <span className="brand-mark" aria-hidden="true">
              <Clock3 size={20} strokeWidth={2.4} />
            </span>
            <span>
              <span className="brand-name">EzyTime</span>
              <span className="brand-caption">QR attendance</span>
            </span>
          </button>
        )}

        {isEmployeeRoute ? (
          <nav className="route-tabs" aria-label="เมนูพนักงาน">
            <button className={route === "clock" ? "route-tab is-active" : "route-tab"} type="button" onClick={() => navigate("/clock")}>ลงเวลา</button>
            <button className={route === "stock" ? "route-tab is-active" : "route-tab"} type="button" onClick={() => navigate("/stock")}>เบิกของ</button>
          </nav>
        ) : (
          <nav className="route-tabs" aria-label="หน้าในระบบ">
            <button
              className={route === "admin" ? "route-tab is-active" : "route-tab"}
              type="button"
              onClick={() => navigate("/")}
            >
              <LayoutDashboard size={18} />
              Admin
            </button>
          </nav>
        )}
      </header>

      <main id="main-content" className="page-frame">
        {route === "clock" ? <ClockPage /> : route === "stock" ? <StockPage /> : <AdminDashboard />}
      </main>
    </div>
  );
}
