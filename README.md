# Sales Royalty Report Generator

ระบบสร้างรายงาน Sales Royalty สำหรับลิขสิทธิ์ต่างประเทศ สร้างไฟล์ Excel แยกตาม Agency และ ISBN โดยอัตโนมัติ

**Version 0.25**

---

## ไฟล์ที่ต้องใช้

| ไฟล์ | Sheet | รายละเอียด |
|---|---|---|
| `ยอดขาย-ลิขสิทธิ์.xlsx` | `Item` | Master ยอดขายและข้อมูลหนังสือทุกเล่ม |
| `1.Intra RptRightAcc_Annual-Western.xlsx` | (sheet แรก) | สัญญา Annual ฝั่ง Western |
| `2.Intra RptRightAcc_Annual-Asia.xlsx` | (sheet แรก) | สัญญา Annual ฝั่ง Asia |
| `3.Intra RptRightAcc_BI-Annual-Western.xlsx` | (sheet แรก) | สัญญา BI-Annual ฝั่ง Western |
| `4.Intra RptRightAcc_BI-Annual-Asia.xlsx` | (sheet แรก) | สัญญา BI-Annual ฝั่ง Asia |
| `อัตราแลกเปลี่ยน.xlsx` | `อัตราแลกเปลี่ยน` | Exchange rate รายไตรมาส |

---

## โครงสร้าง Output (ZIP)

```
SalesReports_All_{period}.zip
├── Agency_Name_A/
│   ├── 9786161856748 - ชื่อหนังสือ.xlsx
│   ├── 9786161879914 - ชื่อหนังสือ.xlsx
│   └── ...
├── Agency_Name_B/
│   └── ...
```

แต่ละไฟล์ Excel มีส่วนประกอบดังนี้:
- Header: SALES REPORT / KADOKAWA CORPORATION / Agency / Publisher / Period
- ตาราง: JOB, ISBN, Title (TH+EN), Copies Printed, Date Printed, Retail Price, Royalty Rate, Copies Sold, Amount (THB), Amount (สกุลเงิน), Advanced Payment, Previous Balance

---

## การคำนวณ Royalty

### Single Rate
ถ้าไฟล์ Intra ไม่มีเงื่อนไข Tiered → ใช้ Royalty Rate จาก Item file เดียว

### Tiered Rate (ขั้นบันได)
ถ้าไฟล์ Intra กำหนด `rt1_text / rt1_price` ขึ้นไป → แบ่งคำนวณตามช่วงยอดขาย แสดงแยกบรรทัดในรายงาน

| rt_text | ความหมาย |
|---|---|
| `a1-3000` | เล่มที่ 1–3000 |
| `a3001` | เล่มที่ 3001 ขึ้นไป |
| `a` (ไม่มีตัวเลข) | ไม่นำมาคิด |

**ตัวอย่าง** ยอดขาย 3,500 เล่ม / Tier 1: 7% / Tier 2: 8%

| Copies | Rate | Amount |
|---|---|---|
| 3,000 | 7% | xxx |
| 500 | 8% | xxx |

Exchange Rate ใช้ตามไตรมาส: BI-Annual H1 → Q2, BI-Annual H2 → Q4, Annual → Q4

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

### รันครั้งถัดไป (ถ้า package ติดตั้งแล้ว)

```bash
# Terminal 1 — Backend
cd backend
python3 -m uvicorn main:app --reload --port 8001

# Terminal 2 — Frontend
cd frontend
npm run dev
```

---

## การใช้งาน

1. **อัปโหลดไฟล์** — เลือกไฟล์ทั้ง 6 ไฟล์
2. **เลือก Period** — BI-Annual 2025.1 / BI-Annual 2025.2 / Annual 2025 / ทุกรอบ
3. **สร้างรายงาน** — ระบบสร้าง Excel ทุก Agency อัตโนมัติ
4. **ดาวน์โหลด ZIP**

---

## Tech Stack

- **Backend**: FastAPI + pandas + openpyxl
- **Frontend**: React + Vite + Tailwind CSS

---

## Changelog

| Version | รายละเอียด |
|---|---|
| v0.25 | Tiered royalty rate (rt1–rt5), Title แสดง TH+EN, Date Printed format "May 31", AMOUNT header แสดง currency จริง |
| v1.0 | Initial release |
