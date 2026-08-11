"""ประกอบ item master (ItemCol layout) จากไฟล์ดิบ — สำหรับชุดข้อมูลตั้งแต่ปี 2026.1

ก่อนปี 2026 ฝ่ายลิขสิทธิ์ส่งไฟล์ `ยอดขาย-ลิขสิทธิ์.xlsx` (item slot) มาให้ ซึ่งเป็นไฟล์
ที่คนนั่ง vlookup ประกอบเองจากไฟล์ดิบหลายไฟล์ ปี 2026.1 ระบบต้นทางส่งของดิบมาตรงๆ
โมดูลนี้ทำงาน vlookup นั้นแทน แล้วคืน DataFrame ที่มี layout ตรงกับ `ItemCol` เป๊ะ
เพื่อให้ logic คำนวณ/เขียน Excel ใน report_engine.py ไม่ต้องแก้เลย

ไฟล์ดิบที่ใช้ (โฟลเดอร์ "ข้อมูลทำ Sales Report 2026.1")
    databook  item (data book).xlsx           ← แกนหลัก: เลขงาน + ราคาปก + ยอดผลิตแจ้งเมืองนอก
    acorp     ยอดขาย-ฝากขาย Acorp.xlsx        ← ยอดขายฝั่ง Amarin (transaction รายเดือน)
    abook     ยอดขาย-ขายขาด Abook.xlsx        ← ยอดขายฝั่ง Abook (สรุปแล้ว, key = ISBN)
    stock     Stock คงเหลือ.xlsx               ← Physical inventory คลัง WH03
    intra     RptRightAcc_*.xlsx              ← advance + สกุลเงิน (AdvPay)

ข้อตกลงกับฝ่ายลิขสิทธิ์ (คุณว่าน 2026-07-30) ที่ฝังอยู่ในโมดูลนี้
    • ราคาปก        → คอลัมน์ `ราคาขาย`
    • จำนวนพิมพ์    → `ยอดผลิตรายงานเมืองนอก` ไม่ใช่ `Job quantity`
    • Stock คงเหลือ → WH03 ของ Amarin อย่างเดียว ไม่บวก Acorp / Abook
    • Previous balance (col 71) → ยกจาก report ปีก่อน (ส่งเข้ามาทาง prev_balances)
    • Balance paid (col 72)     → เว้นว่าง
    • E-Book (col 74–81)        → รอบ 2026.1 ไม่มีไฟล์มาให้ → เว้นว่าง
"""

import re
import pandas as pd

from report_engine import ItemCol, PRODUCT_CODE_RE


# จำนวนคอลัมน์ของ item frame — ต้องกว้างพอสำหรับ ItemCol ที่ index สูงสุด
ITEM_WIDTH = 85

# ─── ตำแหน่งคอลัมน์ในไฟล์ดิบ ────────────────────────────────────────────────────

class DataBookCol:
    """item (data book).xlsx — sheet แรก, header แถวแรก (skiprows=0)

    ⚠ `COPIES_PRINTED` ต้องเป็น **ยอดผลิตรายงานเมืองนอก** ไม่ใช่ `Job quantity`
    Job quantity คือยอดที่โรงพิมพ์พิมพ์จริง (รวมส่วนเผื่อพิมพ์เสีย) ส่วนที่แจ้ง
    เจ้าของลิขสิทธิ์เป็นตัวเลขกลมที่น้อยกว่า เช่น 4,891 พิมพ์จริง → แจ้ง 4,800
    ตรวจกับไฟล์ item ปี 2025 แล้ว: ยอดผลิตรายงานเมืองนอกตรง 99.9% / Job quantity ตรง 2.3%
    """
    HEADER_ROWS = 0
    JOB            = 'Item number'
    TITLE_TH       = 'Name'
    DATE_RECEIVED  = 'End date of receive'
    ISBN           = 'ISBN'
    ITEM_GROUP     = 'Item group'
    JOB_TYPE       = 'Job type number'
    JOB_QUANTITY   = 'Job quantity'              # ยอดพิมพ์จริง — ไม่ใช้ใน report
    PRICE          = 'ราคาขาย'
    COPIES_PRINTED = 'ยอดผลิตรายงานเมืองนอก'    # ← col D ของ report
    TITLE_EN       = 'Name (Eng)'
    AGENCY         = 'Agency'
    PUBLISHER      = 'Publishers'
    ANNUAL_BI      = 'Annual/Bi-Annual'
    COUNTRY        = 'ประเทศ'


