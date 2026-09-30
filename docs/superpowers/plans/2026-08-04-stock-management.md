# Stock Management Module Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a ledger-based stock (inventory) module to EzyTime so a shabu shop's admin defines items with flexible units, employees withdraw stock after Google login, and a daily dashboard shows used-vs-remaining with per-item donut charts.

**Architecture:** Append-only movement ledger (`in`/`out`/`waste`) is the single source of truth; on-hand and all figures are computed from movements client-side (mirrors attendance's `buildDailySummary`). A new `src/lib/stock.ts` data layer follows the existing dual-mode `if (supabase) {…} else {localStorage}` pattern. Admin console gains a module switcher (attendance ↔ stock); employees get a new `/stock` route reusing the existing Google auth helpers.

**Tech Stack:** React 19 + Vite + TypeScript, Supabase Postgres + Auth + RLS, lucide-react icons, vitest. No new npm dependencies — donut chart is hand-rolled SVG.

## Global Constraints

- No new npm dependencies (donut is dependency-free SVG). Cloudflare Workers static-assets deploy.
- Dual-mode data layer: every data function works with Supabase AND with `localStorage` demo fallback (`isSupabaseConfigured === false`).
- Thai UI copy; WCAG AA — visible focus, 44px targets, `role`/`aria-label` on the donut, respect `prefers-reduced-motion`.
- Reuse existing helpers: `getLocalDayRange`, `formatDateInput`, `formatDateTime`, `formatThaiDate` from `src/lib/time.ts`; employee auth (`getEmployeeSession`, `onEmployeeAuthChange`, `signInWithGoogle`, `signOutCurrentUser`, `updateEmployeeNickname`) and admin session from `src/lib/store.ts`.
- Reuse existing CSS classes where they fit: `clock-layout`, `form-panel`, `panel-icon`, `segmented-control`/`segment`/`is-selected`, `stat-card`/`stat-grid`, `icon-text-button`, `primary-button`, `field`, `muted-copy`, `form-error`, `admin-layout`, `date-control`.
- `quantity` always positive; sign implied by `type`. On-hand identity: `received = withdrawn + waste + onHand`.
- Schema is appended to `supabase/schema.sql` idempotently (safe to re-run), matching the existing convention.

---

### Task 1: Domain types + Supabase schema + generated types

**Files:**
- Modify: `src/types.ts` (append stock domain types)
- Modify: `src/lib/supabase.types.ts` (add the two tables to `Database`)
- Modify: `supabase/schema.sql` (append tables, function, indexes, grants, RLS)

**Interfaces:**
- Produces: `MovementType`, `StockItem`, `NewStockItem`, `StockItemPatch`, `StockMovement`, `NewMovement`, `ItemBalance`, `DailyStockStats` — consumed by every later task.

- [ ] **Step 1: Append stock domain types to `src/types.ts`**

```ts
// ===== Stock module =====

export type MovementType = "in" | "out" | "waste";

export interface StockItem {
  id: string;
  name: string;
  unit: string;
  category: string | null;
  low_stock_threshold: number | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface NewStockItem {
  name: string;
  unit: string;
  category: string | null;
  low_stock_threshold: number | null;
}

export interface StockItemPatch {
  name?: string;
  unit?: string;
  category?: string | null;
  low_stock_threshold?: number | null;
  is_active?: boolean;
}

export interface StockMovement {
  id: string;
  item_id: string;
  type: MovementType;
  quantity: number;
  note: string | null;
  user_id: string | null;
  actor_name: string | null;
  created_at: string;
}

export interface NewMovement {
  item_id: string;
  type: MovementType;
  quantity: number;
  note?: string | null;
}

export interface ItemBalance {
  item: StockItem;
  received: number;
  withdrawn: number;
  waste: number;
  onHand: number;
  isLow: boolean;
}

export interface DailyStockStats {
  received: number;
  withdrawn: number;
  waste: number;
  movementCount: number;
}
```

- [ ] **Step 2: Add both tables to `src/lib/supabase.types.ts`**

Add a `StockItem`/`StockMovement` import from `../types` and two entries under `Tables` (Row/Insert/Update). Row mirrors the `StockItem`/`StockMovement` shapes; Insert makes `id`/timestamps optional; Update is `Partial<Insert>`.

```ts
import type { EventType, MovementType, Position } from "../types";
// ...existing time_logs / admin_users entries unchanged...
      stock_items: {
        Row: {
          id: string;
          name: string;
          unit: string;
          category: string | null;
          low_stock_threshold: number | null;
          is_active: boolean;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          unit: string;
          category?: string | null;
          low_stock_threshold?: number | null;
          is_active?: boolean;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<{
          name: string;
          unit: string;
          category: string | null;
          low_stock_threshold: number | null;
          is_active: boolean;
        }>;
      };
      stock_movements: {
        Row: {
          id: string;
          item_id: string;
          type: MovementType;
          quantity: number;
          note: string | null;
          user_id: string | null;
          actor_name: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          item_id: string;
          type: MovementType;
          quantity: number;
          note?: string | null;
          user_id?: string | null;
          actor_name?: string | null;
          created_at?: string;
        };
        Update: never;
      };
```

- [ ] **Step 3: Append schema to `supabase/schema.sql`** (before the trailing admin-insert comment)

```sql
-- ===== Stock management module =====

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admin_users where user_id = auth.uid());
$$;

create table if not exists public.stock_items (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 1 and 100),
  unit text not null check (char_length(trim(unit)) between 1 and 20),
  category text,
  low_stock_threshold numeric check (low_stock_threshold >= 0),
  is_active boolean not null default true,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.stock_items(id) on delete cascade,
  type text not null check (type in ('in', 'out', 'waste')),
  quantity numeric not null check (quantity > 0),
  note text check (char_length(note) <= 300),
  user_id uuid references auth.users(id),
  actor_name text,
  created_at timestamptz not null default now()
);

create index if not exists stock_movements_item_idx on public.stock_movements (item_id);
create index if not exists stock_movements_created_at_idx on public.stock_movements (created_at);

alter table public.stock_items enable row level security;
alter table public.stock_movements enable row level security;

grant select on public.stock_items to authenticated;
grant insert, update, delete on public.stock_items to authenticated;
grant select, insert, update, delete on public.stock_movements to authenticated;

-- stock_items: everyone signed-in can read; only admins write.
drop policy if exists "Authenticated can read stock items" on public.stock_items;
create policy "Authenticated can read stock items"
on public.stock_items for select to authenticated using (true);

drop policy if exists "Admins manage stock items" on public.stock_items;
create policy "Admins manage stock items"
on public.stock_items for all to authenticated
using (public.is_admin()) with check (public.is_admin());

-- stock_movements: employees insert their own out/waste; admins insert anything.
drop policy if exists "Users record their own withdrawals" on public.stock_movements;
create policy "Users record their own withdrawals"
on public.stock_movements for insert to authenticated
with check (
  user_id = auth.uid()
  and (type in ('out', 'waste') or public.is_admin())
);

drop policy if exists "Read own movements or admin reads all" on public.stock_movements;
create policy "Read own movements or admin reads all"
on public.stock_movements for select to authenticated
using (user_id = auth.uid() or public.is_admin());

drop policy if exists "Admins correct movements" on public.stock_movements;
create policy "Admins correct movements"
on public.stock_movements for update to authenticated
using (public.is_admin()) with check (public.is_admin());

drop policy if exists "Admins delete movements" on public.stock_movements;
create policy "Admins delete movements"
on public.stock_movements for delete to authenticated
using (public.is_admin());
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc -b`
Expected: no errors (types compile; `supabase.types.ts` still valid).

- [ ] **Step 5: Commit**

```bash
git add src/types.ts src/lib/supabase.types.ts supabase/schema.sql
git commit -m "feat(stock): add stock domain types and Supabase schema"
```

---

### Task 2: Pure calculation helpers (TDD)

**Files:**
- Create: `src/lib/stock.calc.ts`
- Test: `src/lib/stock.calc.test.ts`

**Interfaces:**
- Consumes: `StockItem`, `StockMovement`, `ItemBalance`, `DailyStockStats` (Task 1); `getLocalDayRange` from `./time`.
- Produces:
  - `computeItemBalances(items: StockItem[], movements: StockMovement[]): ItemBalance[]`
  - `computeDailyStats(movements: StockMovement[], dateInput: string): DailyStockStats`
  - `findLowStockItems(balances: ItemBalance[]): ItemBalance[]`
  - `buildDonutArcs(slices: DonutSlice[], circumference: number): DonutArc[]` with `DonutSlice = { label: string; value: number; color: string }` and `DonutArc = DonutSlice & { percent: number; dashArray: string; dashOffset: number }`.

- [ ] **Step 1: Write the failing tests** — `src/lib/stock.calc.test.ts`

```ts
import { describe, expect, it } from "vitest";
import type { StockItem, StockMovement } from "../types";
import {
  buildDonutArcs,
  computeDailyStats,
  computeItemBalances,
  findLowStockItems,
} from "./stock.calc";

function item(overrides: Partial<StockItem> = {}): StockItem {
  return {
    id: "item-1",
    name: "เนื้อสันคอ",
    unit: "กก.",
    category: "เนื้อ",
    low_stock_threshold: null,
    is_active: true,
    created_at: "2026-08-04T01:00:00.000Z",
    updated_at: "2026-08-04T01:00:00.000Z",
    ...overrides,
  };
}

function move(overrides: Partial<StockMovement> = {}): StockMovement {
  return {
    id: crypto.randomUUID(),
    item_id: "item-1",
    type: "in",
    quantity: 10,
    note: null,
    user_id: null,
    actor_name: null,
    created_at: "2026-08-04T02:00:00.000Z",
    ...overrides,
  };
}

describe("computeItemBalances", () => {
  it("upholds received = withdrawn + waste + onHand", () => {
    const items = [item()];
    const movements = [
      move({ type: "in", quantity: 20 }),
      move({ type: "in", quantity: 5 }),
      move({ type: "out", quantity: 8 }),
      move({ type: "waste", quantity: 2 }),
    ];
    const [balance] = computeItemBalances(items, movements);
    expect(balance.received).toBe(25);
    expect(balance.withdrawn).toBe(8);
    expect(balance.waste).toBe(2);
    expect(balance.onHand).toBe(15);
    expect(balance.received).toBe(balance.withdrawn + balance.waste + balance.onHand);
  });

  it("returns zeroed balance for an item with no movements", () => {
    const [balance] = computeItemBalances([item()], []);
    expect(balance.received).toBe(0);
    expect(balance.onHand).toBe(0);
    expect(balance.isLow).toBe(false);
  });

  it("flags low stock only when a threshold is set and onHand is at/under it", () => {
    const withThreshold = item({ id: "a", low_stock_threshold: 5 });
    const noThreshold = item({ id: "b", low_stock_threshold: null });
    const movements = [
      move({ item_id: "a", type: "in", quantity: 6 }),
      move({ item_id: "a", type: "out", quantity: 2 }), // onHand 4 <= 5 → low
      move({ item_id: "b", type: "in", quantity: 1 }),
    ];
    const balances = computeItemBalances([withThreshold, noThreshold], movements);
    expect(balances.find((b) => b.item.id === "a")?.isLow).toBe(true);
    expect(balances.find((b) => b.item.id === "b")?.isLow).toBe(false);
  });

  it("ignores movements whose item is not in the list", () => {
    const balances = computeItemBalances([item({ id: "x" })], [move({ item_id: "ghost" })]);
    expect(balances[0].received).toBe(0);
  });
});

describe("computeDailyStats", () => {
  it("buckets movements to the given local day only", () => {
    const movements = [
      move({ type: "in", quantity: 10, created_at: localIso("2026-08-04", 9) }),
      move({ type: "out", quantity: 3, created_at: localIso("2026-08-04", 12) }),
      move({ type: "waste", quantity: 1, created_at: localIso("2026-08-04", 15) }),
      move({ type: "out", quantity: 99, created_at: localIso("2026-08-05", 10) }), // other day
    ];
    const stats = computeDailyStats(movements, "2026-08-04");
    expect(stats.received).toBe(10);
    expect(stats.withdrawn).toBe(3);
    expect(stats.waste).toBe(1);
    expect(stats.movementCount).toBe(3);
  });
});

describe("buildDonutArcs", () => {
  it("splits the circumference proportionally and offsets sequentially", () => {
    const arcs = buildDonutArcs(
      [
        { label: "เบิกใช้", value: 25, color: "a" },
        { label: "คงเหลือ", value: 75, color: "b" },
      ],
      100,
    );
    expect(arcs[0].percent).toBeCloseTo(0.25);
    expect(arcs[0].dashArray).toBe("25 75");
    expect(arcs[0].dashOffset).toBe(0);
    expect(arcs[1].dashArray).toBe("75 25");
    expect(arcs[1].dashOffset).toBe(-25);
  });

  it("returns zero-length arcs when total is zero", () => {
    const arcs = buildDonutArcs([{ label: "x", value: 0, color: "a" }], 100);
    expect(arcs[0].percent).toBe(0);
    expect(arcs[0].dashArray).toBe("0 100");
  });
});

// helper: local-time ISO for a given yyyy-mm-dd + hour, matching getLocalDayRange semantics
function localIso(date: string, hour: number): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y, m - 1, d, hour, 0, 0, 0).toISOString();
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/stock.calc.test.ts`
Expected: FAIL — `Cannot find module './stock.calc'`.

- [ ] **Step 3: Implement `src/lib/stock.calc.ts`**

```ts
import type { DailyStockStats, ItemBalance, StockItem, StockMovement } from "../types";
import { getLocalDayRange } from "./time";

export function computeItemBalances(items: StockItem[], movements: StockMovement[]): ItemBalance[] {
  const totals = new Map<string, { received: number; withdrawn: number; waste: number }>();
  for (const item of items) {
    totals.set(item.id, { received: 0, withdrawn: 0, waste: 0 });
  }

  for (const movement of movements) {
    const bucket = totals.get(movement.item_id);
    if (!bucket) continue;
    if (movement.type === "in") bucket.received += movement.quantity;
    else if (movement.type === "out") bucket.withdrawn += movement.quantity;
    else bucket.waste += movement.quantity;
  }

  return items.map((item) => {
    const bucket = totals.get(item.id)!;
    const onHand = bucket.received - bucket.withdrawn - bucket.waste;
    const isLow =
      item.low_stock_threshold !== null && onHand <= item.low_stock_threshold;
    return { item, received: bucket.received, withdrawn: bucket.withdrawn, waste: bucket.waste, onHand, isLow };
  });
}

export function computeDailyStats(movements: StockMovement[], dateInput: string): DailyStockStats {
  const { start, end } = getLocalDayRange(dateInput);
  const stats: DailyStockStats = { received: 0, withdrawn: 0, waste: 0, movementCount: 0 };

  for (const movement of movements) {
    const at = Date.parse(movement.created_at);
    if (at < start.getTime() || at >= end.getTime()) continue;
    stats.movementCount += 1;
    if (movement.type === "in") stats.received += movement.quantity;
    else if (movement.type === "out") stats.withdrawn += movement.quantity;
    else stats.waste += movement.quantity;
  }

  return stats;
}

export function findLowStockItems(balances: ItemBalance[]): ItemBalance[] {
  return balances.filter((balance) => balance.isLow);
}

export interface DonutSlice {
  label: string;
  value: number;
  color: string;
}

export interface DonutArc extends DonutSlice {
  percent: number;
  dashArray: string;
  dashOffset: number;
}

export function buildDonutArcs(slices: DonutSlice[], circumference: number): DonutArc[] {
  const total = slices.reduce((sum, slice) => sum + Math.max(0, slice.value), 0);
  let consumed = 0;
  return slices.map((slice) => {
    const percent = total > 0 ? Math.max(0, slice.value) / total : 0;
    const length = percent * circumference;
    const dashOffset = -consumed;
    consumed += length;
    return {
      ...slice,
      percent,
      dashArray: `${round(length)} ${round(circumference - length)}`,
      dashOffset: round(dashOffset),
    };
  });
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/stock.calc.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add src/lib/stock.calc.ts src/lib/stock.calc.test.ts
git commit -m "feat(stock): add pure balance/daily/donut calculations with tests"
```

---

### Task 3: Data layer `src/lib/stock.ts` (Supabase + demo)

**Files:**
- Create: `src/lib/stock.ts`

**Interfaces:**
- Consumes: `supabase`, `isSupabaseConfigured` from `./supabase`; types from Task 1; `getEmployeeSession`/`getCurrentSession` are NOT reused here (to avoid a cycle) — instead read the Supabase session/user directly.
- Produces (all async unless noted):
  - `listItems(options?: { includeArchived?: boolean }): Promise<StockItem[]>`
  - `createItem(input: NewStockItem): Promise<StockItem>`
  - `updateItem(id: string, patch: StockItemPatch): Promise<void>`
  - `archiveItem(id: string): Promise<void>`
  - `listMovements(options?: { itemId?: string; mine?: boolean }): Promise<StockMovement[]>`
  - `recordMovement(input: NewMovement): Promise<StockMovement>`
  - `getStockActorName(): Promise<string>` (nickname/email or "พนักงาน")

- [ ] **Step 1: Implement `src/lib/stock.ts`**

```ts
import type {
  NewMovement,
  NewStockItem,
  StockItem,
  StockItemPatch,
  StockMovement,
} from "../types";
import { extractNickname } from "./employee";
import { isSupabaseConfigured, supabase } from "./supabase";

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
```

- [ ] **Step 2: Typecheck + lint**

Run: `npx tsc -b && npx eslint src/lib/stock.ts`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/stock.ts
git commit -m "feat(stock): add dual-mode stock data layer with demo seed"
```

---

### Task 4: `DonutChart` component

**Files:**
- Create: `src/components/stock/DonutChart.tsx`
- Modify: `src/styles.css` (donut classes)

**Interfaces:**
- Consumes: `buildDonutArcs`, `DonutSlice` from `../../lib/stock.calc`.
- Produces: `default` export `DonutChart({ slices, size?, thickness?, centerLabel?, centerSub? })`.

- [ ] **Step 1: Implement `src/components/stock/DonutChart.tsx`**

```tsx
import { buildDonutArcs, type DonutSlice } from "../../lib/stock.calc";

interface DonutChartProps {
  slices: DonutSlice[];
  size?: number;
  thickness?: number;
  centerLabel?: string;
  centerSub?: string;
}

export default function DonutChart({
  slices,
  size = 132,
  thickness = 16,
  centerLabel,
  centerSub,
}: DonutChartProps) {
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  const arcs = buildDonutArcs(slices, circumference);
  const total = slices.reduce((sum, slice) => sum + Math.max(0, slice.value), 0);
  const ariaLabel = slices.map((slice) => `${slice.label} ${slice.value}`).join(", ");

  return (
    <div className="donut">
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        role="img"
        aria-label={total > 0 ? ariaLabel : "ยังไม่มีข้อมูล"}
      >
        <circle
          className="donut-track"
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={thickness}
        />
        {total > 0
          ? arcs.map((arc, index) => (
              <circle
                key={index}
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="none"
                stroke={arc.color}
                strokeWidth={thickness}
                strokeDasharray={arc.dashArray}
                strokeDashoffset={arc.dashOffset}
                strokeLinecap="butt"
                transform={`rotate(-90 ${size / 2} ${size / 2})`}
              />
            ))
          : null}
      </svg>
      {centerLabel ? (
        <div className="donut-center" aria-hidden="true">
          <strong>{centerLabel}</strong>
          {centerSub ? <span>{centerSub}</span> : null}
        </div>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 2: Add donut CSS to `src/styles.css`** (append at end)

```css
/* ===== Stock: donut ===== */
.donut { position: relative; display: inline-grid; place-items: center; }
.donut svg { display: block; }
.donut-track { stroke: color-mix(in oklab, var(--ink) 10%, transparent); }
.donut circle { transition: stroke-dashoffset 180ms ease, stroke-dasharray 180ms ease; }
.donut-center {
  position: absolute; inset: 0; display: grid; place-content: center; text-align: center; line-height: 1.1;
}
.donut-center strong { font-size: 1.05rem; color: var(--ink); }
.donut-center span { font-size: 0.75rem; color: var(--muted); }
@media (prefers-reduced-motion: reduce) { .donut circle { transition: none; } }
```

- [ ] **Step 3: Typecheck + build**

Run: `npx tsc -b && npm run build`
Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/components/stock/DonutChart.tsx src/styles.css
git commit -m "feat(stock): add dependency-free SVG donut chart"
```

---

### Task 5: Admin stock dashboard (read view) + module switcher

**Files:**
- Create: `src/components/stock/StockDashboard.tsx`
- Create: `src/components/stock/ItemStockCard.tsx`
- Modify: `src/components/AdminDashboard.tsx` (wrap attendance + stock in a module switcher)
- Modify: `src/styles.css` (item card, module switcher, low-stock badge classes)

**Interfaces:**
- Consumes: `listItems`, `listMovements` (Task 3); `computeItemBalances`, `computeDailyStats`, `findLowStockItems` (Task 2); `DonutChart` (Task 4); `formatDateInput`, `formatThaiDate`, `formatDateTime` from `../../lib/time`.
- Produces: `StockDashboard` default export (admin module); `ItemStockCard` default export.

- [ ] **Step 1: Implement `src/components/stock/ItemStockCard.tsx`**

```tsx
import { AlertTriangle } from "lucide-react";
import type { ItemBalance } from "../../types";
import DonutChart from "./DonutChart";

const COLOR_WITHDRAWN = "var(--accent)";
const COLOR_WASTE = "var(--danger)";
const COLOR_ONHAND = "var(--primary)";

export default function ItemStockCard({ balance }: { balance: ItemBalance }) {
  const { item, received, withdrawn, waste, onHand, isLow } = balance;
  const fmt = (value: number) => `${trim(value)} ${item.unit}`;

  return (
    <article className={isLow ? "stock-card is-low" : "stock-card"}>
      <header className="stock-card-head">
        <div>
          <h3>{item.name}</h3>
          {item.category ? <span className="stock-chip">{item.category}</span> : null}
        </div>
        {isLow ? (
          <span className="low-badge" title="ของใกล้หมด">
            <AlertTriangle size={14} /> ใกล้หมด
          </span>
        ) : null}
      </header>

      <div className="stock-card-body">
        <DonutChart
          slices={[
            { label: "คงเหลือ", value: onHand, color: COLOR_ONHAND },
            { label: "เบิกใช้", value: withdrawn, color: COLOR_WITHDRAWN },
            { label: "ของเสีย", value: waste, color: COLOR_WASTE },
          ]}
          centerLabel={trim(onHand)}
          centerSub={`เหลือ (${item.unit})`}
        />
        <ul className="stock-legend">
          <li><span className="dot" style={{ background: COLOR_ONHAND }} /> คงเหลือ <strong>{fmt(onHand)}</strong></li>
          <li><span className="dot" style={{ background: COLOR_WITHDRAWN }} /> เบิกใช้ <strong>{fmt(withdrawn)}</strong></li>
          <li><span className="dot" style={{ background: COLOR_WASTE }} /> ของเสีย <strong>{fmt(waste)}</strong></li>
          <li className="muted-copy">รับเข้าทั้งหมด {fmt(received)}</li>
        </ul>
      </div>
    </article>
  );
}

function trim(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/\.?0+$/, "");
}
```

- [ ] **Step 2: Implement `src/components/stock/StockDashboard.tsx`**

```tsx
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowDownCircle,
  ArrowUpCircle,
  CalendarDays,
  Loader2,
  PackageSearch,
  RefreshCw,
  Trash2,
} from "lucide-react";
import type { ItemBalance, StockItem, StockMovement } from "../../types";
import { listItems, listMovements } from "../../lib/stock";
import { computeDailyStats, computeItemBalances, findLowStockItems } from "../../lib/stock.calc";
import { formatDateInput, formatDateTime, formatThaiDate } from "../../lib/time";
import ItemStockCard from "./ItemStockCard";

type LoadState = "loading" | "idle" | "error";

export default function StockDashboard() {
  const [selectedDate, setSelectedDate] = useState(() => formatDateInput(new Date()));
  const [items, setItems] = useState<StockItem[]>([]);
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    setLoadState("loading");
    try {
      const [nextItems, nextMoves] = await Promise.all([listItems(), listMovements()]);
      setItems(nextItems);
      setMovements(nextMoves);
      setLoadState("idle");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "โหลดข้อมูลไม่สำเร็จ");
      setLoadState("error");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const balances = useMemo(() => computeItemBalances(items, movements), [items, movements]);
  const daily = useMemo(() => computeDailyStats(movements, selectedDate), [movements, selectedDate]);
  const lowItems = useMemo(() => findLowStockItems(balances), [balances]);
  const grouped = useMemo(() => groupByCategory(balances), [balances]);

  return (
    <section className="admin-layout" aria-labelledby="stock-heading">
      <div className="admin-heading-row">
        <div>
          <div className="eyebrow-row"><span className="status-dot" />สต๊อกสินค้า</div>
          <h1 id="stock-heading">คลังสินค้าร้านชาบู</h1>
          <p className="muted-copy">{formatThaiDate(selectedDate)}</p>
        </div>
        <div className="admin-actions">
          <label className="date-control">
            <CalendarDays size={17} />
            <input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} aria-label="เลือกวันที่" />
          </label>
          <button className="icon-text-button" type="button" onClick={() => void load()} disabled={loadState === "loading"}>
            {loadState === "loading" ? <Loader2 className="spin" size={17} /> : <RefreshCw size={17} />}
            รีเฟรช
          </button>
        </div>
      </div>

      <div className="stat-grid" aria-label="สรุปการเคลื่อนไหววันนี้">
        <StockStat icon={<ArrowUpCircle size={20} />} label="รับเข้าวันนี้" value={num(daily.received)} />
        <StockStat icon={<ArrowDownCircle size={20} />} label="เบิกออกวันนี้" value={num(daily.withdrawn)} />
        <StockStat icon={<Trash2 size={20} />} label="ของเสียวันนี้" value={num(daily.waste)} />
        <StockStat icon={<PackageSearch size={20} />} label="รายการสินค้า" value={`${items.length} อย่าง`} />
      </div>

      {lowItems.length ? (
        <div className="low-alert" role="status">
          <AlertTriangle size={18} />
          <span>ของใกล้หมด {lowItems.length} รายการ: {lowItems.map((b) => b.item.name).join(", ")}</span>
        </div>
      ) : null}

      {loadState === "error" ? (
        <div className="inline-error" role="alert">{error}</div>
      ) : loadState === "loading" ? (
        <TableSkeleton />
      ) : balances.length ? (
        grouped.map(([category, group]) => (
          <section key={category} className="stock-group" aria-label={category}>
            <h2 className="stock-group-title">{category}</h2>
            <div className="stock-card-grid">
              {group.map((balance) => <ItemStockCard key={balance.item.id} balance={balance} />)}
            </div>
          </section>
        ))
      ) : (
        <div className="empty-state">
          <PackageSearch size={30} />
          <h3>ยังไม่มีสินค้าในคลัง</h3>
          <p>เพิ่มสินค้าเพื่อเริ่มจัดการสต๊อก</p>
        </div>
      )}

      <RecentMovements movements={movements} items={items} />
    </section>
  );
}

function StockStat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="stat-card">
      <span aria-hidden="true">{icon}</span>
      <div><p>{label}</p><strong>{value}</strong></div>
    </div>
  );
}

