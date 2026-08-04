import { useCallback, useMemo, useState } from "react";
import {
  AlertTriangle,
  CalendarDays,
  Eye,
  EyeOff,
  Loader2,
  PackageSearch,
  Plus,
  RefreshCw,
  Trash2,
} from "lucide-react";
import type { ItemBalance, StockItem, StockMovement } from "../../types";
import { isOpeningBalanceMovement, listItems, listMovements, updateItem } from "../../lib/stock";
import { computeDailyStats, computeItemBalances, findLowStockItems, formatQuantity } from "../../lib/stock.calc";
import { useAsyncData } from "../../lib/useAsyncData";
import { formatDateInput, formatDateTime, formatThaiDate } from "../../lib/time";
import ItemStockCard from "./ItemStockCard";
import ItemFormDialog from "./ItemFormDialog";
import DeleteItemDialog from "./DeleteItemDialog";
import MovementDialog from "./MovementDialog";
import StockOverviewChart from "./StockOverviewChart";
import ClearHistoryDialog from "./ClearHistoryDialog";

export default function StockDashboard() {
  const [selectedDate, setSelectedDate] = useState(() => formatDateInput(new Date()));
  const [editing, setEditing] = useState<StockItem | null | "new">(null);
  const [movingItem, setMovingItem] = useState<StockItem | null>(null);
  const [deletingItem, setDeletingItem] = useState<StockItem | null>(null);
  const [clearingHistory, setClearingHistory] = useState(false);
  const [showArchived, setShowArchived] = useState(false);

  const loadStock = useCallback(async () => {
    const [items, movements] = await Promise.all([listItems({ includeArchived: true }), listMovements()]);
    return { items, movements };
  }, []);
  const { data, loading, error, reload } = useAsyncData(loadStock, {
    items: [] as StockItem[],
    movements: [] as StockMovement[],
  });
  const { items, movements } = data;

  const balances = useMemo(() => computeItemBalances(items, movements), [items, movements]);
  const activeBalances = useMemo(() => balances.filter((b) => b.item.is_active), [balances]);
  const visibleBalances = useMemo(
    () => (showArchived ? balances : activeBalances),
    [showArchived, balances, activeBalances],
  );
  const archivedCount = balances.length - activeBalances.length;
  const daily = useMemo(() => computeDailyStats(movements, selectedDate), [movements, selectedDate]);
  const lowItems = useMemo(() => findLowStockItems(activeBalances), [activeBalances]);
  const visibleMovementCount = useMemo(
    () => movements.filter((movement) => !isOpeningBalanceMovement(movement)).length,
    [movements],
  );
  const grouped = useMemo(() => groupByCategory(visibleBalances), [visibleBalances]);
  const categories = useMemo(
    () => Array.from(new Set(items.map((i) => i.category).filter((c): c is string => !!c))),
    [items],
  );

  const handleRestore = useCallback(
    async (item: StockItem) => {
      try {
        await updateItem(item.id, { is_active: true });
      } finally {
        reload();
      }
    },
    [reload],
  );

  return (
    <section className="admin-layout admin-dashboard-layout stock-dashboard-layout" aria-labelledby="stock-heading">
      <div className="admin-heading-row admin-dashboard-heading stock-dashboard-heading">
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
          <button className="icon-text-button" type="button" onClick={() => setEditing("new")}><Plus size={17} /> เพิ่มสินค้า</button>
          {archivedCount > 0 ? (
            <button
              className={showArchived ? "icon-text-button" : "icon-text-button quiet"}
              type="button"
              onClick={() => setShowArchived((v) => !v)}
              aria-pressed={showArchived}
            >
              {showArchived ? <EyeOff size={17} /> : <Eye size={17} />}
              {showArchived ? "ซ่อนที่ปิดใช้งาน" : `ที่ปิดใช้งาน (${archivedCount})`}
            </button>
          ) : null}
          <button className="icon-text-button" type="button" onClick={() => void reload()} disabled={loading}>
            {loading ? <Loader2 className="spin" size={17} /> : <RefreshCw size={17} />}
            รีเฟรช
          </button>
        </div>
      </div>

      {activeBalances.length ? <StockOverviewChart balances={activeBalances} daily={daily} /> : null}

      {lowItems.length ? (
        <div className="low-alert" role="status">
          <AlertTriangle size={18} />
          <span>ของใกล้หมด {lowItems.length} รายการ: {lowItems.map((b) => b.item.name).join(", ")}</span>
        </div>
      ) : null}

      {error ? (
        <div className="inline-error" role="alert">{error}</div>
      ) : loading ? (
        <TableSkeleton />
      ) : visibleBalances.length ? (
        grouped.map(([category, group]) => (
          <section key={category} className="stock-group" aria-label={category}>
            <h2 className="stock-group-title">{category}</h2>
            <div className="stock-card-grid">
              {group.map((balance) =>
                balance.item.is_active ? (
                  <ItemStockCard
                    key={balance.item.id}
                    balance={balance}
                    onEdit={() => setEditing(balance.item)}
                    onRecord={() => setMovingItem(balance.item)}
                    onDelete={() => setDeletingItem(balance.item)}
                  />
                ) : (
                  <ItemStockCard
                    key={balance.item.id}
                    balance={balance}
                    onRestore={() => void handleRestore(balance.item)}
                  />
                ),
              )}
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

      <RecentMovements movements={movements} items={items} onClear={() => setClearingHistory(true)} />

      {editing ? (
        <ItemFormDialog
          item={editing === "new" ? undefined : editing}
          currentOnHand={editing === "new" ? undefined : balances.find((balance) => balance.item.id === editing.id)?.onHand ?? 0}
          categorySuggestions={categories}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); void reload(); }}
        />
      ) : null}
      {movingItem ? (
        <MovementDialog
          item={movingItem}
          allowedTypes={["in", "out", "waste"]}
          onClose={() => setMovingItem(null)}
          onSaved={() => { setMovingItem(null); void reload(); }}
        />
      ) : null}
      {deletingItem ? (
        <DeleteItemDialog
          item={deletingItem}
          onClose={() => setDeletingItem(null)}
          onDeleted={() => { setDeletingItem(null); void reload(); }}
        />
      ) : null}
      {clearingHistory ? (
        <ClearHistoryDialog
          balances={balances}
          historyCount={visibleMovementCount}
          onClose={() => setClearingHistory(false)}
          onCleared={() => { setClearingHistory(false); void reload(); }}
        />
      ) : null}
    </section>
  );
}

function RecentMovements({ movements, items, onClear }: { movements: StockMovement[]; items: StockItem[]; onClear: () => void }) {
  const nameById = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);
  const recent = movements.filter((movement) => !isOpeningBalanceMovement(movement)).slice(0, 15);
  const typeLabel: Record<StockMovement["type"], string> = { in: "รับเข้า", out: "เบิกออก", waste: "ของเสีย" };
  if (!recent.length) return null;
  return (
    <section className="activity-panel" aria-labelledby="stock-activity">
      <div className="section-heading-row">
        <div><h2 id="stock-activity">การเคลื่อนไหวล่าสุด</h2><p className="muted-copy">ใครเบิก/รับ อะไร เมื่อไหร่</p></div>
        <button className="icon-text-button quiet stock-clear-history-button" type="button" onClick={onClear}>
          <Trash2 size={17} /> เคลียร์ประวัติ
        </button>
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