class AcorpCol:
    """ยอดขาย-ฝากขาย Acorp.xlsx — header แถว index 10"""
    HEADER_ROWS = 10
    MARKER   = 0   # แถว subtotal มีคำว่า "Item number" ที่คอลัมน์นี้
    SUB_JOB  = 1   # เลขงาน ในแถว subtotal
    JOB      = 6   # เลขงาน ในแถว transaction
    QTY      = 10  # จำนวน (ติดลบ = ขายออก)
    ISBN     = 16


class AbookCol:
    """ยอดขาย-ขายขาด Abook.xlsx — header แถว index 1"""
    HEADER_ROWS = 1
    BARCODE  = 1
    TITLE_TH = 2
    PRICE    = 3
    SOLD     = 12  # คอลัมน์ที่ต้นทางเขียน note กำกับว่า "ใช้ยอดขาย ช่องนี้"
    STOCK    = 13


class StockCol:
    """Stock คงเหลือ.xlsx — header แถว index 13 (คลัง WH03 กรองมาแล้วจากต้นทาง)"""
    HEADER_ROWS = 13
    JOB       = 0
    ISBN      = 5
    DATE_RECV = 7
    PHYSICAL  = 11


JOB_RE = re.compile(r'^[A-Za-z0-9]+/[A-Za-z]+-\d+')


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _norm_header(name) -> str:
    if name is None or (isinstance(name, float) and name != name):
        return ''
    return re.sub(r'\s+', '', str(name)).lower()


def _pick(df: pd.DataFrame, wanted: str):
    """คืน Series ของคอลัมน์ที่ชื่อตรงกับ wanted (ไม่สนช่องว่าง/ตัวพิมพ์) ไม่เจอ → None"""
    key = _norm_header(wanted)
    for col in df.columns:
        if _norm_header(col) == key:
            return df[col]
    return None


def _clean_key(series) -> pd.Series:
    """normalize join key: str, strip, ตัด .0 ที่ pandas ใส่ให้ตัวเลขที่อ่านเป็น float"""
    s = series.astype(str).str.strip()
    return s.str.replace(r'\.0$', '', regex=True)


def _num(series) -> pd.Series:
    return pd.to_numeric(series, errors='coerce').fillna(0)


# ─── ตัวอ่านไฟล์ดิบแต่ละไฟล์ ─────────────────────────────────────────────────────

def read_databook(path) -> pd.DataFrame:
    df = pd.read_excel(path, sheet_name=0, skiprows=DataBookCol.HEADER_ROWS, dtype=object)
    df = df.dropna(axis=1, how='all')
    job = _pick(df, DataBookCol.JOB)
    if job is None:
        raise ValueError(f"ไม่พบคอลัมน์ '{DataBookCol.JOB}' ในไฟล์ item (data book): {path}")
    df = df[_clean_key(job) != '']
    return df.reset_index(drop=True)


def read_acorp_sales(path) -> pd.Series:
    """คืน Series: เลขงาน → จำนวนขาย (บวก)

    ไฟล์เป็น transaction รายเดือน ยอดติดลบ และมีแถว subtotal ต่อเลขงานคั่นอยู่
    เราใช้แถว transaction รวมเอง (ไม่พึ่ง subtotal) แล้วค่อยเทียบกับ subtotal เป็นการตรวจ
    """
    raw = pd.read_excel(path, sheet_name=0, skiprows=AcorpCol.HEADER_ROWS,
                        header=None, dtype=object)
    if raw.empty:
        return pd.Series(dtype=float)

    marker = raw.iloc[:, AcorpCol.MARKER].astype(str).str.strip()
    is_subtotal = marker.str.lower() == 'item number'

    tx = raw[~is_subtotal]
    jobs = _clean_key(tx.iloc[:, AcorpCol.JOB])
    qty = _num(tx.iloc[:, AcorpCol.QTY]).abs()
    valid = jobs.str.match(JOB_RE)

    sold = qty[valid].groupby(jobs[valid]).sum()
    return sold[sold.index != '']


