# ส่งต่องาน — สมาชิก 2 (กิต)

## ทำแล้ว

- ตั้งโครง Profile & Subject Service ไว้ในโฟลเดอร์ `services/profile-service`
- ทำ API อ่านโปรไฟล์และแก้รายการวิชาของผู้ใช้: `GET /api/users/:id` และ `PUT /api/users/:id`
- ทำ API ค้นหาผู้ใช้ตามวิชา: `GET /api/users/search?subject=...`
- เพิ่ม validation: วิชาต้องเป็นข้อความที่ไม่ว่าง ตัดช่องว่างหัวท้าย และไม่รับชื่อซ้ำโดยไม่นับตัวพิมพ์เล็ก/ใหญ่
- ตรวจ Bearer JWT ที่มี claim `userId`; ผู้ใช้ดูหรือแก้ได้เฉพาะโปรไฟล์ของตัวเอง
- บันทึกข้อมูลโปรไฟล์ลง JSON และเพิ่มหน้า `profile.html` สำหรับโหลด บันทึก และค้นหาวิชา
- เพิ่ม README, `.env.example` และ Dockerfile เบื้องต้น
- เพิ่ม API tests ครอบคลุมการอ่าน/บันทึก/ค้นหา, validation, สิทธิ์ และ token ใน `src/app.test.ts`
- ติดตั้ง dependencies และตรวจผ่าน `npm run typecheck`, `npm run build` และ `npm test` (7 tests ผ่าน)

## ข้อตกลงที่ยังต้องยืนยันก่อนเชื่อมบริการ

- JWT จาก Auth Service ต้องใช้ HS256 และมี claim ชื่อ `userId`; สมาชิก 1 ช่วยยืนยันว่าเข้ากับ Auth Service จริง
- ต้องกำหนดวิธีสร้างข้อมูลโปรไฟล์เมื่อสมัคร/สร้างผู้ใช้ใหม่ เพราะ Profile Service ไม่มี endpoint สร้างบัญชี
- ข้อมูลเริ่มต้นที่ Profile Service ใช้มีรูปแบบ `{ "id": "...", "name": "...", "email": "optional", "subjects": [] }`
- ต้องยืนยันว่า `GET /api/users/search` เปิดให้ผู้ใช้ที่ล็อกอินทุกคนค้นหาได้ และข้อมูล `id`, `name`, `subjects` เพียงพอสำหรับผู้เรียก
- `AUTH_TOKEN_SECRET` ต้องตรงกับค่าที่ Auth Service ใช้ และตั้งผ่าน environment/secret เท่านั้น

## งานต่อ

### สมาชิก 1 — Auth Service / ผู้ประสานงาน

- ยืนยันรูปแบบ token, claim `userId`, algorithm และการใช้ secret ร่วมกัน
- กำหนดวิธี provision โปรไฟล์เมื่อมีผู้ใช้ใหม่ เช่น ส่ง event/เรียก API ภายใน หรือใช้ฐานข้อมูลร่วมตาม contract ที่ทีมตกลง
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

- เพิ่ม Profile Service ในการรันทดสอบรวมหลัง contract ได้ข้อสรุป
- เตรียม flow ทดสอบล็อกอิน → บันทึกวิชา → ค้นหาผู้ใช้ตามวิชา
- ประสาน fixture หรือข้อมูลผู้ใช้จำลองสำหรับการทดสอบ โดยไม่ใช้ข้อมูลส่วนตัวจริง

### กิต — สมาชิก 2

- เพิ่ม/ปรับ test เมื่อ contract และ flow เชื่อมบริการได้รับการยืนยัน
- ทดสอบ integration เพิ่มด้วยข้อมูลผู้ใช้จำลองและ token สำหรับ local แล้วแก้ปัญหาที่พบ
- ปรับ service ตาม contract ที่ทีมยืนยันและอัปเดต README ก่อนเปิด PR

## วิธีเริ่ม local

ดูคำสั่งและรายละเอียด API ใน [README.md](README.md) คัดลอก `.env.example` เป็น `.env` แล้วตั้ง `AUTH_TOKEN_SECRET` ให้ตรงกับค่าทดสอบของ Auth Service ข้อมูลจริงและ secret ห้าม commit ลง repository
