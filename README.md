# Sales Royalty Report Generator

ระบบสร้างรายงาน Sales Royalty สำหรับลิขสิทธิ์ต่างประเทศ  
สร้างไฟล์ Excel แยกตาม Agency และ ISBN โดยอัตโนมัติ พร้อม Web UI สำหรับ upload, generate, และดาวน์โหลด

**Version 0.45**

---

## ไฟล์ที่ต้องใช้ (6 ไฟล์)

| Slot | ไฟล์ | Sheet | รายละเอียด |
|------|------|-------|-----------|
| item | `ยอดขาย-ลิขสิทธิ์.xlsx` | `Item` | Master ยอดขายและข้อมูลหนังสือทุกเล่ม |
| intra_1 | `1.Intra RptRightAcc_Annual-Western.xlsx` | sheet แรก | สัญญา Annual ฝั่ง Western |
| intra_2 | `2.Intra RptRightAcc_Annual-Asia.xlsx` | sheet แรก | สัญญา Annual ฝั่ง Asia |
| intra_3 | `3.Intra RptRightAcc_BI-Annual-Western.xlsx` | sheet แรก | สัญญา BI-Annual ฝั่ง Western |
| intra_4 | `4.Intra RptRightAcc_BI-Annual-Asia.xlsx` | sheet แรก | สัญญา BI-Annual ฝั่ง Asia |
| exchange | `อัตราแลกเปลี่ยน.xlsx` | `อัตราแลกเปลี่ยน` | Exchange rate รายไตรมาส |

> **หมายเหตุ:** ระบบรองรับ Item file format ปัจจุบัน (ไม่มี "test" column ที่ position 6)  
> ดู [DEVELOPER.md](DEVELOPER.md) สำหรับรายละเอียด column mapping

---

## วิธีติดตั้งและรัน

### Requirements
- Python 3.9+
- Node.js 18+

### รันครั้งแรก

```bash
chmod +x start.sh
./start.sh
```

เปิดเบราว์เซอร์ที่ `http://localhost:5174`

### รันครั้งถัดไป (package ติดตั้งแล้ว)

```bash
# Terminal 1 — Backend
cd backend && python3 -m uvicorn main:app --reload --port 8001

# Terminal 2 — Frontend
cd frontend && npm run dev
```

---

## การใช้งาน

1. **อัปโหลดชุดข้อมูล** — เลือกไฟล์ทั้ง 6 ไฟล์พร้อมกัน ระบบจะจำชุดข้อมูลไว้
2. **เลือก Period** — BI-Annual 2025.1 / BI-Annual 2025.2 / Annual 2025 (เลือกได้หลายรอบพร้อมกัน)
3. **กรองตาม Agent** (ไม่บังคับ) — พิมพ์ชื่อ Agent ค้นหา แล้วเลือก 1 Agent  
   ถ้าเลือก Agent ระบบจะออก report เฉพาะ Agent นั้นทุกเล่ม  
   ถ้าไม่เลือก — ออกทุก Agent
4. **กด "สร้าง Report"** — ผลลัพธ์แสดงที่แผงขวา พร้อมดาวน์โหลดทันที
5. **ประวัติ** — ด้านล่างแสดง report ทุกชุดที่เคย generate พร้อม badge ชื่อ Agent

---

## โครงสร้าง Output (ZIP)

```
report_{date}_{time}_{period}_{agent_name}.zip
└── Agency_Name/
    └── Publisher_Name/
        ├── 9786161856748 - A Dance with Dragons - มังกรร่อนระบำ.xlsx
        └── ...
```

แต่ละไฟล์ Excel ประกอบด้วย:
- **Header rows 1–6**: SALES REPORT · Amarin · Agency · Publisher · Period type · Period end date
- **ตาราง (18 column)**: JOB · ISBN · Title (TH+EN) · Copies Printed · Date Printed · Retail Price · Royalty Rate · Copies Sold · **Amount (THB)** · **Amount (CCY)** · Advanced Payment · Previous Balance · Balance Paid · **Period Balance** · Unsold Copies · Stock Account · DIF · จ่ายค่าลิขสิทธิ์
- **Formulas**: col 9 (`=F*G*H`), col 10 (`=I/$T$6`), col 14 (`=L-SUM(amounts)+M`)
- **Exchange rate note** และ **Contract expiry note** ใต้ตาราง

---

## การคำนวณ Royalty

### Single Rate
ถ้าไม่มีเงื่อนไข Tiered → ใช้ Royalty Rate จาก Item file

### Tiered Rate (ขั้นบันได)
ถ้า Intra file กำหนด `rt1_text / rt1_price` → แบ่งคำนวณตามช่วงยอดขาย

| rt_text | ความหมาย |
|---------|---------|
| `a1-3000` | เล่มที่ 1–3,000 |
| `a3001` | เล่มที่ 3,001 ขึ้นไป |
| `a` | ไม่นำมาคิด |

### Period Balance
```
PERIOD BALANCE = PREVIOUS BALANCE − Σ AMOUNT(THB) + BALANCE PAID
```

### Exchange Rate
- BI-Annual H1 → Q2, BI-Annual H2 → Q4, Annual → Q4
- AMOUNT (CCY) ใช้ ADV Currency เป็นสกุลเงิน (fallback เป็น Payment Currency)
- Rate reference เก็บใน cell T6 ของแต่ละ Excel ไฟล์

---

## Tech Stack

| Layer | เทคโนโลยี |
|-------|-----------|
| Backend | Python 3.9 · FastAPI · pandas · openpyxl |
| Frontend | React 18 · Vite 5 · Tailwind CSS 3 |
| Storage | ไฟล์ใน `~/.sale_report/` (ไม่มี database) |

---

## สำหรับ Developer

ดู **[DEVELOPER.md](DEVELOPER.md)** สำหรับ:
- Architecture diagram และ data flow
- API endpoint reference ทั้งหมด
- Column mapping ของทุกไฟล์ input
- Known data issues และ workarounds
- Hardcoded values ที่ต้องแก้ก่อนปี 2026
- วิธีเพิ่ม period / widget / input file ใหม่

---

## Changelog

| Version | รายละเอียด |
|---------|----------|
| v0.45 | Agent search filter · ItemCol ใหม่ (ไม่มี test col) · Excel formula cells (col 9,10,14) · col 18 จ่ายค่าลิขสิทธิ์ · security fix ชื่อไฟล์มี ".." |
| v0.44 | Generate แยกต่อเล่ม · error cards ใน ResultsPanel · filter_label badge ในประวัติ |
| v0.43 | ชื่อ ZIP รวม book title · filter report ตามชื่อหนังสือ |
| v0.42 | ชื่อไฟล์ Excel รวม EN+TH title |
| v0.40 | Report layout ตรงกับ reference 2023 |
| v0.37 | Web UI · dataset management · history panel |
| v0.25 | Tiered royalty (rt1–rt5) · title TH+EN · AMOUNT header แสดง currency |
| v1.0 | Initial release |
