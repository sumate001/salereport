# TODO — v0.3

ตรวจสอบจากไฟล์ `ไฟล์อธิบายวิธีการ Report.xlsx` (sheet: วิธีการทำงาน + ตัวอย่าง Sale report ที่ต้องส่ง)
เปรียบเทียบกับ `backend/report_engine.py` ปัจจุบัน (v0.25)

---

## 🔴 สำคัญมาก

### 1. ✅ เพิ่มคอลัมน์ 17 — Stock คงเหลือ Account (col P)
- ดึงจาก Item sheet **col 80 (0-based = 79)** = "Stock คงเหลือบัญชี"
- filter โดยใช้ JOB number ของแต่ละ row
- เพิ่มใน `ItemCol` class: `STOCK_ACCOUNT = 79`
- เพิ่ม header ใน `hdr_rows` (row 7–9): `'Stock (เล่ม)'` / `'คงเหลือ'` / `'Account'`
- เพิ่ม `put(16, d['stock_account'] or None, NUM)` ใน write_section
- เพิ่ม column width สำหรับ col 16

### 2. ✅ แยก PREVIOUS BALANCE กับ BALANCE PAID ให้ถูกตำแหน่ง
ปัจจุบัน (ผิด):
- col 12 = `prev_balance` (Item[72] เมื่อ STATUS=จ่ายแล้ว, ไม่งั้น 0)
- col 13 = `None` เสมอ (BALANCE PAID ว่างเสมอ)

ที่ถูกต้อง:
- col 12 = **PREVIOUS BALANCE** = Item[72] แสดง**เสมอ** ไม่เช็ค status
- col 13 = **BALANCE PAID** = Item[72] เฉพาะเมื่อ `STATUS_2024 == "จ่ายแล้ว"` เท่านั้น

แก้ใน `_build_rows`:
```python
prev_balance  = safe_float(r.iloc[ItemCol.PREV_BALANCE])          # เสมอ
balance_paid  = safe_float(r.iloc[ItemCol.PREV_BALANCE]) if status_2024 == 'จ่ายแล้ว' else 0.0
```
แก้ใน `make_row` / `write_section`:
```python
put(12, d['prev_balance']  or None, NUM)   # PREVIOUS BALANCE
put(13, d['balance_paid']  or None, NUM)   # BALANCE PAID
put(14, None)                              # PERIOD BALANCE (ยังว่าง — ดูข้อ 3)
put(15, None)                              # UNSOLD COPIES (ยังว่าง — ดูข้อ 4)
```

---

## 🟡 กลาง

### 3. ✅ คำนวณ PERIOD BALANCE (col 15/N)
สูตรจาก spec:
```
PERIOD BALANCE = PREVIOUS BALANCE − AMOUNT(ตาม currency ที่จ่าย Advance) + BALANCE PAID
```
- ถ้า Advance currency = THB → ใช้ AMOUNT (THB)
- ถ้า Advance currency = USD/JPY → ใช้ AMOUNT (CCY)
- ต้องรวมทุก JOB ภายใน ISBN เดียวกันก่อน แล้วใส่ผลลัพธ์ใน **row แรก** เท่านั้น

> ⚠️ ขณะนี้ยังไม่ handle กรณี "Advance ใหม่ในปีนี้" (Renew)
> พิจารณาว่าต้องการ column เพิ่มใน Item file หรือไม่

### 4. ✅ คำนวณ NO.OF UNSOLD COPIES (col 16/O)
สูตรจาก spec:
- งานเดิม (ไม่ได้พิมพ์ปีนี้): `UNSOLD ปีก่อน − copies_sold ปีนี้`
- งานพิมพ์ใหม่ปีนี้: `COPIES_PRINTED − copies_sold`

> ⚠️ ต้องการ column "UNSOLD ปีก่อน" ใน Item file (ยังไม่ได้ map)
> ให้ตรวจว่าอยู่ที่ col ไหนในไฟล์จริง

---

## 🟢 ง่าย

### 5. ✅ แก้รูปแบบ Exchange rate note + ย้ายตำแหน่ง
ปัจจุบัน: `USD = 31.7436` ใน **col 11** (K)  
ที่ถูก: `*  at current exchange rate of US$ 1 per 31.7436  Baht` ใน **col 6** (F)

แก้ใน `write_section` (ท้าย section):
```python
ws.cell(row=row, column=6,
        value=f'*  at current exchange rate of {ccy_label} 1 per {ex_rate_used:.4f}  Baht')
```

### 6. ✅ แก้ชื่อบริษัท row 2 — ดึงจาก Intra แทน hardcode
ปัจจุบัน: `'KADOKAWA CORPORATION'` (hardcoded)  
ที่ถูก: ชื่อ Publisher จริง เช่น `'POPLAR PUBLISHING CO., LTD.'`

- ดึงจาก Intra file ผ่าน `IntraCol.PUBLISHER` (col 5)
- ส่ง publisher name เข้า `_write_excel()` แล้วใส่ใน row 2

> row 2 ปัจจุบันใช้ `'KADOKAWA CORPORATION'` — เปลี่ยนเป็น `publisher` parameter แทน  
> (parameter `publisher` มีอยู่แล้วใน signature ของ `_write_excel`)

### 7. ✅ แยก TITLE TH/EN เป็น 2 rows แทน cell เดียว
ปัจจุบัน: `TITLE_TH\nTITLE_EN` รวมใน cell เดียว (wrap_text)  
ที่ถูก: 
- main row col C = TITLE_EN (หรือ EN ก่อน)
- sub-row ถัดไป col C = TITLE_TH (row ที่ job/isbn ว่าง)

> ⚠️ กระทบ tiered rows — ต้องเช็คว่า sub-row ของ Thai title ไม่ชนกับ tier rows

---

## หมายเหตุ
- tag `v0.25` สร้างแล้วที่ commit `a5b26f8` — rollback ได้ด้วย `git checkout v0.25`
- ไฟล์อ้างอิง: `/Users/itadmin/Downloads/ข้อมูลขาย/ไฟล์อธิบายวิธีการ Report/ไฟล์อธิบายวิธีการ Report.xlsx`
- โค้ดหลัก: `backend/report_engine.py`
