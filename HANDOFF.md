# Sales Report Generator — Handoff Document

## สถานะปัจจุบัน

Backend engine ทดสอบผ่านแล้ว: โหลดข้อมูลได้ 150 agents, generate Excel ได้สำเร็จ  
Frontend และ API เขียนเสร็จแล้วแต่ยังไม่ได้รันจริง

---

## โครงสร้างโปรเจกต์

```
sales-report-app/
├── start.sh                  ← รันทั้ง backend+frontend พร้อมกัน
├── README.md
├── backend/
│   ├── main.py               ← FastAPI app (upload, generate, download)
│   ├── report_engine.py      ← Logic หลัก (อ่านข้อมูล + สร้าง Excel)
│   └── requirements.txt
└── frontend/
    ├── index.html
    ├── package.json
    ├── vite.config.js
    ├── tailwind.config.js
    ├── postcss.config.js
    └── src/
        ├── main.jsx
        ├── App.jsx
        └── components/
            ├── UploadStep.jsx       ← Step 1: อัปโหลด 3 ไฟล์
            ├── AgentSelectStep.jsx  ← Step 2: เลือก Agent
            └── GenerateStep.jsx     ← Step 3: เลือกรอบ + download
```

---

## วิธีรัน

```bash
# Terminal 1 — Backend
cd sales-report-app/backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8000

# Terminal 2 — Frontend
cd sales-report-app/frontend
npm install
npm run dev
# เปิด http://localhost:5173
```

---

## ไฟล์ Input ที่ต้องใช้ (upload ผ่าน UI)

| ไฟล์ | Sheet ที่ใช้ | บทบาท |
|------|------------|-------|
| `ยอดขาย-ลิขสิทธิ์.xlsx` | `Item` | Master หนังสือทุกเล่ม |
| `Data_Report_รายงานยอดขาย_รวม_Intra_4_ไฟล์.xlsx` | `Intra` | รายการสัญญาทั้งหมด |
| `อัตราแลกเปลี่ยน.xlsx` | `อัตราแลกเปลี่ยน` | Exchange rate รายไตรมาส |

---

## Column Mapping (สำคัญมาก)

### Item sheet (skiprows=2)

| Index | ชื่อ | ใช้ใน Report |
|-------|------|-------------|
| 1 | Item number | JOB |
| 2 | End date of receive | DATE PRINTED |
| 3 | Name (Thai) | TITLE |
| 9 | Price | RETAIL PRICE |
| 12 | ISBN | ISBN |
| 15 | Name (Eng) | TITLE (Eng) |
| 16 | Agency | **key สำหรับ filter Agent** |
| 18 | Annual/Bi-Annual | แยก BI / AN |
| 19 | Job qty แจ้งเมืองนอก | NO. OF COPIES PRINTED |
| 33 | Rate Royalty | ROYALTY RATE |
| 34 | ADV | ADVANCED PAYMENT |
| 35 | ADV Currency | — |
| 36 | Payment Currency | สกุลเงิน |
| 40 | ขาย H1.2025 (AMARIN) | BI-H1 copies sold (ส่วนที่ 1) |
| 41 | ขาย H2.2025 (AMARIN) | BI-H2 copies sold (ส่วนที่ 1) |
| 42 | ขาย H1.2025 (A-Book) | BI-H1 copies sold (ส่วนที่ 2) |
| 43 | ขาย H2.2025 (A-Book) | BI-H2 copies sold (ส่วนที่ 2) |
| 44 | ขาย Y.2025 | Annual copies sold |
| 72 | ยอดจ่าย 2024 | PREVIOUS BALANCE |
| 73 | สถานะ 2024 | เช็คว่า "จ่ายแล้ว" ก่อนดึง previous balance |

### Intra sheet (skiprows=2)

| Index | ชื่อ | ใช้ใน Report |
|-------|------|-------------|
| 6 | Agent(รับ report) | filter per Agent |
| 5 | Paidtype | Annual / Bi-Annual |
| 10 | Country | — |
| 31 | วันหมดอายุ | EXD (E-Book) |
| 32 | SellOffPeriod | Sell off (Book) |

### Exchange Rate sheet

- Row 3 = ชื่อปี, Row 4 = Q1/Q2/Q3/Q4
- Row 5+ = ข้อมูลแต่ละสกุลเงิน
- ปี 2025 อยู่ที่ col index 29(Q1), 30(Q2), 31(Q3), 32(Q4)
- **BI-Annual**: ใช้ Q2 สำหรับ H1, Q4 สำหรับ H2
- **Annual**: ใช้ Q4 เสมอ
- JPY ในไฟล์ใช้ชื่อ "JYP" (typo ในต้นฉบับ)

---

## Logic คำนวณหลัก

