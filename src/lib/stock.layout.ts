import { supabase } from './supabase';

export function applyStockOrder<T extends { id: string }>(items: T[], order: string[]): T[] {
  const byId = new Map(items.map(item => [item.id, item]));
  const result: T[] = [];
  for (const id of order) {
    const item = byId.get(id);
    if (item) { result.push(item); byId.delete(id); }
  }
  return [...result, ...byId.values()];
}
export function moveStockItem(order: string[], activeId: string, overId: string): string[] {
  const from = order.indexOf(activeId), to = order.indexOf(overId);
  if (from < 0 || to < 0 || from === to) return order;
  const next = [...order];
  next.splice(to, 0, ...next.splice(from, 1));
  return next;
}
async function userId(): Promise<string> {
  if (!supabase) return 'demo';
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error('กรุณาเข้าสู่ระบบใหม่เพื่อบันทึกลำดับสินค้า');
  return data.user.id;
}
export async function loadStockOrder(): Promise<string[]> {
  const id = await userId();
  if (!supabase) {
    const raw = window.localStorage.getItem(`ezytime.stock.layout.${id}`);
    if (!raw) return [];
    try { const order: unknown = JSON.parse(raw); return Array.isArray(order) ? order.filter((v): v is string => typeof v === 'string') : []; }
    catch { return []; }
  }
  const { data, error } = await supabase.from('user_stock_layouts').select('item_ids').eq('user_id', id).maybeSingle();
  if (error) throw new Error('โหลดลำดับส่วนตัวไม่สำเร็จ กรุณาลองอีกครั้ง');
  return data?.item_ids ?? [];
}
export async function saveStockOrder(order: string[]): Promise<void> {
  const id = await userId();
  const itemIds = [...new Set(order)];
  if (!supabase) { window.localStorage.setItem(`ezytime.stock.layout.${id}`, JSON.stringify(itemIds)); return; }
  const { error } = await supabase.from('user_stock_layouts').upsert({ user_id: id, item_ids: itemIds });
  if (error) throw new Error('บันทึกลำดับไม่สำเร็จ กรุณาลองอีกครั้ง');
}
