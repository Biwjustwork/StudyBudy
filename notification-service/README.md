# Study Buddy Notification Service

บริการของสมาชิก 5 รับผลคำขอจาก Membership แสดงการแจ้งเตือนของผู้ใช้ และทำเครื่องหมายอ่านแล้ว ใช้รูปแบบเดียวกับ Profile/Group/Membership: Node.js 22, TypeScript ESM, Express 5, JSON store และ `node:test` ผ่าน `tsx`.

## โครงสร้าง

```text
notification-service/
  src/app.ts                 HTTP, authentication, validation, error responses
  src/server.ts              environment และการเปิด JSON store
  src/notification-store.ts  JSON persistence, ownership และ retry deduplication
  src/app.test.ts            API tests กับ HTTP server และไฟล์ชั่วคราวจริง
  public/notifications.html หน้าแจ้งเตือน
  public/notifications.js   เรียก API และแสดงข้อความแบบ text
  public/notifications.css  รูปแบบหน้าเว็บ
  Dockerfile                Node 22 multi-stage build
```

## เริ่มใช้งาน

ต้องใช้ Node.js 22.9 ขึ้นไป คำสั่งจากโฟลเดอร์ `notification-service`:

```powershell
Copy-Item .env.example .env
npm ci
npm run typecheck
npm run build
npm test
npm run dev
```

ตั้ง `AUTH_TOKEN_SECRET` ให้ตรงกับ Auth และ `NOTIFY_SERVICE_TOKEN` ให้ตรงกับค่าที่ Membership ใช้ส่ง `X-Service-Token`. คำสั่ง `dev`/`start` โหลด `.env` เมื่อมีไฟล์ หรือใช้ environment ที่ส่งจาก Docker/CI ได้โดยตรง ห้าม commit `.env` หรือข้อมูลจริง.

เปิด `http://localhost:3005/health` และ `http://localhost:3005/notifications.html`. หน้าเว็บใช้ API origin เดียวกับ service เป็นค่าเริ่มต้น สามารถเปลี่ยน API URL ในหน้าเว็บได้ วาง access token จาก Login เพื่อโหลดข้อมูล Token เก็บเฉพาะในหน้านี้ ไม่ใช้ localStorage/sessionStorage. ปุ่มล้างการเชื่อมต่อจะล้าง token และรายการที่แสดง ไม่ใช้ internal service token ใน browser.

## Environment

| ชื่อ | ค่าเริ่มต้น/เงื่อนไข |
|---|---|
| `PORT` | `3005`; integer 1–65535 |
| `AUTH_TOKEN_SECRET` | จำเป็น อย่างน้อย 32 ตัวอักษร; ค่าเดียวกับ Auth |
| `NOTIFY_SERVICE_TOKEN` | จำเป็น ไม่ว่าง; ค่าร่วมกับ Membership สำหรับ internal API |
| `NOTIFICATION_DATA_FILE` | `./data/notifications.json`; path ต้องไม่ว่าง |

## API

สัญญากลางอยู่ใน `API_CONTRACT.md` ที่ root ของ repo; ส่วนต่อเชื่อมและการส่งต่องานอยู่ใน `HANDOFF.md`.

| Method | Path | Authentication / ผลลัพธ์ |
|---|---|---|
| GET | `/health` | public; `200 {status:"ok",service:"notification"}` |
| POST | `/internal/notifications` | `X-Service-Token`; สร้างครั้งแรก `201`, retry เดิม `200` |
| GET | `/api/notifications` | Bearer JWT; array เฉพาะ token user ใหม่ไปเก่า |
| PATCH | `/api/notifications/:id/read` | Bearer JWT; ของตน `200`, ของผู้อื่น `403`, ไม่มี `404` |

JWT ต้องเป็น HS256 มี `userId` string ที่ไม่ว่างและ `exp` ที่ยังไม่หมดอายุ. ไม่รับตัวตนจาก body/query ของ public API. Errors ใช้ `{ "error": "error_code", "message": "description" }`; malformed JSON `400`, body เกิน 32 KiB `413`, token หาย/ผิด `401`, ข้อมูล event ผิด `400`, event key เดิมแต่ message ต่าง `409`, ปัญหาเขียนไฟล์ `500` โดยไม่เปิดเผยข้อมูลลับ.