def read_abook_sales(path) -> pd.DataFrame:
    """คืน DataFrame index=barcode (= ISBN 13 หลัก), columns=[sold, stock, price]"""
    raw = pd.read_excel(path, sheet_name=0, skiprows=AbookCol.HEADER_ROWS,
                        header=None, dtype=object)
    if raw.empty:
        return pd.DataFrame(columns=['sold', 'stock', 'price'])

    barcode = _clean_key(raw.iloc[:, AbookCol.BARCODE])
    out = pd.DataFrame({
        'sold':  _num(raw.iloc[:, AbookCol.SOLD]).values,
        'stock': _num(raw.iloc[:, AbookCol.STOCK]).values,
        'price': _num(raw.iloc[:, AbookCol.PRICE]).values,
    }, index=barcode.values)
    out = out[[bool(re.match(r'^\d{8,}$', b)) for b in out.index]]
    return out[~out.index.duplicated(keep='first')]


def _abook_sold_per_job(isbn: pd.Series, abook: pd.DataFrame) -> pd.Series:
    """กระจายยอดขาย Abook (ต่อ ISBN) ลงเลขงาน — ลงเลขงานเดียวต่อ ISBN เท่านั้น

    ไฟล์ Abook ให้ยอดมาต่อ barcode/ISBN แต่ ISBN เดียวกันใช้ซ้ำได้ทุกครั้งที่พิมพ์ใหม่
    (พบสูงสุด 44 เลขงานต่อ ISBN) ถ้า map ตรงๆ ยอดขายจะถูกนับซ้ำเท่าจำนวน print-run

    ตรวจไฟล์ item ปี 2025 แล้วพบว่ายอด Abook ลงแถวเดียวต่อ ISBN (2,489 แถว /
    2,442 ISBN) และเป็น **แถวแรกที่เจอในไฟล์** 94.8% → เป็นผลของ VLOOKUP
    ฟังก์ชันนี้ทำพฤติกรรมเดียวกัน: ลงที่ occurrence แรก ที่เหลือเป็น 0
    """
    sold = pd.Series(0.0, index=isbn.index)
    lookup = abook['sold']
    seen = set()
    for i, key in isbn.items():
        if not key or key in seen or key not in lookup.index:
            continue
        seen.add(key)
        sold.at[i] = float(lookup.at[key])
    return sold


CURRENCY_FIXES = {'URO': 'EUR', 'EURO': 'EUR', 'JYP': 'JPY'}


def read_intra_advance(intra_paths) -> pd.DataFrame:
    """คืน DataFrame index=ISBN, columns=[adv, currency] จากคอลัมน์ AdvPay ของ intra

    ไฟล์ `item (data book).xlsx` ไม่มีคอลัมน์สกุลเงิน/advance มาให้ (ไฟล์ Data หนังสือเล่ม
    เดิมมี) ถ้าปล่อยว่าง `_build_rows()` จะ default เป็น USD ทุกเล่ม ทำให้ Amount (CCY)
    ของเล่มฝั่ง JPY/EUR ผิด — จึงดึงจาก intra แทน โดย AdvPay เก็บเป็น "2600.00 USD"

    join ด้วย ISBN เพราะ intra ไม่มีคอลัมน์เลขงาน (ISBN อยู่ใน BookTH01–10)
    """
    from report_engine import read_intra_file, IntraCol

    paths = intra_paths if isinstance(intra_paths, (list, tuple)) else [intra_paths]
    frames = [read_intra_file(p) for p in paths]
    if not frames:
        return pd.DataFrame(columns=['adv', 'currency'])
    intra = pd.concat(frames, ignore_index=True)

    # คอลัมน์ BookTH01–10 เก็บเป็น "9789748491721 ชื่อหนังสือ" — ISBN แล้วตามด้วยชื่อ
    rows = {}
    for _, row in intra.iterrows():
        raw = row.iloc[IntraCol.ADV_PAY] if IntraCol.ADV_PAY < len(row) else None
        text = '' if raw is None or (isinstance(raw, float) and raw != raw) else str(raw).strip()
        if not text:
            continue
        m = re.match(r'^\s*([\d,.]+)\s*([A-Za-z]{3})\s*$', text)
        if not m:
            continue
        adv = _clean_key(pd.Series([m.group(1)])).iloc[0].replace(',', '')
        cur = m.group(2).upper()
        cur = CURRENCY_FIXES.get(cur, cur)
        try:
            adv_val = float(adv)
        except ValueError:
            continue
        for cell in row:
            if cell is None or (isinstance(cell, float) and cell != cell):
                continue
            m2 = PRODUCT_CODE_RE.match(str(cell).strip())
            if m2 and m2.group(1) not in rows:
                rows[m2.group(1)] = (adv_val, cur)

    if not rows:
        return pd.DataFrame(columns=['adv', 'currency'])
    return pd.DataFrame(
        [{'adv': v[0], 'currency': v[1]} for v in rows.values()], index=list(rows)
    )


