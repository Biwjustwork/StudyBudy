# Study Buddy API Contract

สถานะเอกสาร: ข้อตกลงสำหรับใช้พัฒนาและเชื่อม service ใน repo กลางของทีม ให้เจ้าของ service ตรวจ contract ก่อนเปิด PR ที่เปลี่ยน API

## 1. ภาพรวมระบบ

ทุก service อยู่ใน repository เดียว แต่แยกโฟลเดอร์และมีขอบเขตหน้าที่ชัดเจน:

| Service | โฟลเดอร์ | Local port | หน้าที่ |
|---|---|---:|---|
| Auth | `services/auth-service/` | 3001 | สมัครสมาชิก เข้าสู่ระบบ และออก/ตรวจ token |
| Profile & Subject | `services/profile-service/` | 3002 | ข้อมูลโปรไฟล์และวิชาที่สนใจ |
| Study Group / Session | `services/group-service/` | 3003 | สร้าง ค้นหา และจัดการกลุ่มอ่าน |
| Membership | `services/membership-service/` | 3004 | คำขอเข้าร่วมและการตัดสินใจของเจ้าของกลุ่ม |
| Notification | `services/notification-service/` | 3005 | แจ้งสถานะคำขอและการเปลี่ยนแปลง |

ทุก service มี `GET /health` สำหรับตรวจสถานะ โดยคืน `200` และ JSON ที่มี `status: "ok"` กับชื่อ service

แต่ละ service เก็บข้อมูลของตนเองในไฟล์ JSON แยกกัน ไม่ใช้ไฟล์ร่วมกันและไม่ใช้ MongoDB ในแผนนี้: Auth ใช้ `AUTH_DATA_FILE` (ค่าเริ่มต้น `./data/users.json`), Profile ใช้ `PROFILE_DATA_FILE` (`./data/profiles.json`), Group ใช้ `GROUP_DATA_FILE` (`./data/groups.json`), Membership ใช้ `MEMBERSHIP_DATA_FILE` (`./data/requests.json`) และ Notification ใช้ `NOTIFICATION_DATA_FILE` (`./data/notifications.json`). ห้ามใส่ไฟล์ข้อมูลจริงใน image หรือ commit เข้า Git

เมื่อรันด้วย Docker ให้ mount persistent volume แยกของแต่ละ service ไปยังโฟลเดอร์ที่เก็บไฟล์ข้อมูล เพื่อให้ข้อมูลอยู่ต่อเมื่อเปลี่ยน container; แผนนี้สมมติให้ service ละหนึ่ง replica เพราะไฟล์ JSON ไม่มีการล็อกข้ามหลาย container

## 2. ข้อตกลง HTTP ร่วม

- API ใช้ HTTP และ JSON; URL สำหรับเรียกจาก service อื่นอ่านจาก environment variable เช่น `AUTH_URL`, `PROFILE_URL`, `GROUP_URL`, `MEMBER_URL`, `NOTIFY_URL` ห้ามฝัง URL ปลายทาง production ไว้ใน source code
- คำขอที่มี body ส่ง `Content-Type: application/json`; คำตอบเป็น JSON ยกเว้น `204 No Content`
- การยืนยันตัวตนใช้ `Authorization: Bearer <token>` ห้ามรับ `userId` หรือ `ownerId` จาก body เพื่อใช้ตัดสินตัวตน ให้ใช้ `userId` จาก token เท่านั้น
- JWT ใช้ HS256 และต้องมี `userId` เป็น string และ `exp`; ทุก service ที่ตรวจ token ใช้ `AUTH_TOKEN_SECRET` ค่าเดียวกันจาก environment ห้าม commit secret
- รูปแบบ error กลางคือ `{ "error": "error_code", "message": "คำอธิบาย" }`
- สถานะหลัก: `400` ข้อมูลหรือ JSON ไม่ถูกต้อง, `401` ไม่มี/ใช้ token ไม่ได้, `403` ไม่มีสิทธิ์, `404` ไม่พบข้อมูล, `409` ข้อมูลซ้ำหรือสถานะขัดกัน, `422` ขัดกติกาธุรกิจ เช่น กลุ่มเต็ม, `500` ข้อผิดพลาดที่ไม่คาดคิด

