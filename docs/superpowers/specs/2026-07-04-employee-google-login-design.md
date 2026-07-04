# Employee Google Login — Design

## Goal

Replace the free-text "type your name" employee flow on `/clock` with Google
sign-in, so returning employees are recognized automatically and time logs
are tied to a real identity instead of a typed string.

## Non-goals

- No admin-managed employee directory/allowlist. Signup is self-serve: anyone
  who scans the QR and signs in with Google becomes an employee record.
- No change to how admins log in (Supabase email/password, unchanged).
- No change to position selection — still picked per clock-in/out event, not
  locked to the profile.

## Data model

No new table. Nickname lives in Supabase Auth's `user_metadata` (every
authenticated user already has this) — avoids an extra table and its own RLS
policies for something this small.

`time_logs` gets one new column:

```sql
alter table public.time_logs
  add column if not exists user_id uuid references auth.users(id);
```

Nullable, so existing historical rows (logged anonymously) are untouched.

### RLS changes on `time_logs`

Today: `anon, authenticated` can insert anything, no ownership check. Change
to:

```sql
drop policy if exists "Anyone can submit QR time logs" on public.time_logs;
create policy "Authenticated employees can submit their own time logs"
on public.time_logs
for insert
to authenticated
with check (user_id = auth.uid());
```

This drops anonymous insert entirely — every clock-in/out now requires a
signed-in Google identity. Select policy (admin-only read) is unchanged.

## `/clock` flow

State machine, driven by `supabase.auth.getSession()` /
`onAuthStateChange()` plus `user.user_metadata.nickname`:

1. **No session** → show "เข้าสู่ระบบด้วย Google" button.
   `supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: `${window.location.origin}/clock` } })`
2. **Session, no `user_metadata.nickname`** → one-field "ตั้งชื่อเล่น" form
   (reuses existing 2–100 char validation). On submit:
   `supabase.auth.updateUser({ data: { nickname } })`.
3. **Session + nickname** → normal clock form: greets by nickname, employee
   picks clock in/out + position (unchanged control), submits. No name
   input anywhere in this state.
   - "แก้ไขชื่อ" link reopens the nickname form (pre-filled), same
     `updateUser` call.
   - "ออกจากระบบ" button (`supabase.auth.signOut()`) for shared devices.

`createTimeLog` now also sends `user_id: session.user.id` alongside the
existing `employee_name` (nickname snapshot) and `position`.

### Retired

- `getSavedEmployeeProfiles` / `rememberEmployeeProfile` / the
  `SavedEmployeeProfile` localStorage mechanism in `src/lib/store.ts` — fully
  superseded by real accounts. Deleted, not deprecated.
- The "เลือกชื่อของตัวเอง" dropdown + "กรอกชื่อเอง" toggle in
  `ClockPage.tsx` — replaced by the state machine above.

## Admin route hardening

Unrelated-looking but directly caused by this change: `AdminDashboard`'s
session check (`getCurrentSession`) currently treats "any Supabase session
exists" as "show the dashboard" — it never checks `admin_users` membership.
That was harmless while only hand-created admin accounts existed. Once any
employee can self-serve a Google session, an employee who opens `/` would
hit a broken/error dashboard shell (RLS blocks the actual data, but the UI
doesn't know that up front).

Fix: `getCurrentSession` / `onAuthChange` in `src/lib/store.ts` (the single
place that already owns all Supabase auth calls) additionally query
`admin_users` for that `user_id` before returning a non-null session. Not a
member → return `null`, same as "logged out." `AdminDashboard.tsx` needs no
new logic — it already renders the login panel for a null session. This is
a UX correction, not a new security boundary — RLS already protects the
actual data.

## Demo/local mode (unchanged)

When `VITE_SUPABASE_URL` isn't set (local dev without `.env.local`), `/clock`
keeps today's free-text name entry. Google OAuth cannot function without a
real Supabase project + Google provider configured, so this fallback is
unchanged and stays the only way to exercise the app with zero external
setup.

## External setup required (cannot be done via API key)

Google OAuth requires dashboard configuration outside this repo. Checklist
for the project owner, one-time:

1. **Google Cloud Console** → APIs & Services → Credentials → Create OAuth
   client ID (Web application).
   - Authorized redirect URI: `https://ikdwqpzknngjgmqpohws.supabase.co/auth/v1/callback`
2. **Supabase Dashboard** → Authentication → Providers → Google → paste
   Client ID + Client Secret from step 1 → enable.
3. **Supabase Dashboard** → Authentication → URL Configuration → add to
   allowed redirect URLs:
   - `https://ezytime.phetjaa.workers.dev/clock`
   - `http://localhost:5183/clock` (or whatever local dev port is in use)

Until this is done, the Google button will fail at the provider step —
expected, not a bug.

## Testing / verification plan

Automatable without a real Google account:
- Build succeeds, demo-mode `/clock` still works unauthenticated (local
  fallback path unchanged).
- `signInWithOAuth` is invoked with the correct provider/redirect args
  (can be observed via network request to Supabase's `/authorize` endpoint).
- Nickname-setup form validation (empty/too-short nickname rejected).
- Admin route: session without `admin_users` membership shows login panel,
  not an error shell.

Requires the project owner, after completing the external setup above:
- One real click-through of "เข้าสู่ระบบด้วย Google" → consent screen →
  redirect back → nickname form appears once, then not again on next visit.
- A second employee (different Google account) can sign up independently
  without seeing the first employee's data.

## Files touched

- `supabase/schema.sql` — add `user_id` column + RLS policy change
- `src/lib/store.ts` — remove localStorage profile helpers, add
  nickname read/update helpers, pass `user_id` on `createTimeLog`,
  add `admin_users` membership check to `getCurrentSession`/`onAuthChange`
- `src/lib/supabase.ts` — no change expected
- `src/components/ClockPage.tsx` — replace name input with the auth
  state machine above
- `src/components/AdminDashboard.tsx` — no logic change expected; benefits
  from the `store.ts` fix automatically
- `README.md` — document the Google OAuth setup checklist
