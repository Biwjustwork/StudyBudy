# Group Service Test Specification

เอกสารนี้เป็นรายการทดสอบของ Study Group / Session Service (สมาชิก 3 — บิว) ใช้ร่วมกับ `API_CONTRACT.md` ในโฟลเดอร์เดียวกัน สไตล์ตารางตาม `TEST_SPEC.md` กลางของ Auth (branch `feature/auth-service`) เจ้าของ service ดูแล unit tests ทั้งหมด ส่วนนิค (สมาชิก 4) ใช้ตารางนี้ตรวจฝั่งเรียก

## 1. ขอบเขตและเกณฑ์ผ่าน

- ครอบคลุมสร้าง/ค้นหา/อ่าน/แก้กลุ่ม และ internal endpoint ที่ Membership เรียก
- Unit tests ปัจจุบัน 18 กรณีใน `src/app.test.ts` ต้องผ่านทั้งหมด (`npm ci && npm run typecheck && npm run build && npm test`, workdir `group-service/`)
- ผลจริงต้องตรง expected result และไม่มี secret ใน log/response
- PR ที่เปลี่ยน API ต้องรัน consumer tests ฝั่ง Membership ด้วย

## 2. Unit tests (เจ้าของ: บิว, รันด้วย `npm test`)

| ID | สถานการณ์และข้อมูลทดสอบ | ผลที่คาดหวัง |
|---|---|---|
| GROUP-U01 | `GET /health` ไม่ใช้ token | `200 { status: "ok", service: "group" }` |
| GROUP-U02 | เรียก `/api/*` ไม่ส่ง token | `401 { error, message }` |
| GROUP-U03 | สร้างกลุ่มข้อมูลครบ (`subject/topic/startsAt+07:00/maxMembers/location`) | `201`; `ownerId`/`members` มาจาก token |
| GROUP-U04 | ขาด field / `startsAt` ไม่ใช่ ISO / `maxMembers` เป็น `0`/`2.5` | `400`; ไม่สร้างกลุ่ม |
| GROUP-U05 | `startsAt` ไม่มี timezone (`2026-11-01T10:00:00`) | `400` |
| GROUP-U06 | ส่ง field เก่า `datetime` โดยไม่มี `startsAt` | `400` |
| GROUP-U07 | ค้นหา `subject=CALCULUS` + `openOnly=true` เมื่อมีกลุ่ม open/full/closed/ต่างวิชา | ได้เฉพาะกลุ่มตรงวิชาที่ยังเปิดและไม่เต็ม; ทั้งหมดเรียงตาม `startsAt` |
| GROUP-U08 | อ่านกลุ่มด้วย id / id ที่ไม่มี | `200` ตรง id / `404` |
| GROUP-U09 | เจ้าของ PATCH `topic`+`location` / ผู้อื่น PATCH | `200` ค่าตามที่แก้ / `403` |
| GROUP-U10 | PATCH ลด `maxMembers` ต่ำกว่าสมาชิกปัจจุบัน / PATCH `startsAt` เป็น `"tomorrow"` | `400` ทั้งคู่ |
| GROUP-U11 | internal เพิ่มสมาชิกครั้งเดียว แล้วเพิ่มซ้ำ แล้วเพิ่มคนใหม่ตอนเต็ม | `200` / `409` / `422`; สมาชิกไม่เกิน `maxMembers` |
| GROUP-U12 | เรียก internal route ด้วย Bearer อย่างเดียว (ไม่มี `x-service-token`) | `401`; internal route ไม่ผ่าน Bearer middleware ไม่ว่ากรณีใด |
| GROUP-U13 | internal ไม่ส่ง/ส่งว่าง/ส่งผิด/เอา Auth JWT มาใส่ `x-service-token` | `401` ทั้งหมด |
| GROUP-U14 | internal `userId` ว่าง / กลุ่มไม่มี / กลุ่มปิดรับ | `400` / `404` / `422` |
| GROUP-U15 | `startsAt` อดีต (`2020-01-01T00:00:00Z`) | `400` |
| GROUP-U16 | persist ล้มเหลว (disk ใช้ไม่ได้) แล้วเขียนครั้งถัดไป | ไม่พังถาวร บันทึกครั้งถัดไปสำเร็จ |

## 3. Integration cases ฝั่งเรียก (เจ้าของร่วม: บิว + นิค)

| ID | ระดับ | ผู้รับผิดชอบหลัก | สถานการณ์และข้อมูลทดสอบ | ผลที่คาดหวัง |
|---|---|---|---|---|
| GROUP-I01 | Integration | บิว + นิค | นิคเรียก `POST /internal/groups/:id/members` ด้วย `X-Service-Token` ถูกต้อง | `200`; `members` เพิ่ม 1 คน |
| GROUP-I02 | Integration | บิว + นิค | นิคเรียกโดยไม่ส่ง/ส่ง token ผิด | `401`; สมาชิกไม่เปลี่ยน |
| GROUP-I03 | Integration | บิว + นิค | นิคอนุมัติ 2 คำขอพร้อมกันที่แย่งที่นั่งสุดท้าย | หนึ่งได้ `200` อีกหนึ่งได้ `422`; สมาชิกไม่เกิน `maxMembers` |
| GROUP-I04 | Integration | บิว + นิค | นิค retry คำขอที่อนุมัติแล้ว (timeout ฝั่งนิค) | `409`; สมาชิกไม่เพิ่มซ้ำ |
| GROUP-I05 | Integration | บิว + นิค | นิคขอเพิ่มสมาชิกให้กลุ่มเต็ม/ปิดรับ | `422`; สถานะคำขอฝั่งนิคไม่เป็น approved |
| GROUP-I06 | Integration | บิว + นิค | นิคอ่าน `GET /api/groups/:id` ด้วย Bearer เพื่อเช็ก owner/ที่นั่ง | `200` ได้ `ownerId`/`members`/`maxMembers`/`isOpen` ตรงจริง |

## 4. หมายเหตุให้ reviewer (นิค/ทีม)

1. internal route วางก่อน Bearer middleware และตรวจเฉพาะ `x-service-token` — `403` มีเฉพาะ PATCH โดยผู้ไม่ใช่เจ้าของเท่านั้น
2. `data/groups.json` เป็น dev-only (gitignored) ข้อมูลเก่าที่ใช้ field `datetime` จะเปิดไม่ผ่าน validation ให้ลบไฟล์แล้วรันใหม่
3. ในผล CI หรือรายงานทดสอบ ให้บันทึก Test ID, commit/branch, environment, ผล `PASS/FAIL`, expected/actual และลิงก์ log ห้ามบันทึก token หรือค่าจริงของ secrets
