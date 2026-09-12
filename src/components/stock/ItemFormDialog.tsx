import { FormEvent, useEffect, useRef, useState } from "react";
import { Loader2, Save, X } from "lucide-react";
import type { ItemBalance, NewStockItem, StockItem } from "../../types";
import { archiveItem, createItem, setStockBalanceTotals, updateItem } from "../../lib/stock";
import { formatQuantity } from "../../lib/stock.calc";

const CUSTOM_OPTION_VALUE = "__custom__";

interface Props {
  item?: StockItem;
  balance?: ItemBalance;
  categorySuggestions: string[];
  unitSuggestions: string[];
  onClose: () => void;
  onSaved: () => void;
}

export default function ItemFormDialog({
  item,
  balance,
  categorySuggestions,
  unitSuggestions,
  onClose,
  onSaved,
}: Props) {
  const [name, setName] = useState(item?.name ?? "");
  const [unit, setUnit] = useState(item?.unit ?? "กก.");
  const [category, setCategory] = useState(item?.category ?? "");
  const [addingUnit, setAddingUnit] = useState(false);
  const [addingCategory, setAddingCategory] = useState(false);
  const [threshold, setThreshold] = useState(item?.low_stock_threshold?.toString() ?? "");
  const [received, setReceived] = useState(balance?.received.toString() ?? "");
  const [onHand, setOnHand] = useState(balance?.onHand.toString() ?? "");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const availableUnits = Array.from(new Set([item?.unit, ...unitSuggestions].filter((value): value is string => !!value)));
  const availableCategories = Array.from(
    new Set([item?.category, ...categorySuggestions].filter((value): value is string => !!value)),
  );

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
    const desiredReceived = item ? Number(received) : null;
    const desiredOnHand = item ? Number(onHand) : null;
    if (
      item &&
      (desiredReceived === null || !Number.isFinite(desiredReceived) || desiredReceived < 0 ||
        desiredOnHand === null || !Number.isFinite(desiredOnHand) || desiredOnHand < 0)
    ) {
      setError("จำนวนรับเข้าและคงเหลือต้องเป็นตัวเลขที่ไม่ติดลบ");
      return;
    }
    if (item && balance && desiredReceived !== null && desiredOnHand !== null && desiredReceived < desiredOnHand + balance.waste) {
      setError(`จำนวนรับเข้าต้องไม่น้อยกว่า ${formatQuantity(desiredOnHand + balance.waste)} ${unit.trim() || item.unit}`);
      return;
    }
    setError("");
    setSaving(true);
    try {
      if (item) {
        await updateItem(item.id, payload);
        if (balance && desiredReceived !== null && desiredOnHand !== null) {
          await setStockBalanceTotals(balance, desiredReceived, desiredOnHand);
        }
      } else {
        await createItem(payload);
      }
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
          <select
            value={addingUnit ? CUSTOM_OPTION_VALUE : unit}
            onChange={(event) => {
              if (event.target.value === CUSTOM_OPTION_VALUE) {
                setAddingUnit(true);
                setUnit("");
              } else {
                setAddingUnit(false);
                setUnit(event.target.value);
              }
            }}
            required
          >
            {availableUnits.map((suggestion) => <option key={suggestion} value={suggestion}>{suggestion}</option>)}
            <option value={CUSTOM_OPTION_VALUE}>＋ เพิ่มหน่วยใหม่…</option>
          </select>
          <small className="field-hint">มีหน่วยเดิมให้เลือกครบ หรือเพิ่มหน่วยใหม่ได้</small>
        </label>
        {addingUnit ? (
          <label className="field"><span>ชื่อหน่วยใหม่</span>
            <input value={unit} onChange={(event) => setUnit(event.target.value)} placeholder="เช่น กล่อง / ลัง" autoFocus required />
          </label>
        ) : null}
        <label className="field"><span>หมวดหมู่ (ไม่บังคับ)</span>
          <select
            value={addingCategory ? CUSTOM_OPTION_VALUE : category}
            onChange={(event) => {
              if (event.target.value === CUSTOM_OPTION_VALUE) {
                setAddingCategory(true);
                setCategory("");
              } else {
                setAddingCategory(false);
                setCategory(event.target.value);
              }
            }}
          >
            <option value="">ไม่ระบุหมวดหมู่</option>
            {availableCategories.map((suggestion) => <option key={suggestion} value={suggestion}>{suggestion}</option>)}
            <option value={CUSTOM_OPTION_VALUE}>＋ เพิ่มหมวดหมู่ใหม่…</option>
          </select>
          <small className="field-hint">มีหมวดหมู่เดิมให้เลือกครบ หรือเพิ่มหมวดหมู่ใหม่ได้</small>
        </label>
        {addingCategory ? (
          <label className="field"><span>ชื่อหมวดหมู่ใหม่</span>
            <input value={category} onChange={(event) => setCategory(event.target.value)} placeholder="เช่น ของแห้ง" autoFocus />
          </label>
        ) : null}
        {item && balance ? (
          <div className="stock-balance-editor">
            <label className="field"><span>รับเข้าทั้งหมด ({unit.trim() || item.unit})</span>
              <input type="number" min="0" step="any" value={received} onChange={(e) => setReceived(e.target.value)} required />
            </label>
            <label className="field"><span>จำนวนคงเหลือ ({unit.trim() || item.unit})</span>
              <input type="number" min="0" step="any" value={onHand} onChange={(e) => setOnHand(e.target.value)} required />
            </label>
            <small className="field-hint">
              ของเสียสะสม {formatQuantity(balance.waste)} {item.unit} ระบบจะคำนวณยอดเบิกใช้และปรับประวัติให้ตรงกับจำนวนใหม่
            </small>
          </div>
        ) : null}
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
