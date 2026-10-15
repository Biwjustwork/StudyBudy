# Auth Service

## Password hashing และ access token

- ตรวจ password ว่ายาวอย่างน้อย 8 ตัว มีตัวพิมพ์ใหญ่และอักขระพิเศษ และมีขนาดไม่เกิน 72 ไบต์เมื่อเข้ารหัส UTF-8 ก่อนนำไป hash; ภาษาไทยอาจใช้มากกว่า 1 ไบต์ต่อตัวอักษร
- `hashPassword(password)` สร้าง bcrypt hash แบบ asynchronous โดยใช้ salt rounds 12; อย่าบันทึกหรือส่ง password ดิบกลับไปให้ผู้เรียก
- `verifyPassword(password, hash)` เปรียบเทียบ password กับ hash แบบ asynchronous
- `createAccessToken(userId)` ออก JWT แบบ HS256 โดยมี `userId` และเวลาหมดอายุ `exp` ตาม `JWT_EXPIRES_IN`
- `verifyAccessToken(token)` ตรวจลายเซ็น อัลกอริทึม วันหมดอายุ และ claims ที่จำเป็น; คืน `{ userId, exp }` เมื่อใช้ได้ หรือ `null` เมื่อ token ใช้ไม่ได้

Auth เก็บ `userId`, email, bcrypt hash และสถานะบัญชีในไฟล์ JSON ของตัวเอง ค่าเริ่มต้นคือ `./data/users.json` กำหนด path อื่นได้ด้วย `AUTH_DATA_FILE`; Profile Service เป็นเจ้าของชื่อและข้อมูลวิชา และเก็บไว้ในไฟล์ของ service นั้นเอง

บริการยืนยันตัวตนสำหรับ Study Buddy

## เริ่มใช้งานในเครื่อง

1. ติดตั้ง Node.js และ npm
2. เปิด terminal ในโฟลเดอร์ `services/auth-service`
3. ติดตั้ง dependencies ด้วย `npm install`
4. คัดลอก `.env.example` เป็น `.env` แล้วกำหนด `AUTH_TOKEN_SECRET` และ `PROFILE_SERVICE_TOKEN` ให้ตรงกับ Profile Service; ไม่ต้องใช้ MongoDB Atlas
5. เริ่มบริการด้วย `npm run dev` หรือ `npm start`
6. เปิด `http://localhost:3001/health` ควรได้รับ JSON ที่มี `"status":"ok"`

ห้าม commit ไฟล์ `.env` หรือ secret จริงขึ้น GitHub

## รันด้วย Docker

จาก root ของ repository ให้ build image ด้วย `docker build -f services/auth-service/Dockerfile -t study-buddy-auth-service:local services/auth-service` แล้วรันด้วย `docker run --rm --env-file services/auth-service/.env --mount type=volume,source=study-buddy-auth-data,target=/app/data -p 3001:3001 study-buddy-auth-service:local`. Volume ชื่อ `study-buddy-auth-data` เก็บ `users.json` แยกจาก image เพื่อให้ข้อมูลอยู่ต่อเมื่อเปลี่ยน container; ใช้ volume แยกสำหรับแต่ละ service

## ตรวจสอบข้อมูลสมัครสมาชิก

ฟังก์ชันตรวจข้อมูลพื้นฐานที่ใช้ตอนสมัครสมาชิก:

- อีเมลต้องมีรูปแบบพื้นฐานที่ถูกต้อง
- รหัสผ่านต้องยาวอย่างน้อย 8 ตัว มีตัวพิมพ์ใหญ่ มีเครื่องหมายหรือสัญลักษณ์ และไม่เกิน 72 ไบต์เมื่อเข้ารหัส UTF-8 (ช่องว่างไม่นับเป็นสัญลักษณ์)
- ชื่อต้องมีข้อความหลังตัดช่องว่างหัวท้าย

รัน unit tests ด้วยคำสั่ง `npm test` จากโฟลเดอร์ `services/auth-service`

## GitHub Actions CI

ไฟล์ [auth-service.yml](../../.github/workflows/auth-service.yml) รันเมื่อมีการ push, เปิด PR ที่แก้ Auth Service หรือสั่งรันเองจากแท็บ Actions โดยตรวจ syntax ของ JavaScript, รัน `npm test` และ build Docker image บน Node.js 22; workflow ไม่ publish image และไม่ใช้ production secrets

## Environment variables

| ตัวแปร | จำเป็น | ความหมาย |
| --- | --- | --- |
| `PORT` | ไม่ (ค่าเริ่มต้น `3001`) | port ที่ Auth Service ใช้รับ request |
| `AUTH_TOKEN_SECRET` | ใช่ | secret สำหรับลงลายเซ็น JWT; ต้องยาวอย่างน้อย 32 ตัวอักษร |
| `JWT_EXPIRES_IN` | ไม่ (ค่าเริ่มต้น `1h`) | อายุของ access token |
| `AUTH_DATA_FILE` | ไม่ (ค่าเริ่มต้น `./data/users.json`) | path ของไฟล์ JSON ที่เก็บบัญชีผู้ใช้; ห้าม commit ไฟล์ข้อมูลจริง |
| `PROFILE_URL` | ใช่สำหรับสมัคร | URL ของ Profile Service เช่น `http://localhost:3002` |
| `PROFILE_SERVICE_TOKEN` | ใช่สำหรับสมัคร | token ภายในที่ส่งใน `X-Service-Token` ไปยัง Profile Service |

API ที่มี: `GET /health`, `POST /api/register`, `POST /api/login` และ `GET /api/me`. Service โหลดไฟล์ JSON ก่อนเริ่มรับ request; สมัครสมาชิกเรียก Profile Service เพื่อสร้าง profile และบัญชีจะเปิดให้ login ได้หลัง Profile Service สำเร็จ. ถ้าใช้ container ต้อง mount persistent volume ที่ `/app/data`; การเก็บไฟล์ใน container layer อย่างเดียวไม่รับประกันว่าข้อมูลจะอยู่ต่อเมื่อเปลี่ยน container
