import json
import os
import shutil
import uuid
from datetime import datetime
from pathlib import Path

from fastapi import FastAPI, File, Form, UploadFile, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel

from report_engine import ReportEngine

# ── Persistent storage ─────────────────────────────────────────────────────────
HOME          = Path.home() / ".sale_report"
DATASETS_DIR  = HOME / "datasets";   DATASETS_DIR.mkdir(parents=True, exist_ok=True)
REPORTS_DIR   = HOME / "reports";    REPORTS_DIR.mkdir(parents=True, exist_ok=True)
SNAPSHOTS_DIR = HOME / "dashboards"; SNAPSHOTS_DIR.mkdir(parents=True, exist_ok=True)

PERIOD_LABELS = {
    "bi1":    "BI-Annual 2025.1  (ม.ค. – มิ.ย.)",
    "bi2":    "BI-Annual 2025.2  (ก.ค. – ธ.ค.)",
    "annual": "Annual 2025  (ม.ค. – ธ.ค.)",
    "all":    "ทุกรอบ (BI-Annual + Annual)",
}

FILE_SLOTS = ["item", "intra_1", "intra_2", "intra_3", "intra_4", "exchange"]

# ── App ────────────────────────────────────────────────────────────────────────
app = FastAPI(title="Sales Report API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5174", "http://127.0.0.1:5174"],
    allow_methods=["*"],
    allow_headers=["*"],
)

SESSIONS: dict[str, dict] = {}


# ── Session helpers ────────────────────────────────────────────────────────────

def _ensure_session(dataset_id: str) -> dict:
    """Return session dict from memory; reconstruct from disk on cache miss."""
    if dataset_id in SESSIONS:
        return SESSIONS[dataset_id]
    ds_dir = DATASETS_DIR / dataset_id
    if not (ds_dir / "meta.json").exists():
        raise HTTPException(404, "ไม่พบ dataset กรุณาอัปโหลดไฟล์ใหม่")
    meta = json.loads((ds_dir / "meta.json").read_text(encoding="utf-8"))
    out_dir = ds_dir / "output"
    out_dir.mkdir(exist_ok=True)
    s = {
        "item_path":     str(ds_dir / "item.xlsx"),
        "intra_paths":   [str(ds_dir / f"intra_{i}.xlsx") for i in range(1, 5)],
        "exchange_path": str(ds_dir / "exchange.xlsx"),
        "output_dir":    str(out_dir),
        "label":         meta.get("label", ""),
        "dataset_id":    dataset_id,
    }
    SESSIONS[dataset_id] = s
    return s


# ── Datasets ───────────────────────────────────────────────────────────────────

@app.post("/api/datasets")
async def create_dataset(
    label:         str        = Form(...),
    item_file:     UploadFile = File(...),
    intra_file_1:  UploadFile = File(...),
    intra_file_2:  UploadFile = File(...),
    intra_file_3:  UploadFile = File(...),
    intra_file_4:  UploadFile = File(...),
    exchange_file: UploadFile = File(...),
):
    did    = str(uuid.uuid4())
    ds_dir = DATASETS_DIR / did
    ds_dir.mkdir(parents=True)

    uploads = [
        (item_file,    "item"),
        (intra_file_1, "intra_1"),
        (intra_file_2, "intra_2"),
        (intra_file_3, "intra_3"),
        (intra_file_4, "intra_4"),
        (exchange_file, "exchange"),
    ]
    orig_names: dict[str, str] = {}
    for f, slot in uploads:
        with (ds_dir / f"{slot}.xlsx").open("wb") as out:
            shutil.copyfileobj(f.file, out)
        orig_names[slot] = f.filename or f"{slot}.xlsx"

    try:
        engine = ReportEngine(
            str(ds_dir / "item.xlsx"),
            [str(ds_dir / f"intra_{i}.xlsx") for i in range(1, 5)],
            str(ds_dir / "exchange.xlsx"),
        )
        engine.get_countries()
    except Exception as e:
        shutil.rmtree(ds_dir, ignore_errors=True)
        raise HTTPException(400, f"ไม่สามารถอ่านไฟล์ได้: {e}")

    now  = datetime.now()
    meta = {
        "id":                 did,
        "label":              label,
        "uploaded_at":        now.isoformat(),
        "ts_slug":            now.strftime("%Y%m%d_%H%M%S"),
        "original_filenames": orig_names,
    }
    (ds_dir / "meta.json").write_text(json.dumps(meta, ensure_ascii=False), encoding="utf-8")

    out_dir = ds_dir / "output"
    out_dir.mkdir(exist_ok=True)
    SESSIONS[did] = {
        "item_path":     str(ds_dir / "item.xlsx"),
        "intra_paths":   [str(ds_dir / f"intra_{i}.xlsx") for i in range(1, 5)],
        "exchange_path": str(ds_dir / "exchange.xlsx"),
        "output_dir":    str(out_dir),
        "label":         label,
        "dataset_id":    did,
    }

    return {"dataset_id": did, "label": label, "ts_slug": meta["ts_slug"]}


