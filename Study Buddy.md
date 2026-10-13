# **Study Buddy — ระบบจับกลุ่มอ่านหนังสือ**

# **1\. คำนิยาม**

Study Buddy คือเว็บแอปที่ช่วยให้นักศึกษาซึ่งต้องการอ่านวิชาเดียวกันค้นหาและรวมกลุ่มอ่านหนังสือได้ ผู้ใช้สามารถระบุวิชาที่สนใจ สร้างนัดอ่าน ค้นหากลุ่มที่เปิดรับสมาชิก และส่งคำขอเข้าร่วม โดยเจ้าของกลุ่มเป็นผู้ยืนยันสมาชิก

# **2\. วัตถุประสงค์และกลุ่มผู้ใช้**

โครงงานนี้มุ่งช่วยให้นักศึกษาหาเพื่อนอ่านหนังสือและนัดหมายได้สะดวกขึ้น ลดปัญหาไม่รู้ว่าใครสนใจวิชาเดียวกัน และทำให้รายละเอียดของกลุ่ม เช่น วิชา เวลา และจำนวนสมาชิก อยู่ในที่เดียว กลุ่มผู้ใช้เป้าหมายคือ นักศึกษาในชั้นเรียนหรือมหาวิทยาลัย

# **3\. ขอบเขตฟีเจอร์เบื้องต้น**

* เข้าสู่ระบบและจัดการข้อมูลผู้ใช้พื้นฐาน  
* ระบุวิชาที่สนใจและค้นหากลุ่มตามวิชา วันเวลา หรือสถานะการรับสมาชิก  
* สร้างกลุ่มอ่าน โดยระบุวิชา หัวข้อ วันเวลา จำนวนสมาชิกสูงสุด และรายละเอียดสถานที่หรือช่องทาง  
* ส่งคำขอเข้าร่วม และให้เจ้าของกลุ่มยืนยันหรือปฏิเสธ พร้อมตรวจสอบจำนวนสมาชิกไม่ให้เกินกำหนด  
* ดูรายละเอียดกลุ่ม สมาชิก และเวลานัด รวมถึงการแจ้งเตือนภายในระบบ  
* รุ่นแรกยังไม่รวมวิดีโอคอล แชตสด การจับคู่ด้วย AI การเชื่อมปฏิทิน และการส่งอีเมล เพื่อคุมขอบเขตให้เหมาะกับโครงงาน

# **4\. การแบ่งบทบาทและหน้าที่คร่าว ๆ (สมาชิก 5 คน)**

* สมาชิก 1 — Project Manager และ Auth Service: วางแผนงานและ deployment, ประสาน API/ข้อตกลงร่วม, ทำ Login/ตรวจสอบตัวตน และจัดทำเอกสาร Test Specification ให้ครบอย่างน้อย 5 กรณี  
* สมาชิก 2 — Profile & Subject Service: พัฒนาข้อมูลผู้ใช้พื้นฐาน วิชาที่สนใจ และ API สำหรับค้นหาหรือกรองความสนใจ พร้อม unit test ของบริการ  
* สมาชิก 3 — Study Group/Session Service: พัฒนาการสร้าง แก้ไข ดู และค้นหากลุ่มอ่าน รวมถึงข้อมูลนัดหมายและจำนวนสมาชิกสูงสุด พร้อม unit test  
* สมาชิก 4 — Membership Service: พัฒนาการส่งคำขอเข้าร่วม การอนุมัติ/ปฏิเสธ และกติกาป้องกันสมาชิกเกินจำนวนหรือส่งคำขอซ้ำ พร้อม unit test  
* สมาชิก 5 — Notification Service และ Tester: พัฒนาการแจ้งเตือนในระบบเมื่อคำขอหรือสถานะเปลี่ยน พร้อมทำ automated integration/smoke tests และติดตามผลการทดสอบบน CI  
* งานร่วมกัน: ทำ Web Frontend ที่เชื่อมบริการต่าง ๆ, ทบทวน Pull Request, แก้ปัญหา build/test/deploy และเตรียมสาธิต ทุกคนต้องอธิบายบริการและงานที่ตนรับผิดชอบได้

# **5\. เงื่อนไขและเกณฑ์ที่ต้องทำให้สำเร็จ**

