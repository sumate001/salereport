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
        │   ├── GeneratePanel.jsx  ← เลือก period, filter by agent, generate
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
POST /api/generate-all  { dataset_id, period, isbn_filter[], filter_label, agency_filter }
→ main.py: โหลด paths จาก dataset.json
→ ReportEngine.generate_all(period, isbn_filter, agency_filter)
   → อ่าน item.xlsx + intra_*.xlsx + exchange.xlsx
   → filter by agency ถ้า agency_filter ระบุ
   → loop ทุก agency → loop ทุก ISBN/contract
   → _build_rows() → คำนวณ copies_sold, amount, royalty
   → _write_excel() → สร้าง .xlsx ต่อ contract (พร้อม Excel formulas)
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
| `GET` | `/api/datasets/{id}/books?q=` | ค้นหาชื่อหนังสือ (สำหรับ filter ตามปก) |
| `GET` | `/api/datasets/{id}/agencies?q=` | ค้นหาชื่อ Agent (สำหรับ filter ตาม agent) |
| `GET` | `/api/datasets/{id}/files/{slot}` | Download ไฟล์ต้นฉบับ |

### Generate

| Method | Path | คำอธิบาย |
|--------|------|----------|
| `POST` | `/api/generate-all` | สร้าง report ZIP |

Request body:
```json
{
  "dataset_id": "892f25fa-...",
  "period": "annual",
  "isbn_filter": [],
  "filter_label": "Discover 21, Inc.",
  "agency_filter": "Discover 21, Inc."
}
```
`period` options: `all` · `bi1` · `bi2` · `annual`

Response: `{ filename, period_label, size_bytes, ts_slug, dataset_id }`

### Reports

| Method | Path | คำอธิบาย |
|--------|------|----------|
| `GET` | `/api/reports` | List ทุก report |
| `GET` | `/api/reports/{filename}` | Download ZIP |
| `DELETE` | `/api/reports/{filename}` | ลบ ZIP + JSON metadata |

Security: ตรวจ `filename.startswith("..")` และไม่มี `/` หรือ `\` — รองรับชื่อ Agent ที่มี `..` เช่น `Discover 21, Inc.`

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

ไฟล์: `backend/report_engine.py`

### Class หลัก: `ReportEngine`

```python
engine = ReportEngine(item_path, intra_paths, exchange_path)
# intra_paths = list ของ 4 ไฟล์ [western_annual, asia_annual, western_bi, asia_bi]

zip_path = engine.generate_all(
    period='annual',
    output_dir='/tmp/...',
    isbn_filter=None,       # list ของ ISBN หรือ None = ทั้งหมด
    agency_filter=None,     # ชื่อ agency string หรือ None = ทุก agency
)
```

### Methods สำคัญ

| Method | คำอธิบาย |
|--------|----------|
| `generate_all()` | Entry point หลัก — สร้างทุก Excel แล้ว zip |
| `_build_rows()` | คำนวณ rows สำหรับ 1 contract/period |
| `_write_excel()` | เขียนไฟล์ .xlsx (header + data + styling + formulas) |
| `get_rate()` | ดึง exchange rate ตาม currency + period |
| `get_books()` | ค้นหาหนังสือจาก Item file (grouped by canonical title) |
| `get_agencies_from_item()` | ดึงรายชื่อ agency จาก Item file (สำหรับ agent search) |
| `get_dashboard_data()` | Aggregate data สำหรับ dashboard |
| `_passes_selloff()` | ตรวจ sell-off date ว่าหนังสือยังอยู่ในสัญญาหรือไม่ |

### Logic การคำนวณ Royalty

```
COPIES_SOLD (BI-H1)  = item[col40] + item[col42]   # Amarin H1 + ABook H1
COPIES_SOLD (BI-H2)  = item[col41] + item[col43]   # Amarin H2 + ABook H2
COPIES_SOLD (Annual) = item[col44]                  # Y.2025