@app.get("/api/datasets")
def list_datasets():
    items = []
    for d in DATASETS_DIR.iterdir():
        mp = d / "meta.json"
        if d.is_dir() and mp.exists():
            try:
                items.append(json.loads(mp.read_text(encoding="utf-8")))
            except Exception:
                pass
    items.sort(key=lambda x: x.get("ts_slug", ""), reverse=True)
    return {"datasets": items}


class UpdateLabelReq(BaseModel):
    label: str


@app.patch("/api/datasets/{dataset_id}")
def update_dataset_label(dataset_id: str, req: UpdateLabelReq):
    mp = DATASETS_DIR / dataset_id / "meta.json"
    if not mp.exists():
        raise HTTPException(404, "ไม่พบ dataset")
    meta = json.loads(mp.read_text(encoding="utf-8"))
    meta["label"] = req.label
    mp.write_text(json.dumps(meta, ensure_ascii=False), encoding="utf-8")
    if dataset_id in SESSIONS:
        SESSIONS[dataset_id]["label"] = req.label
    return {"ok": True}


@app.delete("/api/datasets/{dataset_id}")
def delete_dataset(dataset_id: str):
    ds_dir = DATASETS_DIR / dataset_id
    if not ds_dir.exists():
        raise HTTPException(404, "ไม่พบ dataset")
    shutil.rmtree(ds_dir, ignore_errors=True)
    SESSIONS.pop(dataset_id, None)
    return {"ok": True}


@app.get("/api/datasets/{dataset_id}/books")
def list_books(dataset_id: str, q: str = Query(default="")):
    s = _ensure_session(dataset_id)
    try:
        engine = ReportEngine(s["item_path"], s["intra_paths"], s["exchange_path"])
        books  = engine.get_books(q)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"ค้นหาล้มเหลว: {e}")
    return {"books": books[:50]}


@app.get("/api/datasets/{dataset_id}/files/{slot}")
def download_dataset_file(dataset_id: str, slot: str):
    if slot not in FILE_SLOTS:
        raise HTTPException(403, "Access denied")
    ds_dir = DATASETS_DIR / dataset_id
    if not (ds_dir / "meta.json").exists():
        raise HTTPException(404, "ไม่พบ dataset")
    meta = json.loads((ds_dir / "meta.json").read_text(encoding="utf-8"))
    path = ds_dir / f"{slot}.xlsx"
    if not path.exists():
        raise HTTPException(404, "ไม่พบไฟล์")
    orig = meta.get("original_filenames", {}).get(slot, f"{slot}.xlsx")
    return FileResponse(
        path,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        filename=orig,
    )


# ── Generate ───────────────────────────────────────────────────────────────────

class GenerateAllReq(BaseModel):
    dataset_id:   str
    period:       str       = "annual"
    isbn_filter:  list[str] = []
    filter_label: str       = ""