function RecentMovements({ movements, items }: { movements: StockMovement[]; items: StockItem[] }) {
  const nameById = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);
  const recent = movements.slice(0, 15);
  const typeLabel: Record<StockMovement["type"], string> = { in: "รับเข้า", out: "เบิกออก", waste: "ของเสีย" };
  if (!recent.length) return null;
  return (
    <section className="activity-panel" aria-labelledby="stock-activity">
      <div className="section-heading-row">
        <div><h2 id="stock-activity">การเคลื่อนไหวล่าสุด</h2><p className="muted-copy">ใครเบิก/รับ อะไร เมื่อไหร่</p></div>
      </div>
      <ol className="activity-list">
        {recent.map((move) => {
          const item = nameById.get(move.item_id);
          return (
            <li key={move.id}>
              <span className={`event-dot ${move.type}`} />
              <div>
                <strong>{item?.name ?? "—"}</strong>
                <span>{typeLabel[move.type]} {num(move.quantity)} {item?.unit ?? ""} · {move.actor_name ?? "—"}{move.note ? ` · ${move.note}` : ""}</span>
              </div>
              <time>{formatDateTime(move.created_at)}</time>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function TableSkeleton() {
  return <div className="skeleton-table" aria-label="กำลังโหลดข้อมูล">{Array.from({ length: 4 }).map((_, i) => <span key={i} />)}</div>;
}

function groupByCategory(balances: ItemBalance[]): [string, ItemBalance[]][] {
  const groups = new Map<string, ItemBalance[]>();
  for (const balance of balances) {
    const key = balance.item.category ?? "ไม่ระบุหมวดหมู่";
    groups.set(key, [...(groups.get(key) ?? []), balance]);
  }
  return Array.from(groups.entries()).sort((a, b) => a[0].localeCompare(b[0], "th-TH"));
}

function num(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/\.?0+$/, "");
}
```

- [ ] **Step 2b: Add stock layout CSS to `src/styles.css`** (append)

```css
/* ===== Stock: module switcher + cards ===== */
.module-switcher { display: inline-flex; gap: 4px; padding: 4px; background: var(--surface); border-radius: 10px; margin: 0 0 20px; }
.module-tab { display: inline-flex; align-items: center; gap: 8px; padding: 10px 16px; min-height: 44px; border: none; border-radius: 8px; background: transparent; color: var(--muted); font: inherit; cursor: pointer; }
.module-tab.is-active { background: var(--bg); color: var(--ink); box-shadow: 0 1px 2px rgba(0,0,0,0.08); }
.stock-group { margin-top: 22px; }
.stock-group-title { font-size: 1rem; color: var(--muted); margin: 0 0 12px; }
.stock-card-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 16px; }
.stock-card { background: var(--bg); border: 1px solid color-mix(in oklab, var(--ink) 8%, transparent); border-radius: 10px; padding: 16px; }
.stock-card.is-low { border-color: var(--danger); }
.stock-card-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 8px; margin-bottom: 8px; }
.stock-card-head h3 { margin: 0; font-size: 1.05rem; }
.stock-chip { display: inline-block; margin-top: 4px; font-size: 0.75rem; color: var(--muted); background: var(--surface); padding: 2px 8px; border-radius: 999px; }
.low-badge { display: inline-flex; align-items: center; gap: 4px; font-size: 0.75rem; color: var(--danger); }
.stock-card-body { display: flex; gap: 16px; align-items: center; }
.stock-legend { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; font-size: 0.85rem; }
.stock-legend li { display: flex; align-items: center; gap: 8px; }
.stock-legend .dot { width: 10px; height: 10px; border-radius: 3px; flex: none; }
.stock-legend strong { margin-left: auto; }
.low-alert { display: flex; align-items: center; gap: 8px; padding: 12px 16px; border-radius: 8px; background: color-mix(in oklab, var(--danger) 12%, var(--bg)); color: var(--danger); margin-bottom: 16px; }
.event-dot.in { background: var(--primary); }
.event-dot.out { background: var(--accent); }
.event-dot.waste { background: var(--danger); }
```

- [ ] **Step 3: Refactor `AdminDashboard.tsx` to a module switcher**

In `src/components/AdminDashboard.tsx`, add imports and replace the `Dashboard` return in the authed branch with a module switcher. The existing `Dashboard` (attendance) component stays as-is; add the new module around it.

Add near the top imports:
```tsx
import { Boxes, Clock3 } from "lucide-react";
import StockDashboard from "./stock/StockDashboard";
```
Replace the final return of the `AdminDashboard` function:
```tsx
  return <AdminConsole session={session} onSignedOut={() => setSession(null)} />;
```
Add this new component (below `AdminDashboard`):
```tsx
type AdminModule = "attendance" | "stock";

function AdminConsole({ session, onSignedOut }: { session: AuthSession; onSignedOut: () => void }) {
  const [module, setModule] = useState<AdminModule>("attendance");
  return (
    <div>
      <div className="module-switcher" role="tablist" aria-label="เลือกโมดูล">
        <button
          role="tab"
          aria-selected={module === "attendance"}
          className={module === "attendance" ? "module-tab is-active" : "module-tab"}
          type="button"
          onClick={() => setModule("attendance")}
        >
          <Clock3 size={18} /> เวลาทำงาน
        </button>
        <button
          role="tab"
          aria-selected={module === "stock"}
          className={module === "stock" ? "module-tab is-active" : "module-tab"}
          type="button"
          onClick={() => setModule("stock")}
        >
          <Boxes size={18} /> สต๊อกสินค้า
        </button>
      </div>
      {module === "attendance" ? (
        <Dashboard session={session} onSignedOut={onSignedOut} />
      ) : (
        <StockDashboard />
      )}
    </div>
  );
}
```

- [ ] **Step 4: Build + lint**

Run: `npm run build && npx eslint src/components/stock src/components/AdminDashboard.tsx`
Expected: build succeeds, no lint errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/stock/StockDashboard.tsx src/components/stock/ItemStockCard.tsx src/components/AdminDashboard.tsx src/styles.css
git commit -m "feat(stock): admin stock dashboard with donuts + module switcher"
```

---

### Task 6: Admin item management + movement recording

**Files:**
- Create: `src/components/stock/ItemFormDialog.tsx`
- Create: `src/components/stock/MovementDialog.tsx`
- Modify: `src/components/stock/StockDashboard.tsx` (wire add/edit + record actions)
- Modify: `src/components/stock/ItemStockCard.tsx` (add "แก้ไข" + "บันทึกความเคลื่อนไหว" buttons via props)
- Modify: `src/styles.css` (dialog classes)

**Interfaces:**
- Consumes: `createItem`, `updateItem`, `archiveItem`, `recordMovement` (Task 3); `listItems` distinct categories for suggestions.
- Produces: `ItemFormDialog`, `MovementDialog` default exports.

- [ ] **Step 1: Implement `src/components/stock/ItemFormDialog.tsx`**

```tsx
import { FormEvent, useState } from "react";
import { Loader2, Save, X } from "lucide-react";
import type { NewStockItem, StockItem } from "../../types";
import { createItem, updateItem } from "../../lib/stock";

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
    if (payload.low_stock_threshold !== null && Number.isNaN(payload.low_stock_threshold)) {
      setError("จุดแจ้งเตือนต้องเป็นตัวเลข");
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
      </form>
    </Dialog>
  );
}

export function Dialog({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="dialog-backdrop" role="dialog" aria-modal="true" aria-label={title} onClick={onClose}>
      <div className="dialog-panel" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-head">
          <h2>{title}</h2>
          <button className="icon-button" type="button" aria-label="ปิด" onClick={onClose}><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Implement `src/components/stock/MovementDialog.tsx`**

```tsx
import { FormEvent, useState } from "react";
import { Loader2, Save } from "lucide-react";
import type { MovementType, StockItem } from "../../types";
import { recordMovement } from "../../lib/stock";
import { Dialog } from "./ItemFormDialog";

interface Props {
  item: StockItem;
  allowedTypes: MovementType[];
  onClose: () => void;
  onSaved: () => void;
}

const TYPE_LABEL: Record<MovementType, string> = { in: "รับเข้า", out: "เบิกออก", waste: "ของเสีย" };

export default function MovementDialog({ item, allowedTypes, onClose, onSaved }: Props) {
  const [type, setType] = useState<MovementType>(allowedTypes[0]);
  const [quantity, setQuantity] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const qty = Number(quantity);
    if (!Number.isFinite(qty) || qty <= 0) {
      setError("จำนวนต้องมากกว่า 0");
      return;
    }
    setError("");
    setSaving(true);
    try {
      await recordMovement({ item_id: item.id, type, quantity: qty, note });
      onSaved();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "บันทึกไม่สำเร็จ");
      setSaving(false);
    }
  }

  return (
    <Dialog title={`${item.name} — บันทึกความเคลื่อนไหว`} onClose={onClose}>
      <form className="clock-form" onSubmit={handleSubmit}>
        {allowedTypes.length > 1 ? (
          <div className="segmented-control" aria-label="ประเภท">
            {allowedTypes.map((option) => (
              <button
                key={option}
                type="button"
                className={type === option ? "segment is-selected" : "segment"}
                onClick={() => setType(option)}
              >
                {TYPE_LABEL[option]}
              </button>
            ))}
          </div>
        ) : null}
        <label className="field"><span>จำนวน ({item.unit})</span>
          <input type="number" min="0" step="any" value={quantity} onChange={(e) => setQuantity(e.target.value)} autoFocus required />
        </label>
        <label className="field"><span>โน้ต (ไม่บังคับ)</span>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="เช่น เตรียมหน้าร้าน" />
        </label>
        {error ? <p className="form-error" role="alert">{error}</p> : null}
        <button className="primary-button" type="submit" disabled={saving}>
          {saving ? <Loader2 className="spin" size={18} /> : <Save size={18} />} บันทึก{TYPE_LABEL[type]}
        </button>
      </form>
    </Dialog>
  );
}
```

- [ ] **Step 3: Add dialog CSS to `src/styles.css`** (append)

```css
/* ===== Stock: dialog ===== */
.dialog-backdrop { position: fixed; inset: 0; background: rgba(15,30,40,0.4); display: grid; place-items: center; padding: 16px; z-index: 50; }
.dialog-panel { background: var(--bg); border-radius: 12px; padding: 20px; width: min(420px, 100%); max-height: 90vh; overflow: auto; }
.dialog-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
.dialog-head h2 { margin: 0; font-size: 1.1rem; }
.stock-card-actions { display: flex; gap: 8px; margin-top: 12px; }
.stock-card-actions button { flex: 1; }
```

- [ ] **Step 4: Wire actions into `ItemStockCard.tsx`**

Add optional action props and a footer:
```tsx
// props: add onEdit?: () => void; onRecord?: () => void;
```
Extend the signature to `{ balance, onEdit, onRecord }` and before `</article>` add:
```tsx
      {(onEdit || onRecord) ? (
        <div className="stock-card-actions">
          {onRecord ? <button className="icon-text-button" type="button" onClick={onRecord}>บันทึก +/−</button> : null}
          {onEdit ? <button className="icon-text-button quiet" type="button" onClick={onEdit}>แก้ไข</button> : null}
        </div>
      ) : null}