* ระบบต้องมีหน้า Login อย่างน้อย 1 หน้า และมีการตรวจสอบสิทธิ์ก่อนเข้าถึงฟีเจอร์สำหรับสมาชิก  
* แยกบริการ/โปรเจกต์ที่สมาชิกดูแลให้ชัด แต่ละบริการมีขอบเขต API และ unit test ของตนเอง  
* มี unit test อย่างน้อย 5 รายการเป็นขั้นต่ำ และควรให้สมาชิกแต่ละคนรับผิดชอบอย่างน้อย 1 รายการ พร้อม automated test cases ตาม Test Specification  
* เก็บโค้ดใน Remote Repository เช่น GitHub และใช้ GitHub Actions ทำ CI/CD ให้รันตรวจ type/build/test ก่อนสร้างและเผยแพร่ image  
* สร้าง Docker image สำหรับแต่ละบริการ และ push ไปยัง Container Registry เช่น GitHub Container Registry หรือ Docker Hub ได้สำเร็จ โดยใช้ Release tag เช่น v1.0.0  
* ห้ามเก็บรหัสผ่านหรือ token ใน source code; ใช้ Repository Secrets/ตัวแปรสภาพแวดล้อมสำหรับข้อมูลลับ

# **6\. ตัวอย่างกรณีทดสอบหลัก**

* เข้าสู่ระบบด้วยข้อมูลถูกต้องสำเร็จ และข้อมูลไม่ถูกต้องต้องถูกปฏิเสธ  
* สร้างกลุ่มด้วยข้อมูลครบแล้วบันทึกได้; หากขาดวิชาหรือเวลาให้แสดงข้อผิดพลาด  
* ค้นหากลุ่มตามวิชาแล้วได้เฉพาะกลุ่มที่ตรงเงื่อนไขและยังเปิดรับสมาชิก  
* ส่งคำขอเข้าร่วมแล้วเจ้าของกลุ่มอนุมัติได้; คำขอซ้ำต้องไม่สร้างรายการซ้ำ  
* เมื่อกลุ่มเต็ม ระบบต้องปฏิเสธสมาชิกใหม่ และเมื่ออนุมัติ/ปฏิเสธคำขอ ผู้เกี่ยวข้องเห็นการแจ้งเตือน

# **7\. แนวทางเทคโนโลยีและการปล่อยระบบ**

แนวทางตั้งต้นคือ Node.js \+ Express \+ TypeScript สำหรับบริการ, GitHub สำหรับ Remote Repository, GitHub Actions สำหรับ pipeline, Docker สำหรับบรรจุบริการ และ GHCR หรือ Docker Hub สำหรับเก็บ image ทั้งนี้ทีมสามารถตกลงปรับ stack ให้ตรงกับความถนัดและคำแนะนำของผู้สอนได้

Pipeline ที่เสนอ: Pull Request → type check/build/unit test → integration test → merge → build Docker images → เมื่อสร้าง Release tag ให้ push images ที่ติด version ไปยัง Registry การนำ image ไปรันบน Cloud เพิ่มได้หากอยู่ในข้อกำหนดการส่งหรือมีเวลา

หมายเหตุ: ชื่อสมาชิก วันส่ง รายละเอียด stack และขอบเขตสุดท้ายยังเป็นข้อเสนอ ให้กลุ่มเติมและยืนยันร่วมกันก่อนเริ่มพัฒนา

# **8\. แผนปฏิบัติงานรายบทบาทแบบทำงานร่วมกัน**

## **หลักการทำงานร่วมกัน**

* สมาชิกแต่ละคนเป็นเจ้าของ service และ repository ของตน รับผิดชอบ API, database, หน้าเว็บที่เกี่ยวข้อง, unit tests, Dockerfile และ README ขั้นพื้นฐาน ส่วน PM ดูแลภาพรวมและแม่แบบ pipeline ขณะที่ Tester ช่วยวางและรวมการทดสอบ ผู้พัฒนาทุกคนยังต้องเขียนและดูแล test ของ service ตนเอง  
* ก่อนเริ่มเขียน feature ให้ทุกคนอ่าน API\_CONTRACT.md และตกลงชื่อ field, รูปแบบ error, port, environment variables, วิธีส่ง token และผู้มีสิทธิ์ทำรายการให้ตรงกัน หากต้องปรับสัญญา ให้เปิด PR แก้เอกสารก่อนหรือพร้อมกับโค้ดที่เปลี่ยน ห้ามเปลี่ยน API เงียบ ๆ

## **สมาชิก 1 — Project Manager และ Auth Service**

