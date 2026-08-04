import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowDownCircle,
  ArrowUpCircle,
  CalendarDays,
  Loader2,
  PackageSearch,
  RefreshCw,
  Trash2,
} from "lucide-react";
import type { ItemBalance, StockItem, StockMovement } from "../../types";
import { listItems, listMovements } from "../../lib/stock";
import { computeDailyStats, computeItemBalances, findLowStockItems, formatQuantity } from "../../lib/stock.calc";
import { formatDateInput, formatDateTime, formatThaiDate } from "../../lib/time";
import ItemStockCard from "./ItemStockCard";

type LoadState = "loading" | "idle" | "error";

export default function StockDashboard() {
  const [selectedDate, setSelectedDate] = useState(() => formatDateInput(new Date()));
  const [items, setItems] = useState<StockItem[]>([]);
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    setLoadState("loading");
    try {
      const [nextItems, nextMoves] = await Promise.all([listItems(), listMovements()]);
      setItems(nextItems);
      setMovements(nextMoves);
      setLoadState("idle");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "โหลดข้อมูลไม่สำเร็จ");
      setLoadState("error");
    }
  }, []);

  useEffect(() => {
    let isCurrent = true;

    Promise.all([listItems(), listMovements()])
      .then(([nextItems, nextMoves]) => {
        if (!isCurrent) return;
        setItems(nextItems);
        setMovements(nextMoves);
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
  }, []);

  const balances = useMemo(() => computeItemBalances(items, movements), [items, movements]);
  const daily = useMemo(() => computeDailyStats(movements, selectedDate), [movements, selectedDate]);
  const lowItems = useMemo(() => findLowStockItems(balances), [balances]);
  const grouped = useMemo(() => groupByCategory(balances), [balances]);

  return (
    <section className="admin-layout" aria-labelledby="stock-heading">
      <div className="admin-heading-row">
        <div>
          <div className="eyebrow-row"><span className="status-dot" />สต๊อกสินค้า</div>
          <h1 id="stock-heading">คลังสินค้าร้านชาบู</h1>
          <p className="muted-copy">{formatThaiDate(selectedDate)}</p>
        </div>
        <div className="admin-actions">
          <label className="date-control">
            <CalendarDays size={17} />
            <input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} aria-label="เลือกวันที่" />
          </label>
          <button className="icon-text-button" type="button" onClick={() => void load()} disabled={loadState === "loading"}>
            {loadState === "loading" ? <Loader2 className="spin" size={17} /> : <RefreshCw size={17} />}
            รีเฟรช
          </button>
        </div>
      </div>

      <div className="stat-grid" aria-label="สรุปการเคลื่อนไหววันนี้">
        <StockStat icon={<ArrowUpCircle size={20} />} label="รับเข้าวันนี้" value={formatQuantity(daily.received)} />
        <StockStat icon={<ArrowDownCircle size={20} />} label="เบิกออกวันนี้" value={formatQuantity(daily.withdrawn)} />
        <StockStat icon={<Trash2 size={20} />} label="ของเสียวันนี้" value={formatQuantity(daily.waste)} />
        <StockStat icon={<PackageSearch size={20} />} label="รายการสินค้า" value={`${items.length} อย่าง`} />
      </div>

      {lowItems.length ? (
        <div className="low-alert" role="status">
          <AlertTriangle size={18} />
          <span>ของใกล้หมด {lowItems.length} รายการ: {lowItems.map((b) => b.item.name).join(", ")}</span>
        </div>
      ) : null}

      {loadState === "error" ? (
        <div className="inline-error" role="alert">{error}</div>
      ) : loadState === "loading" ? (
        <TableSkeleton />
      ) : balances.length ? (
        grouped.map(([category, group]) => (
          <section key={category} className="stock-group" aria-label={category}>
            <h2 className="stock-group-title">{category}</h2>
            <div className="stock-card-grid">
              {group.map((balance) => <ItemStockCard key={balance.item.id} balance={balance} />)}
            </div>
          </section>
        ))
      ) : (
        <div className="empty-state">
          <PackageSearch size={30} />
          <h3>ยังไม่มีสินค้าในคลัง</h3>
          <p>เพิ่มสินค้าเพื่อเริ่มจัดการสต๊อก</p>
        </div>
      )}

      <RecentMovements movements={movements} items={items} />
    </section>
  );
}

function StockStat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="stat-card">
      <span aria-hidden="true">{icon}</span>
      <div><p>{label}</p><strong>{value}</strong></div>
    </div>
  );
}

function RecentMovements({ movements, items }: { movements: StockMovement[]; items: StockItem[] }) {
  const nameById = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);
  const recent = movements.slice(0, 15);
  const typeLabel: Record<StockMovement["type"], string> = { in: "รับเข้า", out: "เบิกออก", waste: "ของเสีย" };
  if (!recent.length) return null;
  return (
    <section className="activity-panel" aria-labelledby="stock-activity">
      <div className="section-heading-row">
        <div><h2 id="stock-activity">การเคลื่อนไหวล่าสุด</h2><p className="muted-copy">ใครเบิก/รับ อะไร เมื่อไหร่</p></div>
      </div>
      <ol className="activity-list">
        {recent.map((move) => {
          const item = nameById.get(move.item_id);
          return (
            <li key={move.id}>
              <span className={`stock-dot ${move.type}`} />
              <div>
                <strong>{item?.name ?? "—"}</strong>
                <span>{typeLabel[move.type]} {formatQuantity(move.quantity)} {item?.unit ?? ""} · {move.actor_name ?? "—"}{move.note ? ` · ${move.note}` : ""}</span>
              </div>
              <time>{formatDateTime(move.created_at)}</time>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function TableSkeleton() {
  return <div className="skeleton-table" aria-label="กำลังโหลดข้อมูล">{Array.from({ length: 4 }).map((_, i) => <span key={i} />)}</div>;
}

function groupByCategory(balances: ItemBalance[]): [string, ItemBalance[]][] {
  const groups = new Map<string, ItemBalance[]>();
  for (const balance of balances) {
    const key = balance.item.category ?? "ไม่ระบุหมวดหมู่";
    groups.set(key, [...(groups.get(key) ?? []), balance]);
  }
  return Array.from(groups.entries()).sort((a, b) => a[0].localeCompare(b[0], "th-TH"));
}