```

- [ ] **Step 5: Wire dialogs into `StockDashboard.tsx`**

Add imports:
```tsx
import { Plus } from "lucide-react";
import ItemFormDialog from "./ItemFormDialog";
import MovementDialog from "./MovementDialog";
```
Add state inside `StockDashboard`:
```tsx
  const [editing, setEditing] = useState<StockItem | null | "new">(null);
  const [movingItem, setMovingItem] = useState<StockItem | null>(null);
  const categories = useMemo(
    () => Array.from(new Set(items.map((i) => i.category).filter((c): c is string => !!c))),
    [items],
  );
```
Add an "เพิ่มสินค้า" button in `admin-actions` (before รีเฟรช):
```tsx
          <button className="icon-text-button" type="button" onClick={() => setEditing("new")}><Plus size={17} /> เพิ่มสินค้า</button>
```
Pass actions to each card:
```tsx
              {group.map((balance) => (
                <ItemStockCard
                  key={balance.item.id}
                  balance={balance}
                  onEdit={() => setEditing(balance.item)}
                  onRecord={() => setMovingItem(balance.item)}
                />
              ))}
```
Render dialogs before the closing `</section>`:
```tsx
      {editing ? (
        <ItemFormDialog
          item={editing === "new" ? undefined : editing}
          categorySuggestions={categories}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); void load(); }}
        />
      ) : null}
      {movingItem ? (
        <MovementDialog
          item={movingItem}
          allowedTypes={["in", "out", "waste"]}
          onClose={() => setMovingItem(null)}
          onSaved={() => { setMovingItem(null); void load(); }}
        />
      ) : null}