AMOUNT_THB = COPIES_SOLD × RETAIL_PRICE × ROYALTY_RATE
AMOUNT_CCY = AMOUNT_THB ÷ AMT_EXCHANGE_RATE         # ใช้ ADV_CURRENCY ก่อน
```

ใน Excel file จะเขียนเป็น formula:
```
Col 9  (AMOUNT THB) = =F{r}*G{r}*H{r}
Col 10 (AMOUNT CCY) = =I{r}/$T$6         # T6 = exchange rate reference cell
Col 14 (PERIOD BAL) = =L{r}-(I10+I12+...)+M{r}
```

### Tiered Royalty (rt1–rt5)

ถ้า Intra file มี `rt1_text` / `rt1_price` → แบ่งคำนวณตามช่วงยอดขาย

```
rt_text "a1-3000"  → เล่มที่ 1 ถึง 3,000
rt_text "a3001"    → เล่มที่ 3,001 ขึ้นไป
rt_text "a"        → ไม่นำมาคิด (skip)
```

### E-Book Handling

- JOB ขึ้นต้นด้วย `EB/` = E-Book
- Amount (THB) ดึงจาก column ยอดจ่าย 2025 โดยตรง (ไม่ใช่ copies × price × rate)
- E-book rows ไม่เขียน formula ใน col 9 — ใช้ค่าตัวเลขแทน
- วันหมดอายุใช้ `EXP_DATE` แทน `SELL_OFF`

### Exchange Rate

- BI-Annual H1 → Q2, BI-Annual H2 → Q4, Annual → Q4
- `amt_cur = adv_cur or payment_currency` — AMOUNT (CCY) ใช้ ADV currency
- Exchange rate reference เก็บใน cell T6 ของแต่ละ Excel file
- JPY ในไฟล์ Item ใช้ชื่อ `JPY` แต่ Exchange sheet ใช้ `JYP` — มี workaround แล้ว

---

## 7. Column Mapping Reference

ไฟล์ทุกไฟล์ใช้ `skiprows=2` (header อยู่ row 3)

### Item Sheet (`ยอดขาย-ลิขสิทธิ์.xlsx`) — format ปัจจุบัน (ไม่มี "test" col)

| Index | ชื่อ column | ใช้เป็น |
|-------|-------------|---------|
| 1 | Item number | JOB |
| 2 | End date of receive | DATE PRINTED |
| 3 | Name (Thai) | TITLE TH |
| 8 | Price | RETAIL PRICE |
| 11 | ISBN | ISBN |
| 14 | Name (Eng) | TITLE EN |
| 15 | Agency | key สำหรับ group ต่อ agency |
| 17 | Annual/Bi-Annual | แยก BI / Annual |
| 18 | Job qty แจ้งเมืองนอก | NO. OF COPIES PRINTED |
| 32 | Rate Royalty | ROYALTY RATE |
| 33 | ADV | ADVANCED PAYMENT |
| 34 | ADV Currency | สกุลเงิน advance + AMOUNT (CCY) |
| 35 | Payment Currency | สกุลเงิน royalty (fallback) |
| 39 | ขาย H1.2025 (AMARIN) | BI-H1 Amarin channel |
| 40 | ขาย H2.2025 (AMARIN) | BI-H2 Amarin channel |
| 41 | ขาย H1.2025 (A-Book) | BI-H1 ABook channel |
| 42 | ขาย H2.2025 (A-Book) | BI-H2 ABook channel |
| 43 | ขาย Y.2025 | Annual copies sold |
| 71 | ยอดจ่าย 2024 | PREVIOUS BALANCE |
| 72 | สถานะ 2024 | "จ่ายแล้ว" → BALANCE PAID = col 71 |
| 74 | ยอดจ่าย 2025.1 | E-Book H1 net receipt |
| 75 | สถานะ 2025.1 | Pay status BI-H1 |
| 77 | ยอดจ่าย 2025.2 | E-Book H2 net receipt |
| 78 | สถานะ 2025.2 | Pay status BI-H2 |
| 80 | ยอดจ่าย 2025 | E-Book Annual net receipt |
| 81 | สถานะ 2025 | Pay status Annual |
| 84 | Stock คงเหลือ บัญชี | STOCK ACCOUNT |

> **ถ้าพบไฟล์ Item รูปแบบเก่า** (มี "test" column ที่ position 6) ทุก index ตั้งแต่ 5 ขึ้นไปจะต่างกัน 1 — ดู git history ก่อน v0.45

### Intra Sheet (4 ไฟล์, skiprows=3)

| Index | ชื่อ column | ใช้เป็น |
|-------|-------------|---------|
| 1 | Paidtype | Annual / Bi-Annual |
| 2 | Agent (รับ report) | agency label |
| 5 | Publisher | PUBLISHER |
| 6 | Country | COUNTRY |
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
│   ├── ค้นหา Agent (search → GET /api/datasets/{id}/agencies)
│   ├── เลือก 1 Agent → generate report เฉพาะ agent นั้น
│   │   ถ้าไม่เลือก → generate ทุก agent
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
    ├── แสดง filter_label badge (ชื่อ Agent) สำหรับ report ที่ filter
    └── ลบ report / snapshot / dataset
```

### State Flow ที่สำคัญ

- `historyKey` — increment เพื่อ force remount HistoryPanel (refetch จาก server)
- `onGenerationStart()` — clear `currentReports`, `currentErrors`, `currentDashboard` ก่อนเริ่ม job ใหม่
- การ generate หลาย periods ใช้ sequential loop — แสดง progress ทีละขั้น

### Report Filename Convention

```
report_{YYYYMMDD}_{HHMMSS}_{period}_{label_slug}.zip
report_{YYYYMMDD}_{HHMMSS}_{period}_{label_slug}.json   ← metadata
```

