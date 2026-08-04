import type { DailyStockStats, ItemBalance } from "../../types";
import { formatQuantity } from "../../lib/stock.calc";

interface Props {
  balances: ItemBalance[];
  daily: DailyStockStats;
}

const PERCENT_TICKS = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];

export default function StockOverviewChart({ balances, daily }: Props) {
  const groups = groupByUnit(balances);

  return (
    <section className="stock-overview" aria-labelledby="stock-overview-heading">
      <div className="stock-overview-head">
        <div>
          <h2 id="stock-overview-heading">ภาพรวมสต๊อกคงเหลือ</h2>
          <p>เรียงจากคงเหลือมากไปน้อย แยกตามหน่วยเพื่อเปรียบเทียบจำนวนได้ถูกต้อง</p>
        </div>
        <dl className="stock-daily-summary" aria-label="สรุปการเคลื่อนไหวในวันที่เลือก">
          <div><dt>รับเข้า</dt><dd>{formatQuantity(daily.received)}</dd></div>
          <div><dt>เบิกออก</dt><dd>{formatQuantity(daily.withdrawn)}</dd></div>
          <div><dt>ของเสีย</dt><dd>{formatQuantity(daily.waste)}</dd></div>
          <div><dt>รายการเคลื่อนไหว</dt><dd>{daily.movementCount}</dd></div>
        </dl>
      </div>

      <div className="stock-overview-grid">
        {groups.map(([unit, unitBalances]) => (
          <UnitBarChart key={unit} unit={unit} balances={unitBalances} />
        ))}
      </div>
    </section>
  );
}

function UnitBarChart({ unit, balances }: { unit: string; balances: ItemBalance[] }) {
  const sorted = [...balances].sort((a, b) => b.onHand - a.onHand || a.item.name.localeCompare(b.item.name, "th-TH"));
  const maxValue = Math.max(0, ...sorted.map((balance) => balance.onHand));

  return (
    <section className="stock-unit-overview" aria-labelledby={`stock-unit-${slug(unit)}`}>
      <h3 id={`stock-unit-${slug(unit)}`}>หน่วย {unit}</h3>
      <ol className="stock-bar-list">
        {sorted.map((balance) => {
          const value = Math.max(0, balance.onHand);
          const percent = maxValue > 0 ? value / maxValue * 100 : 0;
          const className = `stock-bar-color-${colorIndex(balance.item.id)}${balance.isLow ? " is-low" : ""}`;
          return (
            <li key={balance.item.id} className={className}>
              <div className="stock-bar-row">
                <span className="stock-bar-name">
                  {balance.item.name}
                  {balance.isLow ? <small>ใกล้หมด</small> : null}
                </span>
                <div
                  className="stock-bar-track"
                  role="meter"
                  aria-label={`${balance.item.name} คงเหลือ ${formatQuantity(balance.onHand)} ${unit}`}
                  aria-valuemin={0}
                  aria-valuemax={Math.max(1, maxValue)}
                  aria-valuenow={value}
                >
                  <span className="stock-bar-fill" style={{ width: `${percent}%` }} />
                  {PERCENT_TICKS.slice(0, -1).map((tick) => (
                    <i key={tick} className="stock-bar-gridline" style={{ left: `${tick}%` }} />
                  ))}
                </div>
                <strong className="stock-bar-value">{formatQuantity(balance.onHand)} {unit}</strong>
              </div>
            </li>
          );
        })}
      </ol>
      <div className="stock-bar-axis" aria-hidden="true">
        <div className="stock-bar-scale">
          {PERCENT_TICKS.map((tick) => (
            <span key={tick} className={tick === 100 ? "is-last" : undefined} style={{ left: `${tick}%` }}>
              {tick}<b>%</b>
            </span>
          ))}
        </div>
        <p>เปอร์เซ็นต์เทียบกับสินค้าที่คงเหลือมากที่สุดในหน่วยนี้</p>
      </div>
    </section>
  );
}

function groupByUnit(balances: ItemBalance[]): [string, ItemBalance[]][] {
  const groups = new Map<string, ItemBalance[]>();
  for (const balance of balances) {
    const unit = balance.item.unit.trim() || "ไม่ระบุ";
    groups.set(unit, [...(groups.get(unit) ?? []), balance]);
  }
  return Array.from(groups.entries()).sort((a, b) => a[0].localeCompare(b[0], "th-TH"));
}

function slug(value: string): string {
  return Array.from(value).map((character) => character.codePointAt(0)?.toString(36)).join("-");
}

function colorIndex(id: string): number {
  let hash = 0;
  for (const character of id) hash = (hash * 31 + (character.codePointAt(0) ?? 0)) >>> 0;
  return hash % 10;
}
