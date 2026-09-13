# Stock Management Module — Design

## Goal

Turn EzyTime from a QR attendance tool into a small-shop management app for a
shabu restaurant, starting with a **stock (inventory) module** alongside the
existing **attendance module**. Admins define stock items flexibly (e.g.
"เนื้อสันคอ", unit "กก."), stock is tracked as a running ledger (received in,
withdrawn out, waste), and a daily dashboard shows how much was used vs. how
much remains with an easy-to-read donut chart per item.

Employees log in with the same Google account they already use for `/clock`
and withdraw stock themselves (no QR needed) on a new `/stock` page.

## Non-goals (v1)

- No money/cost/valuation (unit price, stock value) — deferred, "เอาเท่านี้ก่อน".
- No purchase orders, suppliers, or barcode scanning.
- No approval workflow for withdrawals — movements are recorded immediately.
- No admin-managed employee directory — any Google-signed-in user is an
  employee, same self-serve model as attendance.
- No separate categories table — category is a free-text field with
  suggestions (see Data model).

## Core model — Ledger

Stock is a **running balance derived from an append-only movement ledger**, not
a mutable quantity column. This is the single source of truth and cannot drift.

Each movement has a `type` with a fixed sign:

| type    | meaning       | sign on on-hand |
|---------|---------------|-----------------|
| `in`    | รับของเข้า     | `+quantity`     |
| `out`   | เบิกออก        | `-quantity`     |
| `waste` | ของเสีย/ทิ้ง    | `-quantity`     |

`quantity` is always a positive number; the sign is implied by `type`.
Corrections are made by recording a compensating `in`/`waste` movement or by an
admin editing/deleting a movement — there is no separate `adjust` type in v1.

### The donut math (conservation identity)

For any item, over all movements:

```
received (Σ in) = withdrawn (Σ out) + waste (Σ waste) + on_hand
```

So `on_hand = Σin − Σout − Σwaste`, and the three consumption slices
(**withdrawn / waste / on_hand**) always sum to exactly `received` = 100% of
the donut. This makes the "used vs. remaining" donut mathematically exact and
never over/underfills, even across restocks. Reading: "รับมา X → เบิกใช้ A,
เสีย B, เหลือ C."

The donut is per item and cumulative (all-time). The daily dashboard's
**stat cards** (received/withdrawn/waste today) are filtered to the selected
date; **on-hand and the donut are cumulative** state as of now.

## Data model

Two new tables. Both live in `supabase/schema.sql`, appended idempotently so
the script stays safe to re-run (matching the existing convention).

### `stock_items` (master data)

```sql
create table if not exists public.stock_items (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 1 and 100),
  unit text not null check (char_length(trim(unit)) between 1 and 20),
  category text,                       -- nullable free text, e.g. "เนื้อ"
  low_stock_threshold numeric check (low_stock_threshold >= 0),  -- nullable
  is_active boolean not null default true,   -- soft archive, never hard-delete
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

- No `current_quantity` column — on-hand is always computed from movements.
- `category` is free text; the UI suggests existing distinct categories plus
  free entry. Deliberately no categories table (YAGNI for a small shop).
- `is_active=false` archives an item (hidden from withdrawal + dashboards)
  while preserving its history.

### `stock_movements` (ledger)

```sql
create table if not exists public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.stock_items(id) on delete cascade,
  type text not null check (type in ('in', 'out', 'waste')),
  quantity numeric not null check (quantity > 0),
  note text check (char_length(note) <= 300),
  user_id uuid references auth.users(id),
  actor_name text,          -- denormalized display name (nickname snapshot)
  created_at timestamptz not null default now()
);

create index if not exists stock_movements_item_idx
  on public.stock_movements (item_id);
create index if not exists stock_movements_created_at_idx
  on public.stock_movements (created_at);
