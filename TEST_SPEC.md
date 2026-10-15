# Study Buddy Test Specification

เอกสารนี้เป็นรายการทดสอบระดับระบบสำหรับทีม 5 คน ใช้ร่วมกับ unit tests ของแต่ละ service และ pipeline ใน GitHub Actions เจ้าของ service เป็นผู้ดูแล unit tests ของตน ส่วนผู้ประสานงานทดสอบรวบรวมผล integration/smoke tests

## 1. ขอบเขตและเกณฑ์ผ่าน

- ครอบคลุม Auth, Profile & Subject, Group, Membership, Notification และ flow หลักตั้งแต่สมัคร/เข้าสู่ระบบจนได้รับการแจ้งเตือน
- ทุก service ต้องมี unit test อย่างน้อยหนึ่งกรณีที่เจ้าของ service เป็นผู้รับผิดชอบ; เป้าหมายขั้นต่ำรวมอย่างน้อย 5 unit tests
- แต่ละ service ต้องเก็บข้อมูลใน JSON file ของตนเอง; เมื่อตรวจ Docker ให้ mount volume แยกต่อ service และตรวจว่าข้อมูลอยู่ต่อหลัง restart
- Test Case ด้านล่างเป็น acceptance/integration cases; ผลจริงต้องตรง expected result และไม่มี secret หรือ password แบบ plain text ใน log/response
- Pull Request ต้องผ่าน install, typecheck, build และ unit tests ของ service ที่ได้รับผลกระทบ; การเปลี่ยน API ต้องรัน consumer/integration tests ที่เกี่ยวข้องด้วย
- การทดสอบ release ต้อง build Docker image ของทุก service และยืนยันว่า image ถูก push ไปยัง Container Registry ตาม tag ที่กำหนดในแผน release

## 2. Acceptance และ Integration Test Cases

