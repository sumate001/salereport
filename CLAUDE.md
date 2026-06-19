# Sales Royalty Report Generator — CLAUDE.md

คู่มือสำหรับ AI assistant เพื่อให้ต่อเนื่องได้ทันทีในทุก session

---

## ภาพรวมโปรเจกต์

ระบบสร้างรายงาน Sales Royalty สำหรับลิขสิทธิ์ต่างประเทศ  
รับ Excel ต้นฉบับ 6 ไฟล์ → คำนวณ royalty → สร้าง Excel report แยกต่อ Agency/Contract → ZIP → ดาวน์โหลด

มี 2 output mode:
1. **สร้าง Report** (ปีปัจจุบัน) — dataset 6 ไฟล์ → generate ZIP
2. **ข้อมูลย้อนหลัง** — แปลงไฟล์ report เก่า (DataSale/) ให้เป็น format ใหม่
3. **รวมข้อมูลย้อนหลัง** (Step 2) — นำ output จาก 1 + 2 มา stack ตามปี → ZIP ฉบับสมบูรณ์

**Working directory:** `/Users/sumate/Desktop/project/salereport`  
**Version:** v0.46

---

## Stack & Versions

| Layer | Technology | Version |
|-------|-----------|---------|
| Backend | Python FastAPI | 0.111.0 |
| Server | Uvicorn | 0.30.1 |
| Data | pandas | 2.2.2 |
| Excel read/write | openpyxl | 3.1.4 |
| Excel legacy read | xlrd | 2.0.1 |
| Numeric | numpy | 1.26.4 |
| HTTP parser | python-multipart | 0.0.9 |
| Frontend | React + Vite | - |
| Styling | TailwindCSS | - |

---

## โครงสร้างไฟล์

```
salereport/
├── CLAUDE.md                  ← ไฟล์นี้
├── README.md                  ← คู่มือผู้ใช้
├── DEVELOPER.md               ← รายละเอียด dev เต็ม (column mapping, flow)
├── DATA_GAPS.md               ← ปัญหาข้อมูลที่รอคำตอบจาก business
├── start.sh                   ← รัน dev mode (backend + frontend พร้อมกัน)
├── DataSale/                  ← ไฟล์ตัวอย่าง + legacy reports
│
├── backend/
│   ├── main.py                ← FastAPI app: routes, session management, file I/O
│   ├── report_engine.py       ← Logic ทั้งหมด: อ่านข้อมูล, คำนวณ, เขียน Excel
│   ├── legacy_converter.py    ← แปลง report เก่าจาก DataSale/ → format ใหม่
│   ├── history_merger.py      ← รวม report ปัจจุบัน + legacy output → ZIP ฉบับสมบูรณ์
│   ├── diag.py                ← diagnostic tool
│   └── requirements.txt
│
└── frontend/
    ├── index.html
    ├── vite.config.js         ← proxy /api → http://localhost:8002
    └── src/
        ├── App.jsx            ← Root: state management, callback wiring
        └── components/
            ├── UploadPanel.jsx      ← อัปโหลดไฟล์, เลือก/ลบ dataset
            ├── GeneratePanel.jsx    ← เลือก period, filter agent, generate
            ├── ResultsPanel.jsx     ← แสดงผลลัพธ์ (Step 1) + error cards
            ├── MergePanel.jsx       ← Step 2: เลือก report + legacy → รวมข้อมูล
            ├── HistoryPanel.jsx     ← ประวัติ reports + snapshots
            └── LegacyImportPanel.jsx ← UI แปลงข้อมูลย้อนหลัง
```

---

## Storage (ไม่มี database)

```
~/.sale_report/
├── datasets/<uuid>/
│   ├── meta.json         ← { id, label, ts_slug, original_filenames }
│   ├── item.xlsx
│   ├── intra_1.xlsx … intra_4.xlsx
│   ├── exchange.xlsx
│   └── output/           ← temp output ระหว่าง generate
├── reports/              ← ZIP + JSON metadata ของทุก report (Step 1 output)
├── dashboards/           ← HTML snapshots
├── legacy_reports/       ← ZIP ที่แปลงจาก legacy (Step 2 input)
└── merged_reports/       ← ZIP ที่รวมแล้ว (Step 2 output)
```