```

- [ ] **Step 6: Build + lint**

Run: `npm run build && npx eslint src/components/stock`
Expected: build succeeds, no lint errors.

- [ ] **Step 7: Commit**

```bash
git add src/components/stock src/styles.css
git commit -m "feat(stock): admin item management + movement recording dialogs"
```

---

### Task 7: Employee `/stock` withdrawal page + route

**Files:**
- Create: `src/components/StockPage.tsx`
- Modify: `src/App.tsx` (add `/stock` route + employee cross-nav between /clock and /stock)
- Modify: `src/styles.css` (employee stock list classes)

**Interfaces:**
- Consumes: employee auth from `../lib/store` (`getEmployeeSession`, `onEmployeeAuthChange`, `signInWithGoogle`, `signOutCurrentUser`); `listItems`, `listMovements`, `recordMovement` from `../lib/stock`; `computeItemBalances` from `../lib/stock.calc`; `MovementDialog` from `./stock/MovementDialog`.
- Produces: `StockPage` default export routed at `/stock`.

- [ ] **Step 1: Implement `src/components/StockPage.tsx`**

```tsx
import { useCallback, useEffect, useMemo, useState } from "react";
import { Boxes, Loader2, LogIn, LogOut, PackageMinus } from "lucide-react";
import type { EmployeeSession, StockItem, StockMovement } from "../types";
import {
  getEmployeeSession,
  onEmployeeAuthChange,
  signInWithGoogle,
  signOutCurrentUser,
} from "../lib/store";
import { isSupabaseConfigured } from "../lib/supabase";
import { listItems, listMovements } from "../lib/stock";
import { computeItemBalances } from "../lib/stock.calc";
import { formatTime } from "../lib/time";
import MovementDialog from "./stock/MovementDialog";

