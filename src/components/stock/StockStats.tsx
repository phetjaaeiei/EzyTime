import { useCallback, useMemo, useState } from "react";
import { ArrowDown, ArrowRight, ArrowUp, Loader2, Minus, RefreshCw } from "lucide-react";
import type { StockItem, StockMovement } from "../../types";
import { listItems, listMovements } from "../../lib/stock";
import { formatQuantity } from "../../lib/stock.calc";
import { useAsyncData } from "../../lib/useAsyncData";
import { computePeriodStats, defaultPeriodValue, percentChange, rangeFor, type StatGranularity } from "../../lib/stock.stats";

type Metric = "received" | "withdrawn" | "waste";
const METRICS: { key: Metric; label: string }[] = [
  { key: "received", label: "รับเข้า" },
  { key: "withdrawn", label: "เบิกใช้" },
  { key: "waste", label: "ของเสีย" },
];
const GRANULARITIES: { key: StatGranularity; label: string }[] = [
  { key: "day", label: "วันต่อวัน" },
  { key: "month", label: "เดือนต่อเดือน" },
  { key: "year", label: "ปีต่อปี" },
];

export default function StockStats() {
  const [granularity, setGranularity] = useState<StatGranularity>("month");
  const [valueA, setValueA] = useState(() => defaultPeriodValue("month", -1));
  const [valueB, setValueB] = useState(() => defaultPeriodValue("month", 0));
  const [metric, setMetric] = useState<Metric>("withdrawn");

  const load = useCallback(async () => {
    const [items, movements] = await Promise.all([listItems({ includeArchived: true }), listMovements()]);
    return { items, movements };
  }, []);
  const { data, loading, refreshing, error, reload } = useAsyncData(load, { items: [] as StockItem[], movements: [] as StockMovement[] });

  function changeGranularity(next: StatGranularity) {
    setGranularity(next);
    setValueA(defaultPeriodValue(next, -1));
    setValueB(defaultPeriodValue(next, 0));
  }

  const stats = useMemo(
    () => computePeriodStats(data.items, data.movements, rangeFor(granularity, valueA), rangeFor(granularity, valueB)),
    [data.items, data.movements, granularity, valueA, valueB],
  );
  const maxCategoryValue = useMemo(
    () => Math.max(1, ...stats.byCategory.flatMap((c) => [c.a[metric], c.b[metric]])),
    [stats, metric],
  );
  const rankedCategories = useMemo(
    () => stats.byCategory
      .filter((c) => c.a[metric] > 0 || c.b[metric] > 0)
      .sort((x, y) => Math.max(y.a[metric], y.b[metric]) - Math.max(x.a[metric], x.b[metric])),
    [stats, metric],
  );
  const metricLabel = METRICS.find((m) => m.key === metric)!.label;

  return (
    <section className="admin-layout admin-dashboard-layout" aria-labelledby="stock-stats-heading">
      <div className="admin-heading-row admin-dashboard-heading">
        <div>
          <div className="eyebrow-row"><span className="status-dot" />สต๊อกสินค้า</div>
          <h1 id="stock-stats-heading">สถิติการใช้ stock</h1>
          <p className="muted-copy">เลือกช่วงเวลา 2 ช่วงมาเทียบกัน — ระบบคำนวณว่าเพิ่มหรือลดให้อัตโนมัติ</p>
        </div>
        <div className="admin-actions">
          <button className="icon-text-button" type="button" onClick={() => void reload()} disabled={loading || refreshing}>
            {loading || refreshing ? <Loader2 className="spin" size={17} /> : <RefreshCw size={17} />}
            รีเฟรช
          </button>
        </div>
      </div>

      <section className="form-panel stats-controls" aria-label="เลือกช่วงเวลาที่จะเทียบ">
        <div className="segmented-control is-row" role="group" aria-label="ระดับการเทียบ">
          {GRANULARITIES.map((g) => (
            <button key={g.key} type="button" className={granularity === g.key ? "segment is-selected" : "segment"} aria-pressed={granularity === g.key} onClick={() => changeGranularity(g.key)}>{g.label}</button>
          ))}
        </div>
        <div className="stats-period-row">
          <label className="field stats-period"><span>ช่วง A</span><PeriodInput granularity={granularity} value={valueA} onChange={setValueA} /></label>
          <ArrowRight className="stats-vs" size={18} aria-hidden="true" />
          <label className="field stats-period"><span>ช่วง B</span><PeriodInput granularity={granularity} value={valueB} onChange={setValueB} /></label>
        </div>
      </section>

      {error ? (
        <div className="inline-error" role="alert">{error}</div>
      ) : loading ? (
        <div className="skeleton-table" aria-label="กำลังโหลดข้อมูล">{Array.from({ length: 4 }).map((_, i) => <span key={i} />)}</div>
      ) : (
        <>
          <div className="stats-summary-grid">
            {METRICS.map((m) => <SummaryCard key={m.key} label={m.label} a={stats.totalA[m.key]} b={stats.totalB[m.key]} />)}
          </div>

          <section className="form-panel" aria-labelledby="stats-chart-heading">
            <div className="section-heading-row">
              <div>
                <h2 id="stats-chart-heading">เทียบตามหมวดหมู่</h2>
                <p className="muted-copy">A เทียบ B ของ “{metricLabel}”</p>
              </div>
              <div className="segmented-control is-row" role="group" aria-label="เลือกตัวเลขที่ดู">
                {METRICS.map((m) => <button key={m.key} type="button" className={metric === m.key ? "segment is-selected" : "segment"} aria-pressed={metric === m.key} onClick={() => setMetric(m.key)}>{m.label}</button>)}
              </div>
            </div>
            {rankedCategories.length ? (
              <ul className="stats-cat-list">
                {rankedCategories.map((c) => <CategoryBars key={c.category} category={c.category} a={c.a[metric]} b={c.b[metric]} max={maxCategoryValue} />)}
              </ul>
            ) : (
              <p className="muted-copy">ยังไม่มีข้อมูล “{metricLabel}” ในช่วงเวลาที่เลือก</p>
            )}
          </section>
        </>
      )}
    </section>
  );
}