ตัวอย่าง event ส่งจาก Membership หลังบันทึกผลตัดสินสำเร็จ:

```json
{
  "userId": "user-123",
  "type": "request_approved",
  "message": "คำขอเข้ากลุ่มได้รับอนุมัติ",
  "relatedId": "request-123"
}
```

`type` รับ `request_approved` หรือ `request_rejected`. ทุก field ต้องเป็น string ไม่ว่างหลัง trim; message ไม่เกิน 2,000 ตัวอักษร. Response:

```json
{
  "id": "generated-uuid",
  "userId": "user-123",
  "type": "request_approved",
  "message": "คำขอเข้ากลุ่มได้รับอนุมัติ",
  "relatedId": "request-123",
  "read": false,
  "createdAt": "2026-10-15T10:00:00.000Z",
  "readAt": null
}
```

เมื่อ mark-read สำเร็จ `read` เป็น `true` และ `readAt` เป็น timestamp. Mark ซ้ำคืนรายการเดิมและไม่เปลี่ยน `readAt`. รายการที่สร้างใน millisecond เดียวกันเรียงตามลำดับรับ event โดยรายการหลังอยู่ก่อน.

## Retry และข้อมูล

Event key คือ `(userId, relatedId, type)`; retry payload เดิมคืน notification เดิมด้วย `200` รวมถึงสถานะอ่านแล้ว ห้ามเปลี่ยน message ระหว่าง retry; หากต่างจะตอบ `409` และไม่เขียนทับ. การส่งซ้ำพร้อมกันถูกจัดคิวและบันทึกเพียงรายการเดียว.

JSON เป็น array แยกของ service นี้เท่านั้น เขียนไฟล์ชั่วคราวแล้ว rename โดยจัดคิวการเขียน และเผยแพร่ state ใน memory หลังเขียนสำเร็จ. เขียนไม่สำเร็จจะไม่แสดงข้อมูลที่ไม่ได้บันทึก และ retry ได้. ไฟล์เสียหรือมี ID/event ซ้ำทำให้ startup ล้มเหลวโดยไม่ล้างข้อมูลเดิม. ใช้ได้เพียงหนึ่ง process/replica ต่อไฟล์ข้อมูล ตามแผนทีม.

## Docker

จาก root ของ repo:

```powershell
docker build -f notification-service/Dockerfile -t study-buddy-notification:local notification-service
docker run --rm --name study-buddy-notification --env-file notification-service/.env --mount type=volume,source=study-buddy-notification-data,target=/app/data -p 3005:3005 study-buddy-notification:local
```

Image รันด้วย user `node`, มี `/health` healthcheck และ copy เฉพาะ compiled code, public files และ production dependencies. ไม่ copy `.env`, ไฟล์ข้อมูลจริง หรือ tests เข้า final image. Named volume `/app/data` เก็บ JSON ต่อได้หลังสร้าง container ใหม่. หากใช้ bind mount ต้องให้ user `node` เขียน directory นั้นได้.

ทีมตั้งชื่อ image/namespace/release tag และ push Docker Hub พร้อม service อื่นภายหลัง; workflow นี้ตรวจและ build image เท่านั้น.

## CI และขอบเขตการตรวจ

`.github/workflows/notification-service.yml` ใช้รูปแบบเดียวกับ Profile CI: push/PR ที่เกี่ยวข้องและ manual trigger → Node 22 → `npm ci` → typecheck → build → tests → Docker build. ไม่ต้องใช้ Docker Hub credentials ใน workflow นี้.

Tests ตรวจ API และ JSON ของ Notification โดยใช้ JWT สำหรับทดสอบ ไม่ต้องเปิด Auth หรือ Membership. ไม่ใช่ผล E2E ของทั้งระบบหรือการตรวจ Docker volume จริง. ทีมรวมระบบก่อน แล้วสมาชิก 5 จึงทดสอบ `FLOW-01`, `DEPLOY-01` และ `DATA-01` บน container ตามแผนทีม.
