import { useState } from "react";
import { Loader2, Trash2 } from "lucide-react";
import type { ItemBalance } from "../../types";
import { clearMovementHistory } from "../../lib/stock";
import { Dialog } from "./ItemFormDialog";

interface Props {
  balances: ItemBalance[];
  historyCount: number;
  onClose: () => void;
  onCleared: () => void;
}

export default function ClearHistoryDialog({ balances, historyCount, onClose, onCleared }: Props) {
  const [clearing, setClearing] = useState(false);
  const [error, setError] = useState("");

  async function handleClear() {
    setError("");
    setClearing(true);
    try {
      await clearMovementHistory(balances);
      onCleared();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "เคลียร์ประวัติไม่สำเร็จ");
      setClearing(false);
    }
  }

  const handleClose = () => {
    if (!clearing) onClose();
  };

  return (
    <Dialog title="เคลียร์ประวัติสต๊อก" onClose={handleClose}>
      <div className="delete-item-confirmation">
        <span className="delete-item-icon" aria-hidden="true"><Trash2 size={21} /></span>
        <div>
          <strong>ลบประวัติ {historyCount} รายการและเริ่มนับใหม่?</strong>
          <p>ประวัติรับเข้า เบิกออก และของเสียจะถูกลบถาวร แต่ยอดคงเหลือปัจจุบันของสินค้าทุกชิ้นจะไม่เปลี่ยน</p>
        </div>
      </div>
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      <div className="dialog-actions">
        <button className="icon-text-button quiet" type="button" onClick={handleClose} disabled={clearing}>ยกเลิก</button>
        <button className="danger-button" type="button" onClick={() => void handleClear()} disabled={clearing}>
          {clearing ? <Loader2 className="spin" size={18} /> : <Trash2 size={18} />}
          {clearing ? "กำลังเคลียร์..." : "เคลียร์ประวัติ"}
        </button>
      </div>
    </Dialog>
  );
}
