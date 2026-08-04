import type {
  NewMovement,
  NewStockItem,
  StockItem,
  StockItemPatch,
  StockMovement,
} from "../types";
import { extractNickname } from "./employee";
import { supabase } from "./supabase";

const ITEMS_KEY = "ezytime.stock.items.v1";
const MOVES_KEY = "ezytime.stock.moves.v1";

// ---------- demo seed ----------
function nowIso(): string {
  return new Date().toISOString();
}
function hoursAgo(hours: number): string {
  return new Date(Date.now() - hours * 3_600_000).toISOString();
}

const demoItems: StockItem[] = [
  seedItem("s-1", "เนื้อสันคอ", "กก.", "เนื้อ", 5),
  seedItem("s-2", "หมูสไลด์", "กก.", "เนื้อ", 8),
  seedItem("s-3", "ผักกาดขาว", "กก.", "ผัก", 3),
  seedItem("s-4", "เต้าหู้ไข่", "แพ็ค", "ผัก", 10),
  seedItem("s-5", "น้ำจิ้มสุกี้", "ขวด", "เครื่องปรุง", 6),
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
    created_at: hoursAgo(72),
    updated_at: hoursAgo(72),
  };
}

const demoMovements: StockMovement[] = [
  seedMove("s-1", "in", 20, hoursAgo(70), "รับของเช้า"),
  seedMove("s-1", "out", 12, hoursAgo(5), "เตรียมหน้าร้าน"),
  seedMove("s-1", "waste", 1, hoursAgo(3), "ตัดส่วนเสีย"),
  seedMove("s-2", "in", 25, hoursAgo(70), null),
  seedMove("s-2", "out", 18, hoursAgo(4), null),
  seedMove("s-3", "in", 10, hoursAgo(48), null),
  seedMove("s-3", "out", 8, hoursAgo(2), "จัดผักรวม"),
  seedMove("s-4", "in", 30, hoursAgo(48), null),
  seedMove("s-4", "out", 12, hoursAgo(6), null),
  seedMove("s-5", "in", 12, hoursAgo(48), null),
  seedMove("s-5", "out", 7, hoursAgo(1), null),
];

function seedMove(
  itemId: string,
  type: StockMovement["type"],
  quantity: number,
  createdAt: string,
  note: string | null,
): StockMovement {
  return {
    id: crypto.randomUUID(),
    item_id: itemId,
    type,
    quantity,
    note,
    user_id: null,
    actor_name: "มะลิ",
    created_at: createdAt,
  };
}

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
  return items.filter((item) => includeArchived || item.is_active);
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
  if (supabase) {
    const { error } = await supabase
      .from("stock_items")
      .update({ ...patch, updated_at: nowIso() })
      .eq("id", id);
    if (error) throw new Error(error.message);
    return;
  }
  const items = readLocal(ITEMS_KEY, demoItems).map((item) =>
    item.id === id ? { ...item, ...patch, updated_at: nowIso() } : item,
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
  return [...moves].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
}

export async function recordMovement(input: NewMovement): Promise<StockMovement> {
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