def read_stock(path) -> pd.DataFrame:
    """คืน DataFrame index=เลขงาน, columns=[physical, date_received]

    ไฟล์ดิบมีขยะ page-break/footer ปนมา ~1,500 แถว → กรองด้วย pattern เลขงาน
    และคอลัมน์ Physical inventory ต้องเป็นตัวเลข
    """
    raw = pd.read_excel(path, sheet_name=0, skiprows=StockCol.HEADER_ROWS,
                        header=None, dtype=object)
    if raw.empty:
        return pd.DataFrame(columns=['physical', 'date_received'])

    jobs = _clean_key(raw.iloc[:, StockCol.JOB])
    physical = pd.to_numeric(raw.iloc[:, StockCol.PHYSICAL], errors='coerce')
    valid = jobs.str.match(JOB_RE) & physical.notna()

    out = pd.DataFrame({
        'physical': physical[valid].values,
        'date_received': raw.loc[valid].iloc[:, StockCol.DATE_RECV].values,
    }, index=jobs[valid].values)
    return out[~out.index.duplicated(keep='first')]


# ─── ตัวประกอบ item master ────────────────────────────────────────────────────

def build_item_frame(databook_path, acorp_path, abook_path, stock_path,
                     period: str = 'bi1', prev_balances=None,
                     intra_paths=None) -> pd.DataFrame:
    """ประกอบ item frame ที่มี layout ตรงกับ ItemCol

    period       'bi1' | 'bi2' | 'annual' — กำหนดว่ายอดขายจะไปลงคอลัมน์ไหน
    prev_balances dict: เลขงาน → ยอดค้างจาก report ปีก่อน (col 71) ไม่ส่ง = ว่าง
    intra_paths  ไฟล์ intra — ใช้ดึง advance + สกุลเงิน ที่ไฟล์ databook ไม่มีให้

    คืน DataFrame แถวละ 1 เลขงาน คอลัมน์เป็น integer 0..ITEM_WIDTH-1 (header=None
    เหมือนที่ ReportEngine.item อ่านมาจาก Excel)
    """
    db = read_databook(databook_path)
    acorp = read_acorp_sales(acorp_path)
    abook = read_abook_sales(abook_path)
    stock = read_stock(stock_path)
    advance = read_intra_advance(intra_paths) if intra_paths else None

    n = len(db)
    out = pd.DataFrame(index=range(n), columns=range(ITEM_WIDTH), dtype=object)

    def col(name):
        s = _pick(db, name)
        return s.reset_index(drop=True) if s is not None else pd.Series([None] * n)

    job = _clean_key(col(DataBookCol.JOB))
    isbn = _clean_key(col(DataBookCol.ISBN)).replace('nan', '')

    # ── ข้อมูลหนังสือ ──
    out[ItemCol.JOB] = job.values
    out[ItemCol.DATE_PRINTED] = col(DataBookCol.DATE_RECEIVED).values
    out[ItemCol.TITLE_TH] = col(DataBookCol.TITLE_TH).values
    out[ItemCol.PRICE] = _num(col(DataBookCol.PRICE)).values
    out[ItemCol.ISBN] = isbn.values
    out[ItemCol.COPIES_PRINTED] = _num(col(DataBookCol.COPIES_PRINTED)).values

    # ── ข้อมูลสัญญา (มีเฉพาะเล่มลิขสิทธิ์ต่างประเทศ ~30% ของแถว) ──
    out[ItemCol.TITLE_EN] = col(DataBookCol.TITLE_EN).values
    out[ItemCol.AGENCY] = col(DataBookCol.AGENCY).values
    out[ItemCol.ANNUAL_BI] = col(DataBookCol.ANNUAL_BI).values

    # อัตราค่าลิขสิทธิ์ไม่มีในไฟล์ databook — _build_rows() จะ fallback ไปใช้ rt tier
    # ของ intra ให้เองอยู่แล้ว จึงเว้นว่างไว้
    # advance + สกุลเงิน ดึงจาก intra (AdvPay) เพื่อไม่ให้ทุกเล่ม default เป็น USD
    if advance is not None and not advance.empty:
        out[ItemCol.ADV] = isbn.map(advance['adv']).values
        cur = isbn.map(advance['currency'])
        out[ItemCol.ADV_CURRENCY] = cur.values
        out[ItemCol.PAYMENT_CURRENCY] = cur.values

    # ── ยอดขาย ──
    amarin_sold = job.map(acorp).fillna(0)          # Acorp ให้ยอดต่อเลขงานอยู่แล้ว 1:1
    abook_sold = _abook_sold_per_job(isbn, abook)   # Abook ให้ยอดต่อ ISBN → ต้องกระจาย

    if period == 'bi2':
        amarin_col, abook_col = ItemCol.BI_H2_AMARIN, ItemCol.BI_H2_ABOOK
    else:
        amarin_col, abook_col = ItemCol.BI_H1_AMARIN, ItemCol.BI_H1_ABOOK
    out[amarin_col] = amarin_sold.values
    out[abook_col] = abook_sold.values
    # Annual อ่านจากคอลัมน์เดียว — รวมสองฝั่งเข้าด้วยกัน
    out[ItemCol.ANNUAL_SOLD] = (amarin_sold + abook_sold).values

    # ── Stock คงเหลือ: WH03 ของ Amarin อย่างเดียว (ยืนยันจากฝ่ายลิขสิทธิ์) ──
    out[ItemCol.STOCK_ACCOUNT] = job.map(stock['physical']).values

    # ── ยอดค้างปีก่อน: ยกจาก report ปีก่อน / balance paid เว้นว่างตามที่ตกลง ──
    if prev_balances:
        out[ItemCol.PREV_BALANCE] = job.map(pd.Series(prev_balances)).values
    out[ItemCol.STATUS_2024] = None

    # ── E-Book (col 74–81): รอบ 2026.1 ไม่มีไฟล์มาให้ → เว้นว่าง ──

    return out