## 3. Auth Service

### `POST /api/register`

สมัครบัญชี โดยใช้อีเมลเป็น username

Request:

```json
{ "email": "student@example.com", "password": "StudyBuddy!1", "name": "Aun" }
```

เงื่อนไข: email ต้องอยู่ในรูปแบบที่ถูกต้องและไม่ซ้ำ; password ยาวอย่างน้อย 8 ตัวและมีตัวพิมพ์ใหญ่กับอักขระพิเศษ และต้องไม่เกิน 72 ไบต์เมื่อเข้ารหัส UTF-8; name ต้องไม่เป็นค่าว่าง; เก็บ password ด้วย bcrypt เท่านั้น

ข้อจำกัด 72 ไบต์เป็นขนาดข้อมูลจริงหลังเข้ารหัส UTF-8 ไม่ใช่จำนวนตัวอักษรเสมอไป (ตัวอักษรภาษาไทยอาจใช้หลายไบต์) ระบบต้องปฏิเสธ password ที่เกินขนาดนี้ก่อน hash เพื่อไม่ให้ bcrypt มองข้ามส่วนท้ายของรหัสผ่าน ใช้ bcrypt salt rounds 12

สำเร็จ `201`:

```json
{ "userId": "user-123", "email": "student@example.com" }
```

ข้อมูลไม่ผ่านตอบ `400`, email ซ้ำตอบ `409` Auth เก็บ `userId`, email, bcrypt hash และสถานะบัญชีในไฟล์ JSON ที่กำหนดด้วย `AUTH_DATA_FILE`; ห้ามเก็บ password แบบดิบ Auth สร้าง profile เริ่มต้นผ่าน `POST /internal/users` ของ Profile Service ก่อนตอบสำเร็จ บัญชีระหว่างรอ profile มีสถานะ `pending_profile` และ login ไม่ได้; หาก Profile Service ใช้งานไม่ได้ให้ตอบ `503` โดยคงบัญชี pending ไว้เพื่อให้สมัครซ้ำด้วย email, name และ password เดิม แล้วลองสร้าง profile ด้วย `userId` เดิมอีกครั้ง เมื่อสำเร็จจึงเปลี่ยนเป็น `active`

### `POST /api/login`

Request: `{ "email": "student@example.com", "password": "StudyBuddy!1" }`

สำเร็จ `200`: `{ "userId": "user-123", "token": "<jwt>" }`. ข้อมูลผิดหรือไม่พบบัญชีให้ตอบ `401` ด้วยข้อความทั่วไปที่ไม่เปิดเผยว่ามีอีเมลนั้นอยู่หรือไม่

### `GET /api/me`

ต้องมี Bearer token; สำเร็จ `200`: `{ "userId": "user-123", "email": "student@example.com" }`. token หาย ผิดรูปแบบ หมดอายุ หรือลายเซ็นไม่ถูกต้องตอบ `401`

## 4. Profile & Subject Service

สัญญานี้คงชื่อ `id` และ `name` ที่ Profile Service ใช้อยู่ โดย `id` ต้องมีค่าเดียวกับ `userId` ใน JWT และ Auth response

### `POST /internal/users` — สำหรับ Auth Service เท่านั้น

สร้าง profile หลังสมัครสมาชิก; ตรวจ `X-Service-Token` กับ `PROFILE_SERVICE_TOKEN` จาก environment

Profile Service เป็นเจ้าของข้อมูลชื่อและวิชาที่สนใจ และเก็บข้อมูลในไฟล์ JSON ของตนเองตาม `PROFILE_DATA_FILE`; Auth ส่งข้อมูลเริ่มต้นผ่าน endpoint นี้ ไม่เขียนไฟล์ของ Profile โดยตรง

