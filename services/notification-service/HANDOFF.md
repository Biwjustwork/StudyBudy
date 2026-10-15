# ส่งต่องาน — สมาชิก 5 / Notification

## สิ่งที่ส่งมอบวันนี้

- Notification API, หน้าแจ้งเตือน, JSON store, API/unit tests, Dockerfile และ CI เฉพาะ service.
- หน้าแจ้งเตือนโหลดทีละ 20 รายการและมี “ดูเพิ่มเติม”; API ส่ง `unreadCount` เพื่อคงยอด unread ทั้งหมด
- ลบเฉพาะรายการที่อ่านแล้วและ `createdAt` เกิน 90 วัน ตรวจตอน service เริ่มและทุก 24 ชั่วโมง; รายการยังไม่อ่านไม่ถูกลบ
- ปรับสัญญา `GET /api/notifications` เป็น paginated response `{ items, unreadCount, hasMore, nextOffset }`; อัปเดต consumer ทั้ง frontend และหน้า `/notifications.html`
- โฟลเดอร์ `services/notification-service/` อยู่ในโฟลเดอร์ services เดียวกับ Profile/Group/Membership; workflow อยู่ `.github/workflows/notification-service.yml`.
- `API_CONTRACT.md` กลางส่วน 7 เพิ่มรายละเอียด internal token, response fields และ retry; ตอนรวม branch ให้คงการปรับ JSON storage เดิมของ Auth ไว้.
- การประกอบชุดรันรวม, E2E ทุก service และ Docker Hub release เป็นขั้นตอนของทีมหลังรวมโค้ด.

## จุดเชื่อมสำหรับสมาชิก 4 — Membership

ตั้ง `NOTIFY_URL` เป็น URL ของ Notification ที่เข้าถึงได้จาก Membership และใช้ `NOTIFY_SERVICE_TOKEN` ค่าเดียวกับ Notification. ใน container URL ต้องอ้างชื่อ service/network ที่ทีมกำหนด; localhost ของ container จะอ้าง container นั้นเอง.

หลังบันทึก `approved`/`rejected` สำเร็จ ส่ง `POST {NOTIFY_URL}/internal/notifications` พร้อม:

```http
Content-Type: application/json
X-Service-Token: <NOTIFY_SERVICE_TOKEN from environment>
```

```json
{
  "userId": "<request.requesterId>",
  "type": "request_approved",
  "message": "คำขอเข้ากลุ่มได้รับอนุมัติ",
  "relatedId": "<request.id>"
}
```

ปฏิเสธใช้ `request_rejected` และข้อความที่เหมาะสม. `relatedId` คือ request ID. สำหรับ `request_received` ผู้รับคือเจ้าของกลุ่มและต้องแนบ `groupId` เพื่อให้หน้าเว็บพาไปยังรายการคำขอได้; สำหรับผลอนุมัติ/ปฏิเสธ ผู้รับคือ requester. Header ไม่ใช้ Bearer JWT และไม่ส่ง internal token ไปหน้าเว็บ.

| ผล HTTP | การจัดการที่ Membership ต้องทำ |
|---|---|
| `201` | บันทึกว่าส่งสำเร็จ |
| `200` | event เดิมถูกบันทึกแล้ว; ถือว่าส่งสำเร็จเช่นเดียวกับ 201 |
| timeout/network/`500` | คงรายการ pending และ retry payload เดิมภายหลัง |
| `400` | ตรวจ payload; ไม่ retry วนทันทีโดยไม่แก้ข้อมูล |
| `401` | ตรวจ service token/config; อย่าตัดสินคำขอหรือเพิ่มสมาชิกซ้ำ |
| `409` | key เดิมแต่ message ต่าง; ตรวจ event ที่บันทึกไว้ ห้ามเปลี่ยน payload ระหว่าง retry |

Notification deduplicate ด้วย `(userId, relatedId, type)` และไม่ reset สถานะอ่านเมื่อ retry. Membership เก็บ payload/สถานะการส่งไว้ใน request store เพื่อ retry หลัง restart และแยก retry notification ออกจากการอนุมัติ/เพิ่มสมาชิก.

## สำหรับทีมรวมโค้ด / PM

1. รวม `services/notification-service/`, workflow และส่วน 7 ของ contract; ตรวจ path ของ workflows หลังจัดโครงสร้าง repo.
2. ส่ง env ตาม `.env.example`, mount volume แยกเข้าที่ `/app/data` และรันเพียงหนึ่ง replica.
3. เปิด `/health` และ `/notifications.html`; เชื่อม `NOTIFY_URL` จาก Membership.
4. รวมงานแล้วรัน E2E สมัคร→ตั้งวิชา→สร้างกลุ่ม→ขอเข้าร่วม→ตัดสิน→ผู้ขออ่านแจ้งเตือน.
5. ตรวจ restart/recreate ด้วย volume เดิม และ build/tag/push Docker Hub พร้อม services อื่นตาม version ของทีม.

จุดเชื่อมที่พบจาก refs ในเครื่องวันที่ 15 ต.ค. 2026 และต้องตรวจอีกครั้งเมื่อรวม: Profile branch ยังไม่มี `POST /internal/users` ที่ Auth ใช้; Membership branch `Nick` ยังเรียก member-add route แบบเดิม ขณะที่ Group branch เปลี่ยนเป็น `/internal/groups/:id/members` + service token; Membership ยังไม่ได้ส่ง notification. เอกสารนี้รายงานจุดส่งต่อ ไม่ได้แก้ service 1–4.

## รายการตรวจหลังรวม

| Test | สิ่งที่ต้องยืนยัน |
|---|---|
| NOTI-01 | Membership อนุมัติ/ปฏิเสธแล้ว event ไปถึง Notification พร้อม requesterId/requestId ที่ถูกต้อง |
| NOTI-02 | ผู้ขอเห็นเฉพาะของตน, ใหม่ไปเก่า, mark-read แล้วเปิดใหม่ยังอ่านแล้ว |
| NOTI-04 | 20 รายการแรก, โหลดหน้าถัดไป, ยอด unread ทั้งหมด และลบเฉพาะ read เกิน 90 วัน |
| NOTI-03 | อีกคน mark ไม่ได้ (`403`); list ของอีกคนต้องไม่เปิดเผยรายการของผู้ขอ |
| Retry | ส่ง event เดิมซ้ำ/พร้อมกัน/หลัง timeout มีรายการเดียวและไม่เปลี่ยน read state |
| DATA-01 | สร้างรายการและ mark-read แล้ว recreate container ด้วย volume เดิมยังเห็นข้อมูล |
| FLOW-01 | IDs และสถานะตรงกันทั้ง flow จาก service จริง |
| DEPLOY-01 | image ของทุกรายการมี release tag ที่ตกลงกัน, push สำเร็จและ health 200 |

ไม่ใช้ mock UI หรือ unit tests เป็นหลักฐานว่า flow รวมผ่าน. บันทึก commit, environment, expected/actual และ PASS/FAIL โดยไม่ใส่ token/password/secrets ในรายงาน.