---

## ไฟล์ Input ที่ต้องใช้ (6 slots)

| Slot | ไฟล์ | Sheet | รายละเอียด |
|------|------|-------|-----------|
| `item` | ยอดขาย-ลิขสิทธิ์.xlsx | `Item` | Master ยอดขาย + ข้อมูลหนังสือ |
| `intra_1` | Intra Annual-Western.xlsx | sheet แรก | สัญญา Annual ฝั่ง Western |
| `intra_2` | Intra Annual-Asia.xlsx | sheet แรก | สัญญา Annual ฝั่ง Asia |
| `intra_3` | Intra BI-Western.xlsx | sheet แรก | สัญญา BI-Annual ฝั่ง Western |
| `intra_4` | Intra BI-Asia.xlsx | sheet แรก | สัญญา BI-Annual ฝั่ง Asia |
| `exchange` | อัตราแลกเปลี่ยน.xlsx | `อัตราแลกเปลี่ยน` | Exchange rate รายไตรมาส |

---

## การรัน Development

```bash
# วิธีที่ 1: script รวม
./start.sh

# วิธีที่ 2: แยกกัน
# Terminal 1 — Backend
cd backend && python3 -m uvicorn main:app --reload --port 8002

# Terminal 2 — Frontend
cd frontend && npm run dev
```

**URLs:**
- Frontend: http://localhost:5174
- Backend API docs: http://localhost:8002/docs
- Vite proxy: `/api/*` → `http://localhost:8002`

> **สำคัญ:** port backend คือ **8002** ไม่ใช่ 8001  
> ตรวจสอบได้จาก `frontend/vite.config.js` → `proxy.target`

---

## API Endpoints สรุป

### Datasets
| Method | Path | คำอธิบาย |
|--------|------|----------|
| `POST` | `/api/datasets` | Upload 6 files, สร้าง dataset |
| `GET` | `/api/datasets` | List ทุก dataset |
| `PATCH` | `/api/datasets/{id}` | แก้ชื่อ label |
| `DELETE` | `/api/datasets/{id}` | ลบ dataset |
| `GET` | `/api/datasets/{id}/books?q=` | ค้นหาชื่อหนังสือ |
| `GET` | `/api/datasets/{id}/agencies?q=` | ค้นหาชื่อ Agent |
| `GET` | `/api/datasets/{id}/files/{slot}` | Download ไฟล์ต้นฉบับ |

### Generate (Step 1)
| Method | Path | Body |
|--------|------|------|
| `POST` | `/api/generate-all` | `{ dataset_id, period, isbn_filter[], filter_label, agency_filter }` |

`period` options: `all` · `bi1` · `bi2` · `annual`

### Reports
| Method | Path | คำอธิบาย |
|--------|------|----------|
| `GET` | `/api/reports` | List ทุก report ZIP |
| `GET` | `/api/reports/{filename}` | Download ZIP |
| `DELETE` | `/api/reports/{filename}` | ลบ |

### Dashboard / Snapshots
| Method | Path | คำอธิบาย |
|--------|------|----------|
| `GET` | `/api/dashboard?dataset_id=` | Dashboard data (JSON) |
| `POST` | `/api/snapshots/save` | บันทึก HTML snapshot |
| `GET` | `/api/snapshots/{filename}` | เปิด snapshot |
| `DELETE` | `/api/snapshots/{filename}` | ลบ snapshot |

### Legacy Convert (ข้อมูลย้อนหลัง)
| Method | Path | คำอธิบาย |
|--------|------|----------|
| `POST` | `/api/legacy/convert` | แปลง legacy reports (background job) |
| `GET` | `/api/legacy/jobs/{job_id}` | ตรวจ progress `{ status, current, total, pct, message }` |
| `GET` | `/api/legacy/reports` | List ทุก legacy ZIP |
| `GET` | `/api/legacy/reports/{filename}` | Download ZIP |
| `DELETE` | `/api/legacy/reports/{filename}` | ลบ |

