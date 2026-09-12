import { useCallback, useEffect, useMemo, useState } from "react";
import { Boxes, History, Loader2, LogIn, PackageMinus } from "lucide-react";
import type { EmployeeSession, StockItem, StockMovement } from "../types";
import {
  getEmployeeSession,
  onEmployeeAuthChange,
  signInWithGoogle,
} from "../lib/store";
import { isSupabaseConfigured } from "../lib/supabase";
import { listItems, listMovements, listStockOnHand } from "../lib/stock";
import { getEmployeeStockAccess, type EmployeeStockAccess } from "../lib/stock.permissions";
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
  return <StockWithdrawUI key={session.userId} />;
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
    const access = await getEmployeeStockAccess();
    const [items, mine, onHandByItem] = await Promise.all([listItems(), listMovements({ mine: true }), listStockOnHand()]);
    return { items: items.filter((item) => access.isAdmin || access.itemIds.includes(item.id)), movements: mine, onHandByItem, access };
  }, []);
  const { data, loading, error, reload } = useAsyncData(loadStock, {
    access: null as EmployeeStockAccess | null,
    items: [] as StockItem[],
    movements: [] as StockMovement[],
    onHandByItem: null as Record<string, number> | null,
  });
  const { items, movements, onHandByItem, access } = data;

  const itemGroups = useMemo(() => groupItemsByCategory(items), [items]);
  const todayMine = movements.filter((m) => new Date(m.created_at).toDateString() === new Date().toDateString());

  return (
    <section className="clock-layout employee-stock-layout" aria-labelledby="emp-stock-heading">
      <div className="clock-hero employee-stock-hero">
        <div className="eyebrow-row"><span className="status-dot" />{demo ? "โหมดทดลอง" : "เบิกของ"}</div>
        <h1 id="emp-stock-heading">เบิกของเข้าครัว</h1>
        <p className="lead-copy">เบิกและบันทึกของเสียเฉพาะสินค้าที่ admin มอบหมายให้ตำแหน่งของคุณ</p>
        {access ? <p className="muted-copy">{access.isAdmin ? "Admin · จัดการได้ทุกรายการ" : access.position ? `ตำแหน่ง: ${access.position}` : "ยังไม่ได้รับมอบหมายตำแหน่งสำหรับสต๊อก"}{demo ? " · ทดลองในนามมะลิ" : ""}</p> : null}
      </div>

      <div className="employee-stock-panels">
        <section className="form-panel employee-stock-catalog" aria-labelledby="employee-stock-catalog-heading">
          <div className="employee-stock-section-heading">
            <div>
              <h2 id="employee-stock-catalog-heading">เลือกสินค้า</h2>
              <p>
                สินค้าที่พร้อมให้เบิก {onHandByItem
                  ? items.filter((item) => (onHandByItem[item.id] ?? 0) > 0).length
                  : items.length} รายการ
              </p>
            </div>
            <span className="employee-stock-section-icon" aria-hidden="true"><Boxes size={20} /></span>
          </div>
          {error ? <div role="alert"><p className="form-error">{error}</p><button className="icon-text-button" onClick={reload}>ลองโหลดสินค้าอีกครั้ง</button></div> : null}
          {loading ? (
            <div className="skeleton-table">{Array.from({ length: 4 }).map((_, i) => <span key={i} />)}</div>
          ) : error ? null : itemGroups.length ? (
            <div className="emp-stock-groups">
              {itemGroups.map(([category, categoryItems], categoryIndex) => {
                const headingId = `employee-stock-category-${categoryIndex}`;
                return (
                  <section className="emp-stock-category" key={category} aria-labelledby={headingId}>
                    <div className="emp-stock-category-head">
                      <h3 id={headingId}><span className="status-dot" />{category}</h3>
                      <span>{categoryItems.length} รายการ</span>
                    </div>
                    <ul className="emp-stock-list">
                      {categoryItems.map((item) => {
                        const onHand = onHandByItem?.[item.id];
                        const isOutOfStock = onHand !== undefined && onHand <= 0;
                        return (
                        <li key={item.id} className={isOutOfStock ? "is-out-of-stock" : undefined}>
                          <div>
                            <strong>{item.name}</strong>
                            <span className={isOutOfStock ? "stock-status-out" : "muted-copy"}>
                              {isOutOfStock
                                ? "หมดแล้ว"
                                : onHand !== undefined
                                  ? `คงเหลือ ${formatQuantity(onHand)} ${item.unit}`
                                  : `หน่วย: ${item.unit}`}
                            </span>
                          </div>
                          <button className="icon-text-button" type="button" onClick={() => setMovingItem(item)} disabled={isOutOfStock}>
                            <PackageMinus size={17} /> {isOutOfStock ? "หมดแล้ว" : "เบิก"}
                          </button>
                        </li>
                        );
                      })}
                    </ul>
                  </section>
                );
              })}
            </div>
          ) : (
            <p className="employee-stock-history-empty">ยังไม่มีสินค้าที่ได้รับมอบหมาย กรุณาติดต่อ admin เพื่อกำหนดตำแหน่งและสิทธิ์สินค้า</p>
          )}
        </section>

        <section className="form-panel employee-stock-history" aria-labelledby="employee-stock-history-heading">
          <div className="employee-stock-section-heading">
            <div>
              <h2 id="employee-stock-history-heading">ที่ฉันเบิกวันนี้</h2>
              <p>{todayMine.length ? `${todayMine.length} รายการล่าสุด` : "ยังไม่มีรายการวันนี้"}</p>
            </div>
            <span className="employee-stock-section-icon is-history" aria-hidden="true"><History size={20} /></span>
          </div>
          {todayMine.length ? (
            <ul className="employee-stock-history-list">
              {todayMine.map((m) => {
                const item = items.find((i) => i.id === m.item_id);
                return (
                  <li key={m.id}>
                    <div><strong>{item?.name ?? "—"}</strong><span>{formatQuantity(m.quantity)} {item?.unit ?? ""}</span></div>
                    <time>{formatTime(m.created_at)} น.</time>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="employee-stock-history-empty">รายการที่เบิกจะมาแสดงตรงนี้</p>
          )}
        </section>
      </div>

      {movingItem ? (
        <MovementDialog
          item={movingItem}
          employeeMode
          allowedTypes={["out", "waste"]}
          availableQuantity={onHandByItem?.[movingItem.id]}
          onClose={() => setMovingItem(null)}
          onSaved={() => { setMovingItem(null); void reload(); }}
        />
      ) : null}
    </section>
  );
}

function groupItemsByCategory(items: StockItem[]): [string, StockItem[]][] {
  const groups = new Map<string, StockItem[]>();
  for (const item of items) {
    const category = item.category?.trim() || "ไม่ระบุหมวดหมู่";
    groups.set(category, [...(groups.get(category) ?? []), item]);
  }
  return Array.from(groups.entries()).sort(([first], [second]) => first.localeCompare(second, "th-TH"));
}
