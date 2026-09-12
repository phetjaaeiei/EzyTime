# EzyTime

ระบบบันทึกเวลาเข้าออกงานแบบง่ายสำหรับร้านขนาดเล็ก ใช้ QR ให้พนักงานเปิดหน้า `/clock`, เข้าสู่ระบบด้วย Google (ครั้งแรกตั้งชื่อเล่น ครั้งต่อไปจำได้เลย) แล้วบันทึกเวลาได้ทันที ส่วน admin ดูสรุปรายวันที่หน้า `/`.

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

## เปิดใช้ Google Login สำหรับพนักงาน

1. ไปที่ [Google Cloud Console](https://console.cloud.google.com/) > APIs & Services > Credentials > Create OAuth client ID (เลือกประเภท Web application)
2. ใส่ Authorized redirect URI เป็น `https://<your-project-ref>.supabase.co/auth/v1/callback`
3. คัดลอก Client ID และ Client Secret ที่ได้
4. ไปที่ Supabase Dashboard > Authentication > Providers > Google แล้ววางค่าทั้งสอง จากนั้นเปิดใช้งาน provider
5. ไปที่ Supabase Dashboard > Authentication > URL Configuration แล้วเพิ่ม redirect URL ที่อนุญาต:
   - โดเมนที่ deploy จริง เช่น `https://ezytime.phetjaa.workers.dev/clock` และ `https://ezytime.phetjaa.workers.dev/stock`
   - `http://localhost:5173/clock` และ `http://localhost:5173/stock` (สำหรับ dev บนเครื่อง)

ถ้าเป็น Supabase project เดิมที่เคยรัน `schema.sql` เวอร์ชันก่อนหน้าไปแล้ว ต้องกลับไปรัน [supabase/schema.sql](supabase/schema.sql) เวอร์ชันล่าสุดใน Supabase SQL Editor อีกครั้งก่อน deploy build นี้ (สคริปต์เขียนให้รันซ้ำได้อย่างปลอดภัย) เพราะเวอร์ชันล่าสุดเพิ่มคอลัมน์ `time_logs.user_id` และเปลี่ยน insert policy ใหม่ ถ้าไม่รันซ้ำ พนักงานจะบันทึกเวลาเข้า-ออกงานไม่ได้เลยหลัง deploy

พนักงานที่สแกน QR แล้วกด "เข้าสู่ระบบด้วย Google" ครั้งแรกจะถูกขอตั้งชื่อเล่นหนึ่งครั้ง ครั้งต่อไประบบจำได้อัตโนมัติ ไม่ต้องพิมพ์ชื่อซ้ำ

## โมดูลจัดการสต๊อก (Stock)

ระบบสต๊อกแบบ ledger สำหรับร้านชาบู:

- **แอดมิน** (`/` → แท็บ "สต๊อกสินค้า"): เพิ่ม/แก้สินค้า (ชื่อ หน่วย หมวดหมู่ จุดแจ้งเตือน), บันทึกรับเข้า/เบิก/ของเสีย, ดูแดชบอร์ดรายวัน + กราฟโดนัท (เบิกใช้/ของเสีย/คงเหลือ) และของใกล้หมด
- **พนักงาน** (`/stock`): ล็อกอิน Google เดิม แล้วกดเบิกของ/แจ้งของเสียได้เอง เห็น "ที่ฉันเบิกวันนี้"
- คงเหลือคำนวณจากบัญชีเคลื่อนไหวเสมอ: `รับเข้า = เบิกใช้ + ของเสีย + คงเหลือ`

ก่อน deploy build นี้ ให้รัน [supabase/schema.sql](supabase/schema.sql) ล่าสุดซ้ำใน Supabase SQL Editor (เพิ่มตาราง `stock_items`, `stock_movements` และฟังก์ชัน `is_admin()` — รันซ้ำได้ปลอดภัย) และเพิ่ม `/stock` ในรายการ redirect URL ที่อนุญาตของ Google เช่นเดียวกับ `/clock`.

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

- พนักงานต้องเข้าสู่ระบบด้วย Google ก่อนถึงจะ insert `time_logs` ได้ ผูกกับ `user_id` ของตัวเองเสมอ
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

## สิทธิ์สต๊อกตามตำแหน่ง

สำหรับฐานข้อมูลเดิม รัน `supabase/migrations/202609130001_stock_permissions.sql` ใน Supabase SQL Editor **ก่อนปล่อย frontend นี้** (ฐานข้อมูลใหม่ใช้ `supabase/schema.sql` ซึ่งรวม migration แล้ว)

1. ให้พนักงานเข้าสู่ระบบ Google อย่างน้อยหนึ่งครั้ง เพื่อให้มีบัญชีในรายชื่อ
2. Admin เปิด **สต๊อกสินค้า → สิทธิ์จัดการสต๊อก** กำหนดตำแหน่งของแต่ละคน แล้วกดบันทึก
3. เลือกตำแหน่ง เลือกสินค้าที่รับผิดชอบ แล้วกด **บันทึกสิทธิ์ของตำแหน่ง**
4. พนักงานเปิด `/stock` จะเห็นเฉพาะสินค้าที่ได้รับมอบหมาย และเบิก/บันทึกของเสียได้ตามสิทธิ์

ตำแหน่งสำหรับสิทธิ์สต๊อกเก็บแยกจากตำแหน่งที่พนักงานเลือกตอนลงเวลา เพื่อไม่ให้พนักงานเพิ่มสิทธิ์ตัวเอง ไม่มีการให้สิทธิ์อัตโนมัติจากประวัติลงเวลา: หลังติดตั้งต้องให้ admin มอบหมายก่อน พนักงานที่ยังไม่มีตำแหน่งหรือสินค้าที่ได้รับมอบหมายจะเบิกไม่ได้ Admin ยังคงจัดการสินค้าได้ทั้งหมด การถอนสิทธิ์มีผลกับการบันทึกครั้งถัดไปที่ฐานข้อมูล แม้หน้าจอเดิมจะยังเปิดอยู่

การบันทึกรายการสินค้าของแต่ละตำแหน่งเป็น transaction เดียว เลือกว่างได้เพื่อถอนสิทธิ์ทั้งหมด สินค้าใหม่จะยังไม่ได้รับสิทธิ์จนกว่า admin จะเลือกเพิ่ม ส่วนสินค้าที่ปิดใช้งานจะเบิกไม่ได้

โหมดทดลองเก็บการตั้งค่าใน localStorage โดย `/stock` จำลองบัญชีมะลิ ไม่ใช่ระบบยืนยันตัวตนสำหรับใช้งานจริง

ทดสอบ RLS ด้วย PostgreSQL ชั่วคราว (ห้ามใช้ bootstrap กับฐานข้อมูลจริง): รัน `supabase/tests/bootstrap.sql`, `supabase/schema.sql` และ `supabase/tests/stock_permissions.sql` ตามลำดับโดยเปิด `psql -v ON_ERROR_STOP=1` ชุดทดสอบตรวจการมอบหมาย การปฏิเสธสินค้านอกสิทธิ์ การป้องกันเพิ่มสิทธิ์ตัวเอง การจำกัดยอดคงเหลือ และการถอนสิทธิ์

## ลำดับส่วนตัวและการลบถาวร

- เปิด **จัดลำดับสินค้า** ในหน้าสต๊อก แล้วลากจุดจับเพื่อย้ายสินค้าข้ามหมวดหมู่ได้ หรือใช้ปุ่มขึ้น/ลง กด **บันทึกลำดับ** เพื่อบันทึกเฉพาะบัญชีของตนใน Supabase และใช้ต่อได้เมื่อเปลี่ยนอุปกรณ์ มีปุ่มยกเลิกและคืนลำดับเดิม
- Admin เปิด **เลือกลบสินค้า** เลือก checkbox ของสินค้า หรือเลือกทั้งหมดที่แสดง แล้วกด **ลบถาวร** หน้ายืนยันแสดงรายชื่อสินค้าและจำนวนประวัติที่เกี่ยวข้อง การยืนยันจะลบแถวสินค้า ประวัติรับเข้า/เบิก/ของเสีย และสิทธิ์ที่ผูกกับสินค้าออกจริงใน transaction เดียว กู้คืนผ่านแอปไม่ได้
- หากต้องการเพียงซ่อนสินค้า ให้ใช้ **แก้ไข → ปิดการใช้งานสินค้านี้** ซึ่งยังเก็บประวัติไว้
- ติดตั้ง migration `202609130002_stock_layouts.sql`, `202609130003_fix_stock_employees.sql`, `202609130004_delete_stock_items.sql` ตามลำดับก่อน deploy frontend นี้
- Migration 003 แก้ `list_stock_employees()` ด้วย `account.email::text` เพราะ Supabase ใช้ `varchar(255)` แต่ RPC ประกาศผลลัพธ์เป็น `text` ชุดทดสอบ bootstrap ปรับชนิดให้ตรงกับ Supabase แล้ว
- ทดสอบ PostgreSQL เพิ่มด้วย `supabase/tests/stock_layouts.sql` และ `supabase/tests/stock_delete.sql` บนฐานข้อมูลชั่วคราวหลังติดตั้ง schema