### Merge History (Step 2)
| Method | Path | คำอธิบาย |
|--------|------|----------|
| `POST` | `/api/merge-history` | รวม report + legacy → merged ZIP |
| `GET` | `/api/merged-reports` | List ทุก merged ZIP |
| `GET` | `/api/merged-reports/{filename}` | Download merged ZIP |
| `DELETE` | `/api/merged-reports/{filename}` | ลบ |

**Body ของ `POST /api/merge-history`:**
```json
{
  "report_zip": "report_20260619_093457_annual.zip",
  "legacy_zip": "legacy_20260619_102940.zip"   // optional — ถ้าไม่ส่งใช้ latest
}
```

**Response:**
```json
{
  "filename": "merged_20260619_093457_annual_20260619_110259.zip",
  "legacy_zip": "legacy_20260619_102940.zip",
  "matched": 292,
  "unmatched": 7288,
  "total": 7580,
  "size_bytes": 46743058
}
```

---

## ReportEngine — Logic หลัก (report_engine.py)

### Classes

**`ItemCol`** — column indices (0-based) ของ Item sheet (skiprows=2):

| Const | Index | ความหมาย |
|-------|-------|---------|
| JOB | 1 | Job number |
| DATE_PRINTED | 2 | End date of receive |
| TITLE_TH | 3 | ชื่อภาษาไทย |
| PRICE | 8 | Retail price |
| ISBN | 11 | ISBN |
| TITLE_EN | 14 | ชื่อภาษาอังกฤษ |
| AGENCY | 15 | ชื่อ Agency |
| ANNUAL_BI | 17 | Annual / BI-Annual |
| COPIES_PRINTED | 18 | จำนวนพิมพ์ |
| ROYALTY_RATE | 32 | อัตราค่าลิขสิทธิ์ |
| ADV | 33 | Advanced payment |
| ADV_CURRENCY | 34 | สกุลเงิน advance |
| PAYMENT_CURRENCY | 35 | สกุลเงิน royalty |
| BI_H1_AMARIN | 39 | ขาย H1 Amarin |
| BI_H2_AMARIN | 40 | ขาย H2 Amarin |
| BI_H1_ABOOK | 41 | ขาย H1 ABook |
| BI_H2_ABOOK | 42 | ขาย H2 ABook |
| ANNUAL_SOLD | 43 | ขาย Y.2025 |
| PREV_BALANCE | 71 | ยอดจ่าย 2024 |
| STATUS_2024 | 72 | "จ่ายแล้ว" → balance_paid = col71 |
| EB_NET_BI1 | 74 | E-Book H1 net |
| STATUS_BI1 | 75 | สถานะ BI-H1 |
| EB_NET_BI2 | 77 | E-Book H2 net |
| STATUS_BI2 | 78 | สถานะ BI-H2 |
| EB_NET_ANNUAL | 80 | E-Book Annual net |
| STATUS_ANNUAL | 81 | สถานะ Annual |
| STOCK_ACCOUNT | 84 | Stock คงเหลือ บัญชี |

> **หมายเหตุ:** Item format ปัจจุบัน **ไม่มี** "test" column ที่ position 6  
> ถ้าพบ format เก่า ทุก index ตั้งแต่ 5 ขึ้นไปจะต่างกัน 1

**`IntraCol`** — column indices ของ Intra sheet (skiprows=3):
- AGENT=2, PUBLISHER=5, COUNTRY=6, EXP_DATE=27, SELL_OFF=28
- RT tiers: RT1_TEXT=16, RT1_PRICE=17 … RT5_TEXT=24, RT5_PRICE=25

**`ExchangeCol`** — ปี 2025: Q1=29, Q2=30, Q3=31, Q4=32

### Methods สำคัญ