* วันแรก: สร้าง/จัดระเบียบ 5 repositories, ตั้งชื่อ service และ port (Auth 3001, Profile 3002, Group 3003, Membership 3004, Notification 3005), ทำ README และ API\_CONTRACT.md กลาง แล้วคัดลอกสัญญาเวอร์ชันเดียวกันไปยังทุก repository  
* จัดทำ Test Specification อย่างน้อย 5 กรณี โดยแต่ละกรณีระบุ Test ID, requirement, precondition, test data, ขั้นตอน, expected result และผู้รับผิดชอบ เช่น login ถูก/ผิด, ข้อมูลสร้างกลุ่มไม่ครบ, ค้นหาเฉพาะกลุ่มที่เปิดรับ, ขอเข้ากลุ่มซ้ำ และกลุ่มเต็ม  
* สร้างแม่แบบ GitHub Actions ให้รัน install → typecheck → build → unit test → Docker build เมื่อเปิด Pull Request และจัดให้สมาชิกแต่ละคนติดตั้ง workflow เดียวกัน พร้อมเก็บ Docker Hub credentials ใน GitHub Secrets  
* พัฒนา Auth Service และหน้า Login: POST /api/login รับ username/password แล้วคืน userId และ token เมื่อสำเร็จ; GET /api/me ตรวจ token; ข้อมูลผิดหรือไม่มี/หมดอายุ token ต้องได้ 401  
* เพิ่ม unit tests สำหรับ login สำเร็จ, รหัสผ่านผิด, ผู้ใช้ไม่มี, token ใช้ได้ และ token ผิด/หมดอายุ รวมทั้งตรวจว่า password ถูกเก็บแบบ hash ไม่ใช่ plain text  
* กำหนดมาตรฐานการยืนยันตัวตนร่วมกับสมาชิก 2–5 ตั้งแต่วันแรก: protected endpoints ส่ง Authorization: Bearer token; ห้ามเชื่อ userId/ownerId จาก request body โดยไม่ตรวจสิทธิ์ ให้ระบุวิธีตรวจ token และ secret ใน API\_CONTRACT.md ก่อนทุกคนลงมือ  
* ประสานงานประจำวัน: เช็กสถานะงานและ blocker, ตรวจว่า PR มี test และ CI ผ่าน, ขอสมาชิกอื่น review ก่อน merge และสรุปการเปลี่ยนแปลง API ให้ทั้งทีมทราบ  
* วันสุดท้าย: ตรวจ tag/release, ประสานให้ทุก image ใช้ tag v1.0.0, ตรวจผล push ที่ Registry และเตรียมสาธิต pipeline กับอธิบายหน้าที่ PM/Auth

## **สมาชิก 2 — Profile & Subject Service**

* ทำ schema ผู้ใช้/วิชาที่สนใจและ API: GET /api/users/:id อ่านข้อมูลและ subjects, PUT /api/users/:id บันทึกรายการวิชา, GET /api/users/search?subject=... ค้นหาผู้ใช้ตามวิชา  
* กำหนด validation และพฤติกรรมขอบเขต: user ไม่มีต้องตอบ 404, subjects ต้องเป็นรายการข้อความที่ไม่ว่าง/ไม่มีค่าซ้ำตามกติกาทีม, ค้นหาวิชาที่ไม่มีคนสนใจคืน \[\] และทุก response ใช้ JSON ตามสัญญา  
* ทำ unit tests สำหรับบันทึก/อ่านวิชา, ค้นหาที่พบและไม่พบ, user ไม่มี และข้อมูลวิชาไม่ถูกต้อง; ทำหน้า profile.html ให้ผู้ใช้ตั้งค่าวิชาและเห็นผลหลังบันทึก  
* ส่งตัวอย่าง request/response และวิธีรัน service ให้สมาชิก 3 ใช้ทดสอบ flow ค้นหากลุ่มจากวิชา และให้ Frontend เรียก URL ผ่าน env ไม่ฝัง localhost ในโค้ด

## **สมาชิก 3 — Study Group / Session Service**

