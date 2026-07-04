# Employee Google Login Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the free-text employee name entry on `/clock` with Google sign-in, so returning employees are recognized automatically and time logs are tied to a real identity.

**Architecture:** Nickname lives in Supabase Auth `user_metadata` (no new table). `time_logs` gains a `user_id` column and its insert RLS policy now requires `auth.uid() = user_id`, ending anonymous submission. `ClockPage.tsx` becomes a small state machine (signed-out → needs-nickname → ready) driven by `supabase.auth` session state; demo/local mode (no Supabase env) keeps today's free-text flow untouched.

**Tech Stack:** React 19 + TypeScript + Vite, Supabase JS v2 (`@supabase/supabase-js`), Vitest (new, dev-only, for pure-logic unit tests).

## Global Constraints

- All user-facing copy is Thai, matching existing strings in the codebase — do not introduce English UI text.
- Signup is self-serve: no admin allowlist/approval step (per spec).
- Position is selected fresh on every clock-in/out — never locked to the employee's profile (per spec).
- Nickname must be editable after initial setup via a visible "แก้ไขชื่อ" control (per spec).
- Demo/local mode (`VITE_SUPABASE_URL` unset) must keep working with zero external setup — never gate it behind Google OAuth.
- No new runtime dependencies. `vitest` is a devDependency only.
- Do not run the schema migration against the live Supabase project and do not deploy to Cloudflare as part of this plan — both are explicitly gated on the project owner completing the Google Cloud/Supabase OAuth checklist (Task 6, README section) first.

---

### Task 1: Add Vitest test runner

**Files:**
- Modify: `package.json`
- Modify: `vite.config.ts`
- Create: `src/lib/time.test.ts`

**Interfaces:**
- Consumes: `formatDuration` from `src/lib/time.ts` (already exists, unchanged)
- Produces: a working `npm test` command later tasks rely on for their own test files

- [ ] **Step 1: Install vitest**

Run: `npm install -D vitest`

Expected: `package.json` gains `vitest` under `devDependencies`, `package-lock.json` updates.

- [ ] **Step 2: Add the test script**

Modify `package.json` — add a `"test"` entry to `"scripts"` (keep existing entries, insert this one):

```json
    "test": "vitest run",
```

Place it alongside the other scripts, e.g. right after `"lint": "eslint ."`.

- [ ] **Step 3: Wire vitest into the Vite config**

Replace the full contents of `vite.config.ts`:

```ts
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "node",
  },
});
```

- [ ] **Step 4: Write a smoke test against existing code**

Create `src/lib/time.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { formatDuration } from "./time";

describe("formatDuration", () => {
  it("returns a dash for undefined input", () => {
    expect(formatDuration(undefined)).toBe("-");
  });

  it("formats minutes under an hour", () => {
    expect(formatDuration(45)).toBe("45 นาที");
  });

  it("formats whole hours with no remainder", () => {
    expect(formatDuration(120)).toBe("2 ชม.");
  });

  it("formats hours with a remainder", () => {
    expect(formatDuration(125)).toBe("2 ชม. 5 นาที");
  });
});
```

- [ ] **Step 5: Run the test suite**

Run: `npm test`
Expected: `PASS`, 4 tests passing in `src/lib/time.test.ts`.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json vite.config.ts src/lib/time.test.ts
git commit -m "test: add vitest runner with a smoke test"
```

---

### Task 2: Add employee identity pure helpers

**Files:**
- Create: `src/lib/employee.ts`
- Test: `src/lib/employee.test.ts`

**Interfaces:**
- Produces: `getClockViewState(hasSession: boolean, nickname: string | null): "signed-out" | "needs-nickname" | "ready"`, `validateNickname(rawNickname: string): string | null`, `extractNickname(userMetadata: Record<string, unknown> | null | undefined): string | null` — all three are consumed by Task 4 (`store.ts` and `ClockPage.tsx`)

- [ ] **Step 1: Write the failing tests**

Create `src/lib/employee.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { extractNickname, getClockViewState, validateNickname } from "./employee";

describe("getClockViewState", () => {
  it("returns signed-out when there is no session", () => {
    expect(getClockViewState(false, null)).toBe("signed-out");
  });

  it("returns needs-nickname when signed in without a nickname", () => {
    expect(getClockViewState(true, null)).toBe("needs-nickname");
  });

  it("returns ready when signed in with a nickname", () => {
    expect(getClockViewState(true, "มะลิ")).toBe("ready");
  });
});

describe("validateNickname", () => {
  it("rejects nicknames shorter than 2 characters", () => {
    expect(validateNickname("ก")).toBe("กรุณากรอกชื่อเล่นอย่างน้อย 2 ตัวอักษร");
  });

  it("rejects nicknames longer than 100 characters", () => {
    expect(validateNickname("ก".repeat(101))).toBe("ชื่อเล่นยาวเกินไป กรุณาใช้ไม่เกิน 100 ตัวอักษร");
  });

  it("accepts a valid nickname and treats surrounding whitespace as fine", () => {
    expect(validateNickname("  มะลิ  ")).toBeNull();
  });
});

