import os
import re
import tempfile
import zipfile
import pandas as pd
import numpy as np
from datetime import datetime
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter


# ─── Column indices (0-based) ─────────────────────────────────────────────────

class ItemCol:
    JOB              = 1
    DATE_PRINTED     = 2
    TITLE_TH         = 3
    PRICE            = 9
    ISBN             = 12
    TITLE_EN         = 15
    AGENCY           = 16
    ANNUAL_BI        = 18
    COPIES_PRINTED   = 19
    ROYALTY_RATE     = 33
    ADV              = 34
    ADV_CURRENCY     = 35
    PAYMENT_CURRENCY = 36
    BI_H1_AMARIN     = 40
    BI_H2_AMARIN     = 41
    BI_H1_ABOOK      = 42
    BI_H2_ABOOK      = 43
    ANNUAL_SOLD      = 44
    PREV_BALANCE     = 72
    STATUS_2024      = 73
    STOCK_ACCOUNT    = 79


class IntraCol:
    # 4 separate intra files (skiprows=3, sheet_name=0)
    PAIDTYPE  = 1   # Paidtype
    AGENT     = 2   # Agent(รับ report)
    PUBLISHER = 5   # Publisher
    COUNTRY   = 6   # Country
    EXP_DATE  = 27  # วันหมดอายุ (E-Book)
    SELL_OFF  = 28  # SellOffPeriod (Book)
    # Tiered royalty rate columns Q–Z (0-based)
    RT1_TEXT  = 16;  RT1_PRICE = 17
    RT2_TEXT  = 18;  RT2_PRICE = 19
    RT3_TEXT  = 20;  RT3_PRICE = 21
    RT4_TEXT  = 22;  RT4_PRICE = 23
    RT5_TEXT  = 24;  RT5_PRICE = 25
    # ISBNs: BookTH01–BookTH10 at cols 39–48 (auto-detected)


class ExchangeCol:
    Q1_2025 = 29
    Q2_2025 = 30
    Q3_2025 = 31
    Q4_2025 = 32


# ─── Helpers ──────────────────────────────────────────────────────────────────

def safe_float(val, default=0.0):
    try:
        v = float(val)
        return default if (v != v) else v
    except Exception:
        return default


def safe_str(val):
    if val is None:
        return ''
    if isinstance(val, float) and val != val:
        return ''
    return str(val).strip()


def normalize_rate(rate):
    r = safe_float(rate)
    return r / 100 if r > 1 else r


def format_date_printed(val):
    """แปลง date เป็น 'May 31' format"""
    if val is None:
        return ''
    if isinstance(val, datetime):
        return val.strftime('%b %d')
    if hasattr(val, 'strftime'):
        return val.strftime('%b %d')
    s = safe_str(val)
    if not s:
        return ''
    try:
        dt = pd.to_datetime(s)
        if pd.notna(dt):
            return dt.strftime('%b %d')
    except Exception:
        pass
    return s


def extract_year(val):
    """ดึงปี ค.ศ. จาก cell ที่อาจเป็น date, int, float หรือ string"""
    if val is None:
        return None
    if isinstance(val, datetime):
        return val.year
    if hasattr(val, 'year'):
        return val.year
    s = safe_str(val)
    if not s:
        return None
    m = re.search(r'(\d{4})', s)
    if m:
        y = int(m.group(1))
        return y - 543 if y > 2400 else y
    return None


def report_year_from_period(period: str) -> int:
    return 2025


