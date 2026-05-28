# ข้อมูลที่ขาดหายไปจาก Dataset

เอกสารนี้รวบรวมข้อมูลที่ระบบต้องการแต่ยังไม่มีใน dataset ปัจจุบัน  
เพื่อนำไปสอบถามกับผู้ดูแลข้อมูลหรือทีมที่เกี่ยวข้อง

*อัพเดตล่าสุด: 2026-05-28 (v0.45)*

---

## 1. สกุลเงิน "Unknow" — ประมาณ 54% ของ dataset

**ปัญหา:** col 35 ของ Item file (`Payment Currency`) มีค่าเป็น `"Unknow"` (สะกดผิด) ใน ~54% ของ rows

| สกุลเงินใน Item file | จำนวน row (โดยประมาณ) |
|---|---|
| `Unknow` | ~9,600 |
| `THB` | ~4,700 |
| `USD` | ~2,800 |
| `JPY` | ~620 |
| `EUR` | ~31 |
| `CNY` | ~23 |
| `GBP` | ~1 |

**ผลกระทบ:** รายการที่มี currency = "Unknow" จะได้ exchange rate = 1.0  
ทำให้ Amount (CCY) ผิดพลาด แสดง `"* at current exchange rate of Unknow 1 per 1.0000 Baht"`

**หมายเหตุ:** ระบบใช้ ADV Currency (col 34) เป็นสกุลเงินหลักสำหรับ AMOUNT CCY — ถ้า ADV Currency มีค่าถูกต้อง ปัญหานี้จะไม่กระทบ AMOUNT โดยตรง แต่ยังกระทบ exchange rate note

**คำถามที่ต้องถาม:**
- รายการ "Unknow" เหล่านี้คือสกุลเงินอะไร?
- ควรใช้ค่า default เป็น THB สำหรับ row ที่ไม่มีค่าหรือไม่?

---

## 2. สกุลเงิน JPY ≠ JYP — ไม่ตรงกันระหว่างไฟล์

**ปัญหา:** Item file ใช้ `JPY` แต่ Exchange Rate sheet ใช้ `JYP` (สะกดต่างกัน)

**workaround ปัจจุบัน:** โค้ดมี mapping พิเศษ `'JYP' if currency == 'JPY'` ก่อน lookup

**คำถามที่ต้องถาม:**
- มาตรฐาน ISO ที่ใช้ในองค์กรคืออะไร? (ควรเป็น JPY ตาม ISO 4217)
- Exchange Rate sheet ควรแก้ `JYP` → `JPY` หรือไม่?

---

## 3. Exchange Rate — Q1 และ Q3 ว่างทุกปี

**ปัญหา:** Exchange Rate sheet มีอัตราแลกเปลี่ยนเฉพาะ **Q2 และ Q4** ของทุกปี

ระบบจึงใช้: Q2 สำหรับ BI-H1, Q4 สำหรับ BI-H2 และ Annual

**คำถามที่ต้องถาม:**
- ยืนยันได้ไหมว่า Annual report ใช้ Q4 เสมอ?
- `USD (NG)` ในไฟล์ Exchange หมายถึงอะไร? (Q4 2025 ของ USD (NG) ว่าง)

---

## 4. ปี Report Hardcoded เป็น 2025 ทุกจุด

**ปัญหา:** ระบบ hardcode ปี 2025 ไว้ในหลายจุด — ปี 2026 จะผิดพลาดทันที

จุดที่ hardcode (ดูรายละเอียดใน `DEVELOPER.md` หัวข้อ 10):
- `report_year_from_period()` คืนค่า `2025` เสมอ
- Section headers ใน Excel: `"ANNUAL 2025 (January – December 2025)"`
- Column indices ยอดขาย H1/H2 ปี 2025 (col 39–43)
- Column indices ยอดจ่าย + สถานะ ปี 2025 (col 74–81)
- Exchange Rate col indices (col 29–32 สำหรับปี 2025)

**คำถามที่ต้องถาม:**
- ปีของ report ควรมาจากไหน? (UI ให้ user เลือก? หรือ auto-detect จาก dataset?)
- Dataset ปี 2026 จะมี column ยอดขาย H1.2026/H2.2026 เพิ่มเข้ามาหรือไม่?
- Exchange Rate sheet ปี 2026 จะอยู่ที่ col ใด?

---

## 5. E-Book — จำนวน Units Sold ต่อรอบ

**ปัญหา:** รายงานควรแสดง "NO. OF COPIES SOLD" สำหรับ e-book แต่ปัจจุบันแสดงว่าง

