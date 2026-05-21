# Sales Royalty Report Generator — Developer Guide

คู่มือนี้สำหรับ developer ที่จะพัฒนาต่อยอดระบบ  
อ่าน `README.md` ก่อนเพื่อเข้าใจภาพรวม แล้วอ่านไฟล์นี้เพื่อเจาะลึกการทำงานภายใน

---

## สารบัญ

1. [Architecture Overview](#1-architecture-overview)
2. [Directory Structure](#2-directory-structure)
3. [Dev Environment Setup](#3-dev-environment-setup)
4. [Data Flow](#4-data-flow)
5. [Backend — API Endpoints](#5-backend--api-endpoints)
6. [Backend — Report Engine](#6-backend--report-engine)
7. [Column Mapping Reference](#7-column-mapping-reference)
8. [Frontend — Component Map](#8-frontend--component-map)
9. [Known Data Issues](#9-known-data-issues)
10. [Hardcoded Values ที่ต้องแก้ก่อนปี 2026](#10-hardcoded-values-ที่ต้องแก้ก่อนปี-2026)
11. [How to Extend](#11-how-to-extend)

---

## 1. Architecture Overview

```
Browser (React + Vite)
        │  HTTP  (proxy → port 8001)
        ▼
FastAPI (port 8001)
        │
        ├── Dataset store  ~/.sale_report/datasets/<uuid>/
        ├── Report store   ~/.sale_report/reports/
        └── Snapshot store ~/.sale_report/snapshots/
                │
                ▼
        ReportEngine (pandas + openpyxl)
```

- **No database.** ทุกอย่าง store เป็นไฟล์ใน `~/.sale_report/`
- **Stateless requests.** แต่ละ request อ่าน metadata จาก `dataset.json`
- **Frontend served จาก dist/.** Vite build แล้ว FastAPI serve `frontend/dist/` เป็น static files

---

## 2. Directory Structure

```
saleReport/
├── start.sh                   ← รัน backend + frontend พร้อมกัน (dev)
├── README.md
├── DEVELOPER.md               ← ไฟล์นี้
├── DATA_GAPS.md               ← ปัญหาข้อมูลที่ยังรอคำตอบจาก business
│
├── backend/
│   ├── main.py                ← FastAPI app: routes, session management, file I/O
│   ├── report_engine.py       ← Logic ทั้งหมด: อ่านข้อมูล, คำนวณ royalty, เขียน Excel
│   └── requirements.txt
│
└── frontend/
    ├── index.html
    ├── vite.config.js         ← proxy /api → http://localhost:8001
    ├── tailwind.config.js
    └── src/
        ├── App.jsx            ← Root: state management, callback wiring
        ├── components/
        │   ├── UploadPanel.jsx    ← อัปโหลดไฟล์, เลือก dataset
        │   ├── GeneratePanel.jsx  ← เลือก period, filter by book, generate
        │   ├── ResultsPanel.jsx   ← แสดงผลลัพธ์ + error cards รอบปัจจุบัน
        │   └── HistoryPanel.jsx   ← ประวัติ reports + snapshots ทั้งหมด
        └── utils/
            └── dashboardHTML.js  ← Template สร้าง HTML dashboard (client-side render)
```

---

## 3. Dev Environment Setup

### Prerequisites
- Python 3.9+
- Node.js 18+

### ติดตั้งและรัน

```bash
# ครั้งแรก
chmod +x start.sh
./start.sh

# ครั้งต่อไป (packages ติดตั้งแล้ว)
# Terminal 1 — Backend
cd backend && python3 -m uvicorn main:app --reload --port 8001

# Terminal 2 — Frontend
cd frontend && npm run dev
```

- Frontend dev server: `http://localhost:5174`
- Backend API docs: `http://localhost:8001/docs`
- API proxy: Vite forward `/api/*` → `http://localhost:8001`

### Build for production

```bash
cd frontend && npm run build
# output → frontend/dist/  (FastAPI serve เป็น static files)
```

---

## 4. Data Flow

### Upload Dataset

```
User drops 6 files
→ POST /api/datasets  (multipart/form-data)
→ main.py: บันทึกไฟล์ใน ~/.sale_report/datasets/<uuid>/
           บันทึก metadata → dataset.json
→ return: { dataset_id, label, ts_slug, original_filenames }
```

Dataset directory layout:
```
~/.sale_report/datasets/<uuid>/
├── dataset.json     ← metadata (label, ts_slug, file paths)
├── item.xlsx        ← ยอดขาย-ลิขสิทธิ์
├── intra_1.xlsx     ← Intra Annual Western
├── intra_2.xlsx     ← Intra Annual Asia
├── intra_3.xlsx     ← Intra BI-Annual Western
├── intra_4.xlsx     ← Intra BI-Annual Asia
└── exchange.xlsx    ← อัตราแลกเปลี่ยน
```

### Generate Report

```
POST /api/generate-all  { dataset_id, period, isbn_filter[], filter_label }
→ main.py: โหลด paths จาก dataset.json
→ ReportEngine.generate_all(period, isbn_filter)
   → อ่าน item.xlsx + intra_*.xlsx + exchange.xlsx
   → loop ทุก agency → loop ทุก ISBN/contract
   → _build_rows() → คำนวณ copies_sold, amount, royalty
   → _write_excel() → สร้าง .xlsx ต่อ contract
   → zip ทุกไฟล์ → return zip_path
→ copy zip → ~/.sale_report/reports/report_{ts}_{period}_{label}.zip
→ บันทึก metadata → report_{ts}_{period}_{label}.json
→ return: { filename, period_label, size_bytes, ts_slug }
```

---

## 5. Backend — API Endpoints

### Datasets

| Method | Path | คำอธิบาย |
|--------|------|----------|
| `POST` | `/api/datasets` | Upload 6 files, สร้าง dataset ใหม่ |
| `GET` | `/api/datasets` | List ทุก dataset |
| `PATCH` | `/api/datasets/{id}` | แก้ชื่อ label |
| `DELETE` | `/api/datasets/{id}` | ลบ dataset (ไฟล์ + metadata) |
| `GET` | `/api/datasets/{id}/books?q=` | ค้นหาชื่อหนังสือ (สำหรับ filter) |
| `GET` | `/api/datasets/{id}/files/{slot}` | Download ไฟล์ต้นฉบับ (slot: item/intra_1..4/exchange) |

### Generate

| Method | Path | คำอธิบาย |
|--------|------|----------|
| `POST` | `/api/generate-all` | สร้าง report ZIP |

Request body:
```json
{
  "dataset_id": "892f25fa-...",
  "period": "annual",
  "isbn_filter": ["9786161856748"],
  "filter_label": "A Dance with Dragons"
}
```
`period` options: `all` · `bi1` · `bi2` · `annual`

Response: `{ filename, period_label, size_bytes, ts_slug, dataset_id }`

Error (400): ไม่มีข้อมูลสำหรับ period นั้น (เช่น book ไม่มีข้อมูล BI)
Error (500): Report engine crash

### Reports

| Method | Path | คำอธิบาย |
|--------|------|----------|
| `GET` | `/api/reports` | List ทุก report (อ่านจาก `*.json` ใน reports dir) |
| `GET` | `/api/reports/{filename}` | Download ZIP |
| `DELETE` | `/api/reports/{filename}` | ลบ ZIP + JSON metadata |

### Dashboard

| Method | Path | คำอธิบาย |
|--------|------|----------|
| `GET` | `/api/dashboard?dataset_id=` | คำนวณ dashboard data (JSON) |
| `POST` | `/api/snapshots/save` | บันทึก HTML snapshot |
| `GET` | `/api/snapshots` | List ทุก snapshot |
| `GET` | `/api/snapshots/{filename}` | เปิด HTML snapshot |
| `DELETE` | `/api/snapshots/{filename}` | ลบ snapshot |

---

## 6. Backend — Report Engine

ไฟล์: `backend/report_engine.py` (~1,400 บรรทัด)

### Class หลัก: `ReportEngine`

```python
engine = ReportEngine(item_path, intra_paths, exchange_path)
# intra_paths = list ของ 4 ไฟล์ [western_annual, asia_annual, western_bi, asia_bi]

zip_path = engine.generate_all(period='annual', output_dir='/tmp/...', isbn_filter=['978...'])
```

### Methods สำคัญ

| Method | คำอธิบาย |
|--------|----------|
| `generate_all()` | Entry point หลัก — สร้างทุก Excel แล้ว zip |
| `_build_rows()` | คำนวณ rows สำหรับ 1 contract/period |
| `_write_excel()` | เขียนไฟล์ .xlsx (header + data + styling) |
| `get_rate()` | ดึง exchange rate ตาม currency + period |
| `get_dashboard_data()` | Aggregate data สำหรับ dashboard |
| `_passes_selloff()` | ตรวจ sell-off date ว่าหนังสือยังอยู่ในสัญญาหรือไม่ |

### Logic การคำนวณ Royalty

```
COPIES_SOLD (BI-H1)  = item[col40] + item[col42]   # Amarin H1 + ABook H1
COPIES_SOLD (BI-H2)  = item[col41] + item[col43]   # Amarin H2 + ABook H2
COPIES_SOLD (Annual) = item[col44]                  # Y.2025

AMOUNT_THB = COPIES_SOLD × RETAIL_PRICE × ROYALTY_RATE
AMOUNT_CCY = AMOUNT_THB ÷ EXCHANGE_RATE
```

### Tiered Royalty (rt1–rt5)

ถ้า Intra file มี `rt1_text` / `rt1_price` → แบ่งคำนวณตามช่วงยอดขาย

```
rt_text "a1-3000"  → เล่มที่ 1 ถึง 3,000
rt_text "a3001"    → เล่มที่ 3,001 ขึ้นไป
rt_text "a"        → ไม่นำมาคิด (skip)
```

ตัวอย่าง: ยอดขาย 3,500 เล่ม tier1=7% tier2=8%
→ Row 1: 3,000 เล่ม × 7%
→ Row 2: 500 เล่ม × 8%

### E-Book Handling

- JOB ขึ้นต้นด้วย `EB/` = E-Book
- Royalty คำนวณจาก `AMOUNT_THB` (col 81) โดยตรง ไม่ใช่ copies × price × rate
- วันหมดอายุใช้ `EXP_DATE` แทน `SELL_OFF`
- **จำนวน units sold ของ e-book ยังว่าง** — ดู `DATA_GAPS.md` ข้อ 5

### Exchange Rate

- BI-Annual H1 → Q2, BI-Annual H2 → Q4, Annual → Q4
- JPY ในไฟล์ Item ใช้ชื่อ `JPY` แต่ Exchange sheet ใช้ `JYP` (typo) — มี workaround ในโค้ดแล้ว

---

## 7. Column Mapping Reference

ไฟล์ทุกไฟล์ใช้ `skiprows=2` (header อยู่ row 3)

### Item Sheet (`ยอดขาย-ลิขสิทธิ์.xlsx`)

| Index | ชื่อ column | ใช้เป็น |
|-------|-------------|---------|
| 1 | Item number | JOB |
| 2 | End date of receive | DATE PRINTED |
| 3 | Name (Thai) | TITLE TH |
| 9 | Price | RETAIL PRICE |
| 12 | ISBN | ISBN |
| 15 | Name (Eng) | TITLE EN |
| 16 | Agency | key สำหรับ group ต่อ agency |
| 18 | Annual/Bi-Annual | แยก BI / Annual |
| 19 | Job qty แจ้งเมืองนอก | NO. OF COPIES PRINTED |
| 33 | Rate Royalty | ROYALTY RATE |
| 34 | ADV | ADVANCED PAYMENT |
| 35 | ADV Currency | สกุลเงิน advance |
| 36 | Payment Currency | สกุลเงิน royalty |
| 40 | ขาย H1.2025 (AMARIN) | BI-H1 Amarin channel |
| 41 | ขาย H2.2025 (AMARIN) | BI-H2 Amarin channel |
| 42 | ขาย H1.2025 (A-Book) | BI-H1 ABook channel |
| 43 | ขาย H2.2025 (A-Book) | BI-H2 ABook channel |
| 44 | ขาย Y.2025 | Annual copies sold |
| 72 | ยอดจ่าย 2024 | PREVIOUS BALANCE |
| 73 | สถานะ 2024 | "จ่ายแล้ว" → ใช้ col 72 |
| 81 | ยอดจ่าย 2025 | E-Book royalty amount |

### Intra Sheet (4 ไฟล์)

| Index | ชื่อ column | ใช้เป็น |
|-------|-------------|---------|
| 3 | Publisher / Intermediate Agent | PUBLISHER / AGENT (text รวม) |
| 5 | Paidtype | Annual / Bi-Annual |
| 6 | Agent (รับ report) | agency label |
| 10 | Country | COUNTRY |
| 31 | วันหมดอายุ | EXP_DATE (e-book) |
| 32 | SellOffPeriod | SELL_OFF (print book) |
| 56–70 | rt1_text … rt5_price | Tiered royalty tiers |

### Exchange Rate Sheet

- `skiprows=3`, header row คือ Q1/Q2/Q3/Q4
- ปี 2025 อยู่ที่ col index 29(Q1) 30(Q2) 31(Q3) 32(Q4)
- Q1 และ Q3 ว่างทุกปี (ไม่ได้ใช้)
- **ปี 2026 ต้องหา col index ใหม่** — ดูหัวข้อ 10

---

## 8. Frontend — Component Map

```
App.jsx
├── state: activeDataset, datasets, currentReports, currentErrors, currentDashboard, historyKey
│
├── UploadPanel
│   ├── แสดง list of datasets
│   ├── อัปโหลดชุดไฟล์ใหม่
│   └── เลือก / ลบ / แก้ชื่อ dataset
│
├── GeneratePanel
│   ├── เลือก period (checkbox: bi1, bi2, annual)
│   ├── ค้นหาหนังสือ (debounce search → GET /api/datasets/{id}/books)
│   ├── เลือกหลายเล่ม → generate แยกต่อเล่ม (1 job per book per period)
│   └── callbacks: onGenerationStart, onReportGenerated, onReportError, onDashboardGenerated
│
├── ResultsPanel
│   ├── แสดง error cards (สีแดง) สำหรับ jobs ที่ล้มเหลว
│   ├── แสดง report cards พร้อม download link
│   └── reset ทุกครั้งที่เริ่ม generation ใหม่
│
└── HistoryPanel  (key={historyKey} → remount เพื่อ refetch)
    ├── fetch GET /api/reports + GET /api/snapshots
    ├── group by dataset_id
    ├── แสดง filter_label badge สำหรับ report ที่ filter ตามหนังสือ
    └── ลบ report / snapshot / dataset
```

### State Flow ที่สำคัญ

- `historyKey` — increment เพื่อ force remount HistoryPanel (refetch จาก server)
- `onGenerationStart()` — clear `currentReports`, `currentErrors`, `currentDashboard` ก่อนเริ่ม job ใหม่
- การ generate หลาย jobs ใช้ sequential loop (ไม่ parallel) เพื่อแสดง progress ทีละขั้น

### Report Filename Convention

```
report_{YYYYMMDD}_{HHMMSS}_{period}_{label_slug}.zip
report_{YYYYMMDD}_{HHMMSS}_{period}_{label_slug}.json   ← metadata
```

`label_slug` = filter_label ที่ sanitize แล้ว (ตัดอักขระ `\/:*?"<>|` ออก)  
ถ้าไม่มี filter → ไม่มี label_slug ต่อท้าย

---

## 9. Known Data Issues

รายละเอียดเต็มอยู่ใน `DATA_GAPS.md` สรุปประเด็นหลัก:

| # | ปัญหา | ผลกระทบ |
|---|-------|---------|
| 1 | Payment Currency = `"Unknow"` ~54% ของ dataset | Amount (CCY) ผิดพลาด → แสดง rate 1.0 |
| 2 | JPY ใน Item file ↔ JYP ใน Exchange sheet | มี workaround แล้ว แต่เปราะบาง |
| 3 | Exchange Rate มีแค่ Q2/Q4 | Q1/Q3 ว่าง — ใช้ไม่ได้ |
| 4 | ปี hardcode เป็น 2025 | ปี 2026 จะพังทันที — ดูหัวข้อ 10 |
| 5 | E-Book units sold ไม่มีใน dataset | Copies Sold ของ e-book แสดงว่าง |
| 6 | Balance Paid ไม่มี column แยก | ใช้ workaround STATUS_2024 = "จ่ายแล้ว" |
| 10 | ISBN เดียวมีหลาย row ใน Intra | ใช้ heuristic เลือก primary row (อาจผิดพลาด) |

---

## 10. Hardcoded Values ที่ต้องแก้ก่อนปี 2026

จุดทั้งหมดที่ hardcode ปี 2025 — ถ้าไม่แก้จะได้ผลลัพธ์ผิดตั้งแต่ dataset ปี 2026 เป็นต้นไป:

### `report_engine.py`

```python
# 1. ฟังก์ชัน report_year_from_period() — คืนค่า 2025 เสมอ
def report_year_from_period(period: str) -> int:
    return 2025  # ← แก้ให้รับ year parameter หรือ detect จาก dataset

# 2. Column indices ใน Exchange Rate sheet
# ปี 2025 อยู่ที่ Q2=col30, Q4=col32
# ปี 2026 จะเลื่อนไป 4 column → Q2=col34, Q4=col36 (ขึ้นอยู่กับ format ไฟล์)
quarter = {'bi1': 'Q2', 'bi2': 'Q4', 'annual': 'Q4'}.get(period, 'Q4')
# ตรวจสอบ logic หาปีใน get_rate()

# 3. Header ใน Excel output
"ANNUAL 2025 (January – December 2025)"
"For the Period Ended December 31, 2025"
# ค้นหา "2025" ใน report_engine.py เพื่อหาทุก occurrence
```

### `frontend/src/components/GeneratePanel.jsx`

```javascript
// Period labels hardcode ปี 2025
const PERIODS = [
  { id: 'bi1',    label: 'BI-Annual 2025.1', sub: 'ม.ค. – มิ.ย.' },
  { id: 'bi2',    label: 'BI-Annual 2025.2', sub: 'ก.ค. – ธ.ค.' },
  { id: 'annual', label: 'Annual 2025',       sub: 'ม.ค. – ธ.ค.' },
]
```

### `backend/main.py`

```python
# PERIOD_LABELS dictionary
PERIOD_LABELS = {
    'bi1':    'BI-Annual 2025.1  (ม.ค. – มิ.ย.)',
    'bi2':    'BI-Annual 2025.2  (ก.ค. – ธ.ค.)',
    'annual': 'Annual 2025  (ม.ค. – ธ.ค.)',
    'all':    'All Periods 2025',
}
```

**วิธีแก้ที่แนะนำ:** เพิ่ม `year` field ใน dataset metadata ให้ user เลือกตอน upload แล้วส่ง `year` ไปทุก endpoint

---

## 11. How to Extend

### เพิ่ม period ใหม่ (เช่น quarterly)

1. `backend/main.py` → เพิ่มใน `PERIOD_LABELS` และ validate ใน `generate_all()`
2. `backend/report_engine.py` → เพิ่ม logic ใน `_build_rows()` และ `get_rate()`
3. `frontend/src/components/GeneratePanel.jsx` → เพิ่มใน `PERIODS` array

### เพิ่ม input file slot ใหม่

1. `backend/main.py` → เพิ่มใน `POST /api/datasets` (multipart field) และ `dataset.json`
2. `backend/report_engine.py` → รับ path ใหม่ใน `__init__`
3. `frontend/src/components/HistoryPanel.jsx` → เพิ่มใน `FILE_SLOTS`
4. `frontend/src/components/UploadPanel.jsx` → เพิ่ม file input

### เพิ่ม dashboard widget

1. `backend/report_engine.py` → เพิ่ม calculation ใน `get_dashboard_data()`
2. `frontend/src/utils/dashboardHTML.js` → เพิ่ม HTML section ใน template

### แก้ Excel layout

ทั้งหมดอยู่ใน `_write_excel()` ใน `report_engine.py`  
ใช้ `openpyxl` — reference: https://openpyxl.readthedocs.io

### แก้ปัญหา "Unknow" currency (DATA_GAPS #1)

เพิ่ม fallback ใน `get_rate()`:
```python
if currency in ('Unknow', '', None):
    currency = 'THB'  # หรือ default ที่ business กำหนด
```

---

## Changelog

| Version | รายละเอียด |
|---------|----------|
| v0.44 | Generate แยกต่อเล่ม (per-book jobs), error cards ใน ResultsPanel, filter_label ใน history badge, detect empty ZIP |
| v0.43 | ชื่อ ZIP รวม book title เมื่อ filter, filter ตาม book title (search UI) |
| v0.42 | ชื่อไฟล์ Excel รวม EN+TH title |
| v0.41 | Filter report ตามชื่อหนังสือ |
| v0.40 | Report layout ตรงกับ reference 2023 |
| v0.37 | Web UI (React), dataset management, history panel |
| v0.25 | Tiered royalty (rt1–rt5), title TH+EN, AMOUNT header แสดง currency |
| v1.0 | Initial CLI release |