export default function StockPage() {
  if (!isSupabaseConfigured) return <StockWithdrawUI demo />;
  return <GoogleGate />;
}

function GoogleGate() {
  const [session, setSession] = useState<EmployeeSession | null | undefined>(undefined);
  useEffect(() => {
    let mounted = true;
    getEmployeeSession().then((s) => mounted && setSession(s)).catch(() => mounted && setSession(null));
    const unsub = onEmployeeAuthChange(setSession);
    return () => { mounted = false; unsub(); };
  }, []);

  if (session === undefined) return <section className="clock-layout"><div className="skeleton-heading" /></section>;
  if (!session) return <SignInPanel />;
  return <StockWithdrawUI />;
}

function SignInPanel() {
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  async function signIn() {
    setError(""); setSubmitting(true);
    try { await signInWithGoogle(); } catch (c) { setError(c instanceof Error ? c.message : "เข้าสู่ระบบไม่สำเร็จ"); setSubmitting(false); }
  }
  return (
    <section className="clock-layout">
      <div className="form-panel">
        <span className="panel-icon" aria-hidden="true"><Boxes size={24} /></span>
        <h1>เข้าสู่ระบบเพื่อเบิกของ</h1>
        <p className="muted-copy">ใช้บัญชี Google เดียวกับที่ลงเวลา</p>
        {error ? <p className="form-error" role="alert">{error}</p> : null}
        <button className="primary-button" type="button" onClick={signIn} disabled={submitting}>
          {submitting ? <Loader2 className="spin" size={18} /> : <LogIn size={18} />} เข้าสู่ระบบด้วย Google
        </button>
      </div>
    </section>
  );
}

