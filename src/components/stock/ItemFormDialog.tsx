import { FormEvent, useState } from "react";
import { Loader2, Save, X } from "lucide-react";
import type { NewStockItem, StockItem } from "../../types";
import { createItem, updateItem } from "../../lib/stock";

interface Props {
  item?: StockItem;
  categorySuggestions: string[];
  onClose: () => void;
  onSaved: () => void;
}

export default function ItemFormDialog({ item, categorySuggestions, onClose, onSaved }: Props) {
  const [name, setName] = useState(item?.name ?? "");
  const [unit, setUnit] = useState(item?.unit ?? "กก.");
  const [category, setCategory] = useState(item?.category ?? "");
  const [threshold, setThreshold] = useState(item?.low_stock_threshold?.toString() ?? "");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (name.trim().length < 1 || unit.trim().length < 1) {
      setError("กรุณากรอกชื่อสินค้าและหน่วย");
      return;
    }
    const payload: NewStockItem = {
      name,
      unit,
      category: category.trim() || null,
      low_stock_threshold: threshold.trim() === "" ? null : Number(threshold),
    };
    if (payload.low_stock_threshold !== null && Number.isNaN(payload.low_stock_threshold)) {
      setError("จุดแจ้งเตือนต้องเป็นตัวเลข");
      return;
    }
    setError("");
    setSaving(true);
    try {
      if (item) await updateItem(item.id, payload);
      else await createItem(payload);
      onSaved();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "บันทึกไม่สำเร็จ");
      setSaving(false);
    }
  }

  return (
    <Dialog title={item ? "แก้ไขสินค้า" : "เพิ่มสินค้า"} onClose={onClose}>
      <form className="clock-form" onSubmit={handleSubmit}>
        <label className="field"><span>ชื่อสินค้า</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="เช่น เนื้อสันคอ" required />
        </label>
        <label className="field"><span>หน่วย</span>
          <input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="เช่น กก. / ชิ้น / ขวด" required />
        </label>
        <label className="field"><span>หมวดหมู่ (ไม่บังคับ)</span>
          <input list="stock-cats" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="เช่น เนื้อ / ผัก" />
          <datalist id="stock-cats">{categorySuggestions.map((c) => <option key={c} value={c} />)}</datalist>
        </label>
        <label className="field"><span>แจ้งเตือนเมื่อเหลือน้อยกว่า (ไม่บังคับ)</span>
          <input type="number" min="0" step="any" value={threshold} onChange={(e) => setThreshold(e.target.value)} placeholder="เช่น 5" />
        </label>
        {error ? <p className="form-error" role="alert">{error}</p> : null}
        <button className="primary-button" type="submit" disabled={saving}>
          {saving ? <Loader2 className="spin" size={18} /> : <Save size={18} />} บันทึก
        </button>
      </form>
    </Dialog>
  );
}

export function Dialog({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="dialog-backdrop" role="dialog" aria-modal="true" aria-label={title} onClick={onClose}>
      <div className="dialog-panel" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-head">
          <h2>{title}</h2>
          <button className="icon-button" type="button" aria-label="ปิด" onClick={onClose}><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}
