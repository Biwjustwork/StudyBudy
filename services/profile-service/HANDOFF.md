# ส่งต่องาน — สมาชิก 2 (กิต)

## ทำแล้ว

- ย้าย Profile & Subject Service มาไว้ที่ `services/profile-service`
- ทำ API อ่านโปรไฟล์และแก้รายการวิชาของผู้ใช้: `GET /api/users/:id` และ `PUT /api/users/:id`
- ทำ API ค้นหาผู้ใช้ตามวิชา: `GET /api/users/search?subject=...`
- เพิ่ม validation: วิชาต้องเป็นข้อความที่ไม่ว่าง ตัดช่องว่างหัวท้าย และไม่รับชื่อซ้ำโดยไม่นับตัวพิมพ์เล็ก/ใหญ่
- ตรวจ Bearer JWT ที่มี claim `userId`; ผู้ใช้ดูหรือแก้ได้เฉพาะโปรไฟล์ของตัวเอง
- บันทึกข้อมูลโปรไฟล์ลง JSON และทำ frontend ที่ `frontend/` สำหรับสมัคร/เข้าสู่ระบบ จัดการวิชา และค้นหาเพื่อนร่วมวิชา
- เพิ่ม README, `.env.example` และ Dockerfile เบื้องต้น
- เพิ่ม API tests ครอบคลุมการอ่าน/บันทึก/ค้นหา, validation, สิทธิ์ และ token ใน `src/app.test.ts`
- เพิ่ม `POST /internal/users` สำหรับ Auth พร้อมตรวจ `X-Service-Token`, สร้างโปรไฟล์ครั้งแรก, retry แบบ idempotent และตอบ conflict เมื่อข้อมูลขัดกัน
- เพิ่ม `POST /internal/users/display-names` ให้ Membership resolve รหัสสมาชิกเป็นชื่อที่แสดง โดย response ไม่รวมอีเมลหรือวิชาที่สนใจ
- บังคับ JWT เป็น HS256 มี `userId` ที่ไม่ว่างและ `exp` ที่ยังไม่หมดอายุ; เพิ่ม JSON 404 สำหรับ route ที่ไม่มี
- ปรับ JSON store ให้เปลี่ยน memory หลังเขียนไฟล์สำเร็จเท่านั้น และ queue กลับมาทำงานได้หลังเขียนล้มเหลว
- เพิ่ม tests สำหรับ internal user validation, JWT ไม่มี/หมด `exp`, 404 JSON และเขียนไฟล์ล้มเหลวแล้วลองใหม่
- อัปเดต README และ `.env.example`; ค่าที่แสดงเป็น placeholder เท่านั้น ห้าม commit secret จริง
- รันผลตรวจปัจจุบันให้ครบก่อนเปิด PR: `npm run typecheck`, `npm run build`, `npm test`, `docker build --tag study-buddy-profile:local .` (รายงานผลใน PR)

## ข้อตกลงที่ยังต้องยืนยันก่อนเชื่อมบริการ

- JWT จาก Auth Service ต้องใช้ HS256 และมี claim ชื่อ `userId`; สมาชิก 1 ช่วยยืนยันว่าเข้ากับ Auth Service จริง
- สมาชิก 1 ต้องตั้ง `PROFILE_URL` และ `PROFILE_SERVICE_TOKEN` ใน Auth environment ให้ตรงกับ Profile Service
- ข้อมูลเริ่มต้นที่ Profile Service ใช้มีรูปแบบ `{ "id": "...", "name": "...", "email": "optional", "subjects": [] }`
- ต้องยืนยันว่า `GET /api/users/search` เปิดให้ผู้ใช้ที่ล็อกอินทุกคนค้นหาได้ และข้อมูล `id`, `name`, `subjects` เพียงพอสำหรับผู้เรียก
- `AUTH_TOKEN_SECRET` ต้องตรงกับค่าที่ Auth Service ใช้ และตั้งผ่าน environment/secret เท่านั้น

