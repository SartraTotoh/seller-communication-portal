Seller Communication Portal v4.9.0 — One-click Content Operations

วิธีเริ่ม: แตก ZIP ทั้งโฟลเดอร์ แล้วดับเบิลคลิก
Seller-Comms-Portal-v4.9.0-OneClick-ContentOps\ONE_CLICK_FIX_ALL.bat
ใช้บัญชี Workspace ที่มีสิทธิ์ในโปรเจกต์เดิม เมื่อ Google ขอ Login/Consent ให้ทำตามหน้าจอ
ห้ามรันจากในหน้าต่าง ZIP โดยยังไม่แตกไฟล์

ชุดนี้อัปเดตเฉพาะ Seller Communication: seller-communication-portal
ไม่ Deploy ทับ Seller Education หรือ THSP

สิ่งที่เพิ่มในหน้า Content Operations
1. Readiness Checklist ตรวจ Caption, Owner, Channel/Account, Asset และลิงก์ที่จำเป็น
2. Feedback pending + requeue พร้อม source adapter ที่บันทึก FAILED/Retry และ polling ขณะเปิดหน้า
3. Content version/approval; แก้เนื้อหาแล้วต้องอนุมัติใหม่และจัดตารางใหม่
4. Calendar conflict สำหรับ Content Operations ช่องทางและบัญชีเดียวกันภายใน 30 นาที
5. Append-only audit journal และ Admin restore เป็นเวอร์ชันใหม่ที่ยังไม่อนุมัติ
6. Quality/Channel Performance: สถานะส่งตรงเวลา ช่วงวัดผล Organic/Paid และ CSV export
7. THSP read-only feed พร้อม source ownership และตัวเชื่อม downstream

บทบาท
REQUESTER: จัดการ Content ของตนเองและดูข้อมูลที่มีสิทธิ์
COMMS: จัดการ Content จัดตาราง บันทึกลิงก์เผยแพร่และผล Tracking
REVIEWER: ตรวจและอนุมัติ Content; อ่านข้อมูล Operations
ADMIN: จัดการทุกขั้นตอนและ Restore
สิทธิ์ตรวจบน backend และต้องเป็น active Workspace user

ข้อจำกัดที่ต้องทราบก่อน Deploy
- สร้างจากแพ็กเกจ v4.8.5 ที่ค้นพบ ไม่ได้ยืนยันเทียบ production หรือ source ที่แก้นอกแพ็กเกจ
- โครงสร้างเดิมยังใช้ Apps Script + Google Sheets DB; ยังไม่ได้ย้ายฐานข้อมูลออกจาก Sheets
- Content Operations เป็นโมดูลใหม่ แยกจาก Content/PN/SCA/Social records เดิม ไม่มีการย้ายข้อมูลอัตโนมัติ
- การตรวจตารางชนและ THSP feed ครอบคลุม Content Operations เท่านั้น
- บันทึก Published เป็นหลักฐานจากทีม ไม่ใช่ Social API auto-post
- Metrics เป็นการกรอกพร้อม evidence URL ไม่ใช่ดึง Social API อัตโนมัติ
- readiness ตรวจรูปแบบ HTTPS URL ไม่ได้พิสูจน์ว่าแต่ละผู้ใช้เปิดไฟล์ Asset ได้
- ตัวเชื่อม Seller Education และ THSP รวมใน integration/ แต่ยังต้องติดตั้งและ map กับ source code จริงของสอง Portal
- Source polling ทำงานขณะเปิด Portal และมี Workspace session เท่านั้น ไม่ใช่ background server job
- การอนุญาต Google ครั้งแรกไม่สามารถทำแทนผู้ใช้โดยหลบ consent ได้
- Audit เป็น append-only ในระดับแอป ผู้มีสิทธิ์แก้ DB โดยตรงยังสามารถแก้ข้อมูลได้

สถานะทดสอบ
ดู VALIDATION-v4.9.0.txt: 260 package/regression checks และ 20 behavioral tests ผ่าน
การ Deploy จริง, Google consent และทดสอบครบสาม Portal ยังไม่ดำเนินการ
อ่าน integration/INTEGRATION.md สำหรับ source callbacks และเกณฑ์รับงานสาม Portal