function StockWithdrawUI({ demo = false }: { demo?: boolean }) {
  const [items, setItems] = useState<StockItem[]>([]);
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [movingItem, setMovingItem] = useState<StockItem | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const [nextItems, mine] = await Promise.all([listItems(), listMovements({ mine: true })]);
      setItems(nextItems);
      setMovements(mine);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "โหลดข้อมูลไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const balances = useMemo(() => computeItemBalances(items, movements.length ? movements : []), [items, movements]);
  // on-hand for employees is informational; compute from all movements when available
  const onHandById = useMemo(() => new Map(balances.map((b) => [b.item.id, b.onHand])), [balances]);
  const todayMine = movements.filter((m) => new Date(m.created_at).toDateString() === new Date().toDateString());

  return (
    <section className="clock-layout" aria-labelledby="emp-stock-heading">
      <div className="clock-hero">
        <div className="eyebrow-row"><span className="status-dot" />{demo ? "โหมดทดลอง" : "เบิกของ"}</div>
        <h1 id="emp-stock-heading">เบิกของเข้าครัว</h1>
        <p className="lead-copy">เลือกสินค้าแล้วกดเบิก ระบบจะบันทึกชื่อและเวลาให้อัตโนมัติ</p>
        {!demo ? (
          <div className="button-row">
            <button className="field-link-button" type="button" onClick={() => signOutCurrentUser()}>
              <LogOut size={15} /> ออกจากระบบ
            </button>
          </div>
        ) : null}
      </div>

      <div className="form-panel">
        {error ? <p className="form-error" role="alert">{error}</p> : null}
        {loading ? (
          <div className="skeleton-table">{Array.from({ length: 4 }).map((_, i) => <span key={i} />)}</div>
        ) : (
          <ul className="emp-stock-list">
            {items.map((item) => (
              <li key={item.id}>
                <div>
                  <strong>{item.name}</strong>
                  <span className="muted-copy">คงเหลือ {fmt(onHandById.get(item.id) ?? 0)} {item.unit}{item.category ? ` · ${item.category}` : ""}</span>
                </div>
                <button className="icon-text-button" type="button" onClick={() => setMovingItem(item)}>
                  <PackageMinus size={17} /> เบิก
                </button>
              </li>
            ))}
            {!items.length ? <li className="muted-copy">ยังไม่มีสินค้าให้เบิก</li> : null}
          </ul>
        )}

        {todayMine.length ? (
          <div className="emp-today">
            <h2>ที่ฉันเบิกวันนี้</h2>
            <ul>
              {todayMine.map((m) => {
                const item = items.find((i) => i.id === m.item_id);
                return <li key={m.id}>{item?.name ?? "—"} {fmt(m.quantity)} {item?.unit ?? ""} · {formatTime(m.created_at)} น.</li>;
              })}
            </ul>
          </div>
        ) : null}
      </div>

      {movingItem ? (
        <MovementDialog
          item={movingItem}
          allowedTypes={["out", "waste"]}
          onClose={() => setMovingItem(null)}
          onSaved={() => { setMovingItem(null); void load(); }}
        />
      ) : null}
    </section>
  );
}