```

`actor_name` is denormalized (same pattern as `time_logs.employee_name`) so the
admin sees "ใครเบิก" without joining `auth.users`.

### RLS

Follows the existing `admin_users`-membership pattern.

`stock_items`:
- **select**: any `authenticated` user (employees must see items to withdraw).
- **insert / update / delete**: admin only (member of `admin_users`).

`stock_movements`:
- **insert**: `authenticated`, with `user_id = auth.uid()`, AND
  `type in ('out','waste')` unless the user is an admin — i.e. employees can
  withdraw and report waste, only admins can record `in` (รับเข้า).
- **select**: admin sees all; an employee sees only their own rows
  (`user_id = auth.uid()`) — powers "ที่ฉันเบิกวันนี้".
- **update / delete**: admin only (corrections).

A small SQL helper keeps policies readable:

```sql
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admin_users where user_id = auth.uid());
$$;
```

## App structure (Approach A — modular console)

- `App.tsx`: add a `/stock` route. Routes become `/` (admin), `/clock`
  (employee attendance), `/stock` (employee withdrawal). Employee pages get a
  small nav linking `/clock` ↔ `/stock`.
- `AdminDashboard.tsx`: after the existing login/`admin_users` gate, render a
  **module switcher** (segmented control): "เวลาทำงาน" and "สต๊อกสินค้า".
  The current attendance dashboard becomes the "เวลาทำงาน" module unchanged;
  "สต๊อกสินค้า" renders the new `StockDashboard`. The login gate and Supabase
  session logic are untouched.

## Components (`src/components/stock/`)

Small, single-purpose files:

- `DonutChart.tsx` — dependency-free SVG donut. Renders slices from
  `{label, value, color}[]` via stroked circle arcs (`stroke-dasharray`).
  `role="img"` + `aria-label` summary; respects `prefers-reduced-motion`.
  No new npm dependency (no recharts) — fits the minimal-deps/Cloudflare ethos.
- `ItemStockCard.tsx` — one item: name, category, unit, on-hand figure,
  low-stock badge, and its donut (withdrawn / waste / on-hand).
- `ItemFormDialog.tsx` — create/edit an item (name, unit, category with
  suggestions, low-stock threshold, active toggle). Admin only.
- `MovementDialog.tsx` — record a movement for an item (admin: in/out/waste;
  employee page reuses the record path for out/waste).
- `LowStockAlerts.tsx` — banner/list of items at/under threshold.
- `MovementHistory.tsx` — recent movements (who, what, when) for the date.
- `StockDashboard.tsx` — admin orchestration: date picker (reused pattern),
  daily stat cards, low-stock alerts, item cards grouped by category, history,
  and the add/edit + record-stock-in actions.
- `StockPage.tsx` — employee page at `/stock`. Reuses the existing employee
  Google-auth flow (`getEmployeeSession` / `onEmployeeAuthChange` /
  `signInWithGoogle` / nickname). Lists active items with on-hand; "เบิก" and
  "แจ้งของเสีย" actions open the quantity form; shows "ที่ฉันเบิกวันนี้".

## Data layer — `src/lib/stock.ts`

New module, separate from `store.ts` (which stays attendance-focused). Mirrors
the existing dual-mode pattern: `if (supabase) { … } else { localStorage }`.

Functions:
- `listItems({ includeArchived? })`
- `createItem(input)` / `updateItem(id, patch)` / `archiveItem(id)`
- `listMovements({ from?, to?, itemId?, mine? })`
- `recordMovement({ itemId, type, quantity, note })` — attaches current
  `user_id` + `actor_name` (admin email or employee nickname).

Pure helpers (unit-tested, no I/O), in `stock.ts` or `stock.calc.ts`:
- `computeItemBalances(items, movements): ItemBalance[]`
  (`received, withdrawn, waste, onHand` per item — the conservation identity).
- `computeDailyStats(movements, date)` — received/withdrawn/waste for a day.
- `findLowStockItems(balances)` — on-hand ≤ threshold (threshold set & > null).

Types added to `src/types.ts`: `StockItem`, `NewStockItem`, `StockMovement`,
`MovementType`, `ItemBalance`, `DailyStockStats`.

### Balance computation strategy

Balances are aggregated **client-side** from fetched movements (same approach
as attendance's `buildDailySummary`), not via a DB view/RPC. Simpler, keeps the
localStorage demo mode symmetric, and is fine for a small shop's data volume.
Trade-off noted: if movement volume ever grows large, revisit with a cached
balance column or an aggregate view. Not a v1 concern.

## Demo / local mode

When Supabase isn't configured, `stock.ts` seeds demo items (เนื้อสันคอ,
หมูสไลด์, ผักกาดขาว, เต้าหู้ไข่, น้ำจิ้มสุกี้ …) with categories and a handful of
`in`/`out`/`waste` movements in `localStorage`, so the whole module is
explorable with zero setup — consistent with the existing demo attendance logs.
Employee Google withdrawal specifically requires a real Supabase project (OAuth
can't run in demo mode), same caveat as `/clock`.

## Styling

Extend `src/styles.css` with stock classes (donut, item card, badges,
segmented module switcher, dialog) reusing existing OKLCH tokens, 8px radii,
44px targets, and the light product surface from `DESIGN.md`. Donut slice
colors map to existing semantic tokens: on-hand→primary, withdrawn→accent,
waste→danger.

## Testing / verification plan

Automatable (vitest, no external services):
- `computeItemBalances` upholds the conservation identity across mixed
  in/out/waste sequences; on-hand never implied-negative for valid data.
- `computeDailyStats` buckets movements to the correct local day (reuse the
  existing `getLocalDayRange` logic).
- `findLowStockItems` flags only items with a set threshold and on-hand ≤ it.
- Build (`npm run build`) and lint pass; demo mode renders the stock dashboard
  and an employee can "withdraw" against seeded localStorage data.

Requires the project owner (real Supabase + Google, after running the migration):
- Employee signs in with Google on `/stock`, withdraws an item → on-hand drops,
  admin sees the movement with the employee's name.
- Non-admin cannot record `in` (RLS rejects); admin can.
- Low-stock threshold crossing surfaces in the alert banner.

## Files touched

- `supabase/schema.sql` — add `stock_items`, `stock_movements`, `is_admin()`,
  indexes, grants, RLS policies (idempotent).
- `src/lib/supabase.types.ts` — add the two tables to the `Database` type.
- `src/types.ts` — add stock domain types.
- `src/lib/stock.ts` (+ optional `stock.calc.ts`) — new data layer + pure
  helpers.
- `src/lib/stock.calc.test.ts` — unit tests for the pure helpers.
- `src/components/stock/*` — new components listed above.
- `src/App.tsx` — add `/stock` route + employee cross-nav.
- `src/components/AdminDashboard.tsx` — module switcher wrapping the existing
  attendance dashboard + new stock dashboard.
- `src/styles.css` — stock module styles.
- `README.md` — document the stock module + updated migration note.