Request: `{ "id": "user-123", "name": "Aun", "email": "student@example.com" }`

สำเร็จครั้งแรก `201`: `{ "id": "user-123", "name": "Aun", "email": "student@example.com", "subjects": [] }`. หากมี ID เดิมและ `name`/`email` ตรงกัน ให้คืน profile เดิมด้วย `200` เพื่อรองรับการ retry จาก Auth โดยไม่สร้างซ้ำ; ID เดิมแต่ข้อมูลต่างกันตอบ `409`; ไม่มีหรือ token ภายในไม่ถูกต้องตอบ `401`

### `POST /internal/users/lookup` — สำหรับ Membership Service เท่านั้น

ใช้ `X-Service-Token` ค่าเดียวกับ `PROFILE_SERVICE_TOKEN`; Request `{ "ids": ["user-123"] }`; `ids` เป็น array ของ string ไม่ว่างไม่เกิน 500 รายการ สำเร็จ `200` คืนเฉพาะ profile ที่พบในรูป `{ "id", "name", "email" }` โดยไม่คืน subjects; token หาย/ผิดตอบ `401`, body ไม่ถูกต้องตอบ `400`. Membership เรียกหลังยืนยันแล้วว่าผู้เรียกเป็นเจ้าของกลุ่ม เพื่อแสดงข้อมูลผู้ขอให้เจ้าของกลุ่มเท่านั้น

### `POST /internal/users/display-names` — สำหรับ Membership Service เท่านั้น

ใช้ `X-Service-Token` ค่าเดียวกับ `PROFILE_SERVICE_TOKEN`; Request `{ "ids": ["user-123"] }`; รับ ID ได้ไม่เกิน 500 รายการและต้องเป็น string ไม่ว่าง; สำเร็จ `200` คืนเฉพาะ `{ "id", "name" }` โดยไม่คืนอีเมลหรือวิชาที่สนใจ; token หาย/ผิดตอบ `401`, body ไม่ถูกต้องตอบ `400`. Membership ใช้หลังอ่านสมาชิกจาก Group Service เพื่อประกอบรายชื่อสมาชิกในกลุ่ม

### `GET /api/users/:id`

ต้องมี Bearer token และ `:id` ต้องตรงกับ `userId` ใน token; สำเร็จ `200`:

```json
{ "id": "user-123", "name": "Aun", "email": "student@example.com", "subjects": ["ชีววิทยา"] }
```

email แสดงเมื่อมีข้อมูลและอาจไม่มีใน profile เก่าที่ยังไม่ถูกเติม; ไม่ตรงเจ้าของตอบ `403`; ไม่มี profile ตอบ `404`

### `PUT /api/users/:id`

แก้รายการวิชาของตนเองเท่านั้น Request: `{ "subjects": ["ชีววิทยา", "เคมี"] }`. รับ array ของ string ที่ไม่ว่างหลัง trim และไม่มีค่าซ้ำโดยไม่แยกตัวพิมพ์เล็ก/ใหญ่; สำเร็จ `200` คืน profile ปัจจุบันในรูปแบบเดียวกับ GET; ข้อมูลผิดตอบ `400`

### `GET /api/users/search?subject=ชีววิทยา`

ต้องมี Bearer token; ค้นหาวิชาตรงกันแบบไม่แยกตัวพิมพ์เล็ก/ใหญ่ สำเร็จ `200` คืน array โดยแต่ละรายการมีเฉพาะ `{ "id", "name", "subjects" }`; ไม่พบคืน `[]`; ไม่มี subject ตอบ `400`

## 5. Study Group / Session Service

Group Service เก็บข้อมูลกลุ่มในไฟล์ JSON ของตนเองตาม `GROUP_DATA_FILE`; Membership ต้องเรียก API ของ Group เพื่อเพิ่มสมาชิก ไม่แก้ไฟล์ของ Group โดยตรง

