import { AlertTriangle, Trash2 } from "lucide-react";
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
  onRestore?: () => void;
  onDelete?: () => void;
  selected?: boolean;
  onSelect?: (checked: boolean) => void;
}

export default function ItemStockCard({ balance, onEdit, onRecord, onRestore, onDelete, selected = false, onSelect }: Props) {
  const { item, received, withdrawn, waste, onHand, isLow } = balance;
  const fmt = (value: number) => `${formatQuantity(value)} ${item.unit}`;
  const archived = !item.is_active;
  const isOutOfStock = onHand <= 0;
  const className = `stock-card${isLow && !archived ? " is-low" : ""}${isOutOfStock && !archived ? " is-out-of-stock" : ""}${archived ? " is-archived" : ""}`;

  return (
    <article className={`${className}${selected ? " is-selected" : ""}`}>
      {onSelect ? <label className="stock-select-item"><input type="checkbox" checked={selected} onChange={event => onSelect(event.target.checked)} aria-label={`เลือกสินค้า ${item.name}`} /><span>เลือกเพื่อลบ</span></label> : null}
      <header className="stock-card-head">
        <div>
          <h3>{item.name}</h3>
          {item.category ? <span className="stock-chip">{item.category}</span> : null}
          {archived ? <span className="stock-chip muted">ปิดใช้งาน</span> : null}
        </div>
        <div className="stock-card-head-actions">
          {(isLow || isOutOfStock) && !archived ? (
            <span className={isOutOfStock ? "low-badge is-out" : "low-badge"} title={isOutOfStock ? "สินค้าหมดแล้ว" : "ของใกล้หมด"}>
              <AlertTriangle size={14} /> {isOutOfStock ? "หมดแล้ว" : "ใกล้หมด"}
            </span>
          ) : null}
          {onDelete ? (
            <button
              className="icon-button stock-delete-button"
              type="button"
              onClick={onDelete}
              aria-label={`ลบสินค้า ${item.name} ถาวร`}
              title="ลบสินค้าถาวร"
            >
              <Trash2 size={18} />
            </button>
          ) : null}
        </div>
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
          <li>
            <span className="dot" style={{ background: COLOR_ONHAND }} />
            <span className="stock-legend-label">คงเหลือ</span>
            <strong>{fmt(onHand)}</strong>
          </li>
          <li>
            <span className="dot" style={{ background: COLOR_WITHDRAWN }} />
            <span className="stock-legend-label">เบิกใช้</span>
            <strong>{fmt(withdrawn)}</strong>
          </li>
          <li>
            <span className="dot" style={{ background: COLOR_WASTE }} />
            <span className="stock-legend-label">ของเสีย</span>
            <strong>{fmt(waste)}</strong>
          </li>
          <li className="stock-total muted-copy">
            <span>รับเข้าทั้งหมด</span>
            <strong>{fmt(received)}</strong>
          </li>
        </ul>
      </div>

      {(onEdit || onRecord || onRestore) ? (
        <div className="stock-card-actions">
          {onRestore ? <button className="icon-text-button" type="button" onClick={onRestore}>เปิดใช้งานอีกครั้ง</button> : null}
          {onRecord ? <button className="icon-text-button" type="button" onClick={onRecord}>บันทึก +/−</button> : null}
          {onEdit ? <button className="icon-text-button quiet" type="button" onClick={onEdit}>แก้ไข</button> : null}
        </div>
      ) : null}
    </article>
  );
}
