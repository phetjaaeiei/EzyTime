import { useCallback, useMemo, useState } from "react";
import { Loader2, RefreshCw, Search } from "lucide-react";
import type { StockItem, StockMovement } from "../../types";
import { isOpeningBalanceMovement, listItems, listMovements } from "../../lib/stock";
import { formatQuantity } from "../../lib/stock.calc";
import { useAsyncData } from "../../lib/useAsyncData";
import { formatDateTime } from "../../lib/time";

const TYPE_LABEL: Record<StockMovement["type"], string> = { in: "รับเข้า", out: "เบิกออก", waste: "ของเสีย" };
const TYPE_FILTERS: { value: "all" | StockMovement["type"]; label: string }[] = [
  { value: "all", label: "ทั้งหมด" },
  { value: "in", label: "รับเข้า" },
  { value: "out", label: "เบิกออก" },
  { value: "waste", label: "ของเสีย" },
];

export default function StockLog() {
  const load = useCallback(async () => {
    const [items, movements] = await Promise.all([listItems({ includeArchived: true }), listMovements()]);
    return { items, movements };
  }, []);
  const { data, loading, error, reload } = useAsyncData(load, { items: [] as StockItem[], movements: [] as StockMovement[] });
  const { items, movements } = data;
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | StockMovement["type"]>("all");

  const nameById = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);
  const trimmed = query.trim().toLowerCase();
  const rows = useMemo(
    () => movements
      .filter((movement) => !isOpeningBalanceMovement(movement))
      .filter((movement) => typeFilter === "all" || movement.type === typeFilter)
      .filter((movement) => {
        if (!trimmed) return true;
        const item = nameById.get(movement.item_id);
        return `${item?.name ?? ""} ${movement.actor_name ?? ""} ${movement.note ?? ""}`.toLowerCase().includes(trimmed);
      }),
    [movements, typeFilter, trimmed, nameById],
  );

  return (
    <section className="admin-layout admin-dashboard-layout" aria-labelledby="stock-log-heading">
      <div className="admin-heading-row admin-dashboard-heading">
        <div>
          <div className="eyebrow-row"><span className="status-dot" />สต๊อกสินค้า</div>
          <h1 id="stock-log-heading">บันทึกการทำสต๊อก</h1>
          <p className="muted-copy">ใครรับเข้า / เบิก / ปรับยอด อะไร เมื่อไหร่</p>
        </div>
        <div className="admin-actions">
          <button className="icon-text-button" type="button" onClick={() => void reload()} disabled={loading}>
            {loading ? <Loader2 className="spin" size={17} /> : <RefreshCw size={17} />}
            รีเฟรช
          </button>
        </div>
      </div>

      {error ? <div className="inline-error" role="alert">{error}</div> : null}

      <section className="form-panel" aria-label="บันทึกการเคลื่อนไหวสต๊อก">
        <div className="stock-log-controls">
          <div className="stock-search">
            <Search size={17} aria-hidden="true" />
            <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ค้นหาสินค้า ผู้ทำ หรือโน้ต…" aria-label="ค้นหาบันทึก" />
          </div>
          <div className="segmented-control" role="group" aria-label="กรองตามประเภท">
            {TYPE_FILTERS.map((filter) => (
              <button
                key={filter.value}
                type="button"
                className={typeFilter === filter.value ? "segment is-selected" : "segment"}
                aria-pressed={typeFilter === filter.value}
                onClick={() => setTypeFilter(filter.value)}
              >
                {filter.label}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="skeleton-table" aria-label="กำลังโหลดข้อมูล">{Array.from({ length: 5 }).map((_, i) => <span key={i} />)}</div>
        ) : rows.length ? (
          <ol className="activity-list stock-log-list">
            {rows.map((movement) => {
              const item = nameById.get(movement.item_id);
              return (
                <li key={movement.id}>
                  <span className={`stock-dot ${movement.type}`} />
                  <div>
                    <strong>{item?.name ?? "—"}</strong>
                    <span>{TYPE_LABEL[movement.type]} {formatQuantity(movement.quantity)} {item?.unit ?? ""} · {movement.actor_name ?? "—"}{movement.note ? ` · ${movement.note}` : ""}</span>
                  </div>
                  <time>{formatDateTime(movement.created_at)}</time>
                </li>
              );
            })}
          </ol>
        ) : (
          <p className="muted-copy">{trimmed || typeFilter !== "all" ? "ไม่พบรายการที่ค้นหา" : "ยังไม่มีการเคลื่อนไหว"}</p>
        )}
      </section>
    </section>
  );
}
