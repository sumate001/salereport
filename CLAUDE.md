# Sales Royalty Report Generator — CLAUDE.md

คู่มือสำหรับ AI assistant เพื่อให้ต่อเนื่องได้ทันทีในทุก session

---

## ภาพรวมโปรเจกต์

ระบบสร้างรายงาน Sales Royalty สำหรับลิขสิทธิ์ต่างประเทศ  
รับ Excel ต้นฉบับ 6 ไฟล์ → คำนวณ royalty → สร้าง Excel report แยกต่อ Agency/Contract → ZIP → ดาวน์โหลด

มี 2 output mode:
1. **สร้าง Report** (ปีปัจจุบัน) — dataset (6 ไฟล์ หรือ 9 ไฟล์ดิบ) → generate ZIP
2. **ข้อมูลย้อนหลัง** — แปลงไฟล์ report เก่า (DataSale/) ให้เป็น format ใหม่
3. **รวมข้อมูลย้อนหลัง** (Step 2) — นำ output จาก 1 + 2 มา stack ตามปี → ZIP ฉบับสมบูรณ์

**Working directory:** `/Users/sumate/Desktop/project/salereport`  
**Version:** v0.52

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
│   ├── item_builder.py        ← ประกอบ item master จากไฟล์ดิบ (ชุดตั้งแต่ 2026.1)
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

## ไฟล์ Input — 2 โหมด

ตั้งแต่ชุดข้อมูลปี 2026.1 ระบบต้นทาง **ไม่ส่งไฟล์ item master มาให้แล้ว** (ไฟล์
`ยอดขาย-ลิขสิทธิ์.xlsx` เดิมเป็นของที่คนนั่ง vlookup ประกอบเอง) จึงมี 2 โหมดอัปโหลด

| โหมด | endpoint | ใช้กับ |
|------|----------|--------|
| **มีไฟล์ item** | `POST /api/datasets` | ชุดข้อมูลถึงปี 2025 (6 ไฟล์ตามตารางล่าง) |
| **ไฟล์ดิบ** | `POST /api/datasets/raw` | ชุดข้อมูลตั้งแต่ 2026.1 (9 ไฟล์ — ระบบประกอบ item ให้เอง) |

โหมดไฟล์ดิบใช้ `item_builder.build_item_frame()` ประกอบ DataFrame ที่มี layout `ItemCol`
เป๊ะ แล้วเขียนเป็น `item.xlsx` ลง dataset dir → ทุกอย่างหลังจากนั้น (generate, dashboard,
merge) ทำงานเหมือนชุดข้อมูลปีก่อนๆ ไม่ต้องแยกทาง

### โหมดไฟล์ดิบ — slot เพิ่ม 4 ไฟล์

| Slot | ไฟล์ | header row | key |
|------|------|-----------|-----|
| `databook` | item (data book).xlsx | แถวแรก | เลขงาน (`Item number`) |
| `acorp` | ยอดขาย-ฝากขาย Acorp.xlsx | index 10 | เลขงาน (col 6) |
| `abook` | ยอดขาย-ขายขาด Abook.xlsx | index 1 | barcode = ISBN (col 1) |
| `stock` | Stock คงเหลือ.xlsx | index 13 | เลขงาน (col 0) |

**กติกาที่ยืนยันกับฝ่ายลิขสิทธิ์:**
- ราคาปก → `ราคาขาย` (ตรงกับ item 2025 ที่ 99.8%)
- **จำนวนพิมพ์ (col D) → `ยอดผลิตรายงานเมืองนอก` ไม่ใช่ `Job quantity`** — Job quantity
  คือยอดที่โรงพิมพ์พิมพ์จริงรวมส่วนเผื่อพิมพ์เสีย (4,891) ส่วนที่แจ้งเจ้าของลิขสิทธิ์
  เป็นตัวเลขกลม (4,800) เอาไปคิด royalty ไม่ได้ · ตรวจกับ item 2025: ยอดผลิตรายงาน
  เมืองนอกตรง **99.9%** / Job quantity ตรงแค่ **2.3%**