def parse_rt_tiers(intra_row):
    """Parse rt1–rt5 tier columns from Intra row.
    Returns list of (min_copy, max_copy, rate) — rate normalized 0–1.
    'a' alone (no digits) or rate=0 → skipped.
    """
    if intra_row is None:
        return []

    RT_COLS = [
        (IntraCol.RT1_TEXT, IntraCol.RT1_PRICE),
        (IntraCol.RT2_TEXT, IntraCol.RT2_PRICE),
        (IntraCol.RT3_TEXT, IntraCol.RT3_PRICE),
        (IntraCol.RT4_TEXT, IntraCol.RT4_PRICE),
        (IntraCol.RT5_TEXT, IntraCol.RT5_PRICE),
    ]

    tiers = []
    for text_col, price_col in RT_COLS:
        try:
            rt_text  = safe_str(intra_row.iloc[text_col]).strip()
            rt_price = safe_float(intra_row.iloc[price_col])
        except (IndexError, KeyError):
            break
        if not rt_text or rt_price == 0:
            continue
        m_range = re.match(r'a(\d+)-(\d+)', rt_text, re.IGNORECASE)
        m_from  = re.match(r'a(\d+)$',      rt_text, re.IGNORECASE)
        if m_range:
            tiers.append((int(m_range.group(1)), int(m_range.group(2)), normalize_rate(rt_price)))
        elif m_from:
            tiers.append((int(m_from.group(1)), float('inf'), normalize_rate(rt_price)))
    return tiers


def apply_rt_tiers(copies_sold, tiers):
    """Split copies_sold across tiers. Returns [(copies_in_tier, rate), ...] for tiers with copies > 0."""
    result = []
    for min_c, max_c, rate in tiers:
        c = max(0.0, min(copies_sold, max_c) - (min_c - 1))
        if c > 0:
            result.append((c, rate))
    return result


# ─── ReportEngine ─────────────────────────────────────────────────────────────