| ID | ระดับ | ผู้รับผิดชอบหลัก | สถานการณ์และข้อมูลทดสอบ | ผลที่คาดหวัง |
|---|---|---|---|---|
| AUTH-01 | Integration | สมาชิก 1 | สมัครด้วย email ใหม่, name และ password ที่ผ่านเงื่อนไข | ได้ `201`, มี userId, สร้าง profile เริ่มต้นสำเร็จ และไม่มี password ใน response |
| AUTH-02 | Integration | สมาชิก 1 | สมัครด้วย email ที่มีอยู่แล้ว | ได้ `409`; ไม่มีบัญชี/profile ซ้ำ |
| AUTH-03 | Unit/Integration | สมาชิก 1 | สมัครด้วยรหัสผ่านสั้นหรือไม่มีตัวพิมพ์ใหญ่/อักขระพิเศษ | ได้ `400`; ไม่สร้างบัญชี |
| AUTH-04 | Integration | สมาชิก 1 | เข้าสู่ระบบด้วย email/password ถูกต้อง แล้วเรียก `/api/me` ด้วย token | login ได้ `200`; `/api/me` คืน userId ตรงกัน |
| AUTH-05 | Integration | สมาชิก 1 | login ด้วย password ผิด หรือเรียก protected API ด้วย token หาย/ผิด/หมดอายุ | login และ protected API ตอบ `401`; login ไม่เปิดเผยว่ามี email หรือไม่ |
| PROF-01 | Integration | สมาชิก 2 | อ่าน profile โดยใช้ id ที่ตรงกับ userId ใน token | ได้ `200` และ field `id`, `name`, `email`, `subjects` ตาม contract |
| PROF-02 | Integration | สมาชิก 2 | แก้ subjects ด้วย string ที่ trim ได้และไม่ซ้ำ | ได้ `200`; เมื่ออ่านซ้ำได้ค่าที่บันทึกไว้ |
| PROF-03 | Unit/Integration | สมาชิก 2 | บันทึก subjects ว่าง/ชนิดไม่ใช่ array/มีค่าซ้ำ | ได้ `400`; ข้อมูลเดิมไม่ถูกเปลี่ยน |
| PROF-04 | Integration | สมาชิก 2 | อ่านหรือแก้ profile ของ userId อื่น | ได้ `403`; profile เจ้าของเดิมไม่เปลี่ยน |
| PROF-05 | Integration | สมาชิก 2 | ค้นหาวิชาที่มีผู้สนใจและวิชาที่ไม่มีผู้สนใจ | ได้ `200`; ผลมีเฉพาะ `id/name/subjects`; กรณีไม่พบคืน `[]` |
| GROUP-01 | Integration | สมาชิก 3 | สร้างกลุ่มด้วย subject, topic, startsAt, maxMembers และ location ถูกต้อง | ได้ `201`; owner มาจาก token ไม่ใช่ body |
| GROUP-02 | Unit/Integration | สมาชิก 3 | สร้างกลุ่มโดยขาด field บังคับหรือใช้วันเวลา/จำนวนสมาชิกผิดรูปแบบ | ได้ `400`; ไม่สร้างกลุ่ม |
| GROUP-03 | Integration | สมาชิก 3 | ค้นหาตาม subject โดยเปิด `openOnly=true` | ได้เฉพาะกลุ่มวิชาตรงกันที่ยังเปิดและไม่เต็ม; ไม่พบคืน `[]` |
| GROUP-04 | Integration | สมาชิก 3 | ผู้ไม่ใช่เจ้าของแก้กลุ่ม หรืออ่าน groupId ที่ไม่มี | กรณีแรกได้ `403`; กรณีหลังได้ `404` |
| MEM-01 | Integration | สมาชิก 4 | ผู้ใช้ส่งคำขอเข้ากลุ่มที่เปิดรับ | ได้ `201`, สถานะ `pending`, requester มาจาก token |
| MEM-02 | Integration | สมาชิก 4 | ผู้ใช้เดิมส่งคำขอซ้ำ | ได้ `409`; มีคำขอเดียว |
| MEM-03 | Integration | สมาชิก 4 | เจ้าของอนุมัติคำขอของกลุ่มที่ยังมีที่ว่าง | ได้สถานะ `approved`; จำนวนสมาชิกเพิ่มหนึ่งครั้ง; มี notification |
| MEM-04 | Integration | สมาชิก 4 | อนุมัติคำขอเมื่อกลุ่มเต็ม หรือผู้อนุมัติไม่ใช่เจ้าของ | กลุ่มเต็มได้ `422` และจำนวนไม่เกิน maxMembers; ผู้ไม่มีสิทธิ์ได้ `403` |
| MEM-05 | Unit/Integration | สมาชิก 4 | พยายามอนุมัติ request ที่ถูกตัดสินแล้วหรือไม่มีอยู่ | รายการที่ตัดสินแล้วได้ `409`; รายการไม่มีได้ `404`; ไม่เพิ่มสมาชิกซ้ำ |
| NOTI-01 | Integration | สมาชิก 5 | Membership ส่ง event อนุมัติ/ปฏิเสธ | Notification Service บันทึกรายการที่ผูกกับ user และ request ที่ถูกต้อง |
| NOTI-02 | Integration | สมาชิก 5 | ผู้ใช้เรียกรายการแจ้งเตือนและ mark รายการของตนว่าอ่านแล้ว | ได้เฉพาะรายการตนเอง; mark สำเร็จแล้วอ่านซ้ำเห็น `read` |
| NOTI-03 | Integration | สมาชิก 5 | ผู้ใช้พยายามอ่านหรือ mark notification ของคนอื่น | ได้ `403`; ข้อมูลเจ้าของรายการไม่เปลี่ยน |
| FLOW-01 | End-to-end | สมาชิก 5 ร่วมกับสมาชิก 1–4 | สมัคร/login → ตั้ง subjects → สร้างกลุ่ม → ส่งคำขอ → เจ้าของอนุมัติ → ผู้ขออ่าน notification | Flow จบสำเร็จ; userId, groupId, requestId และสถานะตรงกันทุก service |
| DEPLOY-01 | CI/Release smoke | สมาชิก 5 ร่วมกับสมาชิก 1 | build image ของทุก service, push tag release แล้วเรียก `/health` จาก image ที่เผยแพร่ | ทุก image build/push สำเร็จและ service ตอบ health `200`; tag สอดคล้องกัน |
| DATA-01 | Docker smoke | เจ้าของ service แต่ละคน | สร้างข้อมูลผ่าน API, restart container โดยใช้ volume เดิม แล้วอ่านข้อมูลเดิมอีกครั้ง | ข้อมูล JSON ยังอยู่ครบ; image ไม่มีไฟล์ข้อมูลจริงติดไปด้วย |

## 3. รูปแบบบันทึกผล

ในผล CI หรือรายงานทดสอบ ให้บันทึก Test ID, commit/branch, environment, ผล `PASS/FAIL`, expected/actual, ลิงก์ log และ bug/PR ที่เกี่ยวข้อง ห้ามบันทึก token, password หรือค่าจริงของ secrets

กรณี FAIL ให้เจ้าของ service ที่เกี่ยวข้องแก้ไขใน branch/PR ของตน ผู้ทดสอบบันทึกขั้นตอนทำซ้ำและรันทดสอบเดิมซ้ำหลังแก้; ผู้ทดสอบตรวจและรายงานผล แต่ไม่แก้โค้ดแทนเจ้าของ service
