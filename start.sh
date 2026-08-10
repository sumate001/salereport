#!/usr/bin/env bash
set -uo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
VENV="$ROOT/backend/.venv"
VITE_CONFIG="$ROOT/frontend/vite.config.js"

# ── Ports ────────────────────────────────────────────────────────────────────
# ดึงจาก vite.config.js เป็นแหล่งความจริงเดียว กันเลขพอร์ตหลุดจากกันแบบเดิม
# (เคย hardcode 8001 ที่นี่ แต่ proxy ชี้ 8002 → frontend เรียก API ไม่เจอ)
BACKEND_PORT="$(sed -n "s/.*target:.*localhost:\([0-9]\+\).*/\1/p" "$VITE_CONFIG" | head -1)"
FRONTEND_PORT="$(sed -n "s/^\s*port:\s*\([0-9]\+\).*/\1/p" "$VITE_CONFIG" | head -1)"
BACKEND_PORT="${BACKEND_PORT:-8002}"
FRONTEND_PORT="${FRONTEND_PORT:-5174}"

port_busy() { (exec 3<>"/dev/tcp/127.0.0.1/$1") 2>/dev/null; }

for p in "$BACKEND_PORT" "$FRONTEND_PORT"; do
  if port_busy "$p"; then
    echo "❌ port $p ถูกใช้อยู่แล้ว — ปิด process เดิมก่อน (ดูด้วย: ss -ltnp | grep $p)"
    exit 1
  fi
done

# ── Backend ──────────────────────────────────────────────────────────────────
echo "▶ Starting backend..."
cd "$ROOT/backend"

# ต้องใช้ .venv เท่านั้น — python3 ของระบบไม่มี pandas/openpyxl
if [ ! -x "$VENV/bin/python" ]; then
  echo "  Creating virtualenv at backend/.venv ..."
  if command -v uv > /dev/null 2>&1; then
    uv venv "$VENV" || { echo "❌ สร้าง venv ไม่ได้"; exit 1; }
  else
    python3 -m venv "$VENV" || { echo "❌ สร้าง venv ไม่ได้ (ลอง: sudo apt install python3-venv)"; exit 1; }
  fi
fi

# เช็ค deps ก่อน แล้วติดตั้งเฉพาะตอนที่ขาด — venv นี้สร้างด้วย uv จึงไม่มี pip อยู่ข้างใน
# (ของเดิมสั่ง pip install ทุกรอบ → ล้มที่ "No module named pip" ทั้งที่ deps ครบแล้ว)
if "$VENV/bin/python" -c "import fastapi, uvicorn, pandas, openpyxl, xlrd, numpy, multipart" 2>/dev/null; then
  echo "  ✅ Python packages ครบแล้ว (ข้ามการติดตั้ง)"
else
  echo "  Installing Python packages..."
  if command -v uv > /dev/null 2>&1; then
    uv pip install --python "$VENV/bin/python" -q -r requirements.txt \
      || { echo "❌ uv pip install ล้มเหลว"; exit 1; }
  else
    "$VENV/bin/python" -m ensurepip --upgrade > /dev/null 2>&1
    "$VENV/bin/python" -m pip install -q -r requirements.txt \
      || { echo "❌ pip install ล้มเหลว — ติดตั้ง uv แล้วลองใหม่: pip install uv"; exit 1; }
  fi
fi

echo "  Starting uvicorn on port $BACKEND_PORT..."
"$VENV/bin/python" -m uvicorn main:app --reload --port "$BACKEND_PORT" &
BACKEND_PID=$!

# รอให้ backend พร้อมก่อน
echo "  Waiting for backend..."
BACKEND_READY=0
for i in $(seq 1 30); do
  if ! kill -0 "$BACKEND_PID" 2>/dev/null; then
    echo "  ❌ Backend ตายตอนสตาร์ท — เลื่อนขึ้นไปดู traceback ด้านบน"
    exit 1
  fi
  if curl -sf "http://localhost:$BACKEND_PORT/docs" > /dev/null 2>&1; then
    echo "  ✅ Backend ready"
    BACKEND_READY=1
    break
  fi
  sleep 1
done
if [ "$BACKEND_READY" -eq 0 ]; then
  echo "  ❌ Backend ไม่ตอบใน 30 วินาที"
  kill "$BACKEND_PID" 2>/dev/null
  exit 1
fi

# ── Frontend ─────────────────────────────────────────────────────────────────
echo "▶ Starting frontend..."
cd "$ROOT/frontend"
# ติดตั้งเฉพาะตอน node_modules ยังไม่มี หรือ package.json ใหม่กว่า
if [ -d node_modules ] && [ ! package.json -nt node_modules ]; then
  echo "  ✅ npm packages ครบแล้ว (ข้ามการติดตั้ง)"
else
  echo "  Installing npm packages..."
  npm install --silent || { echo "❌ npm install ล้มเหลว"; kill "$BACKEND_PID" 2>/dev/null; exit 1; }
fi
npm run dev &
FRONTEND_PID=$!

echo ""
echo "✅ Backend  → http://localhost:$BACKEND_PORT      (API docs: /docs)"
echo "✅ Frontend → http://localhost:$FRONTEND_PORT"
# vite.config.js ตั้ง host: true ไว้ → เข้าจากเครื่องอื่นได้ด้วย
for ip in $(hostname -I 2>/dev/null); do
  echo "            → http://$ip:$FRONTEND_PORT"
done
echo ""
echo "Press Ctrl+C to stop both servers."

trap 'kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; wait 2>/dev/null; echo "Stopped."' INT TERM
wait