class ReportEngine:
    def __init__(self, item_path: str, intra_paths, exchange_path: str):
        self.item_path     = item_path
        self.intra_paths   = intra_paths if isinstance(intra_paths, list) else [intra_paths]
        self.exchange_path = exchange_path
        self._item_df      = None
        self._intra_df     = None
        self._rates        = {}
        self._intra_job_col   = -1
        self._intra_isbn_col  = -1
        self._intra_isbn_cols = []
        self._intra_cols_init = False

    # ── Lazy loaders ──────────────────────────────────────────────────────────

    @property
    def item(self):
        if self._item_df is None:
            self._item_df = pd.read_excel(
                self.item_path, sheet_name='Item', skiprows=2, header=None, dtype=object
            )
        return self._item_df

    @property
    def intra(self):
        if self._intra_df is None:
            dfs = [
                pd.read_excel(p, sheet_name=0, skiprows=3, header=None, dtype=object)
                for p in self.intra_paths
            ]
            self._intra_df = pd.concat(dfs, ignore_index=True)
        return self._intra_df

    def _ensure_rates(self):
        if self._rates:
            return
        df = pd.read_excel(
            self.exchange_path, sheet_name='อัตราแลกเปลี่ยน', header=None, dtype=object
        )
        for _, row in df.iloc[4:].iterrows():
            currency = safe_str(row.iloc[0])
            if not currency:
                continue
            self._rates[currency] = {
                'Q1': safe_float(row.iloc[ExchangeCol.Q1_2025], 1.0),
                'Q2': safe_float(row.iloc[ExchangeCol.Q2_2025], 1.0),
                'Q3': safe_float(row.iloc[ExchangeCol.Q3_2025], 1.0),
                'Q4': safe_float(row.iloc[ExchangeCol.Q4_2025], 1.0),
            }

    def get_rate(self, currency: str, period: str) -> float:
        self._ensure_rates()
        lookup  = 'JYP' if currency == 'JPY' else currency
        rates   = self._rates.get(lookup, {'Q1': 1.0, 'Q2': 1.0, 'Q3': 1.0, 'Q4': 1.0})
        quarter = {'bi1': 'Q2', 'bi2': 'Q4', 'annual': 'Q4'}.get(period, 'Q4')
        return rates.get(quarter, 1.0) or 1.0

    # ── Cascading filter options ───────────────────────────────────────────────

    def _clean(self, series):
        return series.fillna('').astype(str).str.strip()

    def get_countries(self):
        vals = self._clean(self.intra.iloc[:, IntraCol.COUNTRY])
        return sorted([v for v in vals.unique() if v and v.lower() != 'nan'])

    def get_agencies(self, country=''):
        df = self.intra
        if country:
            df = df[self._clean(df.iloc[:, IntraCol.COUNTRY]) == country]
        vals = self._clean(df.iloc[:, IntraCol.AGENT])
        return sorted([v for v in vals.unique() if v and v.lower() != 'nan' and len(v) > 3])

    def get_publishers(self, agency, country=''):
        df = self.intra
        df = df[self._clean(df.iloc[:, IntraCol.AGENT]) == agency]
        if country:
            df = df[self._clean(df.iloc[:, IntraCol.COUNTRY]) == country]
        vals = self._clean(df.iloc[:, IntraCol.PUBLISHER])
        return sorted([v for v in vals.unique() if v and v.lower() != 'nan'])

    # ── Sell-off filter ───────────────────────────────────────────────────────

    def _init_intra_cols(self):
        if self._intra_cols_init:
            return
        self._intra_cols_init = True
        for c in range(self.intra.shape[1]):
            sample = self._clean(self.intra.iloc[:10, c]).tolist()
            if any(re.match(r'\d{2}/[A-Z]', s) or s.startswith('EB/') for s in sample):
                self._intra_job_col = c
            if any(re.match(r'978\d{10}', s) for s in sample):
                self._intra_isbn_cols.append(c)
        self._intra_isbn_col = self._intra_isbn_cols[0] if self._intra_isbn_cols else -1

    def _find_intra_row(self, item_row):
        self._init_intra_cols()
        isbn = safe_str(item_row.iloc[ItemCol.ISBN])
        job  = safe_str(item_row.iloc[ItemCol.JOB])
        df   = self.intra

        if self._intra_job_col >= 0 and job:
            mask = self._clean(df.iloc[:, self._intra_job_col]) == job
            if mask.any():
                return df[mask].iloc[0]

        if isbn:
            for isbn_col in self._intra_isbn_cols:
                mask = self._clean(df.iloc[:, isbn_col]).str.startswith(isbn)
                if mask.any():
                    return df[mask].iloc[0]

        return None

    def _passes_selloff(self, item_row, period: str) -> bool:
        report_yr  = report_year_from_period(period)
        job        = safe_str(item_row.iloc[ItemCol.JOB])
        is_ebook   = job.upper().startswith('EB/')
        intra_row  = self._find_intra_row(item_row)

        if intra_row is None:
            return True

        col      = IntraCol.EXP_DATE if is_ebook else IntraCol.SELL_OFF
        sell_yr  = extract_year(intra_row.iloc[col])

        if sell_yr is None:
            return True
        return sell_yr >= report_yr

    # ── Row builder ───────────────────────────────────────────────────────────

    def _build_rows(self, items, period: str):
        rows = []
        for _, r in items.iterrows():
            if not self._passes_selloff(r, period):
                continue

            job      = safe_str(r.iloc[ItemCol.JOB])
            is_ebook = job.upper().startswith('EB/')
            title_th = safe_str(r.iloc[ItemCol.TITLE_TH])
            title_en = safe_str(r.iloc[ItemCol.TITLE_EN])
            title_display = title_en or title_th
            title_th_sub  = title_th if title_en else ''
            isbn           = safe_str(r.iloc[ItemCol.ISBN])
            date_prt       = format_date_printed(r.iloc[ItemCol.DATE_PRINTED])
            date_year      = extract_year(r.iloc[ItemCol.DATE_PRINTED])
            copies_prt     = safe_float(r.iloc[ItemCol.COPIES_PRINTED])
            retail         = safe_float(r.iloc[ItemCol.PRICE])
            fallback_rate  = normalize_rate(r.iloc[ItemCol.ROYALTY_RATE])
            currency       = safe_str(r.iloc[ItemCol.PAYMENT_CURRENCY]) or 'USD'
            adv            = safe_float(r.iloc[ItemCol.ADV])
            adv_cur        = safe_str(r.iloc[ItemCol.ADV_CURRENCY])
            status_2024    = safe_str(r.iloc[ItemCol.STATUS_2024])
            prev_balance   = safe_float(r.iloc[ItemCol.PREV_BALANCE])
            balance_paid   = safe_float(r.iloc[ItemCol.PREV_BALANCE]) if status_2024 == 'จ่ายแล้ว' else 0.0
            stock_account  = safe_float(r.iloc[ItemCol.STOCK_ACCOUNT])

            if period == 'bi1':
                copies_sold = safe_float(r.iloc[ItemCol.BI_H1_AMARIN]) + safe_float(r.iloc[ItemCol.BI_H1_ABOOK])
            elif period == 'bi2':
                copies_sold = safe_float(r.iloc[ItemCol.BI_H2_AMARIN]) + safe_float(r.iloc[ItemCol.BI_H2_ABOOK])
            else:
                copies_sold = safe_float(r.iloc[ItemCol.ANNUAL_SOLD])

            ex_rate   = self.get_rate(currency, period)
            intra_row = self._find_intra_row(r)
            tiers     = parse_rt_tiers(intra_row)
            tier_rows = apply_rt_tiers(copies_sold, tiers)

            def make_row(tc, tr, first):
                amt_thb = tc * retail * tr
                return {
                    'job':            job           if first else '',
                    'isbn':           isbn          if first else None,
                    'title':          title_display if first else '',
                    'title_th':       title_th_sub  if first else '',
                    'copies_printed': copies_prt    if first else None,
                    'date_printed':   date_prt      if first else '',
                    'retail_price':   retail        if first else None,
                    'royalty_rate':   tr,
                    'copies_sold':    tc,
                    'amount_thb':     amt_thb,
                    'amount_ccy':     amt_thb / ex_rate if ex_rate else 0.0,
                    'currency':       currency,
                    'adv':            adv           if first else 0.0,
                    'adv_currency':   adv_cur,
                    'prev_balance':   prev_balance  if first else 0.0,
                    'balance_paid':   balance_paid  if first else 0.0,
                    'period_balance': None,
                    'unsold_copies':  None,
                    'stock_account':  stock_account if first else None,
                    'is_ebook':       is_ebook,
                    'ex_rate':        ex_rate,
                }

            item_rows = []
            if tier_rows:
                for i, (tc, tr) in enumerate(tier_rows):
                    item_rows.append(make_row(tc, tr, first=(i == 0)))
            else:
                item_rows.append(make_row(copies_sold, fallback_rate, first=True))

            if item_rows:
                first_row = item_rows[0]
                if prev_balance > 0:
                    total_thb_item = sum(d['amount_thb'] for d in item_rows)
                    total_ccy_item = sum(d['amount_ccy'] for d in item_rows)
                    amount_for_period = total_thb_item if adv_cur == 'THB' else total_ccy_item
                    first_row['period_balance'] = prev_balance - amount_for_period + balance_paid
                if date_year == report_year_from_period(period) and copies_prt > 0:
                    first_row['unsold_copies'] = max(0.0, copies_prt - copies_sold)

            rows.extend(item_rows)

        return rows

    # ── Main generate ─────────────────────────────────────────────────────────

    def generate_report(self, country, agency, publisher, period='annual', output_dir=None):
        if output_dir is None:
            output_dir = tempfile.mkdtemp()

        self._ensure_rates()

        agent_items = self.item[
            self._clean(self.item.iloc[:, ItemCol.AGENCY]) == agency
        ].copy()

        type_col = self._clean(agent_items.iloc[:, ItemCol.ANNUAL_BI])
        bi_mask  = type_col.str.upper().str.contains('BI')

        bi_items = agent_items[bi_mask]
        an_items = agent_items[~bi_mask]

        bi1_rows = self._build_rows(bi_items, 'bi1')    if period in ('all', 'bi1')    else []
        bi2_rows = self._build_rows(bi_items, 'bi2')    if period in ('all', 'bi2')    else []
        an_rows  = self._build_rows(an_items, 'annual') if period in ('all', 'annual') else []

        safe_agent = re.sub(r'[\\/:*?"<>|]', '_', agency)
        filename   = f"SalesReport_{safe_agent}_{period}.xlsx"
        out_path   = os.path.join(output_dir, filename)

        self._write_excel(out_path, country, agency, publisher, period,
                          bi1_rows, bi2_rows, an_rows)
        return out_path

    def generate_all_publishers(self, country, agency, period='annual', output_dir=None):
        if output_dir is None:
            output_dir = tempfile.mkdtemp()
        xlsx_dir = os.path.join(output_dir, 'xlsx')
        os.makedirs(xlsx_dir, exist_ok=True)

        for pub in self.get_publishers(agency, country):
            self.generate_report(country, agency, pub, period, xlsx_dir)

        zip_path = os.path.join(output_dir, f'SalesReports_{period}.zip')
        with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zf:
            for fname in os.listdir(xlsx_dir):
                zf.write(os.path.join(xlsx_dir, fname), fname)
        return zip_path

    def _get_info_for_isbn(self, isbn: str):
        """Return (country, publisher) for an ISBN from the intra sheet."""
        self._init_intra_cols()
        if not isbn:
            return ('', '')
        for isbn_col in self._intra_isbn_cols:
            mask = self._clean(self.intra.iloc[:, isbn_col]).str.startswith(isbn)
            matched = self.intra[mask]
            if not matched.empty:
                row = matched.iloc[0]
                return (
                    safe_str(row.iloc[IntraCol.COUNTRY]),
                    safe_str(row.iloc[IntraCol.PUBLISHER]),
                )
        return ('', '')

    def generate_all(self, period='annual', output_dir=None):
        """Generate one Excel per ISBN inside per-agency folders, bundled as ZIP."""
        if output_dir is None:
            output_dir = tempfile.mkdtemp()

        self._ensure_rates()

        for agency in self.get_agencies():
            agent_items = self.item[
                self._clean(self.item.iloc[:, ItemCol.AGENCY]) == agency
            ].copy()
            if agent_items.empty:
                continue

            safe_agency = re.sub(r'[\\/:*?"<>|]', '_', agency)
            agency_dir  = os.path.join(output_dir, safe_agency)
            os.makedirs(agency_dir, exist_ok=True)

            isbn_col = self._clean(agent_items.iloc[:, ItemCol.ISBN])
            for isbn in sorted(isbn_col.unique()):
                if not isbn:
                    continue
                isbn_items = agent_items[isbn_col == isbn].copy()
                country, publisher = self._get_info_for_isbn(isbn)

                type_col = self._clean(isbn_items.iloc[:, ItemCol.ANNUAL_BI])
                bi_mask  = type_col.str.upper().str.contains('BI')

                bi1_rows = self._build_rows(isbn_items[bi_mask],  'bi1')    if period in ('all', 'bi1')    else []
                bi2_rows = self._build_rows(isbn_items[bi_mask],  'bi2')    if period in ('all', 'bi2')    else []
                an_rows  = self._build_rows(isbn_items[~bi_mask], 'annual') if period in ('all', 'annual') else []

                if not any([bi1_rows, bi2_rows, an_rows]):
                    continue

                title     = safe_str(isbn_items.iloc[0, ItemCol.TITLE_TH])
                safe_name = re.sub(r'[\\/:*?"<>|]', '_', f"{isbn} - {title}")
                self._write_excel(
                    os.path.join(agency_dir, f"{safe_name}.xlsx"),
                    country, agency, publisher, period,
                    bi1_rows, bi2_rows, an_rows,
                )

        zip_path = os.path.join(output_dir, f'SalesReports_All_{period}.zip')
        with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zf:
            for root, _dirs, files in os.walk(output_dir):
                for fname in files:
                    if fname.endswith('.xlsx'):
                        fpath   = os.path.join(root, fname)
                        arcname = os.path.relpath(fpath, output_dir)
                        zf.write(fpath, arcname)
        return zip_path

    # ── Excel writer ──────────────────────────────────────────────────────────

    def _write_excel(self, path, country, agency, publisher, period,
                     bi1_rows, bi2_rows, an_rows):
        wb = Workbook()
        ws = wb.active
        ws.title = 'Sales Report'

        thin = Side(style='thin')
        bdr  = Border(left=thin, right=thin, top=thin, bottom=thin)
        ctr  = Alignment(horizontal='center', vertical='center', wrap_text=True)
        lft  = Alignment(horizontal='left',   vertical='center', wrap_text=True)
        rgt  = Alignment(horizontal='right',  vertical='center')
        NUM  = '#,##0.00'
        PCT  = '0.00%'

        def f(sz=9, bold=False, color='000000'):
            return Font(name='Arial', size=sz, bold=bold, color=color)

        HDR_FILL = PatternFill('solid', fgColor='1F4E79')
        HDR_FONT = Font(name='Arial', size=9, bold=True, color='FFFFFF')
        SEC_FILL = PatternFill('solid', fgColor='D6E4F0')

        type_mark = {
            'bi1': 'x  BI-ANNUAL             ANNUAL',
            'bi2': 'x  BI-ANNUAL             ANNUAL',
        }.get(period, '   BI-ANNUAL           x  ANNUAL')

        period_end = {
            'bi1':    'For the Period Ended June 30, 2025',
            'bi2':    'For the Period Ended December 31, 2025',
            'annual': 'For the Period Ended December 31, 2025',
            'all':    'For the Period Ended December 31, 2025',
        }.get(period, 'For the Period Ended December 31, 2025')

        # ── Rows 1-6: header block ────────────────────────────────────────────
        row = 1
        for txt in ['SALES REPORT', publisher, agency,
                    publisher, type_mark, period_end]:
            ws.cell(row=row, column=3, value=txt).font = f(10, bold=(row <= 2))
            row += 1

        # ── Rows 7-9: column headers ──────────────────────────────────────────
        all_rows_combined = bi1_rows + bi2_rows + an_rows
        raw_ccy = next((r['currency'] for r in all_rows_combined if r.get('currency')), 'CCY')
        ccy_label = 'JPY' if raw_ccy == 'JYP' else raw_ccy

        hdr_rows = [
            ['', '', 'TITLE', 'NO.OF',   'DATE',    'RETAIL',  'ROYALTY', 'NO.OF',
             'AMOUNT',  'AMOUNT',          'ADVANCED', 'PREVIOUS', 'BALANCE', 'PERIOD', 'NO.OF',  'STOCK'],
            ['', '', '',      'COPIES',  'PRINTED', 'PRICE',   'RATE',    'COPIES',
             '(THB)',   f'({ccy_label})',  'PAYMENT',  'BALANCE',  'PAID',    'BALANCE', 'UNSOLD', '(เล่ม)'],
            ['JOB', 'ISBN', '', 'PRINTED', '', '(THB)', '', 'SOLD',
             '', '', '(THB)', '(THB)', '(THB)', '(THB)', 'COPIES', 'คงเหลือ Account'],
        ]
        for hdr in hdr_rows:
            for c_idx, val in enumerate(hdr, 1):
                cell = ws.cell(row=row, column=c_idx, value=val)
                cell.font = HDR_FONT; cell.fill = HDR_FILL
                cell.alignment = ctr; cell.border = bdr
            row += 1

        # ── Section writer ────────────────────────────────────────────────────
        def write_section(label, rows_data, sub_period):
            nonlocal row
            if not rows_data:
                return

            # Section label row
            ws.cell(row=row, column=1, value=label).font = f(9, bold=True)
            ws.cell(row=row, column=1).fill = SEC_FILL
            ws.cell(row=row, column=1).alignment = lft
            ws.merge_cells(start_row=row, start_column=1, end_row=row, end_column=16)
            for c in range(1, 17):
                ws.cell(row=row, column=c).border = bdr
            row += 1

            total_thb = 0.0
            total_ccy = 0.0
            ex_rate_used = None
            ccy_used     = None

            for d in rows_data:
                def put(col, val, fmt=None, align=rgt):
                    cell = ws.cell(row=row, column=col, value=val)
                    cell.font = f(9); cell.border = bdr; cell.alignment = align
                    if fmt:
                        cell.number_format = fmt

                if d['is_ebook']:
                    put(1, '',          align=lft)
                    put(2, d['isbn'] or None, align=lft)
                else:
                    put(1, d['job'],    align=lft)
                    put(2, d['isbn'] or None, align=lft)

                put(3,  d['title'],                        align=lft)
                put(4,  d['copies_printed'] or None,       NUM)
                put(5,  d['date_printed'],                 align=lft)
                put(6,  d['retail_price']   or None,       NUM)
                put(7,  d['royalty_rate']   or None,       PCT)
                put(8,  d['copies_sold']    or None,       NUM)
                put(9,  d['amount_thb']     or None,       NUM)
                put(10, d['amount_ccy']     or None,       NUM)
                put(11, d['adv']            or None,       NUM)
                put(12, d['prev_balance']   or None,       NUM)
                put(13, d['balance_paid']   or None,       NUM)
                put(14, d['period_balance'],               NUM)
                put(15, d['unsold_copies'],                NUM)
                put(16, d['stock_account']  or None,       NUM)

                total_thb   += d['amount_thb']
                total_ccy   += d['amount_ccy']
                ex_rate_used = d['ex_rate']
                ccy_used     = d['currency']
                row += 1

                if d.get('title_th'):
                    put(3, d['title_th'], align=lft)
                    for c in range(1, 17):
                        if c != 3:
                            ws.cell(row=row, column=c).border = bdr
                    row += 1

            # "of net Receipt" note for e-books
            if any(d['is_ebook'] for d in rows_data):
                ws.cell(row=row, column=7, value='of net Receipt').font = f(8)
                row += 1

            # Total row
            for c in range(1, 17):
                ws.cell(row=row, column=c).border = bdr
            ws.cell(row=row, column=8, value='TOTAL').font = f(9, bold=True)
            ws.cell(row=row, column=8).alignment = rgt
            for col, val in ((9, total_thb), (10, total_ccy)):
                cell = ws.cell(row=row, column=col, value=val)
                cell.font = f(9, bold=True)
                cell.number_format = NUM
                cell.alignment = rgt
            row += 1

            # Exchange rate note
            if ex_rate_used and ccy_used:
                ccy_label = 'JPY' if ccy_used == 'JYP' else ccy_used
                ws.cell(row=row, column=6,
                        value=f'*  at current exchange rate of {ccy_label} 1 per {ex_rate_used:.4f}  Baht').font = f(8)
            row += 2

        write_section('BI-ANNUAL 2025.1  (January – June 2025)',      bi1_rows, 'bi1')
        write_section('BI-ANNUAL 2025.2  (July – December 2025)',     bi2_rows, 'bi2')
        write_section('ANNUAL 2025  (January – December 2025)',        an_rows,  'annual')

        # ── Column widths ─────────────────────────────────────────────────────
        for i, w in enumerate(
            [12, 16, 42, 11, 13, 10, 9, 9, 13, 13, 13, 13, 13, 13, 10, 13], 1
        ):
            ws.column_dimensions[get_column_letter(i)].width = w

        ws.freeze_panes = 'A10'
        wb.save(path)
