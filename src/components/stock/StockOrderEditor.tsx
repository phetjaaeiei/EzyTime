import { useState } from 'react';
import { ArrowDown, ArrowUp, GripVertical, Loader2, Save } from 'lucide-react';
import { closestCenter, DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { StockItem } from '../../types';
import { applyStockOrder, moveStockItem } from '../../lib/stock.layout';

interface Props {
  items: StockItem[];
  order: string[];
  loading: boolean;
  error: string;
  reload: () => void;
  save: (order: string[]) => Promise<void>;
}
export default function StockOrderEditor({ items, order, loading, error, reload, save }: Props) {
  const [draft, setDraft] = useState<string[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [message, setMessage] = useState('');
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const sorted = applyStockOrder(items, draft ?? order);
  const ids = sorted.map(item => item.id);
  function move(active: string, over: string) { setDraft(moveStockItem(ids, active, over)); setMessage(''); }
  async function persist(next: string[]) {
    setSaving(true); setSaveError(''); setMessage('');
    try {
      // Keep preferences for temporarily hidden/archived items when saving a visible list.
      await save(next.length ? [...next, ...order.filter(id => !next.includes(id))] : []);
      setDraft(null); setMessage(next.length ? 'บันทึกลำดับส่วนตัวแล้ว' : 'คืนลำดับเดิมแล้ว');
    } catch (cause) { setSaveError(cause instanceof Error ? cause.message : 'บันทึกไม่สำเร็จ'); }
    finally { setSaving(false); }
  }
  return (
    <section className="stock-order-panel" aria-label="จัดลำดับสินค้าส่วนตัว">
      {error ? <p className="form-error" role="alert">{error} <button type="button" className="icon-text-button" onClick={reload}>ลองโหลดลำดับอีกครั้ง</button></p> : null}
      {draft === null ? (
        <div className="stock-order-toolbar">
          <button type="button" className="icon-text-button" disabled={loading || !!error || items.length < 2} onClick={() => { setDraft(ids); setMessage(''); }}><GripVertical size={18} /> จัดลำดับสินค้า</button>
          <span className="muted-copy">{order.length ? 'แสดงตามลำดับส่วนตัวของคุณ' : 'เรียงตามหมวดหมู่และชื่อสินค้า'}</span>
        </div>
      ) : (
        <>
          <div className="section-heading-row"><div><h3>จัดลำดับสินค้า</h3><p className="muted-copy">ลากที่จุดจับ หรือใช้ปุ่มขึ้นลง ลำดับนี้ใช้เฉพาะบัญชีของคุณ</p></div></div>
          <DndContext sensors={sensors} collisionDetection={closestCenter}
            accessibility={{ screenReaderInstructions: { draggable: 'กด Space เพื่อเริ่มย้าย ใช้ลูกศรขึ้นลงเพื่อจัดลำดับ กด Space อีกครั้งเพื่อวาง หรือ Escape เพื่อยกเลิก' }, announcements: {
              onDragStart: ({ active }) => `กำลังย้าย ${items.find(item => item.id === active.id)?.name ?? 'สินค้า'}`,
              onDragOver: ({ over }) => over ? `ตำแหน่งที่ ${ids.indexOf(String(over.id)) + 1}` : 'อยู่นอกรายการ',
              onDragEnd: ({ over }) => over ? `วางที่ตำแหน่ง ${ids.indexOf(String(over.id)) + 1}` : 'ยกเลิกการย้าย',
              onDragCancel: () => 'ยกเลิกการย้าย',
            } }}
            onDragEnd={({ active, over }) => { if (over && !saving) move(String(active.id), String(over.id)); }}>
            <SortableContext items={ids} strategy={verticalListSortingStrategy}>
              <ol className="stock-order-list">
                {sorted.map((item, index) => <SortableRow key={item.id} item={item} index={index} count={sorted.length} disabled={saving} onMove={(offset) => move(item.id, ids[index + offset])} />)}
              </ol>
            </SortableContext>
          </DndContext>
          <div className="stock-order-toolbar">
            <button type="button" className="primary-button" disabled={saving} onClick={() => void persist(ids)}>{saving ? <Loader2 className="spin" size={17} /> : <Save size={17} />} บันทึกลำดับ</button>
            <button type="button" className="icon-text-button" disabled={saving} onClick={() => { setDraft(null); setSaveError(''); }}>ยกเลิก</button>
            <button type="button" className="icon-text-button quiet" disabled={saving} onClick={() => void persist([])}>คืนลำดับเดิม</button>
          </div>
        </>
      )}
      {saveError ? <p className="form-error" role="alert">{saveError}</p> : null}
      {message ? <p className="muted-copy" role="status">{message}</p> : null}
    </section>
  );
}
function SortableRow({ item, index, count, disabled, onMove }: { item: StockItem; index: number; count: number; disabled: boolean; onMove: (offset: number) => void }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: item.id, disabled });
  return (
    <li ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className={`stock-order-row${isDragging ? ' is-dragging' : ''}`}>
      <button ref={setActivatorNodeRef} type="button" {...attributes} {...listeners} className="icon-button stock-drag-handle" disabled={disabled} aria-label={`ลากเพื่อย้าย ${item.name}`}><GripVertical size={20} /></button>
      <span className="stock-order-number" aria-hidden="true">{index + 1}</span>
      <span className="stock-order-name"><strong>{item.name}</strong><small>{item.category || 'ไม่ระบุหมวดหมู่'} · {item.unit}</small></span>
      <button type="button" className="icon-button" disabled={disabled || index === 0} onClick={() => onMove(-1)} aria-label={`เลื่อน ${item.name} ขึ้น`}><ArrowUp size={18} /></button>
      <button type="button" className="icon-button" disabled={disabled || index === count - 1} onClick={() => onMove(1)} aria-label={`เลื่อน ${item.name} ลง`}><ArrowDown size={18} /></button>
    </li>
  );
}
