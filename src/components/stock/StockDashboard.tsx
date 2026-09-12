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
  Search,
  Trash2,
} from "lucide-react";
import type { ItemBalance, StockItem, StockMovement } from "../../types";
import { isOpeningBalanceMovement, listItems, listMovements, updateItem } from "../../lib/stock";
import { computeDailyStats, computeItemBalances, findLowStockItems, formatQuantity } from "../../lib/stock.calc";
import { matchesStockSearch } from "../../lib/stock.search";
import { useAsyncData } from "../../lib/useAsyncData";
import { formatDateInput, formatDateTime, formatThaiDate } from "../../lib/time";
import ItemStockCard from "./ItemStockCard";
import ItemFormDialog from "./ItemFormDialog";
import DeleteItemDialog from "./DeleteItemDialog";
import MovementDialog from "./MovementDialog";
import StockOverviewChart from "./StockOverviewChart";
import ClearHistoryDialog from "./ClearHistoryDialog";
import StockOrderEditor from "./StockOrderEditor";
import { useStockOrder } from "../../lib/useStockOrder";
import { applyStockOrder } from "../../lib/stock.layout";
import StockPermissionsPanel from "./StockPermissionsPanel";

export default function StockDashboard() {
  const layout = useStockOrder();
  const [showPermissions, setShowPermissions] = useState(false);
  const [selectedDate, setSelectedDate] = useState(() => formatDateInput(new Date()));
  const [editing, setEditing] = useState<StockItem | null | "new">(null);
  const [movingItem, setMovingItem] = useState<StockItem | null>(null);
  const [deletingItems, setDeletingItems] = useState<StockItem[]>([]);
  const [selecting, setSelecting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [deleteMessage, setDeleteMessage] = useState("");
  const [clearingHistory, setClearingHistory] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [query, setQuery] = useState("");

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
  const trimmedQuery = query.trim();
  const searchedBalances = useMemo(
    () => (trimmedQuery ? visibleBalances.filter((balance) => matchesStockSearch(balance.item, trimmedQuery)) : visibleBalances),
    [visibleBalances, trimmedQuery],
  );
  const selectedItems = searchedBalances.filter(balance => selectedIds.includes(balance.item.id)).map(balance => balance.item);
  function selectItem(id: string, checked: boolean) {
    setSelectedIds(current => checked ? [...new Set([...current, id])] : current.filter(value => value !== id));
  }
  const daily = useMemo(() => computeDailyStats(movements, selectedDate), [movements, selectedDate]);
  const outOfStockItems = useMemo(() => activeBalances.filter((balance) => balance.onHand <= 0), [activeBalances]);
  const lowItems = useMemo(() => findLowStockItems(activeBalances).filter((balance) => balance.onHand > 0), [activeBalances]);
  const visibleMovementCount = useMemo(
    () => movements.filter((movement) => !isOpeningBalanceMovement(movement)).length,
    [movements],
  );
  const grouped: [string, ItemBalance[]][] = layout.order.length
    ? [["ลำดับสินค้าของฉัน", applyStockOrder(searchedBalances.map(balance => ({ ...balance, id: balance.item.id })), layout.order)]]
    : groupByCategory(searchedBalances);
  const categories = useMemo(
    () => Array.from(new Set(items.map((item) => item.category?.trim()).filter((value): value is string => !!value)))
      .sort((first, second) => first.localeCompare(second, "th-TH")),
    [items],
  );
  const units = useMemo(
    () => Array.from(new Set(items.map((item) => item.unit.trim()).filter(Boolean)))
      .sort((first, second) => first.localeCompare(second, "th-TH")),
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
          <button className="icon-text-button" type="button" aria-pressed={selecting} onClick={() => { setSelecting(value => !value); setSelectedIds([]); setDeleteMessage(""); }}><Trash2 size={17} /> {selecting ? "ยกเลิกการเลือก" : "เลือกลบสินค้า"}</button>
          <button className="icon-text-button" type="button" aria-expanded={showPermissions} onClick={() => setShowPermissions((value) => !value)}>สิทธิ์จัดการสต๊อก</button>
          <label className="date-control">
            <CalendarDays size={17} />
            <input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} aria-label="เลือกวันที่" />
          </label>
          <button className="icon-text-button" type="button" onClick={() => setEditing("new")}><Plus size={17} /> เพิ่มสินค้า</button>
          {archivedCount > 0 ? (
            <button
              className={showArchived ? "icon-text-button" : "icon-text-button quiet"}
              type="button"
              onClick={() => { setShowArchived((v) => !v); setSelectedIds([]); }}
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

      {showPermissions && !loading && !error ? <StockPermissionsPanel items={items} /> : null}

      {activeBalances.length ? <StockOverviewChart balances={activeBalances} daily={daily} /> : null}

      {lowItems.length ? (
        <div className="low-alert" role="status">
          <AlertTriangle size={18} />
          <span>ของใกล้หมด {lowItems.length} รายการ: {lowItems.map((b) => b.item.name).join(", ")}</span>
        </div>
      ) : null}
      {outOfStockItems.length ? (
        <div className="low-alert out-of-stock-alert" role="status">
          <AlertTriangle size={18} />
          <span>สินค้าหมด {outOfStockItems.length} รายการ: {outOfStockItems.map((b) => b.item.name).join(", ")}</span>
        </div>
      ) : null}

      {!loading && !error && visibleBalances.length ? (
        <div className="stock-search">
          <Search size={17} aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="ค้นหาสินค้า…"
            aria-label="ค้นหาสินค้า"
          />
        </div>
      ) : null}

      {deleteMessage ? <p role="status">{deleteMessage}</p> : null}
      {selecting && !loading && !error ? (
        <section className="stock-bulk-toolbar" aria-label="ลบสินค้าที่เลือก">
          <strong>เลือก {selectedItems.length} จาก {searchedBalances.length} รายการที่แสดง</strong>
          <button type="button" className="icon-text-button" onClick={() => setSelectedIds(searchedBalances.map(balance => balance.item.id))}>เลือกทั้งหมดที่แสดง</button>
          <button type="button" className="icon-text-button quiet" onClick={() => setSelectedIds([])}>ล้างการเลือก</button>
          <button type="button" className="danger-button" disabled={!selectedItems.length} onClick={() => setDeletingItems(selectedItems)}><Trash2 size={17} /> ลบถาวร {selectedItems.length} รายการ</button>
        </section>
      ) : null}
      {!selecting && !trimmedQuery && !loading && !error ? <StockOrderEditor items={visibleBalances.map(balance => balance.item)} {...layout} /> : null}

      {error ? (
        <div className="inline-error" role="alert">{error}</div>
      ) : loading ? (
        <TableSkeleton />
      ) : searchedBalances.length ? (
        grouped.map(([category, group]) => (
          <section key={category} className="stock-group" aria-label={category}>
            <h2 className="stock-group-title">{category}</h2>
            <div className="stock-card-grid">
              {group.map((balance) =>
                balance.item.is_active ? (
                  <ItemStockCard
                    key={balance.item.id}
                    balance={balance}
                    selected={selectedIds.includes(balance.item.id)}
                    onSelect={selecting ? checked => selectItem(balance.item.id, checked) : undefined}
                    onEdit={() => setEditing(balance.item)}
                    onRecord={() => setMovingItem(balance.item)}
                    onDelete={selecting ? undefined : () => setDeletingItems([balance.item])}
                  />
                ) : (
                  <ItemStockCard
                    key={balance.item.id}
                    balance={balance}
                    onRestore={() => void handleRestore(balance.item)}
                    selected={selectedIds.includes(balance.item.id)}
                    onSelect={selecting ? checked => selectItem(balance.item.id, checked) : undefined}
                    onDelete={selecting ? undefined : () => setDeletingItems([balance.item])}
                  />
                ),
              )}
            </div>
          </section>
        ))
      ) : trimmedQuery ? (
        <div className="empty-state">
          <PackageSearch size={30} />
          <h3>ไม่พบสินค้าที่ค้นหา</h3>
          <p>ลองค้นด้วยคำอื่น หรือล้างคำค้นหา “{trimmedQuery}”</p>
        </div>
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
          balance={editing === "new" ? undefined : balances.find((balance) => balance.item.id === editing.id)}
          categorySuggestions={categories}
          unitSuggestions={units}
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
      {deletingItems.length ? (
        <DeleteItemDialog
          items={deletingItems}
          movementCount={movements.filter(move => deletingItems.some(item => item.id === move.item_id)).length}
          onClose={() => setDeletingItems([])}
          onDeleted={() => { setDeleteMessage(`ลบสินค้า ${deletingItems.length} รายการพร้อมประวัติถาวรแล้ว`); setDeletingItems([]); setSelectedIds([]); setSelecting(false); void reload(); }}
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