```
COPIES_SOLD (BI-H1)  = Item[40] + Item[42]   # AMARIN + A-Book H1
COPIES_SOLD (BI-H2)  = Item[41] + Item[43]   # AMARIN + A-Book H2
COPIES_SOLD (Annual) = Item[44]              # Y.2025

AMOUNT_THB = COPIES_SOLD × RETAIL_PRICE × ROYALTY_RATE
AMOUNT_CCY = AMOUNT_THB ÷ EXCHANGE_RATE

PREVIOUS_BALANCE = Item[72]  (เฉพาะเมื่อ Item[73] == "จ่ายแล้ว")
```

---

## สิ่งที่ยังต้องทำต่อ (TODO)

### 1. Excel Output Format
ตอนนี้ใช้ openpyxl เขียน basic layout  
ต้องปรับให้ตรงกับ template จริง (`ตัวอย่าง_Report_Kadokawa_...xlsx`) ในเรื่อง:
- Merge cells ตาม header หลายชั้น
- สีพื้นหลัง header (dark blue `#1F4E79`)
- Font: Arial, ขนาด 9-10
- Number format: `#,##0.00`
- Border ทุก cell

**ตัวอย่าง header จาก template:**
```
Row 6: TITLE | NO.OF COPIES PRINTED | DATE PRINTED | RETAIL PRICE | ROYALTY RATE | ...
Row 7: (unit labels)
Row 8: (sub labels)
Row 9: JOB | ISBN | ...
```

### 2. Previous Balance ที่ซับซ้อน
Sheet `ม.ค.69` ใน `ยอดขาย-ลิขสิทธิ์.xlsx` มีรายละเอียดค่าลิขสิทธิ์ค้างจ่าย  
Column สำคัญ:
- `[2]` เลขงาน → link กับ Item[1]
- `[27]` คงเหลือ ธ.ค.68 → ยอด balance ณ ปัจจุบัน
- `[26]` สถานะ → "ลิขสิทธิ์ต่างประเทศ"

Logic ที่ถูกต้อง:
```python
# ถ้า สถานะ 2024 = "จ่ายแล้ว" → ดึง ยอดจ่าย 2024 มาเป็น PREVIOUS BALANCE
# ถ้า สถานะ 2024 = "ค้างจ่าย" → ไม่ต้องใส่
# ถ้า สถานะ 2024 = "ยังไม่เกิน ADV" → ไม่ต้องใส่
```

### 3. Agent List Cleanup
ตอนนี้ list มีค่าแปลกปน เช่น `'0'`, partial names  
ต้อง filter ให้เหลือเฉพาะ Agency ที่ถูกต้อง:
```python
# เพิ่ม filter ใน get_agents():
foreign = self.item[
    (self.item[ItemCol.STATUS].str.contains("ต่างประเทศ")) &
    (self.item[ItemCol.AGENCY].str.len() > 5) &   # กรองชื่อสั้นเกินไป
    (~self.item[ItemCol.AGENCY].str.match(r'^\d+$'))  # กรองตัวเลขล้วน
]
```

### 4. E-Book handling
หนังสือที่ JOB ขึ้นต้น `EB/` = E-Book  
- ใช้ Royalty Rate แบบ "% of net Receipt" ไม่ใช่ % ของราคาปก
- แสดง `(E-Book)` ต่อท้าย title
- วันหมดอายุใช้ `วันหมดอายุ` แทน `SellOffPeriod`

### 5. Multi-Agent Batch Generate
เพิ่ม endpoint `/api/generate-all` ที่ loop generate ทุก Agent แล้ว zip ส่งกลับ

---

## API Endpoints

| Method | Path | คำอธิบาย |
|--------|------|---------|
| POST | `/api/upload` | รับ 3 ไฟล์, return รายชื่อ agents |
| POST | `/api/generate` | generate report สำหรับ 1 agent |
| GET | `/api/download?path=...` | download ไฟล์ที่ generate แล้ว |

### POST /api/generate body
```json
{
  "agent_name": "Tuttle-Mori Agency, Inc.",
  "item_path": "/tmp/.../item_ยอดขาย.xlsx",
  "intra_path": "/tmp/.../intra_Data.xlsx",
  "exchange_path": "/tmp/.../exchange.xlsx",
  "period": "all"
}
```
`period` options: `all` | `bi1` | `bi2` | `annual`

---

## Dependencies

**Backend** (`requirements.txt`)
```
fastapi==0.111.0
uvicorn==0.30.1
python-multipart==0.0.9
pandas==2.2.2
openpyxl==3.1.4
xlrd==2.0.1
numpy==1.26.4
```

**Frontend**
```
react 18, vite 5, tailwindcss 3
IBM Plex Sans Thai (Google Fonts)
```
