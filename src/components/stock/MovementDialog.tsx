import { FormEvent, useState } from "react";
import { Loader2, Save } from "lucide-react";
import type { MovementType, StockItem } from "../../types";
import { getEmployeeStockAccess } from "../../lib/stock.permissions";
import { recordMovement } from "../../lib/stock";
import { formatQuantity } from "../../lib/stock.calc";
import { Dialog } from "./ItemFormDialog";

interface Props {
  item: StockItem;
  allowedTypes: MovementType[];
  availableQuantity?: number;
  employeeMode?: boolean;
  onClose: () => void;
  onSaved: () => void;
}

const TYPE_LABEL: Record<MovementType, string> = { in: "รับเข้า", out: "เบิกออก", waste: "ของเสีย" };

export default function MovementDialog({ item, allowedTypes, availableQuantity, employeeMode = false, onClose, onSaved }: Props) {
  const [type, setType] = useState<MovementType>(allowedTypes[0]);
  const [quantity, setQuantity] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const qty = Number(quantity);
    if (!Number.isFinite(qty) || qty <= 0) {
      setError("จำนวนต้องมากกว่า 0");
      return;
    }
    if (type !== "in" && availableQuantity !== undefined && qty > availableQuantity) {
      setError(`คงเหลือไม่พอ มีสินค้าให้เบิก ${formatQuantity(availableQuantity)} ${item.unit}`);
      return;
    }
    setError("");
    setSaving(true);
    try {
      if (employeeMode) {
        const access = await getEmployeeStockAccess();
        if (!access.isAdmin && !access.itemIds.includes(item.id)) throw new Error("คุณไม่มีสิทธิ์จัดการสินค้านี้แล้ว กรุณาติดต่อ admin");
      }
      await recordMovement({ item_id: item.id, type, quantity: qty, note });
      onSaved();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "บันทึกไม่สำเร็จ");
      setSaving(false);
    }
  }

  return (
    <Dialog title={`${item.name} — บันทึกความเคลื่อนไหว`} onClose={onClose}>
      <form className="clock-form" onSubmit={handleSubmit}>
        {allowedTypes.length > 1 ? (
          <div className="segmented-control" aria-label="ประเภท">
            {allowedTypes.map((option) => (
              <button
                key={option}
                type="button"
                className={type === option ? "segment is-selected" : "segment"}
                onClick={() => setType(option)}
              >
                {TYPE_LABEL[option]}
              </button>
            ))}
          </div>
        ) : null}
        <label className="field"><span>จำนวน ({item.unit})</span>
          <input type="number" min="0" max={type === "in" ? undefined : availableQuantity} step="any" value={quantity} onChange={(e) => setQuantity(e.target.value)} autoFocus required />
        </label>
        <label className="field"><span>โน้ต (ไม่บังคับ)</span>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="เช่น เตรียมหน้าร้าน" />
        </label>
        {error ? <p className="form-error" role="alert">{error}</p> : null}
        <button className="primary-button" type="submit" disabled={saving}>
          {saving ? <Loader2 className="spin" size={18} /> : <Save size={18} />} บันทึก{TYPE_LABEL[type]}
        </button>
      </form>
    </Dialog>
  );
}
