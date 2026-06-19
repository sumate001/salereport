import { useState, useEffect } from 'react'

function Spinner() {
  return (
    <svg className="animate-spin h-3.5 w-3.5 shrink-0" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 00-8 8h4z"/>
    </svg>
  )
}

function fmtSize(b) {
  if (!b) return ''
  return b < 1e6 ? `${(b / 1024).toFixed(0)} KB` : `${(b / 1024 / 1024).toFixed(1)} MB`
}

export default function MergePanel({ latestReports = [] }) {
  const [legacyZips,     setLegacyZips]     = useState([])
  const [selectedReport, setSelectedReport] = useState('')
  const [selectedLegacy, setSelectedLegacy] = useState('')
  const [merging,        setMerging]        = useState(false)
  const [result,         setResult]         = useState(null)
  const [error,          setError]          = useState('')
  const [mergedHistory,  setMergedHistory]  = useState([])

  useEffect(() => {
    fetch('/api/legacy/reports')
      .then(r => r.json())
      .then(d => {
        const zips = (d.reports || []).filter(r => r.filename.endsWith('.zip'))
        setLegacyZips(zips)
        if (zips.length > 0 && !selectedLegacy) setSelectedLegacy(zips[0].filename)
      })
      .catch(() => {})

    fetch('/api/merged-reports')
      .then(r => r.json())
      .then(d => setMergedHistory(d.reports || []))
      .catch(() => {})
  }, [])

  // sync selectedReport with latest available
  useEffect(() => {
    if (latestReports.length > 0 && !selectedReport) {
      setSelectedReport(latestReports[0].filename)
    }
  }, [latestReports])

  const handleMerge = async () => {
    if (!selectedReport || merging) return
    setMerging(true)
    setResult(null)
    setError('')
    try {
      const r = await fetch('/api/merge-history', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          report_zip: selectedReport,
          legacy_zip: selectedLegacy || null,
        }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.detail || 'ล้มเหลว')
      setResult(d)
      setMergedHistory(prev => [{ filename: d.filename, size_bytes: d.size_bytes }, ...prev])
    } catch (e) {
      setError(e.message)
    } finally {
      setMerging(false)
    }
  }

  const hasReports = latestReports.length > 0
  const canMerge   = hasReports && selectedReport && !merging

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 space-y-4">

      {/* header */}
      <div className="flex items-center gap-2.5">
        <div className="w-5 h-5 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center text-xs font-bold shrink-0">2</div>
        <div>
          <span className="text-sm font-semibold text-gray-700">เพิ่มข้อมูลย้อนหลัง</span>
          <span className="ml-2 text-xs text-gray-400">(optional)</span>
        </div>
      </div>

      {!hasReports ? (
        <p className="text-xs text-gray-400 text-center py-4">
          สร้าง Report จาก Step 1 ก่อน
        </p>
      ) : (
        <div className="space-y-3">

          {/* select report */}
          <div className="space-y-1">
            <p className="text-[11px] text-gray-400 font-medium uppercase tracking-wide">Report จาก Step 1</p>
            <select
              value={selectedReport}
              onChange={e => setSelectedReport(e.target.value)}
              className="w-full text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white text-gray-700 focus:outline-none focus:border-brand/50"
            >
              {latestReports.map(r => (
                <option key={r.filename} value={r.filename}>{r.period_label || r.filename}</option>
              ))}
            </select>
          </div>

          {/* select legacy */}
          <div className="space-y-1">
            <p className="text-[11px] text-gray-400 font-medium uppercase tracking-wide">ข้อมูลย้อนหลัง</p>
            {legacyZips.length === 0 ? (
              <p className="text-xs text-amber-600 bg-amber-50 rounded-lg px-3 py-2">
                ยังไม่มีไฟล์ย้อนหลัง — แปลงข้อมูลจากแท็บ "ข้อมูลย้อนหลัง" ก่อน
              </p>
            ) : (
              <select
                value={selectedLegacy}
                onChange={e => setSelectedLegacy(e.target.value)}
                className="w-full text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white text-gray-700 focus:outline-none focus:border-brand/50"
              >
                {legacyZips.map(z => (
                  <option key={z.filename} value={z.filename}>
                    {z.filename} {z.size_bytes ? `(${fmtSize(z.size_bytes)})` : ''}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* info note */}
          <p className="text-[11px] text-gray-400 bg-gray-50 rounded-lg px-3 py-2 leading-relaxed">
            ระบบจับคู่หนังสือโดยอัตโนมัติ (ชื่อภาษาอังกฤษ) แล้วเรียงปีเก่า → ใหม่ในไฟล์เดียวกัน
          </p>

          {error && <p className="text-xs text-red-500">{error}</p>}

          <button
            onClick={handleMerge}
            disabled={!canMerge || legacyZips.length === 0}
            className={`w-full py-2 rounded-lg text-sm font-semibold transition-colors flex items-center justify-center gap-2 ${
              canMerge && legacyZips.length > 0
                ? 'bg-amber-500 text-white hover:bg-amber-600'
                : 'bg-gray-100 text-gray-400 cursor-not-allowed'
            }`}
          >
            {merging ? <><Spinner /> กำลังรวมข้อมูล...</> : '⟳ รวมข้อมูลย้อนหลัง'}
          </button>

          {/* result */}
          {result && (
            <div className="flex items-center gap-3 px-3 py-3 bg-amber-50 border border-amber-100 rounded-xl">
              <span className="text-xl">📋</span>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-amber-800">รวมแล้ว {result.matched} เล่ม · ไม่มีประวัติ {result.unmatched} เล่ม</p>
                <p className="text-[11px] text-amber-600 mt-0.5 font-mono truncate">{result.filename}</p>
              </div>
              <a
                href={`/api/merged-reports/${encodeURIComponent(result.filename)}`}
                download={result.filename}
                className="shrink-0 px-3 py-1.5 bg-amber-600 text-white text-xs font-semibold rounded-lg hover:bg-amber-700 transition-colors whitespace-nowrap"
              >
                ⬇ ดาวน์โหลด
              </a>
            </div>
          )}
        </div>
      )}

      {/* history of merged files */}
      {mergedHistory.length > 0 && (
        <div className="border-t border-gray-100 pt-3 space-y-2">
          <p className="text-[11px] text-gray-400 font-medium uppercase tracking-wide">ไฟล์ที่รวมแล้ว</p>
          {mergedHistory.map(m => (
            <div key={m.filename} className="flex items-center gap-2 text-xs text-gray-500">
              <span>📋</span>
              <span className="flex-1 truncate font-mono text-[10px]">{m.filename}</span>
              <a
                href={`/api/merged-reports/${encodeURIComponent(m.filename)}`}
                download={m.filename}
                className="text-brand hover:underline shrink-0"
              >
                ดาวน์โหลด
              </a>
              <button
                onClick={async () => {
                  await fetch(`/api/merged-reports/${encodeURIComponent(m.filename)}`, { method: 'DELETE' })
                  setMergedHistory(prev => prev.filter(x => x.filename !== m.filename))
                  if (result?.filename === m.filename) setResult(null)
                }}
                className="shrink-0 text-gray-300 hover:text-red-500 transition-colors"
                title="ลบ"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