- Stock คงเหลือ (col P) → **WH03 ของ Amarin เท่านั้น** ไม่บวก Acorp/Abook
- Previous balance (col L) → ยกจาก report ปีก่อน | Balance paid (col M) → เว้นว่าง
- E-Book (ItemCol 74–81) → รอบ 2026.1 ไม่มีไฟล์มาให้ → เว้นว่าง

**สกุลเงินมาจาก intra:** ไฟล์ `item (data book).xlsx` ไม่มีคอลัมน์ ADV/Payment Currency
(ไฟล์ Data หนังสือเล่ม รุ่นก่อนมี) ถ้าเว้นว่าง `_build_rows()` จะ default เป็น USD ทุกเล่ม
→ `read_intra_advance()` ดึงจากคอลัมน์ `AdvPay` ของ intra ที่เก็บเป็น `"2600.00 USD"`
join ด้วย ISBN เพราะ intra ไม่มีคอลัมน์เลขงาน · คอลัมน์ BookTH01–10 เก็บเป็น
`"9789748491721 ชื่อหนังสือ"` (ISBN แล้วตามด้วยชื่อ) ต้อง match แบบ prefix
· ครอบคลุม 67% ของเล่มที่ขึ้น report (ไฟล์ item 2025 มีแค่ 20%)

**Rate Royalty** ไม่มีในไฟล์ databook แล้ว — `_build_rows()` fallback ไป intra ตามลำดับ
**rt tier (rt1–rt5) → `Royalty` แบบ flat** (`intra_flat_rate()`) จึงเว้นว่างในไฟล์ item ได้

> ก่อน v0.50 fallback มีแค่ rt tier ซึ่งชุด 2026.1 กรอกไว้แค่ 293 สัญญาจาก 3,190
> (อีก 2,881 กรอกแต่ `Royalty` แบบ flat) → ช่อง ROYALTY RATE ว่าง 79% ของแถวที่มี
> ยอดขาย แล้ว AMOUNT (THB) เป็น 0 ทั้งรายงาน (เอกสาร Discover ระบุไว้ว่าช่องนี้มาจาก
> intra **คอลัมน์ O–Y** = `Royalty` + rt1–rt5 ไม่ใช่ rt อย่างเดียว)

**ยอดขาย Abook นับซ้ำไม่ได้:** ไฟล์ Abook ให้ยอดต่อ ISBN แต่ ISBN เดียวใช้ซ้ำได้ทุก
print-run (พบสูงสุด 44 เลขงาน/ISBN) → `_abook_sold_per_job()` ลงยอดที่ occurrence
**แรก** เท่านั้น ตามพฤติกรรม VLOOKUP ของไฟล์ item ปี 2025 (ตรวจแล้ว 94.8%)

## ไฟล์ Input โหมดมีไฟล์ item (6 slots)

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
| `POST` | `/api/datasets` | Upload 6 files (มีไฟล์ item) + `label`, `year` |
| `POST` | `/api/datasets/raw` | Upload 9 files (ไฟล์ดิบ) + `label`, `year`, `period` → ประกอบ item ให้ |
| `GET` | `/api/datasets` | List ทุก dataset |
| `PATCH` | `/api/datasets/{id}` | แก้ชื่อ label |
| `DELETE` | `/api/datasets/{id}` | ลบ dataset |
| `GET` | `/api/datasets/{id}/books?q=` | ค้นหาชื่อหนังสือ |
| `GET` | `/api/datasets/{id}/agencies?q=` | ค้นหาชื่อ Agent |
| `GET` | `/api/datasets/{id}/files/{slot}` | Download ไฟล์ต้นฉบับ |
| `GET` | `/api/datasets/{id}/skipped-codes?period=` | รหัสที่ระบบข้าม 4 กอง (ดู `scan_skipped_codes()`) |

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
| `POST` | `/api/legacy/from-report` | เก็บ report ที่ generate แล้ว → ข้อมูลย้อนหลังของปีนั้น |
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