function fmt(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/\.?0+$/, "");
}
```

Note: employees can only read their own movements (RLS), so on-hand shown here reflects the shop total only in demo mode; with Supabase it is a best-effort figure from the employee's visible rows. This is acceptable for v1 (the authoritative on-hand lives on the admin dashboard). Label it "คงเหลือ" as guidance, not a guarantee.

- [ ] **Step 2: Add `/stock` route + employee nav to `src/App.tsx`**

Change `Route` type and routing:
```tsx
type Route = "admin" | "clock" | "stock";

function getRouteFromPath(): Route {
  const path = window.location.pathname;
  if (path.startsWith("/clock")) return "clock";
  if (path.startsWith("/stock")) return "stock";
  return "admin";
}
```
Add import: `import StockPage from "./components/StockPage";`
In the topbar, for employee routes show a cross-nav (replace the `!isClockRoute` nav block condition). Add an `isEmployeeRoute = route === "clock" || route === "stock"` and render links:
```tsx
        {isEmployeeRoute ? (
          <nav className="route-tabs" aria-label="เมนูพนักงาน">
            <button className={route === "clock" ? "route-tab is-active" : "route-tab"} type="button" onClick={() => navigate("/clock")}>ลงเวลา</button>
            <button className={route === "stock" ? "route-tab is-active" : "route-tab"} type="button" onClick={() => navigate("/stock")}>เบิกของ</button>
          </nav>
        ) : null}