@app.post("/api/generate-all")
def generate_all(req: GenerateAllReq):
    if req.period not in ("all", "bi1", "bi2", "annual"):
        raise HTTPException(400, "period ต้องเป็น all | bi1 | bi2 | annual")
    s = _ensure_session(req.dataset_id)
    try:
        engine   = ReportEngine(s["item_path"], s["intra_paths"], s["exchange_path"])
        zip_path = engine.generate_all(
            req.period, s["output_dir"],
            isbn_filter=req.isbn_filter if req.isbn_filter else None,
        )
    except Exception as e:
        raise HTTPException(500, f"Generate ล้มเหลว: {e}")

    now     = datetime.now()
    ts_slug = now.strftime("%Y%m%d_%H%M%S")
    label_slug = ""
    if req.filter_label:
        import re as _re
        label_slug = "_" + _re.sub(r'[\\/:*?"<>|]', '_', req.filter_label)[:60]
    pname   = f"report_{ts_slug}_{req.period}{label_slug}.zip"
    dest    = REPORTS_DIR / pname
    shutil.copy2(zip_path, dest)
    size = dest.stat().st_size
    (REPORTS_DIR / f"report_{ts_slug}_{req.period}.json").write_text(
        json.dumps({
            "filename":      pname,
            "ts_slug":       ts_slug,
            "period":        req.period,
            "period_label":  PERIOD_LABELS.get(req.period, req.period),
            "size_bytes":    size,
            "dataset_id":    req.dataset_id,
            "dataset_label": s.get("label", ""),
        }, ensure_ascii=False),
        encoding="utf-8",
    )

    return {
        "filename":     pname,
        "period_label": PERIOD_LABELS.get(req.period, req.period),
        "size_bytes":   size,
        "ts_slug":      ts_slug,
        "dataset_id":   req.dataset_id,
    }


# ── Dashboard ──────────────────────────────────────────────────────────────────

@app.get("/api/dashboard")
def get_dashboard(dataset_id: str = Query(...)):
    try:
        s      = _ensure_session(dataset_id)
        engine = ReportEngine(s["item_path"], s["intra_paths"], s["exchange_path"])
        return engine.get_dashboard_data()
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"Dashboard ล้มเหลว: {e}")


# ── Reports ────────────────────────────────────────────────────────────────────

@app.get("/api/reports")
def list_reports():
    items = []
    for f in sorted(REPORTS_DIR.glob("report_*.json"), reverse=True):
        try:
            items.append(json.loads(f.read_text(encoding="utf-8")))
        except Exception:
            pass
    return {"reports": items}


@app.get("/api/reports/{filename}")
def download_report(filename: str):
    if not filename.endswith(".zip") or "/" in filename or ".." in filename:
        raise HTTPException(403, "Access denied")
    path = REPORTS_DIR / filename
    if not path.exists():
        raise HTTPException(404, "ไม่พบไฟล์")
    return FileResponse(path, media_type="application/zip", filename=filename)


@app.delete("/api/reports/{filename}")
def delete_report(filename: str):
    if not filename.endswith(".zip") or "/" in filename or ".." in filename:
        raise HTTPException(403, "Access denied")
    (REPORTS_DIR / filename).unlink(missing_ok=True)
    (REPORTS_DIR / filename.replace(".zip", ".json")).unlink(missing_ok=True)
    return {"ok": True}


# ── Snapshots ──────────────────────────────────────────────────────────────────

class SaveSnapshotReq(BaseModel):
    html:       str
    ts_slug:    str
    meta:       dict
    dataset_id: str = ""


@app.post("/api/snapshots/save")
def save_snapshot(req: SaveSnapshotReq):
    fname = f"dashboard_{req.ts_slug}.html"
    (SNAPSHOTS_DIR / fname).write_text(req.html, encoding="utf-8")
    (SNAPSHOTS_DIR / f"dashboard_{req.ts_slug}.json").write_text(
        json.dumps({**req.meta, "filename": fname, "dataset_id": req.dataset_id},
                   ensure_ascii=False),
        encoding="utf-8",
    )
    return {"filename": fname}


@app.get("/api/snapshots")
def list_snapshots():
    items = []
    for f in sorted(SNAPSHOTS_DIR.glob("dashboard_*.json"), reverse=True):
        try:
            items.append(json.loads(f.read_text(encoding="utf-8")))
        except Exception:
            pass
    return {"snapshots": items}


@app.get("/api/snapshots/{filename}")
def get_snapshot(filename: str):
    if not filename.endswith(".html") or "/" in filename or ".." in filename:
        raise HTTPException(403, "Access denied")
    path = SNAPSHOTS_DIR / filename
    if not path.exists():
        raise HTTPException(404, "ไม่พบ snapshot")
    return FileResponse(path, media_type="text/html")


@app.delete("/api/snapshots/{filename}")
def delete_snapshot(filename: str):
    if not filename.endswith(".html") or "/" in filename or ".." in filename:
        raise HTTPException(403, "Access denied")
    (SNAPSHOTS_DIR / filename).unlink(missing_ok=True)
    (SNAPSHOTS_DIR / filename.replace(".html", ".json")).unlink(missing_ok=True)
    return {"ok": True}