**สิ่งที่มีอยู่:** ยอดจ่าย 2025 (col 80) = จำนวนเงิน royalty รวมทั้งปี  
**สิ่งที่ขาด:** จำนวน e-book units ที่ขายได้ต่อรอบ

ตัวอย่างจาก sample report (Dance with Dragons e-book):
| JOB | Copies Sold (sample) |
|---|---|
| EB/59-043 | 44 |
| EB/60-015 | 49 |

**คำถามที่ต้องถาม:**
- Units sold ของ e-book อยู่ที่ column ใดใน Item sheet?
- หรือเก็บอยู่ในไฟล์อื่น?

---

## 6. Balance Paid — ไม่มี Column แยก

**ปัญหา:** ไม่มี column "BALANCE PAID" โดยตรงใน Item file

**workaround ปัจจุบัน:**
- ถ้า STATUS_2024 (col 72) = `"จ่ายแล้ว"` → BALANCE PAID = `abs(PREV_BALANCE)` (col 71)
- ถ้าไม่ใช่ → BALANCE PAID = 0

**ข้อจำกัด:** กรณีจ่ายบางส่วน (partial payment) ระบบจะยังแสดงผิด

**คำถามที่ต้องถาม:**
- มีข้อมูลจำนวนเงินที่จ่ายจริง (partial/full) อยู่ที่ column ใด?
- STATUS มีค่าที่เป็นไปได้ทั้งหมดอะไรบ้าง? (ปัจจุบันพบ: `จ่ายแล้ว`, `ค้างจ่าย`, `ยังไม่เกิน ADV`)

---

## 7. Header Row 4 — Intermediate Agent ไม่ครบ

**ปัญหา:** Sample report แสดง `"The Lotts Agency. Ltd./George R.R. Martin"` แต่ระบบแสดงแค่ `"George R.R. Martin"`

**สาเหตุ:** "The Lotts Agency" ไม่มี column แยกใน Intra file — ปนอยู่ใน free-text

**คำถามที่ต้องถาม:**
- Intermediate agent เก็บแยก column ไว้ที่ Intra ไหมหรือเปล่า?
- ถ้าไม่มี — ควรเพิ่ม column หรือยอมรับแค่ publisher?

---

## 8. ยอดขาย Bi-Annual — 2 Channel (Amarin + ABook)

**ปัญหา:** ยอดขาย H1/H2 แยกเป็น 2 columns (Amarin + ABook) ที่มี header เหมือนกัน  
ระบบปัจจุบัน: รวม Amarin + ABook เป็นยอดเดียว

| Column | ข้อมูล |
|---|---|
| 39 | ขาย H1.2025 — Amarin |
| 40 | ขาย H2.2025 — Amarin |
| 41 | ขาย H1.2025 — ABook |
| 42 | ขาย H2.2025 — ABook |

**คำถามที่ต้องถาม:**
- Report รายงานยอดขาย Amarin + ABook รวมกัน หรือแยก?
- ควรแก้ชื่อ header ใน Excel ต้นฉบับให้ชัดเจนหรือไม่?

---

## 9. Contract "Primary Row" ใน Intra File

**ปัญหา:** ISBN เดียวอาจมีหลาย row ใน Intra file  
ระบบใช้ heuristic เลือก row ที่มี RT1_PRICE > 0 เป็น "primary row"

**ตัวอย่างที่เคยพบ:** Dance with Dragons มี 3 sub-rows — row หนึ่งมี SELL_OFF=2023 ทำให้หนังสือถูก filter ออก (แก้แล้วใน v0.38 ด้วย ANY-row-passes logic)

**คำถามที่ต้องถาม:**
- มี column "Primary" หรือ flag บอกว่า row ไหนคือสัญญาหลักหรือไม่?
- ถ้าไม่มี — ควรเพิ่ม column นี้ใน Intra file หรือไม่?

---

## 10. Column PREV_BALANCE — ค่าเก็บเป็นลบหรือบวก?

**ปัญหา:** Column ยอดจ่าย (PREV_BALANCE col 71 และ EB_NET cols 74/77/80) บางครั้งมีค่าเป็นลบในไฟล์  
ระบบใช้ `abs()` สำหรับทุก column เหล่านี้เพื่อให้ได้ค่าบวกเสมอ

**คำถามที่ต้องถาม:**
- ยืนยันได้ไหมว่าค่าในไฟล์เก็บเป็นลบเสมอ (convention: payment outflow)?
- หรือมีบางกรณีที่ค่าเป็นบวกและมีความหมายต่างกัน?
