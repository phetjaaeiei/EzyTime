import { useEffect, useState } from "react";
import { Clock3, LayoutDashboard, QrCode } from "lucide-react";
import AdminDashboard from "./components/AdminDashboard";
import ClockPage from "./components/ClockPage";

type Route = "admin" | "clock";

function getRouteFromPath(): Route {
  return window.location.pathname.startsWith("/clock") ? "clock" : "admin";
}

export default function App() {
  const [route, setRoute] = useState<Route>(getRouteFromPath);

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
        <button className="brand-button" type="button" onClick={() => navigate("/")}>
          <span className="brand-mark" aria-hidden="true">
            <Clock3 size={20} strokeWidth={2.4} />
          </span>
          <span>
            <span className="brand-name">EzyTime</span>
            <span className="brand-caption">QR attendance</span>
          </span>
        </button>

        <nav className="route-tabs" aria-label="หน้าในระบบ">
          <button
            className={route === "admin" ? "route-tab is-active" : "route-tab"}
            type="button"
            onClick={() => navigate("/")}
          >
            <LayoutDashboard size={18} />
            Admin
          </button>
          <button
            className={route === "clock" ? "route-tab is-active" : "route-tab"}
            type="button"
            onClick={() => navigate("/clock")}
          >
            <QrCode size={18} />
            Scan
          </button>
        </nav>
      </header>

      <main id="main-content" className="page-frame">
        {route === "clock" ? <ClockPage /> : <AdminDashboard />}
      </main>
    </div>
  );
}