**`IntraCol`** — ตำแหน่งใน **canonical frame** ไม่ใช่ตำแหน่งในไฟล์

ไฟล์ `RptRightAcc_*` เปลี่ยน layout ทุกปี (ปี 2026 ย้าย `Title(Eng Trans)` จากตำแหน่ง 9
ไปท้ายไฟล์ → ทุกคอลัมน์ตั้งแต่ 9 เลื่อนซ้าย 1 ช่อง) `read_intra_file()` จึง re-index
ทุกไฟล์ลง `INTRA_CANONICAL` **ด้วยชื่อหัวตาราง** (header อยู่แถว index 2) ก่อน concat
→ IntraCol ใช้ index คงที่ได้โดยไม่ต้องแก้ทุกปี คอลัมน์ที่ไฟล์ไม่มีจะว่าง คอลัมน์เกิน
ถูกต่อท้ายไว้ให้ auto-detect ISBN ยังทำงาน

> ก่อน v0.47 โค้ดอ่าน `EXP_DATE=27` / `SELL_OFF=28` ด้วย index ตายตัว ซึ่งในไฟล์ปี 2025
> ตำแหน่ง 27 คือ *วันเริ่มสัญญา* และ 28 คือ *วันหมดอายุ* → off-by-one มาตั้งแต่แรก
> แก้แล้วทำให้เล่มที่ผ่าน sell-off filter เพิ่มจาก 17,390 → 17,775 บน dataset 2025

**`ExchangeCol`** — `quarter(year, q)` คำนวณ index เอง (2025 = 29–32, 2026 = 33–36)

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
- ไม่มี tier เลย → ใช้ `Royalty` แบบ flat ของ intra (`intra_flat_rate()`)

**ลำดับการหาอัตรา** ใน `_build_rows()`: `ItemCol.ROYALTY_RATE` → rt tier แรกของ intra
→ `IntraCol.ROYALTY` · dashboard ใช้ `flat_rate_for_isbn()` (cache ทั้งไฟล์รอบเดียว
เพราะวน item หลักหมื่นแถว จะเรียก `_find_intra_row()` รายแถวไม่ไหว)

### การหาคอลัมน์ ISBN ใน intra

`_init_intra_cols()` ตรวจว่าคอลัมน์ไหนเก็บ ISBN จาก**เนื้อข้อมูลทุกแถว** — ห้ามกลับไป
sample แค่ N แถวแรก คอลัมน์ BookTH05–10 มี ISBN แค่หลักสิบแถวและกระจายอยู่ลึกในไฟล์
(2026.1: BookTH10 มี 9 แถว) การ sample 200 แถวแรกทำให้ตรวจเจอแค่ BookTH01–04 →
เล่มที่ ISBN ไปตกคอลัมน์หลังจากนั้น (185 ISBN) หาสัญญาไม่เจอ ระบบจึงออกเป็นไฟล์
orphan ที่ไม่มีอัตราค่าลิขสิทธิ์/advance และจัดกลุ่ม agent/publisher ผิด

### รหัสสินค้า (ISBN / barcode) — `PRODUCT_CODE_RE`

ช่องที่ทุกไฟล์เรียกว่า "ISBN" จริงๆ คือ **บาร์โค้ด EAN-13 บนปก** และเป็นเลขชุดเดียวกัน
ทุกไฟล์ (abook Barcode ตรงกับ databook ISBN 97.9%) มี 2 แบบปนกัน — `978/979` หนังสือ
เล่มเดี่ยว · `885878…` boxset / gift box ที่ไม่ได้ขอ ISBN