ตัวตนของเจ้าของกลุ่มมาจาก JWT เท่านั้น

- `POST /api/groups`: รับ `subject`, `topic`, `startsAt`, `maxMembers`, `location` และ `description` (ถ้ามี); สร้างกลุ่มโดยกำหนด owner จาก token; สำเร็จ `201` คืน group object
- `GET /api/groups?subject=ชีววิทยา&openOnly=true`: ค้นหาตามวิชาและสถานะเปิดรับ; สำเร็จ `200` คืน array, ไม่พบคืน `[]`
- `GET /api/groups/:id`: คืนรายละเอียดกลุ่มและจำนวนสมาชิก; กลุ่มไม่มีตอบ `404`
- `PATCH /api/groups/:id`: เจ้าของกลุ่มเท่านั้นแก้ข้อมูลกลุ่ม; ผู้ใช้อื่นตอบ `403`, กลุ่มไม่มีตอบ `404`
- `POST /internal/groups/:id/members`: สำหรับ Membership Service เพิ่มสมาชิกแบบ atomic เมื่อกลุ่มยังไม่เต็ม; ตรวจ `X-Service-Token`; สำเร็จ `200` คืนจำนวนสมาชิกใหม่, กลุ่มเต็มตอบ `422`, เพิ่ม user ซ้ำตอบ `409`
- `DELETE /internal/groups/:id`: สำหรับ Membership Service ลบกลุ่มผ่าน `X-Service-Token`; ลบได้เมื่อ owner เป็นสมาชิกเพียงคนเดียว สำเร็จ `204`; สมาชิกอื่นยังอยู่ตอบ `409`; group ไม่มีตอบ `404`; token หาย/ผิดตอบ `401`
- `DELETE /internal/groups/:id/members`: Membership Service นำสมาชิกออกด้วย body `{ "userId": "user-123" }` และ `X-Service-Token`; สำเร็จ `204`; เจ้าของออกไม่ได้และตอบ `409`

ข้อมูลสร้าง/แก้ไขต้องมี subject และ topic ที่ไม่ว่าง, startsAt เป็น ISO 8601 พร้อม timezone, maxMembers เป็นจำนวนเต็มบวก และ location ไม่เป็นค่าว่าง; ข้อมูลผิดตอบ `400`

## 6. Membership Service

Membership Service เก็บคำขอในไฟล์ JSON ของตนเองตาม `MEMBERSHIP_DATA_FILE`; ห้ามแก้ไฟล์ของ Group หรือ Notification โดยตรง

ตัวตนผู้ขอและผู้ตัดสินมาจาก JWT