| Method | คำอธิบาย |
|--------|----------|
| `generate_all(period, output_dir, isbn_filter, agency_filter)` | Entry point — สร้างทุก Excel แล้ว ZIP |
| `_build_rows(items, period)` | คำนวณ rows สำหรับ 1 contract/period |
| `_write_excel(path, ...)` | เขียน .xlsx (header + data + formatting + formulas) |
| `get_rate(currency, period)` | Exchange rate ตาม currency + period |
| `get_books(q)` | ค้นหาหนังสือ (grouped by canonical title) |
| `get_agencies_from_item(q)` | ดึงรายชื่อ Agency |
| `get_dashboard_data()` | Aggregate สำหรับ dashboard |
| `_passes_selloff(item_row, period)` | ตรวจ sell-off date |

### การคำนวณ Royalty

```
COPIES_SOLD (BI-H1)  = col39 + col41  # Amarin H1 + ABook H1
COPIES_SOLD (BI-H2)  = col40 + col42  # Amarin H2 + ABook H2
COPIES_SOLD (Annual) = col43

AMOUNT_THB = COPIES_SOLD × RETAIL_PRICE × ROYALTY_RATE
AMOUNT_CCY = AMOUNT_THB ÷ AMT_EXCHANGE_RATE   (ใช้ ADV_CURRENCY ก่อน)
```

**Excel formulas ใน output:**
```
Col I  (AMOUNT THB)   = =F{r}*G{r}*H{r}
Col J  (AMOUNT CCY)   = =I{r}/$T$6        ← T6 = exchange rate
Col N  (PERIOD BAL)   = =L{r}-(I10+I12+...)+M{r}
```

### Tiered Royalty (rt1–rt5)

- `rt_text "a1-3000"` → เล่ม 1–3,000 ที่ rate นั้น
- `rt_text "a3001"` → เล่ม 3,001 ขึ้นไป
- `rt_text "a"` หรือ rate=0 → skip
- ระบบ split copies_sold ตามช่วงของแต่ละ run โดยอัตโนมัติ

### E-Book
- JOB ขึ้นต้น `EB/` = E-Book
- Amount (THB) มาจาก net receipt column โดยตรง (ไม่ใช่ copies × price × rate)
- E-book ใช้ `EXP_DATE` แทน `SELL_OFF` สำหรับตรวจสัญญา

### Exchange Rate
- BI-H1 → Q2, BI-H2 → Q4, Annual → Q4
- JPY ใน Item = `JPY` แต่ Exchange sheet = `JYP` → มี workaround แล้ว (`'JYP' if currency == 'JPY'`)

---

## Excel Output Format

ทุก formatting อยู่ใน `_write_excel()` ใน `report_engine.py` และ `write_legacy_excel()` ใน `legacy_converter.py` — ใช้ formatting เดียวกันทั้งสองฟังก์ชัน

### รูปแบบ (ยึดตาม reference template)

| ส่วน | รายละเอียด |
|------|-----------|
| **Font** | Cambria ทั้งไฟล์ |
| **Header rows 1–6** | size 16, bold, merge col C→R (col 3→18), center |
| **Row 6** (For the Period Ended) | สีแดง `#FF0000` |
| **Header rows 7–9** | size 10, bold, พื้นหลังฟ้าอ่อน `#E0FFFF` |
| **เส้นตาราง header 7–9** | แนวตั้งทุก column, แนวนอนแค่บน (row 7) และล่าง (row 9) เท่านั้น |
| **JOB (col A)** | Merge A7:A9 |
| **ISBN (col B)** | Merge B7:B9 |
| **Data rows** | size 10 |
| **ตารางสิ้นสุดที่** | col R (18) |

### Column Layout (18 columns, A–R)