**กติกา: ตรวจแค่ "13 หลัก" ห้ามผูกกับ prefix** — ใช้ `PRODUCT_CODE_RE` ตัวเดียวทุกที่
(6 จุดใน report_engine + read_intra_advance) prefix ใหม่ในอนาคตจะใช้ได้ทันทีโดยไม่ต้อง
แก้โค้ด · ของเดิมเขียน `978\d{10}` กระจาย 6 จุด ทำให้ boxset ที่มีสัญญาจริงถูกทิ้ง
ทั้งตอน map สัญญาและตอนวน item (ไม่ออกแม้แต่ไฟล์ orphan)

`ean13_check_ok()` ใช้เป็น**สัญญาณเตือนเท่านั้น ห้ามเอามาคัดทิ้ง** — พบรหัสที่ต้นทาง
พิมพ์ผิดค้างไว้เหมือนกันทั้ง databook และ abook (`9786161843757`, ขาย 357 เล่ม) ถ้า
คัดทิ้งจะ join ไม่เจอทั้งที่ปัจจุบันทำงานได้เพราะสองฝั่งผิดตรงกัน

### รอบสัญญา (Annual / Bi-Annual) — fallback ไป intra

`generate_all()` แบ่งเล่มเข้ารอบด้วยคอลัมน์ `Annual/Bi-Annual` ของ databook **ถ้าเว้นว่าง
ให้ยึด `Paidtype` ของสัญญาใน intra แทน** ไม่งั้นเล่มจะตกไปกอง annual ทั้งหมดโดยอัตโนมัติ
(2026.1 มีเล่มที่มีสัญญาจริงแต่ databook ไม่กรอกทั้ง Agency และรอบ อยู่ 170 แถว ขายได้
111,606 เล่ม — ในนั้นเป็นสัญญา Bi-Annual 10 แถว ที่หายจากรอบ BI ไปทั้งที่ควรอยู่)

เล่มที่ Agency ว่างยังคงไปกอง `Direct Publisher` ตามเดิม (ยืนยันกับผู้ใช้แล้วว่ารับได้)
ส่วน publisher ในไฟล์ยังเป็นชื่อจริงเพราะดึงจาก intra

### รายงาน "รหัสที่ระบบข้าม" — `scan_skipped_codes()`

ปัญหาที่แท้จริงไม่ใช่ข้อมูลแปลก แต่คือ**ระบบทิ้งของเงียบๆ โดยไม่บอกใคร** เมธอดนี้เปิด
ให้เห็น 4 กอง (เรียกผ่าน `GET /api/datasets/{id}/skipped-codes` · แสดงใน HistoryPanel ·
สรุปแบบไม่มีตัวอย่างถูกเก็บลง `meta.json` → `skipped_codes` ตอนอัปโหลดไฟล์ดิบ)

| กอง | ความหมาย | ผลที่เกิด |
|-----|----------|----------|
| `bad_format` | รหัสไม่ใช่ 13 หลัก | ข้ามทิ้ง ไม่ขึ้นรายงาน |
| `no_agency` | มีสัญญาใน intra + มียอดขาย แต่ databook ไม่กรอก Agency | ขึ้นใต้ Direct Publisher แทน agent จริง |
| `no_contract` | รหัสใช้ได้ + มียอดขาย แต่ไม่มีใน intra | ขึ้นเป็น orphan ไม่มีอัตราค่าลิขสิทธิ์ |
| `check_digit` | 13 หลักแต่ check digit ไม่ผ่าน | ยังใช้งานได้ — เตือนว่าน่าจะพิมพ์ผิด |

แถวที่ไม่มีทั้ง Agency และสัญญาถูกข้าม — databook มีหนังสือของ Amarin เองปนมา 2 ใน 3
ของแถว ถ้านับด้วยจะกลายเป็นรายการหนังสือทั่วไปหลักพันจนหาของที่ผิดจริงไม่เจอ

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

### ปีที่ระบบสร้างเอง ต้องเก็บเข้า legacy pack ด้วย

