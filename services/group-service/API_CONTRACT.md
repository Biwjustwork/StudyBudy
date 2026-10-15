# Group Service API Contract

สถานะเอกสาร: ข้อตกลงของ Study Group / Session Service (สมาชิก 3 — บิว) สำหรับให้ consumer โดยเฉพาะ Membership Service (สมาชิก 4 — นิค) ตรวจก่อนเชื่อมหรือเปิด PR ที่เปลี่ยน API ฝั่งกลุ่ม สไตล์และหมวดตาม `API_CONTRACT.md` กลางของ Auth (branch `feature/auth-service`)

## 1. ภาพรวมระบบ

Group Service อยู่ใน repository เดียวกับ service อื่น แยกโฟลเดอร์และขอบเขตชัดเจน:

| Service | โฟลเดอร์ | Local port | หน้าที่ |
|---|---|---:|---|
| Auth | `auth-service/` | 3001 | สมัครสมาชิก เข้าสู่ระบบ และออก/ตรวจ token |
| Profile & Subject | `services/profile-service/` | 3002 | ข้อมูลโปรไฟล์และวิชาที่สนใจ |
| Study Group / Session | `services/group-service/` | 3003 | สร้าง ค้นหา และจัดการกลุ่มอ่าน (เอกสารนี้) |
| Membership | `membership-service/` | 3004 | คำขอเข้าร่วมและการตัดสินใจของเจ้าของกลุ่ม |
| Notification | `notification-service/` | 3005 | แจ้งสถานะคำขอและการเปลี่ยนแปลง |

ทุก service มี `GET /health` คืน `200` และ JSON `{ "status": "ok", "service": "group" }` (ของ Group Service ไม่ต้องใช้ token)

## 2. ข้อตกลง HTTP ร่วม (เหมือนสัญญากลาง)

- API ใช้ HTTP และ JSON; URL เรียก service อื่นอ่านจาก environment variable (`GROUP_URL` ฝั่ง Membership ชี้ `http://localhost:3003`) ห้ามฝัง URL ปลายทาง production ใน source code
- คำขอที่มี body ส่ง `Content-Type: application/json`
- ฝั่งผู้ใช้ (`/api/*`) ยืนยันตัวตนด้วย `Authorization: Bearer <token>` ห้ามรับ `userId`/`ownerId` จาก body เพื่อตัดสินตัวตน ให้ใช้ `userId` จาก token เท่านั้น
- JWT ใช้ HS256 และต้องมี `userId` เป็น string; Group Service ใช้ `AUTH_TOKEN_SECRET` ค่าเดียวกับ Auth จาก environment ห้าม commit secret
- ฝั่ง service-to-service (`/internal/*`) ตรวจ `X-Service-Token` เทียบ `SERVICE_TOKEN` จาก environment ไม่ใช้ Bearer token
- รูปแบบ error กลางคือ `{ "error": "error_code", "message": "คำอธิบาย" }`
- สถานะหลัก: `400` ข้อมูลหรือ JSON ไม่ถูกต้อง, `401` ไม่มี/ใช้ token ไม่ได้, `403` ไม่มีสิทธิ์, `404` ไม่พบข้อมูล, `409` สมาชิกซ้ำ, `422` ขัดกติกาธุรกิจ (กลุ่มเต็ม/ปิดรับ), `500` ข้อผิดพลาดที่ไม่คาดคิด

## 3. Group object

```json
{ "id": "group-123", "subject": "Calculus", "topic": "Limits", "startsAt": "2026-11-01T10:00:00+07:00", "maxMembers": 5, "location": "Library 3F", "ownerId": "user-1", "members": ["user-1"], "isOpen": true, "createdAt": "2026-10-01T01:00:00Z", "updatedAt": "2026-10-01T01:00:00Z" }
```

ตัวตนของเจ้าของกลุ่ม (`ownerId`, สมาชิกตั้งต้น) มาจาก JWT เท่านั้น

## 4. Endpoints ฝั่งผู้ใช้

### `POST /api/groups`

สร้างกลุ่ม ต้องมี Bearer token รับ `subject`, `topic`, `startsAt`, `maxMembers`, `location` (`isOpen` ถ้ามีต้องเป็น boolean, ไม่ส่งมาคือ `true`)

Request:

```json
{ "subject": "Calculus", "topic": "Limits", "startsAt": "2026-11-01T10:00:00+07:00", "maxMembers": 5, "location": "Library 3F" }
```

เงื่อนไข: `subject`/`topic`/`location` ต้องไม่ว่างหลัง trim; `startsAt` ต้องเป็น ISO 8601 พร้อม timezone (`Z` หรือ `±hhmm`/`±hh:mm`) และเป็นเวลาในอนาคต; `maxMembers` ต้องเป็นจำนวนเต็มบวก

สำเร็จ `201` คืน group object ข้อมูลไม่ผ่านตอบ `400`

### `GET /api/groups?subject=Calculus&openOnly=true`