| Col | Header | ความหมาย |
|-----|--------|---------|
| A | JOB | Job number |
| B | ISBN | ISBN |
| C | TITLE | ชื่อหนังสือ |
| D | NO.OF COPIES PRINTED | จำนวนพิมพ์ |
| E | DATE PRINTED | วันที่พิมพ์ |
| F | RETAIL PRICE (THB) | ราคาปก |
| G | ROYALTY RATE | อัตราค่าลิขสิทธิ์ |
| H | NO.OF COPIES SOLD | จำนวนขาย |
| I | AMOUNT (THB) | ค่าลิขสิทธิ์ บาท (formula) |
| J | AMOUNT (CCY) | ค่าลิขสิทธิ์ สกุลต่างประเทศ (formula) |
| K | ADVANCED PAYMENT (CCY) | เงินล่วงหน้า |
| L | PREVIOUS BALANCE (CCY) | ยอดค้างก่อนหน้า |
| M | BALANCE PAID (CCY) | ยอดจ่ายแล้ว |
| N | PERIOD BALANCE (CCY) | ยอดคงเหลือ (formula) |
| O | NO.OF UNSOLD COPIES | จำนวนคงเหลือ |
| P | Stock คงเหลือ Account | stock_account |
| Q | DIF Stock คงเหลือ Account | P - O |
| R | จ่าย ค่าลิขสิทธิ์ | สถานะการจ่าย |

**T6** = exchange rate reference cell

---

## Legacy Converter (legacy_converter.py)

อ่านไฟล์ report เก่า (XLS/XLSX) จาก `DataSale/Report XXXX/`  
รองรับ 4 formats:
- **A** — Japan XLS: SALES REPORT ที่ col 0, 1 book/section
- **B** — Standard XLSX: SALES REPORT ที่ col 1, 1-N books/section
- **C** — TLL/China: SALES REPORT ที่ col 0, N books (no agent in parens)
- **D** — E-book: "EBOOK/CHAPTER SALES REPORT"

**Output structure (ภายใน ZIP):**
```
{year}/{agent}/{publisher}/{title_en} - {title_th}_{period}.xlsx
```

**Period suffix:** `BI-H1` · `BI-H2` · `Annual`

### `_read_rows(path, timeout=30)`
อ่าน XLS/XLSX → list of list  
ใช้ `read_only=True` + `iter_rows()` เพื่อรองรับไฟล์ที่มี max_row=65536 (ค่า default Excel เก่า) โดยไม่ hang  
มี timeout 30 วินาทีต่อไฟล์ด้วย `ThreadPoolExecutor`

---

## History Merger (history_merger.py)

รวม report ปัจจุบัน (จาก `reports/`) กับข้อมูลย้อนหลัง (จาก `legacy_reports/`) เป็น ZIP ฉบับสมบูรณ์

### Matching Algorithm
จับคู่ด้วย **title_en ที่ normalize แล้ว** (lowercase, strip whitespace):

| ไฟล์ | Pattern | Extract title_en |
|------|---------|-----------------|
| Report | `{ISBN} - {title_en} - {title_th}.xlsx` | ส่วนหลัง ISBN ที่มี Thai ratio < 30% |
| Legacy | `{title_en} - {title_th}_{period}.xlsx` | ส่วนแรกก่อน ` - ` หลังตัด period suffix |

### Deduplication
ไฟล์ที่มี `_2`, `_3` suffix (เกิดจากชื่อซ้ำในระหว่าง legacy convert) จะถูก dedup โดยเก็บแค่อันแรกต่อ (year, period)

### `merge_excels(source_paths, output_path, gap_rows=1)`
Stack Excel files ด้วย openpyxl cell copy (values + font + fill + border + alignment + merged cells + row heights)  
ลำดับ: ปีเก่าสุด → ปีใหม่สุด (report ปัจจุบันอยู่ล่างสุด)

---

## Report Filename Convention

```
report_{YYYYMMDD}_{HHMMSS}_{period}_{label_slug}.zip      ← Step 1 output
legacy_{YYYYMMDD}_{HHMMSS}.zip                            ← Legacy convert output
merged_{base}_{YYYYMMDD}_{HHMMSS}.zip                     ← Step 2 output
```

---