* ทำ schema กลุ่มและ API: POST /api/groups สร้างกลุ่ม, GET /api/groups?subject=...\&openOnly=true ค้นหาเฉพาะกลุ่มตรงวิชาและยังรับสมาชิก, GET /api/groups/:id ดูรายละเอียดและสมาชิก, PATCH /api/groups/:id แก้ข้อมูลโดยเจ้าของ  
* ตรวจข้อมูลบังคับ subject, topic, datetime, maxMembers และ location ตามข้อตกลง; วันที่ต้องใช้รูปแบบเดียวกัน, จำนวนสมาชิกสูงสุดต้องเป็นจำนวนเต็มบวก, ข้อมูลไม่ครบตอบ 400, กลุ่มไม่มีตอบ 404 และผู้แก้ที่ไม่ใช่เจ้าของตอบ 403  
* ทำ unit tests สำหรับสร้างถูกต้อง/ข้อมูลขาด, ค้นหาตรงวิชา, ซ่อนกลุ่มเต็มหรือปิดรับ, รายละเอียดกลุ่ม และการแก้ไขโดยเจ้าของ/ผู้ไม่มีสิทธิ์  
* ทำหน้า groups.html สำหรับสร้างและค้นหากลุ่ม แสดงจำนวนที่นั่งและสถานะรับสมาชิก; ประสานสมาชิก 4 ให้ตกลงวิธีอ่านจำนวนสมาชิกและป้องกันการอนุมัติจนเกิน maxMembers

## **สมาชิก 4 — Membership Service**

* ทำ schema คำขอเข้าร่วมและ API: POST /api/requests สร้างคำขอสถานะ pending, GET /api/requests?groupId=... ให้เจ้าของดูคำขอ, POST /api/requests/:id/approve และ /reject ให้เจ้าของตัดสินใจ  
* บังคับกติกาธุรกิจ: ส่งคำขอซ้ำตอบ 409, กลุ่มเต็มตอบ 422, ผู้ที่ไม่ใช่เจ้าของอนุมัติ/ปฏิเสธตอบ 403, อนุมัติสำเร็จเพิ่มสมาชิกเพียงครั้งเดียว และคำขอที่ถูกตัดสินแล้วไม่ถูกอนุมัติซ้ำ  
* ทำ unit tests ให้ครอบคลุมกติกาข้างต้นและกรณี group/request ไม่มี; ตกลงกับสมาชิก 3 ว่าใครเป็นแหล่งข้อมูลสมาชิกจริงและจะจอง/ยืนยันที่นั่งอย่างไร เพื่อไม่ให้คำขอสองรายการทำให้เกินจำนวน  
* เมื่ออนุมัติหรือปฏิเสธ ให้เรียก Notification Service ผ่าน NOTIFY\_URL จาก environment; หากแจ้งเตือนล้มเหลว ให้กำหนดพฤติกรรมและบันทึก error โดยไม่ทำให้การตัดสินคำขอซ้ำหรือข้อมูลสมาชิกเพี้ยน  
* ทำหน้า requests.html สำหรับส่งคำขอและหน้าของเจ้าของกลุ่มสำหรับอนุมัติ/ปฏิเสธ พร้อมแสดงสถานะและข้อความผิดพลาดที่ API ส่งกลับ

## **สมาชิก 5 — Notification Service และผู้ประสานงานทดสอบ (Tester)**

* ทำ API: GET /api/notifications/:userId อ่านรายการ, POST /api/notifications สร้างรายการจาก Membership Service, PATCH /api/notifications/:id/read ทำเครื่องหมายว่าอ่านแล้ว; ป้องกันผู้ใช้ดูหรือแก้ notification ของคนอื่น  
* ทำ unit tests สำหรับสร้าง/อ่าน/mark as read, user ไม่ตรงสิทธิ์, notification ไม่มี และรูปแบบข้อมูลผิด พร้อมหน้า notifications.html หรือส่วนแสดงการแจ้งเตือนในหน้าเว็บ  
* รวบรวม Test Specification จาก PM เป็น automated tests; ทำ integration/e2e test ที่รันบริการตามลำดับและตรวจ flow login → ตั้งวิชา → สร้างกลุ่ม → ขอเข้าร่วม → เจ้าของอนุมัติ → ผู้ขอเห็นแจ้งเตือน  
* ตรวจผล CI ของทั้ง 5 repositories, เปิด issue พร้อมขั้นตอนทำซ้ำและผลที่คาด/ได้จริง, จัดลำดับ bug ตามความรุนแรง และมอบให้เจ้าของ service แก้ จากนั้นรันทดสอบซ้ำและบันทึกผล  
* ผู้ประสานงานทดสอบไม่ใช่ผู้เขียน test เพียงคนเดียว: เจ้าของแต่ละ service ต้องดูแล unit tests ของตน ส่วนสมาชิก 5 ดูแลการประกอบชุดทดสอบและรายงานผลรวม

# **9\. ข้อตกลงการเชื่อมต่อและการส่งต่องาน**