describe("extractNickname", () => {
  it("returns null when metadata is undefined", () => {
    expect(extractNickname(undefined)).toBeNull();
  });

  it("returns null when nickname is missing or not a string", () => {
    expect(extractNickname({})).toBeNull();
    expect(extractNickname({ nickname: 42 })).toBeNull();
  });

  it("returns null when nickname is too short after trimming", () => {
    expect(extractNickname({ nickname: " ก " })).toBeNull();
  });

  it("returns the trimmed nickname when valid", () => {
    expect(extractNickname({ nickname: "  มะลิ  " })).toBe("มะลิ");
  });
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `npm test`
Expected: FAIL — `Cannot find module './employee'` (file doesn't exist yet).

- [ ] **Step 3: Implement the helpers**

Create `src/lib/employee.ts`:

```ts
export type ClockViewState = "signed-out" | "needs-nickname" | "ready";

export function getClockViewState(hasSession: boolean, nickname: string | null): ClockViewState {
  if (!hasSession) return "signed-out";
  if (!nickname) return "needs-nickname";
  return "ready";
}

export function validateNickname(rawNickname: string): string | null {
  const trimmed = rawNickname.trim();
  if (trimmed.length < 2) return "กรุณากรอกชื่อเล่นอย่างน้อย 2 ตัวอักษร";
  if (trimmed.length > 100) return "ชื่อเล่นยาวเกินไป กรุณาใช้ไม่เกิน 100 ตัวอักษร";
  return null;
}

export function extractNickname(userMetadata: Record<string, unknown> | null | undefined): string | null {
  const nickname = userMetadata?.nickname;
  if (typeof nickname !== "string") return null;
  const trimmed = nickname.trim();
  return trimmed.length >= 2 ? trimmed : null;
}
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npm test`
Expected: `PASS`, all `employee.test.ts` cases plus the Task 1 smoke test green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/employee.ts src/lib/employee.test.ts
git commit -m "feat: add employee identity helpers (nickname validation, clock view state)"
```

---

### Task 3: Update Supabase schema for authenticated time logs

**Files:**
- Modify: `supabase/schema.sql`

**Interfaces:**
- Produces: `public.time_logs.user_id` column and an insert policy requiring `user_id = auth.uid()` — Task 4's `createTimeLog` call and RLS depend on this shape. This file is NOT auto-applied to the live database; the project owner re-runs it manually in the Supabase SQL editor (see Task 6 checklist).

- [ ] **Step 1: Add the `user_id` column to the table definition**

In `supabase/schema.sql`, find:

```sql
  event_type text not null check (event_type in ('clock_in', 'clock_out')),
  scanned_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
```

Replace with:

```sql
  event_type text not null check (event_type in ('clock_in', 'clock_out')),
  user_id uuid references auth.users(id),
  scanned_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

-- Projects created before Google login shipped: add the column if the
-- table already existed without it.
alter table public.time_logs
  add column if not exists user_id uuid references auth.users(id);
```

- [ ] **Step 2: Restrict the insert grant to authenticated users**

Find:

```sql
grant insert on public.time_logs to anon, authenticated;
```

Replace with:

```sql
grant insert on public.time_logs to authenticated;
```

- [ ] **Step 3: Replace the anonymous insert policy**

Find:

```sql
drop policy if exists "Anyone can submit QR time logs" on public.time_logs;
create policy "Anyone can submit QR time logs"
on public.time_logs
for insert
to anon, authenticated
with check (true);
```

Replace with:

```sql
drop policy if exists "Anyone can submit QR time logs" on public.time_logs;
drop policy if exists "Authenticated employees can submit their own time logs" on public.time_logs;
create policy "Authenticated employees can submit their own time logs"
on public.time_logs
for insert
to authenticated
with check (user_id = auth.uid());
```

- [ ] **Step 4: Commit**

```bash
git add supabase/schema.sql
git commit -m "feat: require authenticated user_id for time log inserts"
```

No automated test for this step — it's SQL applied manually to Supabase, consistent with how `schema.sql` has always been used in this project (see README's existing "Supabase Setup" steps).

---

### Task 4: Wire Google sign-in through the app

**Files:**
- Modify: `src/types.ts`
- Modify: `src/lib/store.ts`
- Modify: `src/components/ClockPage.tsx`
- Modify: `src/components/AdminDashboard.tsx`

**Interfaces:**
- Consumes: `getClockViewState`, `validateNickname`, `extractNickname` from `src/lib/employee.ts` (Task 2)
- Produces: `store.ts` exports `signInWithGoogle(): Promise<void>`, `getEmployeeSession(): Promise<EmployeeSession | null>`, `onEmployeeAuthChange(cb): () => void`, `updateEmployeeNickname(nickname: string): Promise<void>`, `signOutCurrentUser(): Promise<void>` (renamed from `signOutAdmin`); `types.ts` exports `EmployeeSession { userId: string; nickname: string | null }` and `NewTimeLog` gains `user_id?: string`

- [ ] **Step 1: Extend `types.ts`**

In `src/types.ts`, change:

```ts
export interface NewTimeLog {
  employee_name: string;
  position: Position;
  event_type: EventType;
  scanned_at: string;
}
```

to:

```ts
export interface NewTimeLog {
  employee_name: string;
  position: Position;
  event_type: EventType;
  scanned_at: string;
  user_id?: string;
}
```

Then add, after the existing `AuthSession` interface at the end of the file:

```ts

export interface EmployeeSession {
  userId: string;
  nickname: string | null;
}
```

- [ ] **Step 2: Replace `src/lib/store.ts`**

Replace the full contents of `src/lib/store.ts`:

```ts
import { POSITIONS, type AuthSession, type EmployeeSession, type NewTimeLog, type Position, type TimeLog } from "../types";
import { formatDateInput, getLocalDayRange } from "./time";
import { extractNickname } from "./employee";
import { isSupabaseConfigured, supabase } from "./supabase";

const LOCAL_STORAGE_KEY = "ezytime.logs.v1";

function todayAt(hour: number, minute: number): string {
  const date = new Date();
  date.setHours(hour, minute, 0, 0);
  return date.toISOString();
}

const demoLogs: TimeLog[] = [
  {
    id: "demo-1",
    employee_name: "มะลิ",
    position: "พนักงานเสิร์ฟ",
    event_type: "clock_in",
    scanned_at: todayAt(9, 2),
    created_at: todayAt(9, 2),
  },
  {
    id: "demo-2",
    employee_name: "มะลิ",
    position: "พนักงานเสิร์ฟ",
    event_type: "clock_out",
    scanned_at: todayAt(17, 11),
    created_at: todayAt(17, 11),
  },
  {
    id: "demo-3",
    employee_name: "บีม",
    position: "พนักงานสไลด์หมู",
    event_type: "clock_in",
    scanned_at: todayAt(10, 0),
    created_at: todayAt(10, 0),
  },
  {
    id: "demo-4",
    employee_name: "นุ่น",
    position: "พนักงานเตรียมของ",
    event_type: "clock_in",
    scanned_at: todayAt(8, 36),
    created_at: todayAt(8, 36),
  },
  {
    id: "demo-5",
    employee_name: "นุ่น",
    position: "พนักงานเตรียมของ",
    event_type: "clock_out",
    scanned_at: todayAt(16, 48),
    created_at: todayAt(16, 48),
  },
];

function readLocalLogs(): TimeLog[] {
  const raw = window.localStorage.getItem(LOCAL_STORAGE_KEY);
  if (!raw) {
    window.localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(demoLogs));
    return demoLogs;
  }

  try {
    return JSON.parse(raw) as TimeLog[];
  } catch {
    window.localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(demoLogs));
    return demoLogs;
  }
}

function writeLocalLogs(logs: TimeLog[]): void {
  window.localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(logs));
}

