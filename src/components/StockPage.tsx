import { useCallback, useEffect, useState } from "react";
import { Boxes, Loader2, LogIn, LogOut, PackageMinus } from "lucide-react";
import type { EmployeeSession, StockItem, StockMovement } from "../types";
import {
  getEmployeeSession,
  onEmployeeAuthChange,
  signInWithGoogle,
  signOutCurrentUser,
} from "../lib/store";
import { isSupabaseConfigured } from "../lib/supabase";
import { listItems, listMovements } from "../lib/stock";
import { formatQuantity } from "../lib/stock.calc";
import { useAsyncData } from "../lib/useAsyncData";
import { formatTime } from "../lib/time";
import MovementDialog from "./stock/MovementDialog";

export default function StockPage() {
  if (!isSupabaseConfigured) return <StockWithdrawUI demo />;
  return <GoogleGate />;
}

function GoogleGate() {
  const [session, setSession] = useState<EmployeeSession | null | undefined>(undefined);
  useEffect(() => {
    let mounted = true;
    getEmployeeSession().then((s) => mounted && setSession(s)).catch(() => mounted && setSession(null));
    const unsub = onEmployeeAuthChange(setSession);
    return () => { mounted = false; unsub(); };
  }, []);

  if (session === undefined) return <section className="clock-layout" aria-label="กำลังโหลด"><div className="skeleton-heading" /></section>;
  if (!session) return <SignInPanel />;
  return <StockWithdrawUI />;
}

function SignInPanel() {
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  async function signIn() {
    setError(""); setSubmitting(true);
    try { await signInWithGoogle(); } catch (c) { setError(c instanceof Error ? c.message : "เข้าสู่ระบบไม่สำเร็จ"); setSubmitting(false); }
  }
  return (
    <section className="clock-layout employee-auth-layout">
      <div className="form-panel employee-auth-card">
        <span className="panel-icon" aria-hidden="true"><Boxes size={24} /></span>
        <h1>เข้าสู่ระบบเพื่อเบิกของ</h1>
        <p className="muted-copy">ใช้บัญชี Google เดียวกับที่ลงเวลา</p>
        {error ? <p className="form-error" role="alert">{error}</p> : null}
        <button className="primary-button" type="button" onClick={signIn} disabled={submitting}>
          {submitting ? <Loader2 className="spin" size={18} /> : <LogIn size={18} />} เข้าสู่ระบบด้วย Google
        </button>
      </div>
    </section>
  );
}

function StockWithdrawUI({ demo = false }: { demo?: boolean }) {
  const [movingItem, setMovingItem] = useState<StockItem | null>(null);

  const loadStock = useCallback(async () => {
    const [items, mine] = await Promise.all([listItems(), listMovements({ mine: true })]);
    return { items, movements: mine };
  }, []);
  const { data, loading, error, reload } = useAsyncData(loadStock, {
    items: [] as StockItem[],
    movements: [] as StockMovement[],
  });
  const { items, movements } = data;

  const todayMine = movements.filter((m) => new Date(m.created_at).toDateString() === new Date().toDateString());

  return (
    <section className="clock-layout" aria-labelledby="emp-stock-heading">
      <div className="clock-hero">
        <div className="eyebrow-row"><span className="status-dot" />{demo ? "โหมดทดลอง" : "เบิกของ"}</div>
        <h1 id="emp-stock-heading">เบิกของเข้าครัว</h1>
        <p className="lead-copy">เลือกสินค้าแล้วกดเบิก ระบบจะบันทึกชื่อและเวลาให้อัตโนมัติ</p>
        {!demo ? (
          <div className="button-row">
            <button className="field-link-button" type="button" onClick={() => signOutCurrentUser()}>
              <LogOut size={15} /> ออกจากระบบ
            </button>
          </div>
        ) : null}
      </div>

      <div className="form-panel">
        {error ? <p className="form-error" role="alert">{error}</p> : null}
        {loading ? (
          <div className="skeleton-table">{Array.from({ length: 4 }).map((_, i) => <span key={i} />)}</div>
        ) : (
          <ul className="emp-stock-list">
            {items.map((item) => (
              <li key={item.id}>
                <div>
                  <strong>{item.name}</strong>
                  <span className="muted-copy">หน่วย: {item.unit}{item.category ? ` · ${item.category}` : ""}</span>
                </div>
                <button className="icon-text-button" type="button" onClick={() => setMovingItem(item)}>
                  <PackageMinus size={17} /> เบิก
                </button>
              </li>
            ))}
            {!items.length ? <li className="muted-copy">ยังไม่มีสินค้าให้เบิก</li> : null}
          </ul>
        )}

        {todayMine.length ? (
          <div className="emp-today">
            <h2>ที่ฉันเบิกวันนี้</h2>
            <ul>
              {todayMine.map((m) => {
                const item = items.find((i) => i.id === m.item_id);
                return <li key={m.id}>{item?.name ?? "—"} {formatQuantity(m.quantity)} {item?.unit ?? ""} · {formatTime(m.created_at)} น.</li>;
              })}
            </ul>
          </div>
        ) : null}
      </div>

      {movingItem ? (
        <MovementDialog
          item={movingItem}
          allowedTypes={["out", "waste"]}
          onClose={() => setMovingItem(null)}
          onSaved={() => { setMovingItem(null); void reload(); }}
        />
      ) : null}
    </section>
  );
}
