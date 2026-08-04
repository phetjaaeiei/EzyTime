import { AlertTriangle } from "lucide-react";
import type { ItemBalance } from "../../types";
import { formatQuantity } from "../../lib/stock.calc";
import DonutChart from "./DonutChart";

const COLOR_WITHDRAWN = "var(--accent)";
const COLOR_WASTE = "var(--danger)";
const COLOR_ONHAND = "var(--primary)";

interface Props {
  balance: ItemBalance;
  onEdit?: () => void;
  onRecord?: () => void;
}

export default function ItemStockCard({ balance, onEdit, onRecord }: Props) {
  const { item, received, withdrawn, waste, onHand, isLow } = balance;
  const fmt = (value: number) => `${formatQuantity(value)} ${item.unit}`;

  return (
    <article className={isLow ? "stock-card is-low" : "stock-card"}>
      <header className="stock-card-head">
        <div>
          <h3>{item.name}</h3>
          {item.category ? <span className="stock-chip">{item.category}</span> : null}
        </div>
        {isLow ? (
          <span className="low-badge" title="ของใกล้หมด">
            <AlertTriangle size={14} /> ใกล้หมด
          </span>
        ) : null}
      </header>

      <div className="stock-card-body">
        <DonutChart
          slices={[
            { label: "คงเหลือ", value: onHand, color: COLOR_ONHAND },
            { label: "เบิกใช้", value: withdrawn, color: COLOR_WITHDRAWN },
            { label: "ของเสีย", value: waste, color: COLOR_WASTE },
          ]}
          centerLabel={formatQuantity(onHand)}
          centerSub={`เหลือ (${item.unit})`}
        />
        <ul className="stock-legend">
          <li><span className="dot" style={{ background: COLOR_ONHAND }} /> คงเหลือ <strong>{fmt(onHand)}</strong></li>
          <li><span className="dot" style={{ background: COLOR_WITHDRAWN }} /> เบิกใช้ <strong>{fmt(withdrawn)}</strong></li>
          <li><span className="dot" style={{ background: COLOR_WASTE }} /> ของเสีย <strong>{fmt(waste)}</strong></li>
          <li className="muted-copy">รับเข้าทั้งหมด {fmt(received)}</li>
        </ul>
      </div>

      {(onEdit || onRecord) ? (
        <div className="stock-card-actions">
          {onRecord ? <button className="icon-text-button" type="button" onClick={onRecord}>บันทึก +/−</button> : null}
          {onEdit ? <button className="icon-text-button quiet" type="button" onClick={onEdit}>แก้ไข</button> : null}
        </div>
      ) : null}
    </article>
  );
}
