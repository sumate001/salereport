import { useState, useEffect, useRef } from 'react'

function fmt_size(bytes) {
  if (bytes >= 1048576) return (bytes / 1048576).toFixed(1) + ' MB'
  if (bytes >= 1024)    return (bytes / 1024).toFixed(1) + ' KB'
  return bytes + ' B'
}

function fmt_ts(ts_slug) {
  if (!ts_slug || ts_slug.length < 15) return ts_slug || ''
  return `${ts_slug.slice(0,4)}-${ts_slug.slice(4,6)}-${ts_slug.slice(6,8)}  `
       + `${ts_slug.slice(9,11)}:${ts_slug.slice(11,13)}:${ts_slug.slice(13,15)}`
}

export default function LegacyImportPanel() {
  const [status,     setStatus]     = useState('idle')   // idle|running|done|error
  const [jobId,      setJobId]      = useState(null)
  const [progress,   setProgress]   = useState({ pct: 0, message: '', current: 0, total: 0 })
  const [result,     setResult]     = useState(null)
  const [errorMsg,   setErrorMsg]   = useState('')
  const [history,    setHistory]    = useState([])
  const [sourcePath,   setSourcePath]   = useState('')
  const [outputPath,   setOutputPath]   = useState('')
  const [browsingSource, setBrowsingSource] = useState(false)
  const [browsingOutput, setBrowsingOutput] = useState(false)
  const pollRef = useRef(null)

  const fetchHistory = async () => {
    try {
      const r = await fetch('/api/legacy/reports')
      const d = await r.json()
      setHistory(d.reports || [])
    } catch { /* ignore */ }
  }

  useEffect(() => {
    fetchHistory()
    return () => clearInterval(pollRef.current)
  }, [])

  // ── Polling ────────────────────────────────────────────────────────────────
  const startPolling = (id) => {
    clearInterval(pollRef.current)
    pollRef.current = setInterval(async () => {
      try {
        const r = await fetch(`/api/legacy/jobs/${id}`)
        const d = await r.json()
        setProgress({ pct: d.pct || 0, message: d.message || '', current: d.current, total: d.total, books_out: d.books_out || 0 })

        if (d.status === 'done') {
          clearInterval(pollRef.current)
          setStatus('done')
          setResult(d.result)
          fetchHistory()
        } else if (d.status === 'error') {
          clearInterval(pollRef.current)
          setStatus('error')
          setErrorMsg(d.message || 'เกิดข้อผิดพลาด')
        }
      } catch {
        clearInterval(pollRef.current)
        setStatus('error')
        setErrorMsg('ไม่สามารถติดต่อ backend ได้')
      }
    }, 1500)
  }

  // ── Start convert ──────────────────────────────────────────────────────────
  const handleConvert = async () => {
    setStatus('running')
    setResult(null)
    setErrorMsg('')
    setProgress({ pct: 0, message: 'กำลังเริ่มต้น...', current: 0, total: 0 })

    try {
      const r = await fetch('/api/legacy/convert', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ source_path: sourcePath.trim(), output_path: outputPath.trim() }),
      })
      const d = await r.json()
      if (!r.ok) {
        setErrorMsg(d.detail || 'เกิดข้อผิดพลาด')
        setStatus('error')
        return
      }
      setJobId(d.job_id)
      startPolling(d.job_id)
    } catch (e) {
      setErrorMsg(String(e))
      setStatus('error')
    }
  }

  const browseFolder = async (type) => {
    const setter  = type === 'source' ? setSourcePath  : setOutputPath
    const current = type === 'source' ? sourcePath     : outputPath
    const setBusy = type === 'source' ? setBrowsingSource : setBrowsingOutput
    setBusy(true)
    try {
      const r = await fetch(`/api/browse-folder?initial=${encodeURIComponent(current)}`)
      const d = await r.json()
      if (!d.cancelled && d.path) setter(d.path)
    } catch { /* ignore */ }
    finally { setBusy(false) }
  }

  const handleDelete = async (filename) => {
    if (!window.confirm(`ลบ ${filename}?`)) return
    await fetch(`/api/legacy/reports/${filename}`, { method: 'DELETE' })
    fetchHistory()
  }

  const isRunning = status === 'running'

  return (
    <div className="space-y-5">

      {/* ── คำอธิบาย ── */}
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-900">
        <p className="font-semibold mb-1">📂 นำเข้าข้อมูลย้อนหลัง (Legacy)</p>
        <p>อ่านไฟล์ report เก่า (XLS/XLSX) จาก <code className="bg-amber-100 px-1 rounded">DataSale/</code> แล้วแปลงเป็น Excel format v0.45 แยกตาม:</p>
        <p className="mt-1 font-mono text-xs bg-amber-100 rounded p-2">
          ปี / Agent / Publisher / ชื่อหนังสือ_period.xlsx
        </p>
      </div>

      {/* ── Input + Button ── */}
      <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-3">
        {/* Source folder */}
        <p className="text-sm font-medium text-gray-700">Source Folder</p>
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="ปล่อยว่างเพื่อใช้ DataSale/ ใน project"
            value={sourcePath}
            onChange={e => setSourcePath(e.target.value)}
            disabled={isRunning}
            className="flex-1 border border-gray-300 rounded px-3 py-2 text-sm font-mono
                       focus:outline-none focus:ring-2 focus:ring-brand disabled:bg-gray-50"
          />
          <button
            onClick={() => browseFolder('source')}
            disabled={isRunning || browsingSource}
            className="px-3 py-2 rounded border border-gray-300 bg-white hover:bg-gray-50
                       text-sm text-gray-600 disabled:opacity-40 whitespace-nowrap transition-colors"
          >
            {browsingSource ? '...' : '📁 Browse'}
          </button>
        </div>

        {/* Output folder */}
        <p className="text-sm font-medium text-gray-700 pt-1">
          บันทึก ZIP ไว้ที่ <span className="text-gray-400 font-normal">(optional — ปล่อยว่าง = ดาวน์โหลดจากหน้านี้)</span>
        </p>
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="เลือก folder ที่ต้องการบันทึก ZIP"
            value={outputPath}
            onChange={e => setOutputPath(e.target.value)}
            disabled={isRunning}
            className="flex-1 border border-gray-300 rounded px-3 py-2 text-sm font-mono
                       focus:outline-none focus:ring-2 focus:ring-brand disabled:bg-gray-50"
          />
          <button
            onClick={() => browseFolder('output')}
            disabled={isRunning || browsingOutput}
            className="px-3 py-2 rounded border border-gray-300 bg-white hover:bg-gray-50
                       text-sm text-gray-600 disabled:opacity-40 whitespace-nowrap transition-colors"
          >
            {browsingOutput ? '...' : '📁 Browse'}
          </button>
        </div>

        {outputPath.trim() && (
          <p className="text-xs text-blue-700 bg-blue-50 rounded px-2 py-1">
            💾 จะบันทึก ZIP ไว้ที่: <span className="font-mono">{outputPath.trim()}</span>
          </p>
        )}
        <button
          onClick={handleConvert}
          disabled={isRunning}
          className="w-full py-2.5 rounded-lg text-sm font-semibold text-white
                     bg-amber-600 hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed
                     transition-colors"
        >
          {isRunning ? '⏳ กำลังแปลงไฟล์...' : '🔄 เริ่มแปลงไฟล์ย้อนหลัง'}
        </button>
      </div>

      {/* ── Progress ── */}
      {isRunning && (
        <div className="bg-white border border-amber-200 rounded-lg p-4 space-y-3">
          {/* bar */}
          <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
            <span className="font-medium text-amber-700">กำลังประมวลผล...</span>
            <span>{progress.pct}%</span>
          </div>
          <div className="w-full bg-gray-100 rounded-full h-3 overflow-hidden">
            <div
              className="h-3 rounded-full bg-amber-500 transition-all duration-500"
              style={{ width: `${Math.max(progress.pct, 2)}%` }}
            />
          </div>
            {/* counter */}
          {progress.total > 0 && (
            <div className="flex justify-between text-xs text-gray-500">
              <span>📂 อ่านไฟล์ต้นฉบับ: <b>{progress.current} / {progress.total}</b></span>
              <span>📄 ได้ไฟล์ใหม่: <b>{progress.books_out || 0}</b></span>
            </div>
          )}
          {/* filename */}
          <p className="text-xs text-gray-600 font-mono truncate bg-gray-50 rounded px-2 py-1">
            {progress.message || '...'}
          </p>
        </div>
      )}

      {/* ── Error ── */}
      {status === 'error' && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700">
          ❌ {errorMsg}
        </div>
      )}

      {/* ── ผลลัพธ์ ── */}
      {status === 'done' && result && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 space-y-3">
          <p className="text-sm font-semibold text-green-800">✅ แปลงสำเร็จ!</p>
          <div className="grid grid-cols-3 gap-3 text-center">
            <Stat label="ไฟล์ต้นฉบับ" value={result.total_files} />
            <Stat label="หนังสือที่แปลง" value={result.total_books} />
            <Stat label="ขนาด" value={fmt_size(result.size_bytes)} />
          </div>

          {result.output_dir && result.output_dir !== '' ? (
            <div className="bg-green-100 rounded-lg px-3 py-2 text-sm text-green-800 space-y-1">
              <p>💾 บันทึก ZIP ไว้ที่:</p>
              <p className="font-mono text-xs break-all">{result.output_path}</p>
            </div>
          ) : null}
          <a
            href={`/api/legacy/reports/${result.filename}`}
            download
            className="flex items-center justify-center gap-2 w-full py-2 rounded-lg
                       bg-green-600 hover:bg-green-700 text-white text-sm font-medium transition-colors"
          >
            ⬇️ ดาวน์โหลด ZIP
          </a>

          {result.errors?.length > 0 && (
            <details className="text-xs text-amber-700">
              <summary className="cursor-pointer font-medium">
                ⚠️ มีข้อผิดพลาด {result.errors.length} ไฟล์ (คลิกดูรายละเอียด)
              </summary>
              <ul className="mt-2 space-y-0.5 max-h-40 overflow-y-auto">
                {result.errors.map(([f, e], i) => (
                  <li key={i} className="font-mono">• {f}: {e}</li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}

      {/* ── ประวัติ ── */}
      {history.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-2">
          <p className="text-sm font-semibold text-gray-700">ประวัติการแปลง</p>
          <div className="space-y-2">
            {history.map(item => (
              <div key={item.filename}
                   className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-100 text-sm">
                <div className="space-y-0.5 min-w-0 flex-1 mr-3">
                  <p className="text-gray-500 text-xs">{fmt_ts(item.ts_slug)}</p>
                  <p className="text-gray-800 font-medium">
                    📦 {item.total_books} หนังสือ จาก {item.total_files} ไฟล์
                    {item.errors?.length > 0 && (
                      <span className="ml-2 text-amber-600 text-xs">({item.errors.length} errors)</span>
                    )}
                  </p>
                  <p className="text-gray-400 text-xs">{fmt_size(item.size_bytes)}</p>
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  <a
                    href={`/api/legacy/reports/${item.filename}`}
                    download
                    className="px-3 py-1.5 rounded bg-green-600 hover:bg-green-700 text-white text-xs font-medium"
                  >
                    ⬇️
                  </a>
                  <button
                    onClick={() => handleDelete(item.filename)}
                    className="px-3 py-1.5 rounded bg-red-100 hover:bg-red-200 text-red-700 text-xs font-medium"
                  >
                    🗑️
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function Stat({ label, value }) {
  return (
    <div className="bg-white rounded-lg p-3 border border-green-200">
      <p className="text-lg font-bold text-green-700">{value}</p>
      <p className="text-xs text-gray-500">{label}</p>
    </div>
  )
}
