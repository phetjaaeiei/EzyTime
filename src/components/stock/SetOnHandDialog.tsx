import { FormEvent, useState } from "react";
import { Loader2, Save } from "lucide-react";
import type { StockItem } from "../../types";
import { getEmployeeStockAccess } from "../../lib/stock.permissions";
import { adjustOnHandTo } from "../../lib/stock";
import { formatQuantity } from "../../lib/stock.calc";
import { Dialog } from "./ItemFormDialog";

interface Props {
  item: StockItem;
  currentOnHand: number;
  onClose: () => void;
  onSaved: () => void;
}

export default function SetOnHandDialog({ item, currentOnHand, onClose, onSaved }: Props) {
  const [value, setValue] = useState(String(currentOnHand));
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const target = Number(value);
    if (!Number.isFinite(target) || target < 0) { setError("ยอดคงเหลือต้องไม่ติดลบ"); return; }
    setError(""); setSaving(true);
    try {
      const access = await getEmployeeStockAccess();
      if (!access.isAdmin && !access.itemIds.includes(item.id)) throw new Error("คุณไม่มีสิทธิ์จัดการสินค้านี้แล้ว กรุณาติดต่อ admin");
      await adjustOnHandTo(item.id, currentOnHand, target);
      onSaved();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "บันทึกไม่สำเร็จ");
      setSaving(false);
    }
  }

  return (
    <Dialog title={`${item.name} — แก้ยอดคงเหลือ`} onClose={onClose}>
      <form className="clock-form" onSubmit={handleSubmit}>
        <p className="muted-copy">คงเหลือปัจจุบัน {formatQuantity(currentOnHand)} {item.unit} — ระบบจะบันทึกเป็นรายการปรับยอด (ไม่ลบประวัติเดิม)</p>
        <label className="field"><span>ยอดคงเหลือใหม่ ({item.unit})</span>
          <input type="number" min="0" step="any" value={value} onChange={(event) => setValue(event.target.value)} autoFocus required />
        </label>
        {error ? <p className="form-error" role="alert">{error}</p> : null}
        <button className="primary-button" type="submit" disabled={saving}>
          {saving ? <Loader2 className="spin" size={18} /> : <Save size={18} />} บันทึกยอดคงเหลือ
        </button>
      </form>
    </Dialog>
  );
}