ต้องมี Bearer token ค้นหาแบบไม่แยกตัวพิมพ์เล็ก/ใหญ่ (trim ก่อนเทียบ) ไม่ส่ง `subject` หรือส่งค่าว่างมาคือทุกกลุ่ม `openOnly=true` เก็บเฉพาะกลุ่มที่ `isOpen` และยังมีที่นั่งว่าง ผลเรียงตาม `startsAt` จากใกล้ไปไกล สำเร็จ `200` คืน array ไม่พบคืน `[]`

### `GET /api/groups/:id`

ต้องมี Bearer token สำเร็จ `200` คืน group object กลุ่มไม่มีตอบ `404`

### `PATCH /api/groups/:id`

เจ้าของกลุ่มเท่านั้น แก้ได้เฉพาะ `subject`/`topic`/`startsAt`/`location`/`maxMembers`/`isOpen` (ต้องส่งอย่างน้อย 1 field, ห้ามแตะ `id`/`ownerId`/`members`/`createdAt`) `maxMembers` ห้ามลดต่ำกว่าจำนวนสมาชิกปัจจุบัน สำเร็จ `200` คืน group ที่แก้แล้ว ผู้ไม่ใช้เจ้าของตอบ `403` กลุ่มไม่มีตอบ `404` ข้อมูลผิดตอบ `400`

## 5. Endpoint ฝั่ง Membership (สำหรับนิค)

### `POST /internal/groups/:id/members` — สำหรับ Membership Service เท่านั้น

เพิ่มสมาชิกแบบ atomic (ตรวจ-เช็ก-เพิ่มในจังหวะเดียว ไม่มี `await` คั่น) ตรวจ `X-Service-Token` เทียบ `SERVICE_TOKEN` ไม่ใช้ Bearer token

Request:

```json
{ "userId": "user-2" }
```

```sh
curl -X POST localhost:3003/internal/groups/<groupId>/members \
  -H "X-Service-Token: $SERVICE_TOKEN" -H "Content-Type: application/json" \
  -d '{"userId":"user-2"}'
```

| ผล | Group API ตอบ | นิคต้องตอบคำขอด้วย |
|---|---|---|
| จองที่นั่งสำเร็จ | `200` + group object ใหม่ | approve สำเร็จ |
| `userId` เป็นสมาชิกแล้ว | `409 { "error": "conflict" }` | `409` (คำขอซ้ำ) |
| กลุ่มเต็ม (`members.length >= maxMembers`) หรือปิด (`isOpen: false`) | `422 { "error": "capacity_exceeded" }` | `422` (กลุ่มเต็ม) |
| token ภายในหาย/ผิด | `401 { "error": "unauthorized" }` | `503` หรือ retry ภายใน (ห้ามเปลี่ยนสถานะคำขอ) |
| กลุ่มไม่มี | `404 { "error": "not_found" }` | `404` |
| `userId` ว่าง | `400 { "error": "validation_error" }` | `400` |

อนุมัติพร้อมกัน 2 คำขอที่แย่งที่นั่งสุดท้ายจะได้ `200` หนึ่งคำขอและ `422` หนึ่งคำขอเสมอ สมาชิกไม่มีวันเกิน `maxMembers`

## 6. สิ่งที่เปลี่ยนจากเดิม (นิคต้องแก้)

| เดิม | ใหม่ |
|---|---|
| field `datetime` | field `startsAt` (ต้องมี timezone + อนาคต) |
| `POST /api/groups/:id/members` ด้วย owner Bearer token | `POST /internal/groups/:id/members` ด้วย `X-Service-Token` อย่างเดียว (route เก่าถูกลบแล้ว เรียกจะได้ `404`) |
| `group-client.ts` ส่ง `Authorization: Bearer <ownerToken>` | ส่ง `X-Service-Token: <SERVICE_TOKEN>` แทน |
| `.env.example` ไม่มี service token | เพิ่ม `SERVICE_TOKEN` ตั้งค่าจริงผ่าน environment/ช่องทางปลอดภัยเท่านั้น |

`GET /api/groups/:id` (นิคใช้เช็กกลุ่ม/owner) ไม่เปลี่ยน ยังใช้ Bearer token เหมือนเดิม

## 7. Environment variables

| ชื่อ | ตัวอย่าง | หมายเหตุ |
|---|---|---|
| `PORT` | `3003` | default `3003` |
| `AUTH_TOKEN_SECRET` | (secret จริง) | ค่าเดียวกับ Auth Service |
| `SERVICE_TOKEN` | (secret จริง) | ค่าร่วมที่ตกลงกับ Membership Service |
| `GROUP_DATA_FILE` | `./data/groups.json` | default นี้ ไฟล์ข้อมูลไม่ commit ลง Git |

## 8. การเปลี่ยนสัญญา

ผู้แก้ API ต้องปรับเอกสารนี้และเพิ่ม/แก้ test ใน PR เดียวกับโค้ด ระบุ consumer ที่ได้รับผลกระทบ (นิค) และแจ้งก่อน merge ห้ามเปลี่ยนชื่อ field, status code หรือสิทธิ์แบบเงียบ ๆ
