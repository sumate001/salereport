import { useState, useEffect, useRef } from 'react'
import { generateHTML } from '../utils/dashboardHTML'

// ปีมาจาก dataset ที่เลือก (ตั้งตอนอัปโหลด) — ไม่ผูกกับปีใดปีหนึ่งในโค้ด
const periodsFor = year => [
  { id: 'bi1',    label: `BI-Annual ${year}.1`, sub: 'ม.ค. – มิ.ย.' },
  { id: 'bi2',    label: `BI-Annual ${year}.2`, sub: 'ก.ค. – ธ.ค.' },
  { id: 'annual', label: `Annual ${year}`,      sub: 'ม.ค. – ธ.ค.' },
]

function Spinner() {
  return (
    <svg className="animate-spin h-3.5 w-3.5 shrink-0" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 00-8 8h4z"/>
    </svg>
  )
}

export default function GeneratePanel({ activeDataset, onGenerationStart, onReportGenerated, onReportError, onDashboardGenerated }) {
  const PERIODS = periodsFor(activeDataset?.year ?? new Date().getFullYear())
  const [selected,      setSelected]      = useState(new Set(['annual']))
  const [genReport,     setGenReport]     = useState(false)
  const [genDash,       setGenDash]       = useState(false)
  const [dashErr,       setDashErr]       = useState('')
  const [status,        setStatus]        = useState('')

  // agent search / filter
  const [searchQ,       setSearchQ]       = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [selectedAgent, setSelectedAgent] = useState(null)
  const [searching,     setSearching]     = useState(false)
  const [showDropdown,  setShowDropdown]  = useState(false)
  const searchRef = useRef(null)

  const toggle = id => setSelected(prev => {
    const next = new Set(prev)
    next.has(id) ? next.delete(id) : next.add(id)
    return next
  })

  const handleSearch = async () => {
    if (!activeDataset || !searchQ.trim() || searching) return
    setSearching(true)
    setShowDropdown(false)
    try {
      const r = await fetch(`/api/datasets/${activeDataset.id}/agencies?q=${encodeURIComponent(searchQ)}`)
      const d = await r.json()
      const filtered = (d.agencies || []).filter(a => a !== selectedAgent)
      setSearchResults(filtered)
      setShowDropdown(true)
    } catch {}
    setSearching(false)
  }

  // close dropdown on outside click
  useEffect(() => {
    const handler = e => {
      if (searchRef.current && !searchRef.current.contains(e.target))
        setShowDropdown(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const selectAgent = agent => {
    setSelectedAgent(agent)
    setSearchQ('')
    setSearchResults([])
    setShowDropdown(false)
  }

  const handleGenerateReport = async () => {
    if (!activeDataset || selected.size === 0 || genReport) return
    setGenReport(true)
    onGenerationStart()
    const periods = PERIODS.filter(p => selected.has(p.id))

    const jobs = periods.map(p => ({
      period:        p,
      agency_filter: selectedAgent || '',
      filter_label:  selectedAgent || '',
    }))

    for (let i = 0; i < jobs.length; i++) {
      const { period: p, agency_filter, filter_label } = jobs[i]
      setStatus(`${p.label}${filter_label ? ` — ${filter_label}` : ''} (${i + 1}/${jobs.length})`)
      try {
        const r = await fetch('/api/generate-all', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({
            dataset_id:    activeDataset.id,
            period:        p.id,
            isbn_filter:   [],
            filter_label,
            agency_filter,
          }),
        })
        const d = await r.json()
        if (!r.ok) {
          const msg = typeof d.detail === 'string' ? d.detail : JSON.stringify(d.detail)
          throw new Error(msg || 'Generate ล้มเหลว')
        }
        onReportGenerated(d)
      } catch (e) {
        onReportError({
          label:   filter_label ? `${p.label} — ${filter_label}` : p.label,
          message: e.message,
        })
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

            {/* Period checkboxes */}
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

            {/* Agent filter */}
            <div className="pt-1 border-t border-gray-100 space-y-2">
              <p className="text-[11px] text-gray-400">
                กรองตาม Agent
                <span className="ml-1 text-gray-300">(ไม่เลือก = ออกทุก Agent)</span>
              </p>

              {/* Search input + dropdown */}
              {!selectedAgent && (
                <div className="relative" ref={searchRef}>
                  <div className="flex gap-1.5">
                    <div className="flex-1 flex items-center gap-1.5 border border-gray-200 rounded-md px-2 py-1.5 bg-white focus-within:border-brand/60 focus-within:ring-1 focus-within:ring-brand/20 transition">
                      <input
                        type="text"
                        value={searchQ}
                        onChange={e => { setSearchQ(e.target.value); setShowDropdown(false) }}
                        onKeyDown={e => e.key === 'Enter' && handleSearch()}
                        placeholder="พิมพ์ชื่อ Agent แล้วกด Search"
                        className="flex-1 text-xs outline-none bg-transparent text-gray-700 placeholder-gray-300 min-w-0"
                      />
                      {searchQ && (
                        <button onClick={() => { setSearchQ(''); setSearchResults([]); setShowDropdown(false) }} className="text-gray-300 hover:text-gray-500">
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path d="M18 6 6 18M6 6l12 12"/></svg>
                        </button>
                      )}
                    </div>
                    <button
                      onClick={handleSearch}
                      disabled={!searchQ.trim() || searching}
                      className="px-2.5 rounded-md text-xs font-medium border transition-colors shrink-0 flex items-center gap-1
                        disabled:bg-gray-50 disabled:text-gray-300 disabled:border-gray-100
                        enabled:bg-white enabled:text-brand enabled:border-brand/30 enabled:hover:bg-brand enabled:hover:text-white enabled:hover:border-brand"
                    >
                      {searching ? <Spinner /> : (
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
                      )}
                      <span>ค้นหา</span>
                    </button>
                  </div>

                  {showDropdown && (
                    <div className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden max-h-52 overflow-y-auto">
                      {searchResults.length === 0 ? (
                        <p className="px-3 py-2 text-xs text-gray-400">ไม่พบ Agent</p>
                      ) : searchResults.map(agent => (
                        <button
                          key={agent}
                          onMouseDown={e => { e.preventDefault(); selectAgent(agent) }}
                          className="w-full text-left px-3 py-2 hover:bg-brand/5 transition-colors border-b border-gray-50 last:border-0"
                        >
                          <p className="text-xs font-medium text-gray-700 truncate">{agent}</p>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Selected agent chip */}
              {selectedAgent && (
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-brand/8 text-brand text-xs rounded-full border border-brand/20 min-w-0">
                    <svg className="w-3 h-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                    <span className="truncate font-medium">{selectedAgent}</span>
                    <button onClick={() => setSelectedAgent(null)} className="shrink-0 hover:text-red-500 transition-colors ml-0.5">
                      <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path d="M18 6 6 18M6 6l12 12"/></svg>
                    </button>
                  </span>
                </div>
              )}
            </div>

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
              {genReport ? <><Spinner /> กำลังสร้าง...</> : (() => {
                const total = selected.size
                return total > 1
                  ? `▶ สร้าง Report (${total} ไฟล์)`
                  : '▶ สร้าง Report'
              })()}
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