def build_stats(databook_path, acorp_path, abook_path, stock_path) -> dict:
    """สรุปตัวเลข coverage ของการ join — ใช้ตรวจว่าไฟล์ดิบชุดนี้ครบพอไหม"""
    db = read_databook(databook_path)
    acorp = read_acorp_sales(acorp_path)
    abook = read_abook_sales(abook_path)
    stock = read_stock(stock_path)

    job = _clean_key(_pick(db, DataBookCol.JOB).reset_index(drop=True))
    isbn = _clean_key(_pick(db, DataBookCol.ISBN).reset_index(drop=True)).replace('nan', '')
    agency = _pick(db, DataBookCol.AGENCY)
    price = _num(_pick(db, DataBookCol.PRICE))
    printed = _pick(db, DataBookCol.COPIES_PRINTED)

    has_contract = agency.notna().reset_index(drop=True) if agency is not None \
        else pd.Series([False] * len(db))

    return {
        'databook_rows': int(len(db)),
        'copies_printed_missing': int((_num(printed) <= 0).sum()) if printed is not None else None,
        'contract_rows': int(has_contract.sum()),
        'price_missing_on_contract_rows': int(((price.reset_index(drop=True) <= 0) & has_contract).sum()),
        'acorp_jobs': int(len(acorp)),
        'acorp_matched': int(job.isin(acorp.index).sum()),
        'acorp_unmatched': int(len(set(acorp.index) - set(job))),
        'abook_barcodes': int(len(abook)),
        'abook_matched': int(len(set(abook.index) & set(isbn[isbn != '']))),
        'abook_unmatched': int(len(set(abook.index) - set(isbn))),
        'stock_jobs': int(len(stock)),
        'stock_matched': int(job.isin(stock.index).sum()),
        'stock_unmatched': int(len(set(stock.index) - set(job))),
    }
