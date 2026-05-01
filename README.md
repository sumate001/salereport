# Sales Royalty Report Generator

ระบบสร้างรายงาน Sales Royalty สำหรับลิขสิทธิ์ต่างประเทศ สร้างไฟล์ Excel แยกตาม Agency และ ISBN โดยอัตโนมัติ

## ไฟล์ที่ต้องใช้

| ไฟล์ | Sheet | รายละเอียด |
|---|---|---|
| `ยอดขาย-ลิขสิทธิ์.xlsx` | `Item` | Master ยอดขายและข้อมูลหนังสือทุกเล่ม |
| `1.Intra RptRightAcc_Annual-Western.xlsx` | (sheet แรก) | สัญญา Annual ฝั่ง Western |
| `2.Intra RptRightAcc_Annual-Asia.xlsx` | (sheet แรก) | สัญญา Annual ฝั่ง Asia |
| `3.Intra RptRightAcc_BI-Annual-Western.xlsx` | (sheet แรก) | สัญญา BI-Annual ฝั่ง Western |
| `4.Intra RptRightAcc_BI-Annual-Asia.xlsx` | (sheet แรก) | สัญญา BI-Annual ฝั่ง Asia |
| `อัตราแลกเปลี่ยน.xlsx` | `อัตราแลกเปลี่ยน` | Exchange rate รายไตรมาส |

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

## การใช้งาน

1. **อัปโหลดไฟล์** — เลือกไฟล์ทั้ง 6 ไฟล์
2. **เลือก Period** — BI-Annual 2025.1 / BI-Annual 2025.2 / Annual 2025 / ทุกรอบ
3. **สร้างรายงาน** — ระบบสร้าง Excel ทุก Agency อัตโนมัติ
4. **ดาวน์โหลด ZIP**

## Tech Stack

- **Backend**: FastAPI + pandas + openpyxl
- **Frontend**: React + Vite + Tailwind CSS
