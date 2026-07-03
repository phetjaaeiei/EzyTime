# EzyTime

ระบบบันทึกเวลาเข้าออกงานแบบง่ายสำหรับร้านขนาดเล็ก ใช้ QR ให้พนักงานเปิดหน้า `/clock` แล้วบันทึกเวลา ส่วน admin ดูสรุปรายวันที่หน้า `/`.

## Stack

- Frontend: React + Vite + TypeScript
- Backend/data: Supabase Postgres + Supabase Auth + RLS
- Free deploy ที่แนะนำ: Cloudflare Workers Static Assets สำหรับ FE และ Supabase Free Plan สำหรับฐานข้อมูล/auth

ถ้ายังไม่ได้ใส่ค่า Supabase แอปจะเข้าโหมดทดลองและเก็บข้อมูลใน browser ด้วย `localStorage`.

## Local Development

```bash
npm install
npm run dev
```

เปิด `http://localhost:5173/` สำหรับ admin และ `http://localhost:5173/clock` สำหรับหน้าที่ QR จะพาไป

## Supabase Setup

1. สร้าง Supabase project
2. เปิด SQL Editor แล้วรัน [supabase/schema.sql](supabase/schema.sql)
3. ไปที่ Authentication > Users แล้วสร้าง admin user ด้วย email/password
4. คัดลอก UUID ของ user แล้วรัน SQL นี้

```sql
insert into public.admin_users (user_id)
values ('PASTE_ADMIN_USER_UUID_HERE');
```

5. คัดลอก `.env.example` เป็น `.env.local` แล้วใส่ค่า

```bash
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-supabase-publishable-key
```

ห้ามใส่ secret key หรือ service role key ใน frontend. ถ้าใช้ Supabase project เก่าที่ยังมี legacy anon key สามารถใช้ `VITE_SUPABASE_ANON_KEY` แทนได้ชั่วคราว.

## Deploy ฟรี

### Frontend บน Cloudflare Workers Static Assets

1. Push repo ไป GitHub
2. สร้าง Cloudflare Workers project
3. ตั้งค่า build command เป็น `npm run build`
4. ตั้งค่า deploy command เป็น `npx wrangler deploy` (ถ้า deploy จากเครื่อง local ใช้ `npm run deploy` ได้)
5. เพิ่ม environment variables `VITE_SUPABASE_URL` และ `VITE_SUPABASE_PUBLISHABLE_KEY`
6. Deploy แล้วใช้ URL `/clock` เป็น QR link

โปรเจกต์มี [wrangler.jsonc](wrangler.jsonc) ตั้งค่า `assets.not_found_handling` เป็น `single-page-application` เพื่อให้ `/clock` เปิด SPA ได้ตรงบน Cloudflare Workers.

### Backend บน Supabase

ใช้ schema ที่ให้ไว้พร้อม RLS:

- คนที่ scan QR insert `time_logs` ได้เท่านั้น
- เฉพาะ Supabase Auth user ที่ถูกเพิ่มใน `admin_users` จึงอ่านรายงานได้

## Commands

```bash
npm run lint
npm run build
npm run preview
npm run preview:worker
npm run deploy
```

## Design

Concept mock อยู่ที่ [design/ezytime-ui-concept.png](design/ezytime-ui-concept.png). UI ใช้ light product surface, sky-teal primary, coral/mint accents, table-first dashboard และ mobile-first clock form.
