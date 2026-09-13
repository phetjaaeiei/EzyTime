import { useState } from "react";
import { Loader2, Trash2 } from "lucide-react";
import type { StockItem } from "../../types";
import { deleteStockItems } from "../../lib/stock";
import { Dialog } from "./ItemFormDialog";

interface Props {
  items: StockItem[];
  movementCount: number;
  onClose: () => void;
  onDeleted: () => void;
}

export default function DeleteItemDialog({ items, movementCount, onClose, onDeleted }: Props) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");

  async function handleDelete() {
    setError("");
    setDeleting(true);
    try {
      await deleteStockItems(items.map(item => item.id));
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
    <Dialog title="ลบสินค้าถาวร" onClose={handleClose}>
      <div className="delete-item-confirmation">
        <span className="delete-item-icon" aria-hidden="true"><Trash2 size={21} /></span>
        <div>
          <strong>ลบสินค้า {items.length} รายการออกจากฐานข้อมูลถาวร?</strong>
          <p>ลบสินค้า พร้อมประวัติรับเข้า เบิกออก และของเสีย {movementCount} รายการ รวมถึงสิทธิ์ที่ผูกกับสินค้า ยอดและรายงานของสินค้าที่ลบจะหายไปด้วย และกู้คืนผ่านระบบไม่ได้</p>
        </div>
      </div>
      <ul className="delete-stock-list">{items.map(item => <li key={item.id}><strong>{item.name}</strong><span>{item.category || "ไม่ระบุหมวดหมู่"} · {item.unit}</span></li>)}</ul>
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      <div className="dialog-actions">
        <button className="icon-text-button quiet" type="button" onClick={handleClose} disabled={deleting}>ยกเลิก</button>
        <button className="danger-button" type="button" onClick={() => void handleDelete()} disabled={deleting}>
          {deleting ? <Loader2 className="spin" size={18} /> : <Trash2 size={18} />}
          {deleting ? "กำลังลบ..." : `ยืนยันลบถาวร ${items.length} รายการ`}
        </button>
      </div>
    </Dialog>
  );
}