## งานต่อ

### สมาชิก 1 — Auth Service / ผู้ประสานงาน

- ยืนยันรูปแบบ token, claim `userId`, algorithm และการใช้ secret ร่วมกัน
- เรียก `POST /internal/users` หลังสมัคร โดยส่ง `{ id, name, email }` และ header `X-Service-Token`; ห้ามเขียนไฟล์/ฐานข้อมูลของ Profile โดยตรง
- แจ้ง contract และตัวอย่าง token/ข้อมูลผู้ใช้สำหรับทดสอบ โดยใช้ข้อมูลจำลองและห้ามส่ง secret จริง

### สมาชิก 3 — Study Group / Session Service

- ยืนยันว่าจะใช้ผลค้นหาจาก `GET /api/users/search?subject=...` ใน flow ใด
- ทบทวน response ตัวอย่างใน README และแจ้ง field เพิ่มเติมที่หน้าแสดงกลุ่มจำเป็นต้องใช้
- ตกลงชื่อวิชาและการเทียบตัวพิมพ์/ช่องว่างให้สอดคล้องกับการค้นหากลุ่ม

### สมาชิก 4 — Membership Service

- ยืนยันว่า Membership Service ไม่ต้องเรียก Profile Service โดยตรงสำหรับการส่ง/อนุมัติคำขอ หรือระบุข้อมูลผู้ใช้ที่จำเป็นต้องใช้
- หากต้องแสดงชื่อผู้ขอหรือข้อมูลประกอบคำขอ ให้ตกลงกับกิตและสมาชิก 3 ว่าจะใช้ `userId` อ้างอิง หรือเรียก `GET /api/users/:id` อย่างไร โดย endpoint นี้อนุญาตให้ผู้ใช้ดูได้เฉพาะโปรไฟล์ของตนเอง จึงต้องตกลงวิธีสำหรับ service-to-service ก่อนใช้งาน
- ประสานกับสมาชิก 3 เรื่องแหล่งข้อมูลสมาชิกจริงและการจอง/ยืนยันที่นั่ง เพื่อป้องกันการอนุมัติคำขอเกิน `maxMembers`; ประเด็นนี้เป็นการเชื่อมระหว่าง Membership กับ Group Service ไม่ใช่หน้าที่ของ Profile Service

### สมาชิก 5 — Integration / Tester

- เพิ่ม frontend และ Profile Service ในการรันทดสอบรวมหลัง contract ได้ข้อสรุป
- เตรียม flow ทดสอบล็อกอิน → บันทึกวิชา → ค้นหาผู้ใช้ตามวิชา
- ประสาน fixture หรือข้อมูลผู้ใช้จำลองสำหรับการทดสอบ โดยไม่ใช้ข้อมูลส่วนตัวจริง

### กิต — สมาชิก 2

- งานตามรายการ Profile & Subject Service ข้างต้นอยู่บน branch ของกิต; รันคำสั่งตรวจทั้งสี่รายการและแนบผลใน PR ใหม่เข้า `main`
- เปิด PR ไว้เพื่อ review เท่านั้น ห้าม merge จนกว่าจะตรวจเสร็จ
- ระบุใน PR ว่า Auth เรียก `POST /internal/users` พร้อม `X-Service-Token` ได้แล้ว; ห้ามใส่ token หรือ secret จริง

## วิธีเริ่ม local

ดูคำสั่งและรายละเอียด API ใน [README.md](README.md) คัดลอก `.env.example` เป็น `.env` แล้วตั้ง `AUTH_TOKEN_SECRET` และ `PROFILE_SERVICE_TOKEN` ใน environment ทดสอบให้ตรงกับ Auth Service โดยห้าม commit ค่าจริง ส่วน frontend อยู่ที่ `frontend/` และอ่าน `VITE_AUTH_URL`/`VITE_PROFILE_URL` จากไฟล์ `.env` ของ frontend