`label_slug` = filter_label ที่ sanitize แล้ว (ตัดอักขระ `\/:*?"<>|` ออก, max 60 chars)  
ถ้าไม่มี filter → ไม่มี label_slug ต่อท้าย

### Excel Path Length Limit (Windows)

ชื่อ folder/file ถูก truncate เพื่อไม่ให้ path รวมเกิน 260 chars (Windows MAX_PATH):
- Agency folder: max 40 chars
- Publisher folder: max 40 chars
- Book filename: max 100 chars

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
| 6 | Balance Paid ไม่มี column แยก | ใช้ workaround STATUS col = "จ่ายแล้ว" |

---

## 10. Hardcoded Values ที่ต้องแก้ก่อนปี 2026

### `report_engine.py`

```python
# 1. ฟังก์ชัน report_year_from_period() — คืนค่า 2025 เสมอ
def report_year_from_period(period: str) -> int:
    return 2025  # ← แก้ให้รับ year parameter หรือ detect จาก dataset

# 2. Column indices ใน Exchange Rate sheet
# ปี 2025: Q2=col30, Q4=col32
# ปี 2026: จะเลื่อนไป 4 column → ต้องตรวจสอบ

# 3. Header ใน Excel output (ค้นหา "2025" เพื่อหาทุก occurrence)
"ANNUAL 2025 (January – December 2025)"
"For the Period Ended December 31, 2025"

# 4. ItemCol: STATUS_BI1/BI2/ANNUAL และ EB_NET_BI1/BI2/ANNUAL
# columns เหล่านี้ถูก hardcode ตาม layout ปี 2025
# ถ้า dataset ปี 2026 มี column ใหม่เพิ่ม → ต้องอัปเดต
```

### `frontend/src/components/GeneratePanel.jsx`

```javascript
const PERIODS = [
  { id: 'bi1',    label: 'BI-Annual 2025.1', sub: 'ม.ค. – มิ.ย.' },
  { id: 'bi2',    label: 'BI-Annual 2025.2', sub: 'ก.ค. – ธ.ค.' },
  { id: 'annual', label: 'Annual 2025',       sub: 'ม.ค. – ธ.ค.' },
]
```

### `backend/main.py`

```python
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

### เพิ่ม period ใหม่

1. `backend/main.py` → เพิ่มใน `PERIOD_LABELS` และ validate ใน `generate_all()`
2. `backend/report_engine.py` → เพิ่ม logic ใน `_build_rows()` และ `get_rate()`
3. `frontend/src/components/GeneratePanel.jsx` → เพิ่มใน `PERIODS` array

### เพิ่ม input file slot ใหม่

1. `backend/main.py` → เพิ่มใน `POST /api/datasets` และ `dataset.json`
2. `backend/report_engine.py` → รับ path ใหม่ใน `__init__`
3. `frontend/src/components/HistoryPanel.jsx` → เพิ่มใน `FILE_SLOTS`
4. `frontend/src/components/UploadPanel.jsx` → เพิ่ม file input

### เพิ่ม dashboard widget

1. `backend/report_engine.py` → เพิ่ม calculation ใน `get_dashboard_data()`
2. `frontend/src/utils/dashboardHTML.js` → เพิ่ม HTML section ใน template

### แก้ Excel layout

ทั้งหมดอยู่ใน `_write_excel()` ใน `report_engine.py`  
ใช้ `openpyxl` — reference: https://openpyxl.readthedocs.io

### เพิ่ม Excel formula column ใหม่

1. เพิ่ม tracking ใน `write_section()` (เหมือน `pb_row` / `amount_rows`)
2. เขียน formula string แทน value: `ws.cell(...).value = f'=A{r}+B{r}'`
3. ตั้ง `number_format` ที่ cell เดียวกัน

---

## Changelog

| Version | รายละเอียด |
|---------|----------|
| v0.45 | Agent search filter (GET /agencies endpoint), ItemCol ใหม่ (ไม่มี test col), Excel formula cells (col 9,10,14), col 18 จ่ายค่าลิขสิทธิ์, security fix ชื่อไฟล์ที่มี ".." |
| v0.44 | Generate แยกต่อเล่ม (per-book jobs), error cards ใน ResultsPanel, filter_label badge ใน history |
| v0.43 | ชื่อ ZIP รวม book title เมื่อ filter, book title search UI |
| v0.42 | ชื่อไฟล์ Excel รวม EN+TH title |
| v0.41 | Filter report ตามชื่อหนังสือ |
| v0.40 | Report layout ตรงกับ reference 2023 |
| v0.37 | Web UI (React), dataset management, history panel |
| v0.25 | Tiered royalty (rt1–rt5), title TH+EN |
| v1.0 | Initial CLI release |
