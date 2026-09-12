import { useCallback, useMemo, useState } from "react";
import { Loader2, Save } from "lucide-react";
import { POSITIONS, type Position, type StockItem } from "../../types";
import { listPositionStockItems, listStockEmployees, saveEmployeeStockPosition, savePositionStockItems, type StockEmployee } from "../../lib/stock.permissions";
import { useAsyncData } from "../../lib/useAsyncData";

export default function StockPermissionsPanel({ items }: { items: StockItem[] }) {
  const [position, setPosition] = useState<Position>(POSITIONS[0]);
  const [drafts, setDrafts] = useState<Partial<Record<Position, string[]>>>({});
  return (
    <section className="form-panel stock-permissions" aria-labelledby="stock-permissions-heading">
      <div>
        <h2 id="stock-permissions-heading">สิทธิ์จัดการสต๊อก</h2>
        <p className="muted-copy">กำหนดตำแหน่งของพนักงาน แล้วเลือกสินค้าที่ตำแหน่งนั้นเบิกและบันทึกของเสียได้ Admin จัดการได้ทุกรายการ</p>
      </div>
      <EmployeeAssignments />
      <div className="stock-permission-selection">
        <h3>สินค้าที่แต่ละตำแหน่งรับผิดชอบ</h3>
        <label className="field">
          <span>ตำแหน่งที่ต้องการตั้งค่า</span>
          <select value={position} onChange={(event) => setPosition(event.target.value as Position)}>
            {POSITIONS.map((value) => <option key={value}>{value}</option>)}
          </select>
        </label>
        <PositionItems key={position} position={position} items={items} draft={drafts[position]} onDraftChange={(ids) => setDrafts((current) => ({ ...current, [position]: ids }))} />
      </div>
    </section>
  );
}

