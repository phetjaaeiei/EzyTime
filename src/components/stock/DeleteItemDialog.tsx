import { useState } from "react";
import { Loader2, Trash2 } from "lucide-react";
import type { StockItem } from "../../types";
import { archiveItem } from "../../lib/stock";
import { Dialog } from "./ItemFormDialog";

interface Props {
  item: StockItem;
  onClose: () => void;
  onDeleted: () => void;
}

export default function DeleteItemDialog({ item, onClose, onDeleted }: Props) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");

  async function handleDelete() {
    setError("");
    setDeleting(true);
    try {
      await archiveItem(item.id);
      onDeleted();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "ลบสินค้าไม่สำเร็จ");
      setDeleting(false);
    }
  }

  const handleClose = () => {
    if (!deleting) onClose();
  };

  return (
    <Dialog title="ลบสินค้า" onClose={handleClose}>
      <div className="delete-item-confirmation">
        <span className="delete-item-icon" aria-hidden="true"><Trash2 size={21} /></span>
        <div>
          <strong>ลบ “{item.name}” ออกจากคลัง?</strong>
          <p>สินค้าจะถูกซ่อนจากรายการใช้งาน แต่ประวัติการรับเข้าและเบิกออกจะยังอยู่ และสามารถเปิดใช้งานอีกครั้งได้</p>
        </div>
      </div>
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      <div className="dialog-actions">
        <button className="icon-text-button quiet" type="button" onClick={handleClose} disabled={deleting}>ยกเลิก</button>
        <button className="danger-button" type="button" onClick={() => void handleDelete()} disabled={deleting}>
          {deleting ? <Loader2 className="spin" size={18} /> : <Trash2 size={18} />}
          {deleting ? "กำลังลบ..." : "ลบสินค้า"}
        </button>
      </div>
    </Dialog>
  );
}