```
Render the page:
```tsx
        {route === "clock" ? <ClockPage /> : route === "stock" ? <StockPage /> : <AdminDashboard />}
```
Keep the existing `isClockRoute` brand logic but base the non-clickable brand on `isEmployeeRoute` so `/stock` also shows the static brand.

- [ ] **Step 3: Add employee stock CSS to `src/styles.css`** (append)

```css
/* ===== Stock: employee list ===== */
.emp-stock-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 10px; }
.emp-stock-list li { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 12px; border: 1px solid color-mix(in oklab, var(--ink) 8%, transparent); border-radius: 8px; }
.emp-stock-list li > div { display: grid; }
.emp-today { margin-top: 20px; }
.emp-today h2 { font-size: 1rem; margin: 0 0 8px; }
.emp-today ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; font-size: 0.9rem; color: var(--muted); }
```

- [ ] **Step 4: Build + lint**

Run: `npm run build && npx eslint src/components/StockPage.tsx src/App.tsx`
Expected: build succeeds, no lint errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/StockPage.tsx src/App.tsx src/styles.css
git commit -m "feat(stock): employee /stock withdrawal page + route nav"
```

---

### Task 8: Docs + full verification

**Files:**
- Modify: `README.md` (stock module section + migration note)

- [ ] **Step 1: Add a stock section to `README.md`**

Document: what the module does; that admins manage items + record stock-in on `/` (module "สต๊อกสินค้า"); employees withdraw on `/stock` with the same Google login; the migration note that `supabase/schema.sql` must be re-run (adds `stock_items`, `stock_movements`, `is_admin()` — safe to re-run). Add `/stock` to the allowed Google redirect URLs list alongside `/clock`.

```markdown
## โมดูลจัดการสต๊อก (Stock)

ระบบสต๊อกแบบ ledger สำหรับร้านชาบู:

- **แอดมิน** (`/` → แท็บ "สต๊อกสินค้า"): เพิ่ม/แก้สินค้า (ชื่อ หน่วย หมวดหมู่ จุดแจ้งเตือน), บันทึกรับเข้า/เบิก/ของเสีย, ดูแดชบอร์ดรายวัน + กราฟโดนัท (เบิกใช้/ของเสีย/คงเหลือ) และของใกล้หมด
- **พนักงาน** (`/stock`): ล็อกอิน Google เดิม แล้วกดเบิกของ/แจ้งของเสียได้เอง เห็น "ที่ฉันเบิกวันนี้"
- คงเหลือคำนวณจากบัญชีเคลื่อนไหวเสมอ: `รับเข้า = เบิกใช้ + ของเสีย + คงเหลือ`

ก่อน deploy build นี้ ให้รัน [supabase/schema.sql](supabase/schema.sql) ล่าสุดซ้ำใน Supabase SQL Editor (เพิ่มตาราง `stock_items`, `stock_movements` และฟังก์ชัน `is_admin()` — รันซ้ำได้ปลอดภัย) และเพิ่ม `/stock` ในรายการ redirect URL ที่อนุญาตของ Google เช่นเดียวกับ `/clock`.
```

- [ ] **Step 2: Run the full test suite**

Run: `npm run test`
Expected: all tests pass (including `stock.calc.test.ts`).

- [ ] **Step 3: Lint + build the whole project**

Run: `npm run lint && npm run build`
Expected: no lint errors; build succeeds.

- [ ] **Step 4: Manual demo-mode smoke test (no Supabase)**

Run: `npm run dev`, then verify:
- `/` → "สต๊อกสินค้า" tab shows 5 demo items grouped by category, each with a donut; low-stock alert if any; "เพิ่มสินค้า" and per-card "บันทึก +/−" / "แก้ไข" work and refresh figures.
- `/stock` → demo withdraw UI lists items; "เบิก" records and updates "ที่ฉันเบิกวันนี้".
- `/clock` still works unchanged.

- [ ] **Step 5: Commit**

```bash
git add README.md
git commit -m "docs(stock): document stock module and migration"
```

---

## Self-Review

**Spec coverage:**
- Ledger model (in/out/waste, on-hand = Σin−Σout−Σwaste) → Tasks 1, 2. ✓
- Flexible units + categories (free text) → Task 1 schema, Task 6 form. ✓
- Who withdrew (actor_name + user_id) → Task 1 schema, Task 3 `recordMovement`. ✓
- Low-stock alerts → Task 2 `findLowStockItems`, Task 5 banner + badge. ✓
- Waste tracking → movement type `waste` across Tasks 1–7. ✓
- Daily dashboard + donut (used vs remaining) → Tasks 2 (`computeDailyStats`, `buildDonutArcs`), 4, 5. ✓
- Employee Google withdrawal on `/stock` → Task 7. ✓
- Admin module switcher (attendance ↔ stock) → Task 5. ✓
- Dual-mode (Supabase + demo) → Task 3. ✓
- RLS (employees out/waste only, admin all; read own/admin-all) → Task 1. ✓
- No new deps / SVG donut → Task 4. ✓
- README + migration note → Task 8. ✓

**Placeholder scan:** No TBD/TODO; each code step shows full code. UI wiring steps (5,6,7) show exact snippets + insertion points.

**Type consistency:** `MovementType`, `StockItem`, `NewStockItem`, `StockItemPatch`, `StockMovement`, `NewMovement`, `ItemBalance`, `DailyStockStats` defined in Task 1 and used verbatim after. Data functions (`listItems`, `createItem`, `updateItem`, `archiveItem`, `listMovements`, `recordMovement`, `getStockActorName`) named consistently in Tasks 3, 5, 6, 7. `buildDonutArcs`/`DonutSlice` consistent in Tasks 2 and 4.
