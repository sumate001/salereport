# ข้อมูลที่ขาดหายไปจาก Dataset

เอกสารนี้รวบรวมข้อมูลที่ระบบต้องการแต่ยังไม่มีใน dataset ปัจจุบัน  
เพื่อนำไปสอบถามกับผู้ดูแลข้อมูลหรือทีมที่เกี่ยวข้อง

---

## 1. สกุลเงิน "Unknow" — 9,633 รายการ (ใหญ่ที่สุด)

**ปัญหา:** col 36 ของ Item file (`Payment Currency`) มีค่าเป็น `"Unknow"` (สะกดผิด) ถึง 9,633 row จากทั้งหมด ~17,886 row — คิดเป็น **~54% ของ dataset ทั้งหมด**

| สกุลเงินใน Item file | จำนวน row |
|---|---|
| `Unknow` | 9,633 |
| `THB` | 4,711 |
| `USD` | 2,809 |
| `JPY` | 622 |
| `EUR` | 31 |
| `CNY` | 23 |
| `GBP` | 1 |

**ผลกระทบ:** รายการที่มี currency = "Unknow" จะได้ exchange rate = 1.0 ทำให้ Amount (USD/CCY) ผิดพลาดทั้งหมด รายงานแสดง `"* at current exchange rate of Unknow 1 per 1.0000 Baht"`

**คำถามที่ต้องถาม:**
- รายการ "Unknow" เหล่านี้คือสกุลเงินอะไร? (น่าจะเป็น THB สำหรับลิขสิทธิ์ไทย หรือ USD?)
- ทำไมถึงว่างหรือสะกดผิด? กรอกได้ที่ไหนใน AX?
- ควรใช้ค่า default เป็น THB สำหรับ row ที่ไม่มีค่าหรือไม่?

---

## 2. สกุลเงิน JPY ≠ JYP — ไม่ตรงกันระหว่างไฟล์

**ปัญหา:** Item file ใช้ `JPY` แต่ Exchange Rate sheet ใช้ `JYP` (สะกดต่างกัน)

**ผลกระทบ:** ระบบต้องมี workaround พิเศษในโค้ด (`if currency == 'JPY': lookup 'JYP'`) — ถ้ามีสกุลเงินอื่นที่สะกดไม่ตรงอีก จะ lookup ไม่เจอโดยไม่มี error

**คำถามที่ต้องถาม:**
- มาตรฐาน ISO ที่ใช้ในองค์กรคืออะไร? (ควรเป็น JPY ตาม ISO 4217)
- Exchange Rate sheet ควรแก้ `JYP` → `JPY` หรือจะให้ Item file ใช้ `JYP`?

---

## 3. Exchange Rate — Q1 และ Q3 ว่างทุกปี

**ปัญหา:** Exchange Rate sheet มีอัตราแลกเปลี่ยนเฉพาะ **Q2 และ Q4** ของทุกปี (Q1 และ Q3 เป็น NaN)

**ที่มา:** หมายเหตุในไฟล์ระบุว่า "Sales Report รายปี จะใช้อัตราแลกเปลี่ยนของครึ่งปีหลัง" — ระบบจึงใช้ Q2 สำหรับ H1, Q4 สำหรับ H2/Annual

**คำถามที่ต้องถาม:**
- ยืนยันได้ไหมว่า Annual report ใช้ Q4 เสมอ? (ปัจจุบันโค้ดใช้ Q4 สำหรับทั้ง bi2 และ annual)
- `USD (NG)` ในไฟล์ Exchange หมายถึงอะไร? (Q4 2025 ของ USD (NG) ว่าง)
- ถ้ามีการออก report ปี 2026 — ต้องเพิ่ม column 2026 ใน Exchange sheet ด้วยมือทุกครั้งหรือไม่?

---

## 4. ปี Report Hardcoded เป็น 2025 ทุกจุด

**ปัญหา:** ระบบ hardcode ปี 2025 ไว้ในหลายจุด — ปี 2026 จะผิดพลาดทันที

จุดที่ hardcode:
- `report_year_from_period()` → คืนค่า `2025` เสมอ  
- ชื่อ section ใน Excel: `"ANNUAL 2025 (January – December 2025)"`  
- Period header: `"For the Period Ended December 31, 2025"`  
- Column indices Exchange Rate sheet: Q1–Q4 ของปี 2025 อยู่ที่ col 29–32

**คำถามที่ต้องถาม:**
- ปีของ report ควรมาจากไหน? (UI ให้ user เลือก? หรือ auto-detect จากข้อมูลใน dataset?)
- ปี 2026 จะมี dataset ใหม่ที่มี column ขาย H1.2026/H2.2026 เพิ่มเข้ามาหรือไม่?
- Exchange Rate sheet ปี 2026 จะอยู่ที่ col ใด? (ตอนนี้ 2025 = col 29–32)

---

## 5. E-Book — จำนวน Units Sold ต่อรอบ

**ปัญหา:** รายงานควรแสดง "NO. OF COPIES SOLD" สำหรับ e-book แต่ปัจจุบันแสดงเป็นช่องว่าง

**สิ่งที่มีอยู่แล้ว:**
- `ยอดจ่าย 2025` (col 81) = จำนวนเงิน royalty รวมทั้งปี ✓

