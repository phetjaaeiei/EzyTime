import { useState } from "react";
import { FolderMinus, Loader2 } from "lucide-react";
import { clearItemCategory } from "../../lib/stock";
import { Dialog } from "./ItemFormDialog";

interface Props {
  category: string;
  itemIds: string[];
  onClose: () => void;
  onCleared: () => void;
}

export default function ClearCategoryDialog({ category, itemIds, onClose, onCleared }: Props) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function confirm() {
    setSaving(true);
    setError("");
    try {
      await clearItemCategory(itemIds);
      onCleared();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "ลบหมวดหมู่ไม่สำเร็จ");
      setSaving(false);
    }
  }

  return (
    <Dialog title={`ลบหมวดหมู่ “${category}”`} onClose={onClose}>
      <div className="clock-form">
        <p className="muted-copy">สินค้า {itemIds.length} รายการในหมวดนี้จะย้ายไปอยู่ที่ “ไม่ระบุหมวดหมู่” — ไม่ลบสินค้าหรือประวัติใด ๆ</p>
        {error ? <p className="form-error" role="alert">{error}</p> : null}
        <div className="button-row">
          <button className="primary-button" type="button" disabled={saving} onClick={() => void confirm()}>
            {saving ? <Loader2 className="spin" size={18} /> : <FolderMinus size={18} />} ลบหมวดหมู่
          </button>
          <button className="icon-text-button" type="button" disabled={saving} onClick={onClose}>ยกเลิก</button>
        </div>
      </div>
    </Dialog>
  );
}
