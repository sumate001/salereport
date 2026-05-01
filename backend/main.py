import os
import shutil
import tempfile
import uuid
from pathlib import Path

from fastapi import FastAPI, File, UploadFile, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel

from report_engine import ReportEngine

app = FastAPI(title="Sales Report API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5174", "http://127.0.0.1:5174"],
    allow_methods=["*"],
    allow_headers=["*"],
)

SESSIONS: dict[str, dict] = {}
UPLOAD_DIR = Path(tempfile.gettempdir()) / "sale_report_uploads"
UPLOAD_DIR.mkdir(exist_ok=True)


def _save(file: UploadFile, dest: Path) -> Path:
    out = dest / file.filename
    with out.open("wb") as f:
        shutil.copyfileobj(file.file, f)
    return out


def _engine(session_id: str) -> ReportEngine:
    s = SESSIONS.get(session_id)
    if not s:
        raise HTTPException(404, "Session ไม่พบ กรุณาอัปโหลดไฟล์ใหม่")
    return ReportEngine(s["item_path"], s["intra_paths"], s["exchange_path"])


# ── POST /api/upload ──────────────────────────────────────────────────────────

@app.post("/api/upload")
async def upload(
    item_file:      UploadFile = File(...),
    intra_file_1:   UploadFile = File(...),
    intra_file_2:   UploadFile = File(...),
    intra_file_3:   UploadFile = File(...),
    intra_file_4:   UploadFile = File(...),
    exchange_file:  UploadFile = File(...),
):
    sid = str(uuid.uuid4())
    d   = UPLOAD_DIR / sid
    d.mkdir(parents=True)

    item_path     = _save(item_file,     d)
    intra_paths   = [str(_save(f, d)) for f in [intra_file_1, intra_file_2, intra_file_3, intra_file_4]]
    exchange_path = _save(exchange_file, d)

    try:
        engine    = ReportEngine(str(item_path), intra_paths, str(exchange_path))
        countries = engine.get_countries()
    except Exception as e:
        shutil.rmtree(d, ignore_errors=True)
        raise HTTPException(400, f"ไม่สามารถอ่านไฟล์ได้: {e}")

    out_dir = str(d / "output")
    os.makedirs(out_dir, exist_ok=True)

    SESSIONS[sid] = {
        "item_path":     str(item_path),
        "intra_paths":   intra_paths,
        "exchange_path": str(exchange_path),
        "output_dir":    out_dir,
    }

    return {"session_id": sid, "countries": countries}


# ── GET /api/agencies ─────────────────────────────────────────────────────────

@app.get("/api/agencies")
def get_agencies(session_id: str = Query(...), country: str = Query("")):
    return {"agencies": _engine(session_id).get_agencies(country)}


# ── GET /api/publishers ───────────────────────────────────────────────────────

@app.get("/api/publishers")
def get_publishers(
    session_id: str = Query(...),
    agency:     str = Query(...),
    country:    str = Query(""),
):
    return {"publishers": _engine(session_id).get_publishers(agency, country)}


# ── POST /api/generate ────────────────────────────────────────────────────────

class GenerateReq(BaseModel):
    session_id: str
    country:    str
    agency:     str
    publisher:  str
    period:     str = "annual"


@app.post("/api/generate")
def generate(req: GenerateReq):
    if req.period not in ("all", "bi1", "bi2", "annual"):
        raise HTTPException(400, "period ต้องเป็น all | bi1 | bi2 | annual")
    s = SESSIONS.get(req.session_id)
    if not s:
        raise HTTPException(404, "Session ไม่พบ กรุณาอัปโหลดไฟล์ใหม่")
    try:
        engine   = ReportEngine(s["item_path"], s["intra_paths"], s["exchange_path"])
        out_path = engine.generate_report(
            req.country, req.agency, req.publisher, req.period, s["output_dir"]
        )
    except Exception as e:
        raise HTTPException(500, f"Generate ล้มเหลว: {e}")
    return {"file_path": out_path, "filename": os.path.basename(out_path)}


# ── POST /api/generate-all ───────────────────────────────────────────────────

class GenerateAllReq(BaseModel):
    session_id: str
    period:     str = "annual"


@app.post("/api/generate-all")
def generate_all(req: GenerateAllReq):
    if req.period not in ("all", "bi1", "bi2", "annual"):
        raise HTTPException(400, "period ต้องเป็น all | bi1 | bi2 | annual")
    s = SESSIONS.get(req.session_id)
    if not s:
        raise HTTPException(404, "Session ไม่พบ กรุณาอัปโหลดไฟล์ใหม่")
    try:
        engine   = ReportEngine(s["item_path"], s["intra_paths"], s["exchange_path"])
        zip_path = engine.generate_all(req.period, s["output_dir"])
    except Exception as e:
        raise HTTPException(500, f"Generate ล้มเหลว: {e}")
    return {"file_path": zip_path, "filename": os.path.basename(zip_path)}


# ── GET /api/download ─────────────────────────────────────────────────────────

@app.get("/api/download")
def download(path: str):
    if not os.path.isfile(path):
        raise HTTPException(404, "ไม่พบไฟล์")
    real = os.path.realpath(path)
    base = os.path.realpath(str(UPLOAD_DIR))
    if not real.startswith(base):
        raise HTTPException(403, "Access denied")
    media = ("application/zip" if path.endswith(".zip")
             else "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
    return FileResponse(path, media_type=media, filename=os.path.basename(path))
