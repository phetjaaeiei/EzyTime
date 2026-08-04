import type { DailyStockStats, ItemBalance } from "../../types";
import { formatQuantity } from "../../lib/stock.calc";

interface Props {
  balances: ItemBalance[];
  daily: DailyStockStats;
}

interface PieEntry {
  id: string;
  name: string;
  value: number;
  color: string;
}

interface PieSlice extends PieEntry {
  percent: number;
  path: string;
  labelX: number;
  labelY: number;
}

const CHART_COLORS = [
  "#087f87",
  "#d85f3f",
  "#3f6eb8",
  "#6f58a8",
  "#2f8a60",
  "#be4657",
  "#8b6822",
  "#24769b",
  "#81523e",
  "#566574",
];

const SIZE = 220;
const CENTER = SIZE / 2;
const RADIUS = 96;

export default function StockOverviewChart({ balances, daily }: Props) {
  const groups = groupByUnit(balances);

  return (
    <section className="stock-overview" aria-labelledby="stock-overview-heading">
      <div className="stock-overview-head">
        <div>
          <h2 id="stock-overview-heading">ภาพรวมสต๊อกคงเหลือ</h2>
          <p>แต่ละสีแทนสินค้า แยกวงตามหน่วยเพื่อเปรียบเทียบจำนวนได้ถูกต้อง</p>
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
          <UnitPieChart key={unit} unit={unit} balances={unitBalances} />
        ))}
      </div>
    </section>
  );
}

function UnitPieChart({ unit, balances }: { unit: string; balances: ItemBalance[] }) {
  const entries = balances.map((balance, index) => ({
    id: balance.item.id,
    name: balance.item.name,
    value: Math.max(0, balance.onHand),
    color: CHART_COLORS[index % CHART_COLORS.length],
  }));
  const slices = buildPieSlices(entries);
  const total = entries.reduce((sum, entry) => sum + entry.value, 0);
  const ariaLabel = entries.map((entry) => `${entry.name} ${formatQuantity(entry.value)} ${unit}`).join(", ");

  return (
    <section className="stock-unit-overview" aria-labelledby={`stock-unit-${slug(unit)}`}>
      <h3 id={`stock-unit-${slug(unit)}`}>หน่วย {unit}</h3>
      <div className="stock-unit-content">
        <svg
          className="stock-pie"
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          role="img"
          aria-label={total > 0 ? ariaLabel : `ยังไม่มีสินค้าคงเหลือในหน่วย ${unit}`}
        >
          {total > 0 ? (
            slices.map((slice) =>
              slices.length === 1 ? (
                <circle key={slice.id} cx={CENTER} cy={CENTER} r={RADIUS} fill={slice.color}>
                  <title>{`${slice.name} ${formatQuantity(slice.value)} ${unit}`}</title>
                </circle>
              ) : (
                <path key={slice.id} d={slice.path} fill={slice.color} stroke="white" strokeWidth="2">
                  <title>{`${slice.name} ${formatQuantity(slice.value)} ${unit} (${Math.round(slice.percent * 100)}%)`}</title>
                </path>
              ),
            )
          ) : (
            <circle className="stock-pie-empty" cx={CENTER} cy={CENTER} r={RADIUS} />
          )}
          {slices.map((slice) =>
            slice.percent >= 0.09 ? (
              <text key={`label-${slice.id}`} x={slice.labelX} y={slice.labelY} className="stock-pie-value">
                {formatQuantity(slice.value)}
              </text>
            ) : null,
          )}
        </svg>

        <ul className="stock-overview-legend">
          {entries.map((entry) => (
            <li key={entry.id}>
              <span className="stock-overview-dot" style={{ background: entry.color }} />
              <span>{entry.name}</span>
              <strong>{formatQuantity(entry.value)} {unit}</strong>
            </li>
          ))}
        </ul>
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

function buildPieSlices(entries: PieEntry[]): PieSlice[] {
  const positive = entries.filter((entry) => entry.value > 0);
  const total = positive.reduce((sum, entry) => sum + entry.value, 0);
  let angle = -Math.PI / 2;

  return positive.map((entry) => {
    const percent = entry.value / total;
    const endAngle = angle + percent * Math.PI * 2;
    const midAngle = angle + (endAngle - angle) / 2;
    const start = pointOnCircle(angle, RADIUS);
    const end = pointOnCircle(endAngle, RADIUS);
    const label = pointOnCircle(midAngle, RADIUS * 0.62);
    const path = [
      `M ${CENTER} ${CENTER}`,
      `L ${start.x} ${start.y}`,
      `A ${RADIUS} ${RADIUS} 0 ${percent > 0.5 ? 1 : 0} 1 ${end.x} ${end.y}`,
      "Z",
    ].join(" ");
    angle = endAngle;
    return { ...entry, percent, path, labelX: label.x, labelY: label.y };
  });
}

function pointOnCircle(angle: number, radius: number): { x: number; y: number } {
  return {
    x: round(CENTER + Math.cos(angle) * radius),
    y: round(CENTER + Math.sin(angle) * radius),
  };
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function slug(value: string): string {
  return Array.from(value).map((character) => character.codePointAt(0)?.toString(36)).join("-");
}
