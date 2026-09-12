import type {
  ItemBalance,
  NewMovement,
  NewStockItem,
  StockItem,
  StockItemPatch,
  StockMovement,
} from "../types";
import { extractNickname } from "./employee";
import { supabase } from "./supabase";
import { STOCK_CATALOG } from "./stock.catalog";

const ITEMS_KEY = "ezytime.stock.items.v1";
const MOVES_KEY = "ezytime.stock.moves.v1";
const OPENING_BALANCE_NOTE = "__ezytime_stock_opening_balance__";
const OPENING_BALANCE_DATE = "2000-01-01T00:00:00.000Z";

// ---------- demo seed ----------
function nowIso(): string {
  return new Date().toISOString();
}
const demoItems: StockItem[] = [
  ...STOCK_CATALOG.map((item, index) => seedItem(`catalog-${index + 1}`, item.name, item.unit, item.category, 0)),
];

function seedItem(
  id: string,
  name: string,
  unit: string,
  category: string,
  threshold: number,
): StockItem {
  return {
    id,
    name,
    unit,
    category,
    low_stock_threshold: threshold,
    is_active: true,
    created_at: nowIso(),
    updated_at: nowIso(),
  };
}

const demoMovements: StockMovement[] = [];

function readLocal<T>(key: string, seed: T): T {
  const raw = window.localStorage.getItem(key);
  if (!raw) {
    window.localStorage.setItem(key, JSON.stringify(seed));
    return seed;
  }
  try {
    return JSON.parse(raw) as T;
  } catch {
    window.localStorage.setItem(key, JSON.stringify(seed));
    return seed;
  }
}
function writeLocal<T>(key: string, value: T): void {
  window.localStorage.setItem(key, JSON.stringify(value));
}

// ---------- actor identity ----------
export async function getStockActorName(): Promise<string> {
  if (!supabase) return "โหมดทดลอง";
  const { data } = await supabase.auth.getSession();
  const user = data.session?.user;
  if (!user) return "พนักงาน";
  return extractNickname(user.user_metadata) ?? user.email ?? "พนักงาน";
}

async function currentUserId(): Promise<string | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.user.id ?? null;
}

// ---------- items ----------
export async function listItems(options: { includeArchived?: boolean } = {}): Promise<StockItem[]> {
  const includeArchived = options.includeArchived ?? false;

  if (supabase) {
    let query = supabase.from("stock_items").select("*").order("name", { ascending: true });
    if (!includeArchived) query = query.eq("is_active", true);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return (data ?? []) as StockItem[];
  }

  const items = readLocal(ITEMS_KEY, demoItems);
  return items
    .filter((item) => includeArchived || item.is_active)
    .sort((a, b) => a.name.localeCompare(b.name, "th-TH"));
}