export async function createTimeLog(input: NewTimeLog): Promise<TimeLog> {
  const scannedAt = input.scanned_at;
  const employeeName = input.employee_name.trim();

  if (supabase) {
    const { error } = await supabase.from("time_logs").insert({
      employee_name: employeeName,
      position: input.position,
      event_type: input.event_type,
      scanned_at: scannedAt,
      user_id: input.user_id,
    });

    if (error) throw new Error(error.message);

    return {
      id: crypto.randomUUID(),
      employee_name: employeeName,
      position: input.position,
      event_type: input.event_type,
      scanned_at: scannedAt,
      created_at: new Date().toISOString(),
    };
  }

  const now = new Date().toISOString();
  const newLog: TimeLog = {
    id: crypto.randomUUID(),
    employee_name: employeeName,
    position: input.position,
    event_type: input.event_type,
    scanned_at: scannedAt,
    created_at: now,
  };
  const nextLogs = [...readLocalLogs(), newLog];
  writeLocalLogs(nextLogs);
  return newLog;
}

export async function fetchLogsByDate(dateInput: string): Promise<TimeLog[]> {
  const { start, end } = getLocalDayRange(dateInput);

  if (supabase) {
    const { data, error } = await supabase
      .from("time_logs")
      .select("*")
      .gte("scanned_at", start.toISOString())
      .lt("scanned_at", end.toISOString())
      .order("scanned_at", { ascending: true });

    if (error) throw new Error(error.message);
    return data ?? [];
  }

  return readLocalLogs()
    .filter((log) => {
      const timestamp = Date.parse(log.scanned_at);
      return timestamp >= start.getTime() && timestamp < end.getTime();
    })
    .sort((first, second) => Date.parse(first.scanned_at) - Date.parse(second.scanned_at));
}

export function getDefaultDate(): string {
  return formatDateInput(new Date());
}

export async function signInAdmin(email: string, password: string): Promise<AuthSession> {
  if (!supabase) return { email: "demo@local", isDemo: true };

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw new Error(error.message);

  return { email: data.user.email ?? email, isDemo: false };
}

export async function signOutCurrentUser(): Promise<void> {
  if (supabase) {
    const { error } = await supabase.auth.signOut();
    if (error) throw new Error(error.message);
  }
}