## ⚠️ Hardcoded Values ที่ต้องแก้ก่อนปี 2026

### backend/report_engine.py

```python
# 1. ปีที่ hardcode
return 2025  # report_year_from_period() — ต้องรับ year parameter

# 2. Exchange rate column indices — ปี 2026 จะเลื่อน +4
class ExchangeCol:
    Q2_2025 = 30
    Q4_2025 = 32

# 3. Period end string
"For the Period Ended December 31, 2025"
```

### backend/main.py

```python
PERIOD_LABELS = {
    "bi1": "BI-Annual 2025.1  (ม.ค. – มิ.ย.)",  # ← ปี
}
```

### frontend/src/components/GeneratePanel.jsx

```javascript
const PERIODS = [
  { id: 'bi1', label: 'BI-Annual 2025.1', ... },  // ← ปี
]
```

**วิธีแก้ที่แนะนำ:** เพิ่ม `year` field ใน dataset metadata ให้ user เลือกตอน upload

---

## Known Issues

| # | ปัญหา | ผลกระทบ |
|---|-------|---------|
| 1 | Payment Currency = `"Unknow"` ~54% ของ dataset | Amount (CCY) อาจผิด |
| 2 | JPY (Item) ↔ JYP (Exchange sheet) | มี workaround แล้ว |
| 3 | Exchange Rate มีแค่ Q2/Q4 | Q1/Q3 ว่าง |
| 4 | ปี hardcode 2025 | ปี 2026 จะพัง |
| 5 | E-Book units sold ไม่มี | Copies Sold แสดงว่าง |
| 6 | History merge matching ใช้ title_en เท่านั้น | ชื่อต่างกันเล็กน้อย (ใส่วงเล็บ, ตัวสะกด) อาจ miss |

รายละเอียดเต็มใน `DATA_GAPS.md`

---

## วิธีขยายระบบ

### เพิ่ม period ใหม่
1. `main.py` → เพิ่มใน `PERIOD_LABELS` + validate
2. `report_engine.py` → เพิ่มใน `_build_rows()` และ `get_rate()`
3. `GeneratePanel.jsx` → เพิ่มใน `PERIODS` array

### แก้ Excel layout
ทั้งหมดอยู่ใน `_write_excel()` ใน `report_engine.py`  
`write_legacy_excel()` ใน `legacy_converter.py` ต้องแก้คู่กันเสมอ (format ต้องเหมือนกัน)

### เพิ่ม dashboard widget
1. `report_engine.py` → เพิ่มใน `get_dashboard_data()`
2. `frontend/src/utils/dashboardHTML.js` → เพิ่ม HTML section

### แก้ matching logic ของ history_merger
ฟังก์ชัน `title_en_from_report_name()` และ `title_en_from_legacy_name()` ใน `history_merger.py`  
ถ้าต้องการ match แม่นขึ้น สามารถเพิ่ม ISBN-based matching โดยอ่าน cell B ของแต่ละ Excel

---

## Changelog

| Version | รายละเอียด |
|---------|----------|
| v0.46 | history_merger.py: รวม report + legacy ตามปี (Step 2), MergePanel.jsx, `/api/merge-history` + `/api/merged-reports`, แก้ legacy_converter อ่านไฟล์ 65536 rows ไม่ hang (read_only+timeout) |
| v0.45 | Agent search filter, Excel: Cambria + light cyan `#E0FFFF` + merge A7:A9/B7:B9, cols P/Q/R (Stock/DIF/จ่าย) คงไว้, legacy_converter ใช้ format เดียวกัน |
| v0.44 | Generate per-book jobs, error cards, filter_label badge |
| v0.43 | ชื่อ ZIP รวม book title เมื่อ filter |
| v0.42 | ชื่อไฟล์ Excel รวม EN+TH title |
| v0.40 | Report layout ตรงกับ reference 2023 |
| v0.37 | Web UI (React), dataset management, history |
| v0.25 | Tiered royalty (rt1–rt5) |
| v1.0 | Initial CLI release |