- `POST /api/requests`: body `{ "groupId": "group-123" }`; สร้างคำขอ `pending` โดยใช้ userId จาก token; สำเร็จ `201` คืน request; คำขอที่ยัง `pending` ซ้ำตอบ `409`; ส่งคำขอใหม่ได้หลังคำขอก่อนหน้าถูกปฏิเสธ; กลุ่มไม่มีตอบ `404`; กลุ่มเต็มตอบ `422`
- `GET /api/requests?groupId=group-123`: เจ้าของกลุ่มเท่านั้นดูรายการคำขอได้; สำเร็จ `200` คืน array โดยแต่ละรายการเพิ่ม `requesterName` และ `requesterEmail` จาก Profile Service
- `GET /api/groups/:id/members`: ต้องมี Bearer token; คืนสมาชิกปัจจุบันตามลำดับในกลุ่มเป็น `{ "name", "isOwner" }`; ใช้แสดงชื่อและป้ายเจ้าของกลุ่ม โดยไม่ส่ง email หรือ user ID ให้ frontend; กลุ่มไม่มีตอบ `404`, Profile Service ใช้งานไม่ได้ตอบ `503`
- `DELETE /api/groups/:id`: เจ้าของกลุ่มเท่านั้นลบกลุ่มได้ผ่าน Membership Service; ต้องไม่มีสมาชิกอื่นนอกจากเจ้าของและไม่มีคำขอที่ยัง pending; สำเร็จ `204`, เงื่อนไขไม่ครบตอบ `409`; Membership ประสาน Group Service ผ่าน `DELETE /internal/groups/:id` และ service token
- `DELETE /api/groups/:id/leave`: สมาชิกที่ไม่ใช่เจ้าของออกจากกลุ่มได้; สำเร็จ `204`; ผู้ที่ไม่ได้เป็นสมาชิกตอบ `409`; เจ้าของต้องลบกลุ่มแทน
- `DELETE /api/groups/:id/members/:memberId`: เจ้าของกลุ่มนำสมาชิกคนอื่นออกได้; สำเร็จ `204`; ผู้ที่ไม่ใช่เจ้าของตอบ `403`; นำเจ้าของออกไม่ได้; สมาชิกที่ถูกนำออกส่งคำขอเข้าร่วมใหม่ได้
- `POST /api/requests/:id/approve`: เจ้าของกลุ่มอนุมัติ; ก่อนบันทึกสถานะต้องเรียก `POST /internal/groups/:id/members`; เพิ่มสมาชิกสำเร็จแล้วจึงเปลี่ยนสถานะเป็น `approved`; คำขอที่ตัดสินแล้วตอบ `409`
- `POST /api/requests/:id/reject`: เจ้าของกลุ่มปฏิเสธ; สำเร็จคืน request สถานะ `rejected`; ผู้ไม่มีสิทธิ์ตอบ `403`; request/group ไม่มีตอบ `404`

เมื่อมีคำขอใหม่ ให้ Membership ส่งแจ้งเตือนไปยังเจ้าของกลุ่ม เพื่อให้เปิดรายการและพิจารณาคำขอได้ทันที; หลังอนุมัติหรือปฏิเสธ ให้แจ้งผลไปยังผู้ขอด้วย การแจ้งเตือนที่ส่งไม่สำเร็จต้องถูกบันทึกและลองซ้ำได้ โดยไม่ทำให้การอนุมัติถูกดำเนินซ้ำหรือเพิ่มสมาชิกซ้ำ

## 7. Notification Service

Notification Service เก็บรายการแจ้งเตือนในไฟล์ JSON ของตนเองตาม `NOTIFICATION_DATA_FILE`; Membership ส่ง event ผ่าน API ภายใน ไม่เขียนไฟล์ของ Notification โดยตรง

- `POST /internal/notifications`: Membership Service เรียกด้วย `X-Service-Token`; body สำหรับแจ้งเจ้าของกลุ่มเมื่อมีคำขอใหม่ `{ "userId": "owner-123", "type": "request_received", "message": "มีคำขอเข้าร่วมกลุ่ม …", "relatedId": "request-123", "groupId": "group-123" }`; body สำหรับแจ้งผลผู้ขอใช้ `request_approved` หรือ `request_rejected` และไม่ต้องมี `groupId`; สำเร็จ `201` คืน notification
- `GET /api/notifications?limit=20&offset=0`: ต้องมี Bearer token; คืนหน้ารายการเฉพาะ userId ใน token เรียงใหม่ไปเก่า; limit ค่าเริ่มต้น 20 (รับ 1–100), offset ค่าเริ่มต้น 0; response `{ "items": [], "unreadCount": 0, "hasMore": false, "nextOffset": null }`; `unreadCount` นับรายการยังไม่อ่านทั้งหมดของผู้ใช้
- `PATCH /api/notifications/:id/read`: ทำเครื่องหมายอ่านแล้วได้เฉพาะ notification ของตน; สำเร็จ `200`, ไม่มีรายการตอบ `404`, เป็นของผู้อื่นตอบ `403`