export async function createItem(input: NewStockItem): Promise<StockItem> {
  if (supabase) {
    const { data, error } = await supabase
      .from("stock_items")
      .insert({
        name: input.name.trim(),
        unit: input.unit.trim(),
        category: input.category?.trim() || null,
        low_stock_threshold: input.low_stock_threshold,
        created_by: await currentUserId(),
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return data as StockItem;
  }

  const item: StockItem = {
    id: crypto.randomUUID(),
    name: input.name.trim(),
    unit: input.unit.trim(),
    category: input.category?.trim() || null,
    low_stock_threshold: input.low_stock_threshold,
    is_active: true,
    created_at: nowIso(),
    updated_at: nowIso(),
  };
  writeLocal(ITEMS_KEY, [...readLocal(ITEMS_KEY, demoItems), item]);
  return item;
}

export async function updateItem(id: string, patch: StockItemPatch): Promise<void> {
  const normalized: StockItemPatch = { ...patch };
  if (typeof normalized.name === "string") normalized.name = normalized.name.trim();
  if (typeof normalized.unit === "string") normalized.unit = normalized.unit.trim();
  if (typeof normalized.category === "string") normalized.category = normalized.category.trim() || null;

  if (supabase) {
    const { error } = await supabase
      .from("stock_items")
      .update({ ...normalized, updated_at: nowIso() })
      .eq("id", id);
    if (error) throw new Error(error.message);
    return;
  }
  const items = readLocal(ITEMS_KEY, demoItems).map((item) =>
    item.id === id ? { ...item, ...normalized, updated_at: nowIso() } : item,
  );
  writeLocal(ITEMS_KEY, items);
}

export async function archiveItem(id: string): Promise<void> {
  await updateItem(id, { is_active: false });
}

// ---------- movements ----------
export async function listMovements(
  options: { itemId?: string; mine?: boolean } = {},
): Promise<StockMovement[]> {
  if (supabase) {
    let query = supabase.from("stock_movements").select("*").order("created_at", { ascending: false });
    if (options.itemId) query = query.eq("item_id", options.itemId);
    if (options.mine) {
      const uid = await currentUserId();
      if (uid) query = query.eq("user_id", uid);
    }
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return (data ?? []) as StockMovement[];
  }

  let moves = readLocal(MOVES_KEY, demoMovements);
  if (options.itemId) moves = moves.filter((move) => move.item_id === options.itemId);
  if (options.mine) {
    const uid = await currentUserId();
    moves = moves.filter((move) => move.user_id === uid);
  }
  return [...moves].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
}

export async function listStockOnHand(): Promise<Record<string, number> | null> {
  if (supabase) {
    const { data, error } = await supabase.rpc("get_stock_item_balances");
    if (error) {
      if (error.code === "PGRST202" || error.message.includes("get_stock_item_balances")) return null;
      throw new Error(error.message);
    }
    return Object.fromEntries(
      ((data ?? []) as Array<{ item_id: string; on_hand: number }>).map((row) => [row.item_id, Number(row.on_hand)]),
    );
  }

  const totals: Record<string, number> = {};
  for (const item of await listItems()) totals[item.id] = 0;
  for (const movement of await listMovements()) {
    const direction = movement.type === "in" ? 1 : -1;
    totals[movement.item_id] = (totals[movement.item_id] ?? 0) + direction * movement.quantity;
  }
  return totals;
}

export async function recordMovement(input: NewMovement): Promise<StockMovement> {
  if (!(input.quantity > 0)) {
    throw new Error("จำนวนต้องมากกว่า 0");
  }
  const actorName = await getStockActorName();

  if (supabase) {
    const { data, error } = await supabase
      .from("stock_movements")
      .insert({
        item_id: input.item_id,
        type: input.type,
        quantity: input.quantity,
        note: input.note?.trim() || null,
        user_id: await currentUserId(),
        actor_name: actorName,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return data as StockMovement;
  }

  const movement: StockMovement = {
    id: crypto.randomUUID(),
    item_id: input.item_id,
    type: input.type,
    quantity: input.quantity,
    note: input.note?.trim() || null,
    user_id: null,
    actor_name: actorName,
    created_at: nowIso(),
  };
  writeLocal(MOVES_KEY, [...readLocal(MOVES_KEY, demoMovements), movement]);
  return movement;
}

export async function setStockBalanceTotals(
  balance: ItemBalance,
  targetReceived: number,
  targetOnHand: number,
): Promise<void> {
  const targetWithdrawn = targetReceived - targetOnHand - balance.waste;
  if (targetReceived < 0 || targetOnHand < 0 || targetWithdrawn < -1e-9) {
    throw new Error("จำนวนรับเข้าไม่เพียงพอสำหรับยอดคงเหลือและของเสีย");
  }

  await reconcileMovementTotal(
    balance.item.id,
    "in",
    targetReceived,
    balance.received,
    `ปรับยอดรับเข้าทั้งหมดเป็น ${targetReceived}`,
  );
  await reconcileMovementTotal(
    balance.item.id,
    "out",
    Math.max(0, targetWithdrawn),
    balance.withdrawn,
    `ปรับยอดเบิกใช้เพื่อให้คงเหลือ ${targetOnHand}`,
  );
}

async function reconcileMovementTotal(
  itemId: string,
  type: StockMovement["type"],
  target: number,
  current: number,
  note: string,
): Promise<void> {
  const difference = target - current;
  if (Math.abs(difference) <= 1e-9) return;
  if (difference > 0) {
    await recordMovement({ item_id: itemId, type, quantity: difference, note });
    return;
  }

  let remainingReduction = Math.abs(difference);
  const movements = (await listMovements({ itemId })).filter((movement) => movement.type === type);
  for (const movement of movements) {
    if (remainingReduction <= 1e-9) break;
    if (movement.quantity <= remainingReduction + 1e-9) {
      remainingReduction -= movement.quantity;
      await deleteMovement(movement.id);
    } else {
      await updateMovementQuantity(movement.id, movement.quantity - remainingReduction);
      remainingReduction = 0;
    }
  }
  if (remainingReduction > 1e-9) throw new Error("ปรับยอดสต๊อกไม่สำเร็จ กรุณารีเฟรชแล้วลองอีกครั้ง");
}

async function updateMovementQuantity(id: string, quantity: number): Promise<void> {
  if (supabase) {
    const { error } = await supabase.from("stock_movements").update({ quantity }).eq("id", id);
    if (error) throw new Error(error.message);
    return;
  }
  const movements = readLocal(MOVES_KEY, demoMovements).map((movement) =>
    movement.id === id ? { ...movement, quantity } : movement,
  );
  writeLocal(MOVES_KEY, movements);
}

async function deleteMovement(id: string): Promise<void> {
  if (supabase) {
    const { error } = await supabase.from("stock_movements").delete().eq("id", id);
    if (error) throw new Error(error.message);
    return;
  }
  writeLocal(MOVES_KEY, readLocal(MOVES_KEY, demoMovements).filter((movement) => movement.id !== id));
}

export function isOpeningBalanceMovement(movement: StockMovement): boolean {
  return movement.note === OPENING_BALANCE_NOTE;
}

export async function clearMovementHistory(balances: ItemBalance[]): Promise<void> {
  if (balances.some((balance) => balance.onHand < 0)) {
    throw new Error("พบสินค้าที่มียอดติดลบ กรุณาปรับยอดคงเหลือก่อนเคลียร์ประวัติ");
  }

  const actorName = await getStockActorName();
  const userId = await currentUserId();
  const openingBalances = balances
    .filter((balance) => balance.onHand > 0)
    .map((balance) => ({
      item_id: balance.item.id,
      type: "in" as const,
      quantity: balance.onHand,
      note: OPENING_BALANCE_NOTE,
      user_id: userId,
      actor_name: actorName,
      created_at: OPENING_BALANCE_DATE,
    }));

  if (supabase) {
    const { error: deleteError } = await supabase
      .from("stock_movements")
      .delete()
      .not("id", "is", null);
    if (deleteError) throw new Error(deleteError.message);

    if (openingBalances.length) {
      const { error: insertError } = await supabase.from("stock_movements").insert(openingBalances);
      if (insertError) throw new Error(insertError.message);
    }
    return;
  }

  const localOpeningBalances: StockMovement[] = openingBalances.map((movement) => ({
    ...movement,
    id: crypto.randomUUID(),
  }));
  writeLocal(MOVES_KEY, localOpeningBalances);
}

/** Permanently delete selected products and their movement history. */
export async function deleteStockItems(itemIds: string[]): Promise<number> {
  const ids = [...new Set(itemIds)];
  if (!ids.length) throw new Error("กรุณาเลือกสินค้าที่ต้องการลบ");
  if (supabase) {
    const { data, error } = await supabase.rpc("delete_stock_items", { target_item_ids: ids });
    if (error) throw new Error(error.message);
    return Number(data);
  }
  const items = readLocal(ITEMS_KEY, demoItems);
  if (ids.some(id => !items.some(item => item.id === id))) throw new Error("บางสินค้าถูกลบไปแล้ว กรุณารีเฟรชและเลือกใหม่");
  const movements = readLocal(MOVES_KEY, demoMovements);
  writeLocal(MOVES_KEY, movements.filter(move => !ids.includes(move.item_id)));
  writeLocal(ITEMS_KEY, items.filter(item => !ids.includes(item.id)));
  const permissionsKey = "ezytime.stock.permissions.v1";
  const permissions = readLocal<Record<string, string[]>>(permissionsKey, {});
  writeLocal(permissionsKey, Object.fromEntries(Object.entries(permissions).map(([position, granted]) => [position, granted.filter(id => !ids.includes(id))])));
  return ids.length;
}