`DataSale/` มี report ต้นฉบับถึงปี 2024 เท่านั้น — ตั้งแต่ปี 2025 ระบบนี้เป็นคน generate
เอง ถ้าไม่เก็บกลับเข้า legacy pack ปีนั้นจะ **หายไปจากไฟล์ merged** (เจอตอนตรวจ 2026.1:
legacy pack มี 2016–2024 ครบ แต่ 2025 มีแค่ 5 ไฟล์)

`archive_report_as_legacy()` แปลงชื่อไฟล์ report → legacy แล้วรวมกับ pack เดิม:

```
report : {agent}/{publisher}/{ISBN} - {title_en} - {title_th}.xlsx
legacy : {year}/{agent}/{publisher}/{title_en} - {title_th}_{period}.xlsx
```

เรียกผ่าน `POST /api/legacy/from-report` หรือปุ่ม "เก็บ report นี้เป็นข้อมูลย้อนหลังด้วย"
ใน MergePanel · ชื่อชนกันจะเติม `_2`, `_3` เหมือน legacy_converter

> ไฟล์ปี 2025 ถูกแตกไว้ที่ `DataSale/Report 2025/` เพื่อให้อยู่ที่เดียวกับปีอื่นด้วย
> โฟลเดอร์นั้นมีไฟล์ `.skip_legacy_convert` กำกับ — `convert_datasale_folder()` จะข้าม
> ทั้ง subtree เพราะไฟล์ข้างในเป็น format ใหม่อยู่แล้ว ถ้าปล่อยให้แปลงซ้ำจะได้ผลผิด

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

## ปีของ report (แก้ hardcode แล้วใน v0.47)

ปีไม่ผูกกับโค้ดอีกต่อไป — user เลือกตอน upload แล้วเก็บใน `meta.json` → `year`

| จุด | ทำงานยังไง |
|-----|-----------|
| `ReportEngine(..., year=)` | ทุก call site สร้างผ่าน `_engine(session)` ใน main.py |
| `ExchangeCol.quarter(year, q)` | คำนวณ index จาก `BASE_YEAR=2018, BASE_COL=1` (ปีละ 4 คอลัมน์) — 2025 = 29–32, 2026 = 33–36 |
| `period_end_label(period, year)` | "For the Period Ended June 30, {year}" |
| `period_label(period, year)` ใน main.py | แทน `PERIOD_LABELS` เดิม |
| `periodsFor(year)` ใน GeneratePanel.jsx | ปีจาก `activeDataset.year` |

dataset เก่าที่ไม่มี `year` ใน meta → default `DEFAULT_REPORT_YEAR = 2025`

> ⚠️ ไฟล์อัตราแลกเปลี่ยนของปีที่ยังไม่จบจะมีแค่ Q2 — ถ้า generate รอบ bi2/annual
> ของปีนั้น `get_rate()` จะคืน 1.0 เงียบๆ ทำให้ Amount (CCY) = Amount (THB)

---

## Known Issues

