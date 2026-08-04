import { FormEvent, useEffect, useRef, useState } from "react";
import { Loader2, Save, X } from "lucide-react";
import type { NewStockItem, StockItem } from "../../types";
import { archiveItem, createItem, updateItem } from "../../lib/stock";

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
    if (
      payload.low_stock_threshold !== null &&
      (Number.isNaN(payload.low_stock_threshold) || payload.low_stock_threshold < 0)
    ) {
      setError("จุดแจ้งเตือนต้องเป็นตัวเลขที่ไม่ติดลบ");
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

  async function handleArchive() {
    if (!item) return;
    setError("");
    setSaving(true);
    try {
      await archiveItem(item.id);
      onSaved();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "ปิดการใช้งานไม่สำเร็จ");
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
        {item ? (
          <button className="field-link-button" type="button" onClick={handleArchive} disabled={saving}>
            ปิดการใช้งานสินค้านี้
          </button>
        ) : null}
      </form>
    </Dialog>
  );
}

export function Dialog({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  // Trap focus inside the dialog and close on Escape (WCAG modal behavior).
  useEffect(() => {
    const panel = panelRef.current;
    const opener = document.activeElement as HTMLElement | null;
    const openerIsOutside = !!opener && !panel?.contains(opener);

    const focusable = () =>
      Array.from(
        panel?.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      ).filter((el) => el.offsetParent !== null);

    // Move focus into the dialog on open, unless an autoFocus target already did.
    if (panel && !panel.contains(document.activeElement)) {
      (focusable()[0] ?? panel).focus();
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const items = focusable();
      if (items.length === 0) {
        event.preventDefault();
        panel?.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && (active === first || active === panel)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown, true);
    return () => {
      document.removeEventListener("keydown", handleKeyDown, true);
      if (openerIsOutside) opener.focus();
    };
  }, []);

  return (
    <div className="dialog-backdrop" role="dialog" aria-modal="true" aria-label={title} onClick={onClose}>
      <div className="dialog-panel" ref={panelRef} tabIndex={-1} onClick={(e) => e.stopPropagation()}>
        <div className="dialog-head">
          <h2>{title}</h2>
          <button className="icon-button" type="button" aria-label="ปิด" onClick={onClose}><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}
