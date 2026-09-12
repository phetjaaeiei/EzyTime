import { useCallback, useMemo, useState } from "react";
import { CalendarDays, Loader2, PackageSearch, RefreshCw } from "lucide-react";
import type { StockItem, StockMovement } from "../../types";
import { listItems, listMovements } from "../../lib/stock";
import { computeDailyStats, computeItemBalances } from "../../lib/stock.calc";
import { useAsyncData } from "../../lib/useAsyncData";
import { formatDateInput, formatThaiDate } from "../../lib/time";
import StockOverviewChart from "./StockOverviewChart";

export default function StockOverview() {
  const [selectedDate, setSelectedDate] = useState(() => formatDateInput(new Date()));

  const loadStock = useCallback(async () => {
    const [items, movements] = await Promise.all([listItems(), listMovements()]);
    return { items, movements };
  }, []);
  const { data, loading, error, reload } = useAsyncData(loadStock, {
    items: [] as StockItem[],
    movements: [] as StockMovement[],
  });
  const { items, movements } = data;

  const balances = useMemo(() => computeItemBalances(items, movements), [items, movements]);
  const activeBalances = useMemo(() => balances.filter((balance) => balance.item.is_active), [balances]);
  const daily = useMemo(() => computeDailyStats(movements, selectedDate), [movements, selectedDate]);

  return (
    <section className="admin-layout admin-dashboard-layout stock-dashboard-layout" aria-labelledby="stock-overview-page-heading">
      <div className="admin-heading-row admin-dashboard-heading stock-dashboard-heading">
        <div>
          <div className="eyebrow-row"><span className="status-dot" />สต๊อกสินค้า</div>
          <h1 id="stock-overview-page-heading">ภาพรวมสต๊อก</h1>
          <p className="muted-copy">{formatThaiDate(selectedDate)}</p>
        </div>
        <div className="admin-actions">
          <label className="date-control">
            <CalendarDays size={17} />
            <input type="date" value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)} aria-label="เลือกวันที่" />
          </label>
          <button className="icon-text-button" type="button" onClick={() => void reload()} disabled={loading}>
            {loading ? <Loader2 className="spin" size={17} /> : <RefreshCw size={17} />}
            รีเฟรช
          </button>
        </div>
      </div>

      {error ? (
        <div className="inline-error" role="alert">{error}</div>
      ) : loading ? (
        <div className="skeleton-table" aria-label="กำลังโหลดข้อมูล">{Array.from({ length: 4 }).map((_, i) => <span key={i} />)}</div>
      ) : activeBalances.length ? (
        <StockOverviewChart balances={activeBalances} daily={daily} />
      ) : (
        <div className="empty-state">
          <PackageSearch size={30} />
          <h3>ยังไม่มีสินค้าในคลัง</h3>
          <p>เพิ่มสินค้าในหน้าคลังสินค้าเพื่อดูภาพรวมคงเหลือ</p>
        </div>
      )}
    </section>
  );
}