| # | ปัญหา | ผลกระทบ |
|---|-------|---------|
| 1 | Payment Currency = `"Unknow"` ~54% ของ dataset | Amount (CCY) อาจผิด |
| 2 | JPY (Item) ↔ JYP (Exchange sheet) | มี workaround แล้ว |
| 3 | Exchange Rate มีแค่ Q2/Q4 | Q1/Q3 ว่าง |
| 4 | อัตราแลกเปลี่ยนของปีที่ยังไม่จบมีแค่ Q2 | generate bi2/annual ของปีนั้น → rate = 1.0 เงียบๆ |
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
| v0.52 | `generate_all()` ยึด `Paidtype` ของ intra เมื่อ databook ไม่ได้กรอก Annual/Bi-Annual — เล่มที่มีสัญญาแต่ databook เว้นว่าง (170 แถว / 111,606 เล่ม) เคยตกไปรอบ annual หมด · ผลบน 2026.1 bi1: ไฟล์ 525 → 551, ยอดค่าลิขสิทธิ์ 2.60M → 3.17M บาท |
| v0.51 | รหัสสินค้าใช้ `PRODUCT_CODE_RE` (13 หลัก ไม่ผูก prefix) แทน `978\d{10}` ที่กระจาย 6 จุด — boxset ที่ใช้ EAN `885878…` เคยหายทั้งกลุ่มโดยไม่มีไฟล์ orphan (2026.1 bi1: กลับมา 18 ไฟล์), `ean13_check_ok()` เป็นสัญญาณเตือนไม่ใช่ตัวคัดทิ้ง, `scan_skipped_codes()` + `GET /api/datasets/{id}/skipped-codes` + ส่วน "รหัสที่ระบบข้าม" ใน HistoryPanel + เก็บสรุปลง meta.json ตอนอัปโหลด |
| v0.50 | แก้ ROYALTY RATE ว่างทั้งรายงานของชุดไฟล์ดิบ: `intra_flat_rate()` fallback ไปคอลัมน์ `Royalty` ของ intra ต่อจาก rt tier, `flat_rate_for_isbn()` ให้ dashboard, `_init_intra_cols()` กวาด ISBN ทุกแถว (เดิม 200 แถวแรก → BookTH05–10 หลุด) · ผลบน 2026.1 bi1: แถวยอดขายที่ rate ว่าง 266 → 131 (ที่เหลือคือ ISBN ที่ไม่มีในไฟล์ intra), ยอดค่าลิขสิทธิ์รวม 362K → 2.60M บาท, ไฟล์ 525 → 507 (orphan ยุบเข้าสัญญาจริง) |
| v0.49 | `archive_report_as_legacy()` + `POST /api/legacy/from-report` + ปุ่มใน MergePanel — เก็บ report ที่ generate แล้วเข้า legacy pack (ปี 2025 เคยหายจาก merged เพราะ DataSale มีถึง 2024), HistoryPanel แสดงไฟล์ครบตาม slot จริงของแต่ละ dataset, `convert_datasale_folder()` ข้ามโฟลเดอร์ที่มี `.skip_legacy_convert` |
| v0.48 | เปลี่ยน databook slot เป็นไฟล์ `item (data book).xlsx`: col D ใช้ `ยอดผลิตรายงานเมืองนอก` (เดิมใช้ `Job quantity` = ยอดพิมพ์จริง ซึ่งผิด), ราคาปกใช้ `ราคาขาย`, เพิ่ม `read_intra_advance()` ดึง advance + สกุลเงินจาก AdvPay ของ intra |
| v0.47 | รองรับชุดข้อมูล 2026.1 ที่ไม่มีไฟล์ item: `item_builder.py` + `POST /api/datasets/raw` + โหมดอัปโหลดใน UploadPanel, `read_intra_file()` map คอลัมน์ intra ด้วยชื่อหัวตาราง (แก้ off-by-one EXP_DATE/SELL_OFF ที่มีมาแต่เดิม), ปี report เป็น parameter ทั้งระบบ (`ExchangeCol.quarter()`, `period_end_label()`, `period_label()`, `periodsFor()`) |
| v0.46 | history_merger.py: รวม report + legacy ตามปี (Step 2), MergePanel.jsx, `/api/merge-history` + `/api/merged-reports`, แก้ legacy_converter อ่านไฟล์ 65536 rows ไม่ hang (read_only+timeout) |
| v0.45 | Agent search filter, Excel: Cambria + light cyan `#E0FFFF` + merge A7:A9/B7:B9, cols P/Q/R (Stock/DIF/จ่าย) คงไว้, legacy_converter ใช้ format เดียวกัน |
| v0.44 | Generate per-book jobs, error cards, filter_label badge |
| v0.43 | ชื่อ ZIP รวม book title เมื่อ filter |
| v0.42 | ชื่อไฟล์ Excel รวม EN+TH title |
| v0.40 | Report layout ตรงกับ reference 2023 |
| v0.37 | Web UI (React), dataset management, history |
| v0.25 | Tiered royalty (rt1–rt5) |
| v1.0 | Initial CLI release |