export async function getCurrentSession(): Promise<AuthSession | null> {
  if (!isSupabaseConfigured || !supabase) return { email: "demo@local", isDemo: true };

  const { data, error } = await supabase.auth.getSession();
  if (error) throw new Error(error.message);
  const email = data.session?.user.email;
  return data.session ? { email: email ?? undefined, isDemo: false } : null;
}

export function onAuthChange(callback: (session: AuthSession | null) => void): () => void {
  if (!supabase) return () => undefined;

  const {
    data: { subscription },
  } = supabase.auth.onAuthStateChange((_event, session) => {
    callback(session ? { email: session.user.email ?? undefined, isDemo: false } : null);
  });

  return () => subscription.unsubscribe();
}

export async function signInWithGoogle(): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${window.location.origin}/clock` },
  });
  if (error) throw new Error(error.message);
}

export async function getEmployeeSession(): Promise<EmployeeSession | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.auth.getSession();
  if (error) throw new Error(error.message);
  if (!data.session) return null;
  return {
    userId: data.session.user.id,
    nickname: extractNickname(data.session.user.user_metadata),
  };
}

export function onEmployeeAuthChange(callback: (session: EmployeeSession | null) => void): () => void {
  if (!supabase) return () => undefined;

  const {
    data: { subscription },
  } = supabase.auth.onAuthStateChange((_event, session) => {
    callback(
      session ? { userId: session.user.id, nickname: extractNickname(session.user.user_metadata) } : null,
    );
  });

  return () => subscription.unsubscribe();
}

export async function updateEmployeeNickname(nickname: string): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.auth.updateUser({ data: { nickname: nickname.trim() } });
  if (error) throw new Error(error.message);
}

export function exportLogsCsv(rows: TimeLog[]): void {
  const headers = ["ชื่อ", "ตำแหน่ง", "ประเภท", "เวลา"];
  const csvRows = rows.map((log) =>
    [log.employee_name, log.position, log.event_type === "clock_in" ? "เข้างาน" : "ออกงาน", log.scanned_at]
      .map((value) => `"${value.replaceAll('"', '""')}"`)
      .join(","),
  );
  const blob = new Blob([[headers.join(","), ...csvRows].join("\n")], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `ezytime-${formatDateInput(new Date())}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}
```

Note what's gone: `SavedEmployeeProfile`, `getSavedEmployeeProfiles`, `rememberEmployeeProfile`, `normalizeEmployeeName`, `isPosition`, and the `EMPLOYEE_PROFILES_KEY` constant — all retired per the spec, fully superseded by real Google accounts.

- [ ] **Step 3: Replace `src/components/ClockPage.tsx`**

Replace the full contents of `src/components/ClockPage.tsx`:

```tsx
import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  BadgeCheck,
  BriefcaseBusiness,
  CheckCircle2,
  Clock3,
  Loader2,
  LogIn,
  LogOut,
  RefreshCw,
  UserRound,
} from "lucide-react";
import { POSITIONS, type EmployeeSession, type EventType, type Position, type TimeLog } from "../types";
import {
  createTimeLog,
  getEmployeeSession,
  onEmployeeAuthChange,
  signInWithGoogle,
  signOutCurrentUser,
  updateEmployeeNickname,
} from "../lib/store";
import { isSupabaseConfigured } from "../lib/supabase";
import { getClockViewState, validateNickname } from "../lib/employee";
import { formatDateTime, formatTime, getEventLabel } from "../lib/time";

const defaultPosition: Position = POSITIONS[0];

export default function ClockPage() {
  if (!isSupabaseConfigured) {
    return <DemoClockForm />;
  }
  return <GoogleClockFlow />;
}

function GoogleClockFlow() {
  const [session, setSession] = useState<EmployeeSession | null | undefined>(undefined);
  const [isEditingNickname, setIsEditingNickname] = useState(false);

  useEffect(() => {
    let isMounted = true;

    getEmployeeSession()
      .then((nextSession) => {
        if (isMounted) setSession(nextSession);
      })
      .catch(() => {
        if (isMounted) setSession(null);
      });

    const unsubscribe = onEmployeeAuthChange(setSession);
    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, []);

  if (session === undefined) return <ClockSkeleton />;
  if (!session) return <GoogleSignInPanel />;

  const viewState = getClockViewState(true, session.nickname);
  if (viewState === "needs-nickname" || isEditingNickname) {
    return (
      <NicknameForm
        initialValue={session.nickname ?? ""}
        onSaved={(nickname) => {
          setSession({ ...session, nickname });
          setIsEditingNickname(false);
        }}
      />
    );
  }

  return <EmployeeClockForm session={session} onRequestEditNickname={() => setIsEditingNickname(true)} />;
}

function GoogleSignInPanel() {
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSignIn() {
    setError("");
    setIsSubmitting(true);
    try {
      await signInWithGoogle();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "เข้าสู่ระบบไม่สำเร็จ");
      setIsSubmitting(false);
    }
  }

  return (
    <section className="clock-layout" aria-labelledby="clock-signin-heading">
      <div className="form-panel">
        <span className="panel-icon" aria-hidden="true">
          <UserRound size={24} />
        </span>
        <h1 id="clock-signin-heading">เข้าสู่ระบบเพื่อบันทึกเวลา</h1>
        <p className="muted-copy">ใช้บัญชี Google ของคุณ ระบบจะจำชื่อให้ครั้งต่อไป</p>

        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}

        <button className="primary-button" type="button" onClick={handleSignIn} disabled={isSubmitting}>
          {isSubmitting ? <Loader2 className="spin" size={18} /> : <LogIn size={18} />}
          เข้าสู่ระบบด้วย Google
        </button>
      </div>
    </section>
  );
}

function NicknameForm({
  initialValue,
  onSaved,
}: {
  initialValue: string;
  onSaved: (nickname: string) => void;
}) {
  const [nickname, setNickname] = useState(initialValue);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const validationError = validateNickname(nickname);
    if (validationError) {
      setError(validationError);
      return;
    }

    setError("");
    setIsSubmitting(true);
    try {
      await updateEmployeeNickname(nickname);
      onSaved(nickname.trim());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "บันทึกชื่อเล่นไม่สำเร็จ");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="clock-layout" aria-labelledby="nickname-heading">
      <div className="form-panel">
        <span className="panel-icon" aria-hidden="true">
          <BadgeCheck size={24} />
        </span>
        <h1 id="nickname-heading">ตั้งชื่อเล่นของคุณ</h1>
        <p className="muted-copy">ใช้ชื่อนี้ทุกครั้งที่บันทึกเวลา ไม่ต้องพิมพ์ใหม่</p>

        <form className="clock-form" onSubmit={handleSubmit}>
          <label className="field">
            <span>
              <UserRound size={16} />
              ชื่อเล่น
            </span>
            <input
              autoComplete="nickname"
              inputMode="text"
              placeholder="เช่น มะลิ"
              value={nickname}
              onChange={(event) => setNickname(event.target.value)}
            />
          </label>

          {error ? (
            <p className="form-error" role="alert">
              {error}
            </p>
          ) : null}

          <button className="primary-button" type="submit" disabled={isSubmitting}>
            {isSubmitting ? <Loader2 className="spin" size={18} /> : <BadgeCheck size={18} />}
            บันทึกชื่อเล่น
          </button>
        </form>
      </div>
    </section>
  );
}

function EmployeeClockForm({
  session,
  onRequestEditNickname,
}: {
  session: EmployeeSession;
  onRequestEditNickname: () => void;
}) {
  const [eventType, setEventType] = useState<EventType>("clock_in");
  const [position, setPosition] = useState<Position>(defaultPosition);
  const [scanTime, setScanTime] = useState(() => new Date());
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [savedLog, setSavedLog] = useState<TimeLog | null>(null);

  const nickname = session.nickname ?? "";

  const eventCopy = useMemo(
    () =>
      eventType === "clock_in"
        ? { title: "บันทึกเข้างาน", icon: <LogIn size={18} /> }
        : { title: "บันทึกออกงาน", icon: <LogOut size={18} /> },
    [eventType],
  );

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setIsSaving(true);
    try {
      const log = await createTimeLog({
        employee_name: nickname,
        position,
        event_type: eventType,
        scanned_at: scanTime.toISOString(),
        user_id: session.userId,
      });
      setSavedLog(log);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "บันทึกไม่สำเร็จ กรุณาลองอีกครั้ง");
    } finally {
      setIsSaving(false);
    }
  }

  function resetForNextEvent() {
    setSavedLog(null);
    setError("");
    setScanTime(new Date());
  }

  function updateEventType(nextEventType: EventType) {
    setEventType(nextEventType);
    setPosition(defaultPosition);
    setError("");
  }

  async function handleSignOut() {
    await signOutCurrentUser();
  }

  return (
    <section className="clock-layout" aria-labelledby="clock-heading">
      <div className="clock-hero">
        <div className="eyebrow-row">
          <span className="status-dot" />
          สวัสดี {nickname}
        </div>
        <h1 id="clock-heading">{eventCopy.title}</h1>
        <p className="lead-copy">ขอให้กะนี้ราบรื่น บันทึกเสร็จแล้วกลับไปทำงานต่อได้เลย</p>

        <div className="scan-ticket" aria-label="เวลาที่ระบบบันทึกจาก QR">
          <Clock3 size={22} />
          <div>
            <span className="ticket-label">เวลา scan</span>
            <strong>{formatDateTime(scanTime.toISOString())} น.</strong>
          </div>
          <button className="icon-text-button quiet" type="button" onClick={() => setScanTime(new Date())}>
            <RefreshCw size={17} />
            รีเฟรช
          </button>
        </div>

        <div className="button-row">
          <button className="field-link-button" type="button" onClick={onRequestEditNickname}>
            แก้ไขชื่อ
          </button>
          <button className="field-link-button" type="button" onClick={handleSignOut}>
            ออกจากระบบ
          </button>
        </div>
      </div>

      <div className="form-panel">
        {savedLog ? (
          <div className="success-state" role="status" aria-live="polite">
            <CheckCircle2 size={42} />
            <h2>บันทึกแล้ว</h2>
            <p>
              {savedLog.employee_name} {getEventLabel(savedLog.event_type)} เวลา {formatTime(savedLog.scanned_at)} น.
            </p>
            <button className="primary-button" type="button" onClick={resetForNextEvent}>
              <BadgeCheck size={18} />
              บันทึกอีกครั้ง
            </button>
          </div>
        ) : (
          <form className="clock-form" onSubmit={handleSubmit}>
            <div className="segmented-control" aria-label="เลือกประเภทเวลา">
              <button
                className={eventType === "clock_in" ? "segment is-selected" : "segment"}
                type="button"
                onClick={() => updateEventType("clock_in")}
              >
                <LogIn size={17} />
                เข้างาน
              </button>
              <button
                className={eventType === "clock_out" ? "segment is-selected" : "segment"}
                type="button"
                onClick={() => updateEventType("clock_out")}
              >
                <LogOut size={17} />
                ออกงาน
              </button>
            </div>

            <label className="field">
              <span>
                <BriefcaseBusiness size={16} />
                ตำแหน่ง
              </span>
              <select value={position} onChange={(event) => setPosition(event.target.value as Position)}>
                {POSITIONS.map((positionOption) => (
                  <option key={positionOption} value={positionOption}>
                    {positionOption}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <span>
                <Clock3 size={16} />
                เวลา
              </span>
              <input value={`${formatDateTime(scanTime.toISOString())} น.`} readOnly />
            </label>

            {error ? (
              <p className="form-error" role="alert">
                {error}
              </p>
            ) : null}

            <button className="primary-button" type="submit" disabled={isSaving}>
              {isSaving ? <Loader2 className="spin" size={18} /> : eventCopy.icon}
              {isSaving ? "กำลังบันทึก" : "บันทึกเวลา"}
            </button>
          </form>
        )}
      </div>
    </section>
  );
}

function ClockSkeleton() {
  return (
    <section className="clock-layout" aria-label="กำลังโหลด">
      <div className="skeleton-heading" />
    </section>
  );
}

function DemoClockForm() {
  const [eventType, setEventType] = useState<EventType>("clock_in");
  const [employeeName, setEmployeeName] = useState("");
  const [position, setPosition] = useState<Position>(defaultPosition);
  const [scanTime, setScanTime] = useState(() => new Date());
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [savedLog, setSavedLog] = useState<TimeLog | null>(null);

  const eventCopy = useMemo(
    () =>
      eventType === "clock_in"
        ? { title: "บันทึกเข้างาน", icon: <LogIn size={18} /> }
        : { title: "บันทึกออกงาน", icon: <LogOut size={18} /> },
    [eventType],
  );

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (employeeName.trim().length < 2) {
      setError("กรุณากรอกชื่ออย่างน้อย 2 ตัวอักษร");
      return;
    }

    setIsSaving(true);
    try {
      const log = await createTimeLog({
        employee_name: employeeName,
        position,
        event_type: eventType,
        scanned_at: scanTime.toISOString(),
      });
      setSavedLog(log);
      setEmployeeName("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "บันทึกไม่สำเร็จ กรุณาลองอีกครั้ง");
    } finally {
      setIsSaving(false);
    }
  }

  function resetForNextPerson() {
    setSavedLog(null);
    setError("");
    setScanTime(new Date());
  }

  function updateEventType(nextEventType: EventType) {
    setEventType(nextEventType);
    setEmployeeName("");
    setPosition(defaultPosition);
    setError("");
  }

  return (
    <section className="clock-layout" aria-labelledby="clock-heading">
      <div className="clock-hero">
        <div className="eyebrow-row">
          <span className="status-dot" />
          เวลาจาก QR (โหมดทดลอง)
        </div>
        <h1 id="clock-heading">{eventCopy.title}</h1>
        <p className="lead-copy">ขอให้กะนี้ราบรื่น บันทึกเสร็จแล้วกลับไปทำงานต่อได้เลย</p>

        <div className="scan-ticket" aria-label="เวลาที่ระบบบันทึกจาก QR">
          <Clock3 size={22} />
          <div>
            <span className="ticket-label">เวลา scan</span>
            <strong>{formatDateTime(scanTime.toISOString())} น.</strong>
          </div>
          <button className="icon-text-button quiet" type="button" onClick={() => setScanTime(new Date())}>
            <RefreshCw size={17} />
            รีเฟรช
          </button>
        </div>
      </div>

      <div className="form-panel">
        {savedLog ? (
          <div className="success-state" role="status" aria-live="polite">
            <CheckCircle2 size={42} />
            <h2>บันทึกแล้ว</h2>
            <p>
              {savedLog.employee_name} {getEventLabel(savedLog.event_type)} เวลา {formatTime(savedLog.scanned_at)} น.
            </p>
            <button className="primary-button" type="button" onClick={resetForNextPerson}>
              <BadgeCheck size={18} />
              บันทึกคนถัดไป
            </button>
          </div>
        ) : (
          <form className="clock-form" onSubmit={handleSubmit}>
            <div className="segmented-control" aria-label="เลือกประเภทเวลา">
              <button
                className={eventType === "clock_in" ? "segment is-selected" : "segment"}
                type="button"
                onClick={() => updateEventType("clock_in")}
              >
                <LogIn size={17} />
                เข้างาน
              </button>
              <button
                className={eventType === "clock_out" ? "segment is-selected" : "segment"}
                type="button"
                onClick={() => updateEventType("clock_out")}
              >
                <LogOut size={17} />
                ออกงาน
              </button>
            </div>

            <label className="field">
              <span>
                <UserRound size={16} />
                ชื่อ
              </span>
              <input
                autoComplete="name"
                inputMode="text"
                placeholder="เช่น มะลิ"
                value={employeeName}
                onChange={(event) => setEmployeeName(event.target.value)}
              />
            </label>

            <label className="field">
              <span>
                <BriefcaseBusiness size={16} />
                ตำแหน่ง
              </span>
              <select value={position} onChange={(event) => setPosition(event.target.value as Position)}>
                {POSITIONS.map((positionOption) => (
                  <option key={positionOption} value={positionOption}>
                    {positionOption}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <span>
                <Clock3 size={16} />
                เวลา
              </span>
              <input value={`${formatDateTime(scanTime.toISOString())} น.`} readOnly />
            </label>

            {error ? (
              <p className="form-error" role="alert">
                {error}
              </p>
            ) : null}

            <button className="primary-button" type="submit" disabled={isSaving}>
              {isSaving ? <Loader2 className="spin" size={18} /> : eventCopy.icon}
              {isSaving ? "กำลังบันทึก" : "บันทึกเวลา"}
            </button>
          </form>
        )}
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Rename `signOutAdmin` usage in `AdminDashboard.tsx`**

In `src/components/AdminDashboard.tsx`, change the import:

```ts
import {
  exportLogsCsv,
  fetchLogsByDate,
  getCurrentSession,
  getDefaultDate,
  onAuthChange,
  signInAdmin,
  signOutAdmin,
} from "../lib/store";
```

to:

```ts
import {
  exportLogsCsv,
  fetchLogsByDate,
  getCurrentSession,
  getDefaultDate,
  onAuthChange,
  signInAdmin,
  signOutCurrentUser,
} from "../lib/store";
```

And change the one call site:

```ts
  async function handleSignOut() {
    await signOutAdmin();
    onSignedOut();
  }
```

to:

```ts
  async function handleSignOut() {
    await signOutCurrentUser();
    onSignedOut();
  }
```

- [ ] **Step 5: Run the full test suite**

Run: `npm test`
Expected: `PASS` — no test touches `store.ts` or `ClockPage.tsx` directly (they call live Supabase/browser APIs), so this just confirms Tasks 1–2's tests are still green.

- [ ] **Step 6: Type-check and build**

Run: `npm run build`
Expected: succeeds with no TypeScript errors. This is the real check for this task — it will catch any leftover reference to a removed export (`getSavedEmployeeProfiles`, `signOutAdmin`, etc.).

- [ ] **Step 7: Lint**

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add src/types.ts src/lib/store.ts src/components/ClockPage.tsx src/components/AdminDashboard.tsx
git commit -m "feat: replace employee name entry with Google sign-in on /clock"
```

---

### Task 5: Harden the admin session check

**Files:**
- Modify: `src/lib/store.ts`

**Interfaces:**
- Consumes: `supabase` client from `src/lib/supabase.ts` (unchanged), `admin_users` table (already exists in schema, unchanged by this task)
- Produces: `getCurrentSession` and `onAuthChange` now only resolve to a non-null `AuthSession` for users present in `admin_users`; a private `isAdminUser(userId: string): Promise<boolean>` helper is added (not exported — internal to this file only)

- [ ] **Step 1: Replace the admin session functions**

In `src/lib/store.ts`, find:

```ts
export async function getCurrentSession(): Promise<AuthSession | null> {
  if (!isSupabaseConfigured || !supabase) return { email: "demo@local", isDemo: true };

  const { data, error } = await supabase.auth.getSession();
  if (error) throw new Error(error.message);
  const email = data.session?.user.email;
  return data.session ? { email: email ?? undefined, isDemo: false } : null;
}

export function onAuthChange(callback: (session: AuthSession | null) => void): () => void {
  if (!supabase) return () => undefined;

  const {
    data: { subscription },
  } = supabase.auth.onAuthStateChange((_event, session) => {
    callback(session ? { email: session.user.email ?? undefined, isDemo: false } : null);
  });

  return () => subscription.unsubscribe();
}
```

Replace with:

```ts
async function isAdminUser(userId: string): Promise<boolean> {
  if (!supabase) return false;
  const { data, error } = await supabase.from("admin_users").select("user_id").eq("user_id", userId).maybeSingle();
  if (error) return false;
  return Boolean(data);
}

export async function getCurrentSession(): Promise<AuthSession | null> {
  if (!isSupabaseConfigured || !supabase) return { email: "demo@local", isDemo: true };

  const { data, error } = await supabase.auth.getSession();
  if (error) throw new Error(error.message);
  if (!data.session) return null;

  const isAdmin = await isAdminUser(data.session.user.id);
  if (!isAdmin) return null;

  return { email: data.session.user.email ?? undefined, isDemo: false };
}

export function onAuthChange(callback: (session: AuthSession | null) => void): () => void {
  if (!supabase) return () => undefined;

  const {
    data: { subscription },
  } = supabase.auth.onAuthStateChange((_event, session) => {
    if (!session) {
      callback(null);
      return;
    }

    isAdminUser(session.user.id).then((isAdmin) => {
      callback(isAdmin ? { email: session.user.email ?? undefined, isDemo: false } : null);
    });
  });

  return () => subscription.unsubscribe();
}
```

- [ ] **Step 2: Type-check and build**

Run: `npm run build`
Expected: succeeds with no TypeScript errors.

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/lib/store.ts
git commit -m "fix: require admin_users membership before granting admin dashboard access"
```

No automated test for this step: it depends on a live Supabase session + `admin_users` row, which isn't mockable without introducing a Supabase client mock the codebase doesn't otherwise use. Covered by the manual verification checklist in Task 7.

---

### Task 6: Document the Google OAuth setup

**Files:**
- Modify: `README.md`

**Interfaces:** none (documentation only)

- [ ] **Step 1: Update the intro line**

Find:

```
ระบบบันทึกเวลาเข้าออกงานแบบง่ายสำหรับร้านขนาดเล็ก ใช้ QR ให้พนักงานเปิดหน้า `/clock` แล้วบันทึกเวลา ส่วน admin ดูสรุปรายวันที่หน้า `/`.
```

Replace with:

```
ระบบบันทึกเวลาเข้าออกงานแบบง่ายสำหรับร้านขนาดเล็ก ใช้ QR ให้พนักงานเปิดหน้า `/clock`, เข้าสู่ระบบด้วย Google (ครั้งแรกตั้งชื่อเล่น ครั้งต่อไปจำได้เลย) แล้วบันทึกเวลาได้ทันที ส่วน admin ดูสรุปรายวันที่หน้า `/`.
```

- [ ] **Step 2: Add a Google OAuth setup section**

Find the `## Deploy ฟรี` heading and insert this new section immediately before it:

```markdown
## เปิดใช้ Google Login สำหรับพนักงาน

1. ไปที่ [Google Cloud Console](https://console.cloud.google.com/) > APIs & Services > Credentials > Create OAuth client ID (เลือกประเภท Web application)
2. ใส่ Authorized redirect URI เป็น `https://<your-project-ref>.supabase.co/auth/v1/callback`
3. คัดลอก Client ID และ Client Secret ที่ได้
4. ไปที่ Supabase Dashboard > Authentication > Providers > Google แล้ววางค่าทั้งสอง จากนั้นเปิดใช้งาน provider
5. ไปที่ Supabase Dashboard > Authentication > URL Configuration แล้วเพิ่ม redirect URL ที่อนุญาต:
   - โดเมนที่ deploy จริง เช่น `https://ezytime.phetjaa.workers.dev/clock`
   - `http://localhost:5173/clock` (สำหรับ dev บนเครื่อง)

พนักงานที่สแกน QR แล้วกด "เข้าสู่ระบบด้วย Google" ครั้งแรกจะถูกขอตั้งชื่อเล่นหนึ่งครั้ง ครั้งต่อไประบบจำได้อัตโนมัติ ไม่ต้องพิมพ์ชื่อซ้ำ

```

- [ ] **Step 3: Update the RLS description under Backend section**

Find:

```
- คนที่ scan QR insert `time_logs` ได้เท่านั้น
- เฉพาะ Supabase Auth user ที่ถูกเพิ่มใน `admin_users` จึงอ่านรายงานได้
```

Replace with:

```
- พนักงานต้องเข้าสู่ระบบด้วย Google ก่อนถึงจะ insert `time_logs` ได้ ผูกกับ `user_id` ของตัวเองเสมอ
- เฉพาะ Supabase Auth user ที่ถูกเพิ่มใน `admin_users` จึงอ่านรายงานได้
```

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: document Google OAuth setup for employee login"
```

---

### Task 7: Final verification

**Files:** none (verification only)

**Interfaces:** none

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: `PASS`, all tests from Tasks 1–2 green.

- [ ] **Step 2: Run the full build**

Run: `npm run build`
Expected: succeeds, no TypeScript errors.

- [ ] **Step 3: Run lint**

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 4: Manually verify demo mode still works without Supabase**

Run: `mv .env.local .env.local.bak && npm run dev`, open `http://localhost:5173/clock`, confirm the old free-text name form renders (no Google button) and a clock-in submits successfully. Then `mv .env.local.bak .env.local` to restore the real config.

- [ ] **Step 5: Stop — do not deploy yet**

Do not run `npm run deploy` or apply `supabase/schema.sql` to the live project as part of this task. Both require the project owner to first complete the Google Cloud/Supabase checklist from Task 6's README section — deploying before that is done means the "เข้าสู่ระบบด้วย Google" button will fail at the provider step. Report completion and hand off:
1. The README checklist for the owner to complete (Google Cloud OAuth client + Supabase provider + redirect URLs).
2. A reminder to re-run the updated `supabase/schema.sql` in the Supabase SQL editor once ready.
3. Only after both are done: deploy with `npm run deploy` and do one real click-through of the Google sign-in flow to confirm end-to-end.
