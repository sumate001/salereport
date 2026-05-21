function fmtSize(b) {
  if (!b) return ''
  return b < 1e6 ? `${(b / 1024).toFixed(0)} KB` : `${(b / 1024 / 1024).toFixed(1)} MB`
}

export default function ResultsPanel({ reports, errors = [], dashboard }) {
  const empty = reports.length === 0 && errors.length === 0 && !dashboard

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">ผลลัพธ์ (รอบนี้)</span>
        {!empty && (
          <span className="text-xs text-gray-400">
            {reports.length + (dashboard ? 1 : 0)} ไฟล์{errors.length > 0 ? ` · ${errors.length} ข้อผิดพลาด` : ''}
          </span>
        )}
      </div>

      {empty ? (
        <div className="flex flex-col items-center justify-center py-14 text-center">
          <div className="text-4xl mb-3 opacity-10">📄</div>
          <p className="text-sm text-gray-400">ยังไม่มีผลลัพธ์</p>
          <p className="text-xs text-gray-300 mt-1">เลือก period แล้วกด "สร้าง" ตรงกลาง</p>
        </div>
      ) : (
        <div className="space-y-2">
          {errors.map((err, i) => (
            <div key={`err-${i}`} className="flex items-start gap-3 px-3 py-3 bg-red-50 border border-red-100 rounded-xl">
              <span className="text-lg mt-0.5">⚠️</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-red-700 leading-tight">{err.label}</p>
                <p className="text-xs text-red-500 mt-0.5 leading-relaxed">{err.message}</p>
              </div>
            </div>
          ))}
          {reports.map((r, i) => (
            <div key={i} className="flex items-center gap-3 px-3 py-3 bg-gray-50 rounded-xl">
              <span className="text-2xl">📦</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-700 leading-tight">{r.period_label}</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {fmtSize(r.size_bytes)}
                  {r.size_bytes && ' · '}
                  <span className="font-mono">{r.filename}</span>
                </p>
              </div>
              <a
                href={`/api/reports/${encodeURIComponent(r.filename)}`}
                download={r.filename}
                className="shrink-0 px-3 py-1.5 bg-green-600 text-white text-xs font-semibold rounded-lg hover:bg-green-700 transition-colors whitespace-nowrap"
              >
                ⬇ ดาวน์โหลด
              </a>
            </div>
          ))}

          {dashboard && (
            <div className="flex items-center gap-3 px-3 py-3 bg-brand/5 border border-brand/15 rounded-xl">
              <span className="text-2xl">📊</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-brand leading-tight">Dashboard</p>
                <p className="text-xs text-gray-400 mt-0.5">สร้างเมื่อ {dashboard.tsDisplay}</p>
              </div>
              <a
                href={`/api/snapshots/${dashboard.filename}`}
                target="_blank"
                rel="noreferrer"
                className="shrink-0 px-3 py-1.5 bg-brand text-white text-xs font-semibold rounded-lg hover:bg-brand-light transition-colors whitespace-nowrap"
              >
                ↗ เปิดดู
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