* Environment variables ใช้ AUTH\_URL, PROFILE\_URL, GROUP\_URL, MEMBER\_URL และ NOTIFY\_URL โดยมีค่า default สำหรับ local ที่ localhost:3001–3005; ห้ามเขียน URL ปลายทางตายตัวใน source code  
* ทุก API ส่งและรับ JSON ใช้ชื่อ field และ HTTP status ตาม API\_CONTRACT.md; เวลานัดใช้รูปแบบ ISO 8601 พร้อม timezone ที่ทีมตกลง; response error ควรมีโครงสร้างเดียวกัน เช่น { error, message }  
* แต่ละ repository มี .env.example ที่ไม่มี secret จริง, README สำหรับติดตั้ง/ทดสอบ/รัน, Dockerfile และ GitHub Actions workflow; อย่า commit .env, password, token หรือข้อมูลส่วนตัว  
* ทำงานผ่าน branch เช่น feature/auth-login หรือ fix/group-capacity; ห้าม push ตรงเข้า main. Pull Request ต้องอธิบายการเปลี่ยนแปลง, วิธีทดสอบ, ผล test และการเปลี่ยน API; อย่างน้อยหนึ่งคนที่ไม่ใช่ผู้เขียน review ก่อน merge  
* เมื่อ service เปลี่ยน contract ให้แจ้งผู้ใช้ปลายทางของ API, อัปเดต API\_CONTRACT.md, ปรับ mock/consumer tests และ merge การเปลี่ยนแปลงที่เข้ากันได้ก่อน deploy รุ่นใหม่

# **10\. ลำดับงานร่วมกันตามขั้นตอน**

1. ยืนยันขอบเขตและสัญญากลาง — PM รวบรวม requirement, API\_CONTRACT.md, ports, environment variables, รูปแบบ error, วิธีตรวจ token, เจ้าของข้อมูลสมาชิก/ที่นั่ง และ Test Specification; สมาชิกทุกคน review และยืนยันก่อนเริ่มเชื่อม service  
2. ตั้งโครงและเครื่องมือของทุก service — สร้าง repository/branch, โครง source และ test, database, health endpoint, .env.example, README, Dockerfile และ GitHub Actions พื้นฐาน; แต่ละ service ต้องติดตั้งและรัน local ได้ และมี test เริ่มต้น  
3. พัฒนา service ตามสัญญา — เจ้าของแต่ละ service ทำ API, validation, authorization, unit tests และหน้าเว็บที่เกี่ยวข้อง; เปิด Pull Request ขนาดเล็กพร้อมวิธีทดสอบและให้สมาชิกอีกคน review ก่อน merge  
4. เชื่อมหน้าเว็บและบริการเข้าด้วยกัน — ตั้งค่า URL ผ่าน environment, เชื่อม login/token, profile/วิชา, กลุ่มอ่าน, คำขอสมาชิก และ notification; ทดลอง flow หลักจากต้นจนจบและแก้ response, CORS, port หรือ permission ที่ไม่ตรงกัน  
5. ทดสอบรวมและทำให้ระบบเสถียร — รัน unit, integration, end-to-end, smoke และ regression tests; บันทึก bug พร้อมขั้นตอนทำซ้ำ ให้เจ้าของ service แก้และรันทดสอบซ้ำ; build และทดลองรันแต่ละ Docker image  
6. ปล่อยเวอร์ชันและเตรียมส่ง — เมื่อ CI ผ่าน ให้สร้าง Release tag เช่น v1.0.0, push image ของทุก service ไปยัง Docker Hub/Container Registry, ตรวจชื่อและ tag ของ image, ทดสอบ flow จาก image และเตรียม demo/คำอธิบายงานของสมาชิกทุกคน

# **11\. Definition of Done — งานหนึ่งชิ้นถือว่าเสร็จเมื่อ**

* API/หน้าเว็บทำงานตาม contract และตรวจ input, error, authentication/authorization ที่เกี่ยวข้องแล้ว  
* มี unit test สำหรับ logic หลักและกรณีผิดพลาด; local test ผ่าน และ GitHub Actions ผ่านบน Pull Request  
* Docker image build ได้, service อ่าน config จาก environment, README มีวิธี run/test และไม่มี secret ใน repository  
* PR ผ่าน review และ merge แล้ว; ถ้าเกี่ยวกับ flow ข้าม service ให้ integration/e2e test ผ่านด้วย  
* ก่อนส่งงานจริง: ทุก service มี image ที่ถูก tag และ push ไป Container Registry สำเร็จ; ทีมทดสอบ flow หลักและสมาชิกทุกคนอธิบายส่วนที่รับผิดชอบได้