function PeriodInput({ granularity, value, onChange }: { granularity: StatGranularity; value: string; onChange: (value: string) => void }) {
  if (granularity === "day") return <input type="date" value={value} onChange={(e) => onChange(e.target.value)} aria-label="เลือกวัน" />;
  if (granularity === "month") return <input type="month" value={value} onChange={(e) => onChange(e.target.value)} aria-label="เลือกเดือน" />;
  return <input type="number" min="2000" max="2100" step="1" value={value} onChange={(e) => onChange(e.target.value)} aria-label="เลือกปี" />;
}

function Delta({ from, to }: { from: number; to: number }) {
  const diff = Math.round((to - from) * 1000) / 1000;
  if (Math.abs(diff) < 1e-9) return <span className="stats-delta is-flat"><Minus size={14} /> เท่าเดิม</span>;
  const up = diff > 0;
  const pct = percentChange(from, to);
  const pctText = pct === null ? "ใหม่" : `${up ? "+" : ""}${pct.toFixed(0)}%`;
  return (
    <span className={up ? "stats-delta is-up" : "stats-delta is-down"}>
      {up ? <ArrowUp size={14} /> : <ArrowDown size={14} />} {up ? "+" : ""}{formatQuantity(diff)} ({pctText})
    </span>
  );
}

function SummaryCard({ label, a, b }: { label: string; a: number; b: number }) {
  return (
    <div className="stats-summary-card">
      <p className="stats-summary-label">{label}</p>
      <div className="stats-summary-values">
        <span><small>A</small><strong>{formatQuantity(a)}</strong></span>
        <ArrowRight size={16} aria-hidden="true" />
        <span><small>B</small><strong>{formatQuantity(b)}</strong></span>
      </div>
      <Delta from={a} to={b} />
    </div>
  );
}

function CategoryBars({ category, a, b, max }: { category: string; a: number; b: number; max: number }) {
  return (
    <li className="stats-cat">
      <div className="stats-cat-head"><strong>{category}</strong><Delta from={a} to={b} /></div>
      <div className="stats-bar-row">
        <span className="stats-bar-tag">A</span>
        <div className="stats-bar-track"><span className="stats-bar-fill is-a" style={{ width: `${(a / max) * 100}%` }} /></div>
        <span className="stats-bar-val">{formatQuantity(a)}</span>
      </div>
      <div className="stats-bar-row">
        <span className="stats-bar-tag">B</span>
        <div className="stats-bar-track"><span className="stats-bar-fill is-b" style={{ width: `${(b / max) * 100}%` }} /></div>
        <span className="stats-bar-val">{formatQuantity(b)}</span>
      </div>
    </li>
  );
}