**สิ่งที่ขาด:** จำนวน e-book units ที่ขายได้ต่อรอบ — col 38–44 เป็น 0 ทั้งหมดสำหรับ e-book

**ตัวอย่างจาก sample report (Dance with Dragons e-book):**
| JOB | Copies Sold | Amount (THB) |
|---|---|---|
| EB/59-043 | **44** | 3,620.69 |
| EB/60-015 | **49** | 4,054.97 |
| EB/60-016 | **46** | 3,788.14 |

**คำถามที่ต้องถาม:**
- ตัวเลข units sold ของ e-book กรอกไว้ที่ column ใดใน Item sheet?
- หรือเก็บอยู่ใน sheet อื่น / ไฟล์อื่น?

---

## 6. Balance Paid — ไม่มี Column แยกต่างหาก

**ปัญหา:** ระบบต้องการค่า "BALANCE PAID" (เงินที่จ่ายไปแล้วในรอบก่อน) แต่ไม่มี column นี้ใน Item file

**Workaround ปัจจุบัน:** ดูจาก `STATUS_2024` (col 73):
- ถ้า `"จ่ายแล้ว"` → ใช้ค่าจาก `PREV_BALANCE` (col 72) เป็น Balance Paid
- ถ้าไม่ใช่ → Balance Paid = 0

**ปัญหาของ workaround:** `PREV_BALANCE` = ยอดจ่ายปีก่อน ≠ Balance Paid จริงๆ (อาจจ่ายบางส่วนก็ได้)

**คำถามที่ต้องถาม:**
- มีข้อมูล "จำนวนเงินที่จ่าย advance ไปแล้ว" อยู่ที่ column ใด?
- STATUS_2024 มีค่าที่เป็นไปได้ทั้งหมดอะไรบ้าง? (ปัจจุบันระบบรู้จักเฉพาะ `จ่ายแล้ว`, `ค้างจ่าย`, `ยังไม่เกิน ADV`)

---

## 7. Header Row 4 — Intermediate Agent (Lotts Agency)

**ปัญหา:** Sample report แสดง Row 4 ว่า `"The Lotts Agency. Ltd./George R.R. Martin"` แต่ระบบแสดงแค่ `"George R.R. Martin"`

**สาเหตุ:** "The Lotts Agency" ไม่มี column แยกใน Intra file — ปนอยู่ใน free-text col 3

**คำถามที่ต้องถาม:**
- Intermediate agent เก็บแยก column ไว้ที่ Intra ไหมหรือเปล่า?
- ถ้าไม่มี — ควรเพิ่ม column หรือยอมรับแค่ publisher (George R.R. Martin)?

---

## 8. ยอดขาย Bi-Annual — 2 Channel (Amarin + ABook)

**ปัญหา:** ยอดขาย H1/H2 แยกเป็น 2 column คือ Amarin channel และ ABook channel

| Column | Header | ความหมาย |
|---|---|---|
| col 40 | ขาย H1.2025 (เล่ม) | Amarin channel H1 |
| col 41 | ขาย H2.2025 (เล่ม) | Amarin channel H2 |
| col 42 | ขาย H1.2025 (เล่ม) | ABook channel H1 |
| col 43 | ขาย H2.2025 (เล่ม) | ABook channel H2 |

Header ของ col 40 กับ 42 เหมือนกันทุกอย่าง — แยกได้แค่จากตำแหน่ง

**คำถามที่ต้องถาม:**
- Report รายงานยอดขาย Amarin + ABook รวมกัน หรือแยก? (ตอนนี้ระบบรวมกัน)
- ทำไม header ของ col 40/42 และ 41/43 ถึงเหมือนกัน? ควรแก้ชื่อ header ให้ชัดเจนหรือไม่?

---

## 9. E-Book — ตำแหน่งใน Folder Output

**ปัญหา:** E-book ไม่แสดง ISBN ในรายงาน (ถูกต้องตาม sample) แต่ชื่อไฟล์และโครงสร้าง folder ยังใช้ ISBN ของ print book เดียวกัน

**คำถามที่ต้องถาม:**
- E-book report ควร group รวมในไฟล์เดียวกับ print book (ISBN เดียวกัน) หรือแยกไฟล์?
- ถ้าแยก — ชื่อไฟล์ควรใช้อะไร?

---

## 10. Contract "Primary Row" ใน Intra File

**ปัญหา:** ISBN เดียวอาจมีหลาย row ใน Intra file (เช่น Dance with Dragons มี 3 sub-rows) ระบบต้องเดาว่า row ไหน "หลัก" โดยใช้ heuristic (เลือก row ที่มี RT1_PRICE > 0)

**ผลกระทบที่เคยเกิดขึ้น:** Dance with Dragons ถูก filter ออกจากรายงานทั้งหมดเพราะระบบเลือก sub-row ที่มี SELL_OFF=2023 (expired)

**คำถามที่ต้องถาม:**
- มี column "Primary" หรือ flag บอกว่า row ไหนคือสัญญาหลักหรือไม่?
- ถ้าไม่มี — ควรเพิ่ม column นี้ใน Intra file เพื่อความถูกต้องหรือไม่?

---

*อัพเดตล่าสุด: 2026-05-17 (session 3)*