function EmployeeAssignments() {
  const { data: employees, loading, error, reload } = useAsyncData(listStockEmployees, [] as StockEmployee[]);
  return (
    <div>
      <h3>ตำแหน่งสำหรับสิทธิ์สต๊อก</h3>
      <p className="muted-copy">ตำแหน่งนี้กำหนดโดย admin แยกจากตำแหน่งที่พนักงานเลือกตอนลงเวลา</p>
      {error ? <div role="alert"><p className="form-error">{error}</p><button className="icon-text-button" onClick={reload}>ลองโหลดพนักงานอีกครั้ง</button></div> : null}
      {loading ? <div className="skeleton-table" aria-label="กำลังโหลดพนักงาน"><span /><span /></div> : !error && !employees.length ? (
        <p className="muted-copy">ยังไม่มีบัญชีพนักงาน ให้พนักงานเข้าสู่ระบบด้วย Google ก่อน แล้วเปิดหน้าสิทธิ์อีกครั้ง</p>
      ) : (
        <ul className="stock-employee-assignments">
          {employees.map((employee) => <EmployeeAssignment key={employee.user_id} employee={employee} />)}
        </ul>
      )}
    </div>
  );
}
function EmployeeAssignment({ employee }: { employee: StockEmployee }) {
  const [position, setPosition] = useState<Position | "">(employee.position ?? "");
  const [saved, setSaved] = useState(position);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  async function save() {
    setSaving(true); setError(""); setMessage("");
    try {
      await saveEmployeeStockPosition(employee.user_id, position || null);
      setSaved(position); setMessage("บันทึกตำแหน่งแล้ว");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "บันทึกไม่สำเร็จ"); }
    finally { setSaving(false); }
  }
  return (
    <li>
      <div className="stock-employee-name"><strong>{employee.display_name}</strong>{employee.email ? <span className="muted-copy">{employee.email}</span> : null}</div>
      <label className="field">
        <span className="sr-only">ตำแหน่งของ {employee.display_name}</span>
        <select value={position} disabled={saving} onChange={(event) => { setPosition(event.target.value as Position | ""); setMessage(""); }}>
          <option value="">ยังไม่มอบหมายสิทธิ์</option>
          {POSITIONS.map((value) => <option key={value}>{value}</option>)}
        </select>
      </label>
      <button className="icon-text-button" disabled={saving || saved === position} onClick={() => void save()} aria-label={`บันทึกตำแหน่งของ ${employee.display_name}`}>
        {saving ? <Loader2 size={17} className="spin" /> : <Save size={17} />} บันทึก
      </button>
      {error ? <p className="form-error stock-permission-feedback" role="alert">{error}</p> : null}
      {message ? <p className="muted-copy stock-permission-feedback" role="status">{message}</p> : null}
    </li>
  );
}
function PositionItems({ position, items, draft, onDraftChange }: { position: Position; items: StockItem[]; draft?: string[]; onDraftChange: (ids: string[]) => void }) {
  const loader = useCallback(() => listPositionStockItems(position), [position]);
  const { data, loading, error, reload } = useAsyncData(loader, [] as string[]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [message, setMessage] = useState("");
  const [query, setQuery] = useState("");
  const activeItems = items.filter((item) => item.is_active);
  const activeIds = new Set(activeItems.map((item) => item.id));
  const selected = (draft ?? data).filter((id) => activeIds.has(id));
  const groups = useMemo(() => {
    const grouped = new Map<string, StockItem[]>();
    for (const item of items) {
      if (!item.is_active || !`${item.name} ${item.category ?? ""}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())) continue;
      const category = item.category || "ไม่ระบุหมวดหมู่";
      grouped.set(category, [...(grouped.get(category) ?? []), item]);
    }
    return [...grouped.entries()];
  }, [items, query]);
  function change(ids: string[]) { onDraftChange(ids); setMessage(""); }
  async function save() {
    setSaving(true); setSaveError(""); setMessage("");
    try {
      await savePositionStockItems(position, selected);
      setMessage(`บันทึกสิทธิ์ ${position} แล้ว (${selected.length} รายการ)`);
    } catch (cause) { setSaveError(cause instanceof Error ? cause.message : "บันทึกสิทธิ์ไม่สำเร็จ"); }
    finally { setSaving(false); }
  }
  if (loading) return <div className="skeleton-table" aria-label="กำลังโหลดสิทธิ์"><span /><span /></div>;
  if (error) return <div role="alert"><p className="form-error">{error}</p><button className="icon-text-button" onClick={reload}>ลองโหลดสิทธิ์อีกครั้ง</button></div>;
  return (
    <fieldset className="stock-permission-editor" disabled={saving}>
      <legend className="sr-only">เลือกสินค้าสำหรับ {position}</legend>
      <div className="stock-permission-toolbar">
        <label className="field"><span>ค้นหาสินค้าหรือหมวดหมู่</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ชื่อสินค้า หรือหมวดหมู่" /></label>
        <button className="icon-text-button" type="button" onClick={() => change(activeItems.map((item) => item.id))}>เลือกสินค้าทั้งหมด</button>
        <button className="icon-text-button quiet" type="button" onClick={() => change([])}>ล้างการเลือก</button>
      </div>
      <p className="muted-copy">เลือก {selected.length} จาก {activeItems.length} รายการ · หากไม่เลือกสินค้า ตำแหน่งนี้จะยังเบิกของไม่ได้</p>
      <div className="stock-permission-groups">
        {groups.map(([category, group]) => (
          <fieldset key={category} className="stock-permission-category">
            <legend>{category}</legend>
            {group.map((item) => (
              <label key={item.id} className="stock-permission-item">
                <input type="checkbox" checked={selected.includes(item.id)} onChange={(event) => change(event.target.checked ? [...selected, item.id] : selected.filter((id) => id !== item.id))} />
                <span>{item.name} <small className="muted-copy">({item.unit})</small></span>
              </label>
            ))}
          </fieldset>
        ))}
        {!groups.length ? <p className="muted-copy">{activeItems.length ? "ไม่พบสินค้าที่ตรงกับคำค้น" : "เพิ่มสินค้าในคลังก่อนกำหนดสิทธิ์"}</p> : null}
      </div>
      {saveError ? <p className="form-error" role="alert">{saveError}</p> : null}
      {message ? <p role="status">{message}</p> : null}
      <button className="primary-button" type="button" onClick={() => void save()} disabled={saving}>
        {saving ? <Loader2 size={17} className="spin" /> : <Save size={17} />} {saving ? "กำลังบันทึกสิทธิ์" : "บันทึกสิทธิ์ของตำแหน่ง"}
      </button>
    </fieldset>
  );
}
