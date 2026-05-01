#!/usr/bin/env bash

ROOT="$(cd "$(dirname "$0")" && pwd)"

# ── Backend ──────────────────────────────────────────────────────────────────
echo "▶ Starting backend..."
cd "$ROOT/backend"
echo "  Installing Python packages..."
pip3 install -r requirements.txt
echo "  Starting uvicorn on port 8001..."
python3 -m uvicorn main:app --reload --port 8001 &
BACKEND_PID=$!

# รอให้ backend พร้อมก่อน
echo "  Waiting for backend..."
for i in $(seq 1 20); do
  sleep 1
  if curl -s http://localhost:8001/docs > /dev/null 2>&1; then
    echo "  ✅ Backend ready"
    break
  fi
done

# ── Frontend ─────────────────────────────────────────────────────────────────
echo "▶ Starting frontend..."
cd "$ROOT/frontend"
echo "  Installing npm packages..."
npm install
npm run dev &
FRONTEND_PID=$!

echo ""
echo "✅ Backend  → http://localhost:8001"
echo "✅ Frontend → http://localhost:5174"
echo ""
echo "Press Ctrl+C to stop both servers."

trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; echo 'Stopped.'" INT TERM
wait