รายละเอียดสำหรับเชื่อม Membership → Notification (สมาชิก 4 และ 5):

- ตั้ง `NOTIFY_SERVICE_TOKEN` ค่าเดียวกันใน Membership และ Notification แล้วส่งใน `X-Service-Token`; ค่า `NOTIFY_URL` ฝั่ง Membership ชี้ Notification port 3005 ตาม environment ที่ทีมจัดให้ ห้ามส่ง service token ไป browser
- `type` รับ `request_received`, `request_approved` และ `request_rejected`; สำหรับ `request_received`, `userId` คือเจ้าของกลุ่มและ `groupId` คือกลุ่มที่มีคำขอใหม่; สำหรับผลการพิจารณา `userId` คือ requester; `relatedId` คือ request ID ทุก field ที่ส่งต้องเป็น string ไม่ว่างหลัง trim และ `message` ไม่เกิน 2,000 ตัวอักษร; ข้อมูลผิดตอบ `400`, internal token หาย/ผิดตอบ `401`
- Notification object มี `{ id, userId, type, message, relatedId, groupId?, read, createdAt, readAt }`; `groupId` มีเฉพาะ event `request_received` เพื่อให้หน้าเว็บพาเจ้าของกลุ่มไปยังรายการคำขอของกลุ่มนั้น; สร้างใหม่มี `read: false`, `readAt: null`; เวลาเป็น ISO 8601 UTC เมื่อ mark-read มี `read: true` และ `readAt` เป็นเวลาที่อ่านครั้งแรก การ mark ซ้ำคืนรายการเดิมด้วย `200`
- เพื่อรองรับ retry โดยไม่แจ้งซ้ำ ใช้ `(userId, relatedId, type)` เป็น event key: ครั้งแรกตอบ `201`; ส่ง payload เดิมซ้ำตอบ `200` พร้อม notification เดิมและคง read state; key เดิมแต่ message ต่างตอบ `409` โดยไม่เขียนทับ Membership ต้องถือทั้ง `200` และ `201` ว่าส่งสำเร็จ
- Membership ต้องบันทึก event ที่ยังส่งไม่สำเร็จเพื่อ retry payload เดิมภายหลัง โดยไม่ตัดสินคำขอหรือเพิ่มสมาชิกซ้ำ; Notification เก็บเฉพาะ JSON ของตนผ่าน `NOTIFICATION_DATA_FILE` และ Docker volume แยก ใช้หนึ่ง process/replica ต่อไฟล์
- `GET /api/notifications` คืนเฉพาะ userId ใน token เสมอ ไม่รับ userId จาก query; การพยายามดูของผู้อื่นด้วย query จึงไม่เปิดเผยรายการนั้น ส่วนการ mark รายการของผู้อื่นตอบ `403` ตามเดิม
- หน้าการแจ้งเตือนโหลดครั้งละ 20 รายการ และขอหน้าถัดไปเมื่อผู้ใช้กด “ดูเพิ่มเติม”; badge แสดงจำนวนที่ยังไม่อ่านทั้งหมด
- Notification Service ลบอัตโนมัติเฉพาะรายการที่อ่านแล้วและ `createdAt` เก่ากว่า 90 วัน ทำครั้งหนึ่งตอนเริ่ม service และตรวจซ้ำทุก 24 ชั่วโมง; รายการที่ยังไม่อ่านจะไม่ถูกลบตามนโยบายนี้

## 8. การเปลี่ยนสัญญา

ผู้แก้ API ต้องปรับเอกสารนี้และเพิ่ม/แก้ test ที่เกี่ยวข้องใน PR เดียวกับการเปลี่ยนโค้ด ระบุ consumer ที่ได้รับผลกระทบ และแจ้งเจ้าของ service ปลายทางก่อน merge; ห้ามเปลี่ยนชื่อ field, status code หรือสิทธิ์แบบเงียบ ๆ
