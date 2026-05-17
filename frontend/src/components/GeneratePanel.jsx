import { useState } from 'react'
import { generateHTML } from '../utils/dashboardHTML'

const PERIODS = [
  { id: 'bi1',    label: 'BI-Annual 2025.1', sub: 'ม.ค. – มิ.ย.' },
  { id: 'bi2',    label: 'BI-Annual 2025.2', sub: 'ก.ค. – ธ.ค.' },
  { id: 'annual', label: 'Annual 2025',       sub: 'ม.ค. – ธ.ค.' },
]

function Spinner() {
  return (
    <svg className="animate-spin h-3.5 w-3.5 shrink-0" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 00-8 8h4z"/>
    </svg>
  )
}

export default function GeneratePanel({ activeDataset, onReportGenerated, onDashboardGenerated }) {
  const [selected,   setSelected]   = useState(new Set(['annual']))
  const [genReport,  setGenReport]  = useState(false)
  const [genDash,    setGenDash]    = useState(false)
  const [reportErr,  setReportErr]  = useState('')
  const [dashErr,    setDashErr]    = useState('')
  const [status,     setStatus]     = useState('')

  const toggle = id => setSelected(prev => {
    const next = new Set(prev)
    next.has(id) ? next.delete(id) : next.add(id)
    return next
  })

  const handleGenerateReport = async () => {
    if (!activeDataset || selected.size === 0 || genReport) return
    setGenReport(true)
    setReportErr('')
    const periods = PERIODS.filter(p => selected.has(p.id))
    for (let i = 0; i < periods.length; i++) {
      const p = periods[i]
      setStatus(`${p.label} (${i + 1}/${periods.length})`)
      try {
        const r = await fetch('/api/generate-all', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ dataset_id: activeDataset.id, period: p.id }),
        })
        const d = await r.json()
        if (!r.ok) {
          const msg = typeof d.detail === 'string' ? d.detail : JSON.stringify(d.detail)
          throw new Error(msg || 'Generate ล้มเหลว')
        }
        onReportGenerated(d)
      } catch (e) {
        setReportErr(e.message)
        break
      }
    }
    setStatus('')
    setGenReport(false)
  }

  const handleGenerateDashboard = async () => {
    if (!activeDataset || genDash) return
    setGenDash(true)
    setDashErr('')
    try {
      const r = await fetch(`/api/dashboard?dataset_id=${activeDataset.id}`)
      if (!r.ok) {
        const d = await r.json()
        const msg = typeof d.detail === 'string' ? d.detail : JSON.stringify(d.detail)
        throw new Error(msg || 'Dashboard ล้มเหลว')
      }
      const data = await r.json()

      const now = new Date()
      const pad = n => String(n).padStart(2, '0')
      const tsSlug = `${now.getFullYear()}${pad(now.getMonth()+1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
      const tsDisplay = now.toLocaleString('th-TH', {
        year: 'numeric', month: 'long', day: 'numeric',
        hour: '2-digit', minute: '2-digit',
      })

      const html = generateHTML(data, tsDisplay)
      const saveRes = await fetch('/api/snapshots/save', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          html,
          ts_slug:    tsSlug,
          dataset_id: activeDataset.id,
          meta: {
            generated_at_display: tsDisplay,
            ts_slug:              tsSlug,
            total_isbns:          data.summary.total_isbns,
            total_agencies:       data.summary.total_agencies,
            total_royalty_thb:    data.summary.total_royalty_thb,
          },
        }),
      })
      const snap = await saveRes.json()
      onDashboardGenerated({ filename: snap.filename, tsDisplay })
    } catch (e) {
      setDashErr(e.message)
    } finally {
      setGenDash(false)
    }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 space-y-4">
      <span className="text-xs font-bold text-gray-400 uppercase tracking-wider block">สร้าง</span>

      {!activeDataset ? (
        <div className="flex items-center justify-center py-12 text-sm text-gray-400 text-center">
          ← เลือกหรืออัปโหลดชุดข้อมูลก่อน
        </div>
      ) : (
        <>
          <p className="text-xs text-gray-500 -mt-2">
            ชุดข้อมูล: <span className="font-semibold text-gray-700">{activeDataset.label}</span>
          </p>

          {/* Report section */}
          <div className="rounded-lg border border-gray-100 p-3 space-y-2.5">
            <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide">รายงาน (ZIP)</p>
            {PERIODS.map(p => (
              <label key={p.id} className="flex items-center gap-2.5 cursor-pointer group select-none">
                <input
                  type="checkbox"
                  checked={selected.has(p.id)}
                  onChange={() => toggle(p.id)}
                  className="accent-brand w-3.5 h-3.5 shrink-0"
                />
                <span className="text-sm text-gray-700 group-hover:text-brand transition-colors">
                  {p.label}
                  <span className="text-xs text-gray-400 ml-1.5">({p.sub})</span>
                </span>
              </label>
            ))}
            {reportErr && <p className="text-xs text-red-500">{reportErr}</p>}
            {status && genReport && (
              <p className="text-xs text-brand">กำลังสร้าง {status}</p>
            )}
            <button
              onClick={handleGenerateReport}
              disabled={genReport || selected.size === 0}
              className={`w-full py-2 rounded-lg text-sm font-semibold transition-colors flex items-center justify-center gap-2 ${
                !genReport && selected.size > 0
                  ? 'bg-brand text-white hover:bg-brand-light'
                  : 'bg-gray-100 text-gray-400 cursor-not-allowed'
              }`}
            >
              {genReport ? <><Spinner /> กำลังสร้าง...</> : (
                `▶ สร้าง Report${selected.size > 1 ? ` (${selected.size} รอบ)` : ''}`
              )}
            </button>
          </div>

          {/* Dashboard section */}
          <div className="rounded-lg border border-gray-100 p-3 space-y-2.5">
            <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide">Dashboard (HTML)</p>
            <p className="text-xs text-gray-400 leading-relaxed">
              ภาพรวม Portfolio · Advance · Top books · Agent Performance
            </p>
            {dashErr && <p className="text-xs text-red-500">{dashErr}</p>}
            <button
              onClick={handleGenerateDashboard}
              disabled={genDash}
              className={`w-full py-2 rounded-lg text-sm font-semibold transition-colors flex items-center justify-center gap-2 ${
                !genDash
                  ? 'bg-brand/8 text-brand border border-brand/20 hover:bg-brand hover:text-white hover:border-brand'
                  : 'bg-gray-100 text-gray-400 cursor-not-allowed'
              }`}
            >
              {genDash ? <><Spinner /> กำลังสร้าง...</> : '▶ สร้าง Dashboard'}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
