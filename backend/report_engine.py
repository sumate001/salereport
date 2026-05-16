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
    """แปลง date เป็น '21 May 2024' format"""
    if val is None:
        return ''
    if isinstance(val, datetime):
        return val.strftime('%d %b %Y')
    if hasattr(val, 'strftime'):
        return val.strftime('%d %b %Y')
    s = safe_str(val)
    if not s:
        return ''
    try:
        dt = pd.to_datetime(s)
        if pd.notna(dt):
            return dt.strftime('%d %b %Y')
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

def strip_reprint_suffix(title: str) -> str:
    """Strip reprint indicators like (พ.1), (พ.2), พิมพ์เพิ่ม from title."""
    s = re.sub(r'\s*[\(（][พP]\.\s*\d+[\)）]', '', title)
    s = re.sub(r'\s*พิมพ์เพิ่ม.*', '', s)
    s = re.sub(r'\s*พิมพ์ครั้งที่\s*\d+.*', '', s)
    return s.strip()


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
        if items.empty:
            return rows

        # Group by ISBN (maintain first-appearance order)
        isbn_to_group = {}
        isbn_order    = []
        for _, r in items.iterrows():
            isbn = safe_str(r.iloc[ItemCol.ISBN])
            if isbn not in isbn_to_group:
                isbn_to_group[isbn] = []
                isbn_order.append(isbn)
            isbn_to_group[isbn].append(r)

        for isbn in isbn_order:
            group = isbn_to_group[isbn]

            if not any(self._passes_selloff(r, period) for r in group):
                continue

            first_r       = group[0]
            is_ebook      = safe_str(first_r.iloc[ItemCol.JOB]).upper().startswith('EB/')
            retail        = safe_float(first_r.iloc[ItemCol.PRICE])
            fallback_rate = normalize_rate(first_r.iloc[ItemCol.ROYALTY_RATE])
            currency      = safe_str(first_r.iloc[ItemCol.PAYMENT_CURRENCY]) or 'USD'
            adv           = safe_float(first_r.iloc[ItemCol.ADV])
            adv_cur       = safe_str(first_r.iloc[ItemCol.ADV_CURRENCY])
            status_2024   = safe_str(first_r.iloc[ItemCol.STATUS_2024])
            prev_balance  = safe_float(first_r.iloc[ItemCol.PREV_BALANCE])
            balance_paid  = safe_float(first_r.iloc[ItemCol.PREV_BALANCE]) if status_2024 == 'จ่ายแล้ว' else 0.0
            stock_account = safe_float(first_r.iloc[ItemCol.STOCK_ACCOUNT])
            ex_rate       = self.get_rate(currency, period)
            intra_row     = self._find_intra_row(first_r)
            tiers         = parse_rt_tiers(intra_row)

            # Clean titles (strip reprint suffix) — for display header
            title_th_raw  = safe_str(first_r.iloc[ItemCol.TITLE_TH])
            title_en_raw  = safe_str(first_r.iloc[ItemCol.TITLE_EN])
            clean_th      = strip_reprint_suffix(title_th_raw)
            clean_en      = strip_reprint_suffix(title_en_raw)
            title_display = clean_en or clean_th
            title_th_sub  = clean_th if clean_en else ''

            # Per-run copies_sold and totals
            run_data             = []
            total_copies_sold    = 0.0
            total_copies_printed = 0.0
            for r in group:
                if period == 'bi1':
                    run_sold = safe_float(r.iloc[ItemCol.BI_H1_AMARIN]) + safe_float(r.iloc[ItemCol.BI_H1_ABOOK])
                elif period == 'bi2':
                    run_sold = safe_float(r.iloc[ItemCol.BI_H2_AMARIN]) + safe_float(r.iloc[ItemCol.BI_H2_ABOOK])
                else:
                    run_sold = safe_float(r.iloc[ItemCol.ANNUAL_SOLD])
                run_data.append((r, run_sold))
                total_copies_sold    += run_sold
                total_copies_printed += safe_float(r.iloc[ItemCol.COPIES_PRINTED])

            tier_split = apply_rt_tiers(total_copies_sold, tiers)

            # PERIOD BALANCE (first tier row only, when advance exists)
            period_balance = None
            if prev_balance > 0:
                if tier_split:
                    amt_thb_total = sum(tc * retail * tr for tc, tr in tier_split)
                else:
                    amt_thb_total = total_copies_sold * retail * fallback_rate
                amt_ccy_total  = amt_thb_total / ex_rate if ex_rate else 0.0
                amount_for_pb  = amt_thb_total if adv_cur == 'THB' else amt_ccy_total
                period_balance = prev_balance - amount_for_pb + balance_paid

            # UNSOLD COPIES (new prints only)
            any_new_print = any(
                extract_year(r.iloc[ItemCol.DATE_PRINTED]) == report_year_from_period(period)
                for r, _ in run_data
            )
            unsold_copies = (
                max(0.0, total_copies_printed - total_copies_sold)
                if any_new_print and total_copies_printed > 0 else None
            )

            multiple_runs = len(group) > 1

            # ── Print run sub-rows (only when >1 reprint) ──────────────────────
            if multiple_runs:
                for i, (r, run_sold) in enumerate(run_data):
                    is_first = (i == 0)
                    run_title = safe_str(r.iloc[ItemCol.TITLE_EN]) or safe_str(r.iloc[ItemCol.TITLE_TH])
                    rows.append({
                        'row_type':       'print_run',
                        'job':            safe_str(r.iloc[ItemCol.JOB]) if is_first else '',
                        'isbn':           isbn if is_first else None,
                        'title':          title_display if is_first else run_title,
                        'title_th':       title_th_sub  if is_first else '',
                        'copies_printed': safe_float(r.iloc[ItemCol.COPIES_PRINTED]),
                        'date_printed':   format_date_printed(r.iloc[ItemCol.DATE_PRINTED]),
                        'copies_sold':    run_sold,
                        'retail_price':   None,
                        'royalty_rate':   None,
                        'amount_thb':     0.0,
                        'amount_ccy':     0.0,
                        'currency':       currency,
                        'adv':            None,
                        'adv_currency':   adv_cur,
                        'prev_balance':   None,
                        'balance_paid':   None,
                        'period_balance': None,
                        'unsold_copies':  None,
                        'stock_account':  None,
                        'is_ebook':       is_ebook,
                        'ex_rate':        ex_rate,
                    })

            # ── Tier rows (based on total copies_sold across all reprints) ──────
            job_first = safe_str(first_r.iloc[ItemCol.JOB])

            def make_tier_row(tc, tr, is_first_tier):
                amt_thb = tc * retail * tr
                return {
                    'row_type':       'tier',
                    'job':            '' if multiple_runs else (job_first if is_first_tier else ''),
                    'isbn':           None if multiple_runs else (isbn if is_first_tier else None),
                    'title':          '' if multiple_runs else (title_display if is_first_tier else ''),
                    'title_th':       '' if multiple_runs else (title_th_sub  if is_first_tier else ''),
                    'copies_printed': None if multiple_runs else (total_copies_printed if is_first_tier else None),
                    'date_printed':   (
                        '' if multiple_runs else
                        (format_date_printed(first_r.iloc[ItemCol.DATE_PRINTED]) if is_first_tier else '')
                    ),
                    'copies_sold':    tc,
                    'retail_price':   retail,
                    'royalty_rate':   tr,
                    'amount_thb':     amt_thb,
                    'amount_ccy':     amt_thb / ex_rate if ex_rate else 0.0,
                    'currency':       currency,
                    'adv':            adv           if is_first_tier else 0.0,
                    'adv_currency':   adv_cur,
                    'prev_balance':   prev_balance  if is_first_tier else 0.0,
                    'balance_paid':   balance_paid  if is_first_tier else 0.0,
                    'period_balance': period_balance if is_first_tier else None,
                    'unsold_copies':  unsold_copies  if is_first_tier else None,
                    'stock_account':  stock_account  if is_first_tier else None,
                    'is_ebook':       is_ebook,
                    'ex_rate':        ex_rate,
                }

            if tier_split:
                for j, (tc, tr) in enumerate(tier_split):
                    rows.append(make_tier_row(tc, tr, is_first_tier=(j == 0)))
            else:
                rows.append(make_tier_row(total_copies_sold, fallback_rate, is_first_tier=True))

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
        """Generate one Excel per ISBN inside Agent/Publisher folders, bundled as ZIP."""
        if output_dir is None:
            output_dir = tempfile.mkdtemp()

        self._ensure_rates()

        # Iterate all unique agency values, including blank → Direct Publisher
        agency_series = self._clean(self.item.iloc[:, ItemCol.AGENCY])
        all_agencies  = sorted(agency_series.unique())

        for agency_raw in all_agencies:
            agent_items = self.item[agency_series == agency_raw].copy()
            if agent_items.empty:
                continue

            agency_label = agency_raw if len(agency_raw) > 3 else 'Direct Publisher'
            safe_agency  = re.sub(r'[\\/:*?"<>|]', '_', agency_label)
            agency_dir   = os.path.join(output_dir, safe_agency)

            isbn_series = self._clean(agent_items.iloc[:, ItemCol.ISBN])
            for isbn in sorted(isbn_series.unique()):
                if not isbn:
                    continue
                isbn_items = agent_items[isbn_series == isbn].copy()
                country, publisher = self._get_info_for_isbn(isbn)

                safe_pub = re.sub(r'[\\/:*?"<>|]', '_', publisher or 'Unknown Publisher')
                pub_dir  = os.path.join(agency_dir, safe_pub)
                os.makedirs(pub_dir, exist_ok=True)

                type_col = self._clean(isbn_items.iloc[:, ItemCol.ANNUAL_BI])
                bi_mask  = type_col.str.upper().str.contains('BI')

                bi1_rows = self._build_rows(isbn_items[bi_mask],  'bi1')    if period in ('all', 'bi1')    else []
                bi2_rows = self._build_rows(isbn_items[bi_mask],  'bi2')    if period in ('all', 'bi2')    else []
                an_rows  = self._build_rows(isbn_items[~bi_mask], 'annual') if period in ('all', 'annual') else []

                if not any([bi1_rows, bi2_rows, an_rows]):
                    continue

                raw_title   = safe_str(isbn_items.iloc[0, ItemCol.TITLE_TH])
                clean_title = strip_reprint_suffix(raw_title)
                safe_name   = re.sub(r'[\\/:*?"<>|]', '_', f"{isbn} - {clean_title}")
                self._write_excel(
                    os.path.join(pub_dir, f"{safe_name}.xlsx"),
                    country, agency_label, publisher, period,
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

    # ── Dashboard data ───────────────────────────────────────────────────────────

    def get_dashboard_data(self):
        self._ensure_rates()
        self._init_intra_cols()
        item = self.item

        # ── ISBN-level aggregation ────────────────────────────────────────────
        isbn_stats = {}
        for _, row in item.iterrows():
            isbn = safe_str(row.iloc[ItemCol.ISBN])
            if not isbn:
                continue
            title = (strip_reprint_suffix(safe_str(row.iloc[ItemCol.TITLE_EN]))
                     or strip_reprint_suffix(safe_str(row.iloc[ItemCol.TITLE_TH])))
            agency = safe_str(row.iloc[ItemCol.AGENCY])
            if not agency or len(agency) <= 3:
                agency = 'Direct Publisher'

            paidtype   = safe_str(row.iloc[ItemCol.ANNUAL_BI]).upper()
            is_bi      = 'BI' in paidtype
            if is_bi:
                copies_sold = (safe_float(row.iloc[ItemCol.BI_H1_AMARIN])
                             + safe_float(row.iloc[ItemCol.BI_H1_ABOOK])
                             + safe_float(row.iloc[ItemCol.BI_H2_AMARIN])
                             + safe_float(row.iloc[ItemCol.BI_H2_ABOOK]))
            else:
                copies_sold = safe_float(row.iloc[ItemCol.ANNUAL_SOLD])

            copies_printed = safe_float(row.iloc[ItemCol.COPIES_PRINTED])
            retail         = safe_float(row.iloc[ItemCol.PRICE])
            rate           = normalize_rate(row.iloc[ItemCol.ROYALTY_RATE])
            royalty_thb    = copies_sold * retail * rate
            status_2024    = safe_str(row.iloc[ItemCol.STATUS_2024])
            prev_balance   = safe_float(row.iloc[ItemCol.PREV_BALANCE])

            if isbn not in isbn_stats:
                isbn_stats[isbn] = {
                    'title':          title,
                    'agency':         agency,
                    'copies_sold':    0.0,
                    'copies_printed': 0.0,
                    'royalty_thb':    0.0,
                    'status_2024':    status_2024,
                    'prev_balance':   prev_balance,
                }
            isbn_stats[isbn]['copies_sold']    += copies_sold
            isbn_stats[isbn]['copies_printed'] += copies_printed
            isbn_stats[isbn]['royalty_thb']    += royalty_thb

        total_isbns   = len(isbn_stats)
        with_sales    = sum(1 for v in isbn_stats.values() if v['copies_sold'] > 0)
        zero_sales    = sum(1 for v in isbn_stats.values() if v['copies_sold'] == 0)
        total_royalty = sum(v['royalty_thb'] for v in isbn_stats.values())

        # ── Advance status (per unique ISBN) ──────────────────────────────────
        advance_status = {'จ่ายแล้ว': 0, 'ค้างจ่าย': 0, 'ยังไม่เกิน ADV': 0}
        seen = set()
        for _, row in item.iterrows():
            isbn = safe_str(row.iloc[ItemCol.ISBN])
            if not isbn or isbn in seen:
                continue
            seen.add(isbn)
            s = safe_str(row.iloc[ItemCol.STATUS_2024])
            if s in advance_status:
                advance_status[s] += 1

        # ── Sell-off expiring (year = 2025) ───────────────────────────────────
        expiring = set()
        for _, row in self.intra.iterrows():
            try:
                sell_yr = extract_year(row.iloc[IntraCol.SELL_OFF])
            except Exception:
                continue
            if sell_yr == 2025:
                for isbn_col in self._intra_isbn_cols:
                    v = safe_str(row.iloc[isbn_col])
                    if v:
                        expiring.add(v)
                        break

        # ── Agent aggregation ─────────────────────────────────────────────────
        agent_agg = {}
        for isbn, stats in isbn_stats.items():
            ag = stats['agency']
            if ag not in agent_agg:
                agent_agg[ag] = {'printed': 0.0, 'sold': 0.0, 'isbns': set(), 'royalty': 0.0}
            agent_agg[ag]['printed'] += stats['copies_printed']
            agent_agg[ag]['sold']    += stats['copies_sold']
            agent_agg[ag]['isbns'].add(isbn)
            agent_agg[ag]['royalty'] += stats['royalty_thb']

        agents = sorted([
            {
                'name':             ag,
                'isbn_count':       len(v['isbns']),
                'sell_through_pct': round(v['sold'] / v['printed'] * 100, 1) if v['printed'] > 0 else 0.0,
                'royalty_thb':      round(v['royalty'], 0),
            }
            for ag, v in agent_agg.items()
        ], key=lambda x: -x['royalty_thb'])

        # ── Top books & zero-sales books ──────────────────────────────────────
        all_books = sorted([
            {
                'isbn':             isbn,
                'title':            v['title'],
                'agency':           v['agency'],
                'copies_sold':      int(v['copies_sold']),
                'royalty_thb':      round(v['royalty_thb'], 0),
                'sell_through_pct': round(v['copies_sold'] / v['copies_printed'] * 100, 1)
                                    if v['copies_printed'] > 0 else 0.0,
            }
            for isbn, v in isbn_stats.items()
        ], key=lambda x: -x['royalty_thb'])

        top_books  = all_books[:10]
        zero_books = [b for b in all_books if b['copies_sold'] == 0][:10]

        # ── Totals ────────────────────────────────────────────────────────────
        agency_series    = self._clean(item.iloc[:, ItemCol.AGENCY])
        total_agencies   = len([a for a in agency_series.unique() if a and len(a) > 3])
        pub_series       = self._clean(self.intra.iloc[:, IntraCol.PUBLISHER])
        total_publishers = len([p for p in pub_series.unique()
                                 if p and p.lower() not in ('nan', '')])

        return {
            'summary': {
                'total_isbns':       total_isbns,
                'total_agencies':    total_agencies,
                'total_publishers':  total_publishers,
                'with_sales':        with_sales,
                'zero_sales':        zero_sales,
                'expiring_2025':     len(expiring),
                'total_royalty_thb': round(total_royalty, 0),
            },
            'advance_status': advance_status,
            'agents':         agents,
            'top_books':      top_books,
            'zero_books':     zero_books,
        }

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

                if d['row_type'] == 'print_run':
                    put(1, d['job'],                    align=lft)
                    put(2, d['isbn'] or None,           align=lft)
                    put(3, d['title'],                  align=lft)
                    put(4, d['copies_printed'] or None, NUM)
                    put(5, d['date_printed'],           align=lft)
                    put(6,  None); put(7,  None)
                    put(8, d['copies_sold'] or None,    NUM)
                    for c in range(9, 17):
                        put(c, None)
                else:
                    if d['is_ebook']:
                        put(1, '',                align=lft)
                        put(2, d['isbn'] or None, align=lft)
                    else:
                        put(1, d['job'],          align=lft)
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
