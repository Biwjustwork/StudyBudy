# Study Buddy Frontend

Single-page application (SPA) สำหรับ Study Buddy พัฒนาด้วย Vite + TypeScript ทำหน้าที่เป็น Web Frontend ส่วนกลางที่เชื่อมต่อและประสานงานกับ Microservices ทั้ง 5 บริการอย่างครบวงจร

## ฟีเจอร์ที่รองรับ

1. **Authentication (Auth Service :3001)**: สมัครสมาชิก, เข้าสู่ระบบ, ออกจากระบบ, จัดเก็บ JWT ใน `sessionStorage` อย่างปลอดภัย
2. **Profile & Subjects (Profile Service :3002)**: แสดงข้อมูลผู้ใช้, กำหนดวิชาที่กำลังเรียน/สนใจ, ค้นหาเพื่อนร่วมชั้นที่สนใจวิชาเดียวกัน
3. **Study Groups (Group Service :3003)**: ค้นหากลุ่มตามวิชา, กรองเฉพาะกลุ่มที่ยังมีที่ว่าง (`openOnly`), สร้างกลุ่มอ่านใหม่พร้อมแปลงเวลาเป็น ISO 8601 ตาม Timezone, แสดงจำนวนสมาชิกและสถานะเปิด/ปิดรับ
4. **Membership (Membership Service :3004)**: ส่งคำขอเข้าร่วมกลุ่ม, สำหรับเจ้าของกลุ่มสามารถดูคำขอของกลุ่มตนเอง และกดอนุมัติ (Approve) หรือปฏิเสธ (Reject) แบบ Atomic
5. **Notifications (Notification Service :3005)**: แสดงการแจ้งเตือนผลการขอเข้ากลุ่ม, แสดงจำนวนข้อความใหม่ (Badge), กดทำเครื่องหมายว่าอ่านแล้ว (Mark as read), มีระบบ Background polling ทุก 15 วินาที

## Local development

```sh
cd frontend
Copy-Item .env.example .env
npm install
npm run dev
```

เปิด Browser ที่ `http://localhost:5173`

## Service Endpoints (Host Ports)

- Auth Service: `http://localhost:3001` (`VITE_AUTH_URL`)
- Profile Service: `http://localhost:3002` (`VITE_PROFILE_URL`)
- Group Service: `http://localhost:3003` (`VITE_GROUP_URL`)
- Membership Service: `http://localhost:3004` (`VITE_MEMBERSHIP_URL`)
- Notification Service: `http://localhost:3005` (`VITE_NOTIFICATION_URL`)

## Build สำหรับ Production

```sh
npm run build
```
ผลลัพธ์ build จะอยู่ที่โฟลเดอร์ `dist/`
