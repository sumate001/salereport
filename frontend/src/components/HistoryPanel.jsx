import { useEffect, useState } from 'react'

// ชุดข้อมูลมี 2 แบบ: โหมด item (6 ไฟล์) กับโหมดไฟล์ดิบ (9 ไฟล์) จึงไล่จาก
// original_filenames ที่บันทึกไว้จริง แทนการ hardcode รายการเดียว
const SLOT_LABELS = {
  item:     'ยอดขาย-ลิขสิทธิ์',
  databook: 'item (data book)',
  acorp:    'ยอดขาย-ฝากขาย Acorp',
  abook:    'ยอดขาย-ขายขาด Abook',
  stock:    'Stock คงเหลือ (WH03)',
  intra_1:  'Intra Annual — Western',
  intra_2:  'Intra Annual — Asia',
  intra_3:  'Intra BI-Annual — Western',
  intra_4:  'Intra BI-Annual — Asia',
  exchange: 'อัตราแลกเปลี่ยน',
}
const SLOT_ORDER = ['item', 'databook', 'acorp', 'abook', 'stock',
                    'intra_1', 'intra_2', 'intra_3', 'intra_4', 'exchange']

function slotsOf(ds) {
  const names = ds.original_filenames || {}
  const present = SLOT_ORDER.filter(s => names[s])
  const known = present.length ? present : SLOT_ORDER.filter(s => s !== 'databook'
    && s !== 'acorp' && s !== 'abook' && s !== 'stock')
  return known.map(slot => ({ slot, label: SLOT_LABELS[slot] || slot }))
}

function fmtTs(slug) {
  if (!slug) return ''
  const [d, t] = slug.split('_')
  if (!d || !t) return slug
  const dt = new Date(+d.slice(0, 4), +d.slice(4, 6) - 1, +d.slice(6, 8), +t.slice(0, 2), +t.slice(2, 4))
  return dt.toLocaleString('th-TH', {
    year: 'numeric', month: 'long', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function fmtSize(b) {
  if (!b) return ''
  return b < 1e6 ? `${(b / 1024).toFixed(0)} KB` : `${(b / 1024 / 1024).toFixed(1)} MB`
}

function snapSlug(filename) {
  return (filename || '').replace('dashboard_', '').replace('.html', '')
}

// ── Output list (right column) ─────────────────────────────────────────────────

function OutputList({ reports, snapshots, onDeleteReport, onDeleteSnap }) {
  if (reports.length === 0 && snapshots.length === 0) {
    return <p className="text-xs text-gray-300">ยังไม่มีผลลัพธ์</p>
  }
  return (
    <div className="space-y-2">
      {reports.map(r => (
        <div key={r.filename} className="flex items-start gap-2">
          <span className="text-base mt-0.5">📦</span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <a
                href={`/api/reports/${encodeURIComponent(r.filename)}`}
                download={r.filename}
                className="text-sm font-semibold text-gray-700 hover:text-brand transition-colors"
              >
                {r.period_label}
              </a>
              {r.filter_label && (
                <span className="text-[10px] px-1.5 py-0.5 bg-brand/8 text-brand border border-brand/20 rounded-full truncate max-w-[160px]">
                  {r.filter_label}
                </span>
              )}
            </div>
            <p className="text-[11px] text-gray-400">
              {fmtTs(r.ts_slug)}{r.size_bytes ? ` · ${fmtSize(r.size_bytes)}` : ''}
            </p>
          </div>
          <div className="shrink-0 flex items-center gap-1.5">
            <a
              href={`/api/reports/${encodeURIComponent(r.filename)}`}
              download={r.filename}
              className="text-[11px] px-2 py-1 bg-green-50 text-green-700 border border-green-200 rounded-lg hover:bg-green-100 transition-colors"
            >
              ⬇ ZIP
            </a>
            <button
              onClick={e => onDeleteReport(r.filename, e)}
              className="p-1 rounded-md text-red-300 hover:text-red-600 hover:bg-red-50 border border-red-100 hover:border-red-200 transition-colors"
              title="ลบรายงานนี้"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
              </svg>
            </button>
          </div>
        </div>
      ))}
      {snapshots.map(s => (
        <div key={s.filename} className="flex items-start gap-2">
          <span className="text-base mt-0.5">📊</span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-brand">Dashboard</p>
            <p className="text-[11px] text-gray-400">
              {s.generated_at_display || fmtTs(snapSlug(s.filename))}
            </p>
          </div>
          <div className="shrink-0 flex items-center gap-1.5">
            <a
              href={`/api/snapshots/${s.filename}`}
              target="_blank"
              rel="noreferrer"
              className="text-[11px] px-2 py-1 bg-brand/5 text-brand border border-brand/20 rounded-lg hover:bg-brand/10 transition-colors"
            >
              ↗ เปิด
            </a>
            <button
              onClick={e => onDeleteSnap(s.filename, e)}
              className="p-1 rounded-md text-red-300 hover:text-red-600 hover:bg-red-50 border border-red-100 hover:border-red-200 transition-colors"
              title="ลบ Dashboard นี้"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
              </svg>
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}

// ── History row (one per dataset) ─────────────────────────────────────────────

function HistoryRow({ ds, reports, snapshots, onDeleteDataset, onDeleteReport, onDeleteSnap, onLabelUpdated }) {
  const [editingLabel, setEditingLabel] = useState(false)
  const [editVal,      setEditVal]      = useState(ds.label)

  const saveLabel = async () => {
    await fetch(`/api/datasets/${ds.id}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ label: editVal }),
    })
    setEditingLabel(false)
    onLabelUpdated()
  }

  return (
    <div className="rounded-xl border border-gray-200 overflow-hidden">
      {/* Row header */}
      <div className="bg-gray-50 border-b border-gray-100 px-4 py-2.5 flex items-center gap-3">
        {editingLabel ? (
          <div className="flex items-center gap-1.5 flex-1">
            <input
              autoFocus
              value={editVal}
              onChange={e => setEditVal(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') saveLabel(); if (e.key === 'Escape') setEditingLabel(false) }}
              className="flex-1 text-sm border border-brand rounded px-2 py-0.5 outline-none"
            />
            <button onClick={saveLabel} className="text-xs text-brand font-semibold px-1">✓</button>
            <button onClick={() => setEditingLabel(false)} className="text-xs text-gray-400 px-1">✕</button>
          </div>
        ) : (
          <>
            <span className="text-sm font-semibold text-gray-700 flex-1">{ds.label}</span>
            <span className="text-xs text-gray-400">{fmtTs(ds.ts_slug)}</span>
            <button onClick={() => { setEditVal(ds.label); setEditingLabel(true) }}
              className="text-gray-300 hover:text-brand text-xs px-1 transition-colors" title="แก้ชื่อ">✎</button>
            <button onClick={() => onDeleteDataset(ds.id)}
              className="p-1 rounded text-red-300 hover:text-red-600 hover:bg-red-50 transition-colors" title="ลบชุดข้อมูล">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
              </svg>
            </button>
          </>
        )}
      </div>

      {/* 2-column body */}
      <div className="grid grid-cols-2 divide-x divide-gray-100">
        {/* Left: source files */}
        <div className="p-4">
          <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide mb-3">
            ไฟล์ข้อมูล
            {ds.source === 'raw' && (
              <span className="ml-1.5 font-medium normal-case tracking-normal text-brand">
                · ไฟล์ดิบ {ds.year || ''}
              </span>
            )}
          </p>
          <div className="space-y-1.5">
            {slotsOf(ds).map(({ slot, label }) => {
              const origName = ds.original_filenames?.[slot]
              return (
                <a
                  key={slot}
                  href={`/api/datasets/${ds.id}/files/${slot}`}
                  download={origName || `${slot}.xlsx`}
                  className="flex items-center gap-2 text-xs text-gray-600 hover:text-brand transition-colors group"
                >
                  <span className="text-gray-300 group-hover:text-brand transition-colors">⬇</span>
                  <span className="font-medium">{label}</span>
                  {origName && (
                    <span className="text-gray-300 truncate max-w-[130px]">({origName})</span>
                  )}
                </a>
              )
            })}
          </div>
          {ds.source === 'raw' && (
            <a
              href={`/api/datasets/${ds.id}/files/item`}
              download={`item_${ds.ts_slug || ds.id}.xlsx`}
              className="mt-2.5 pt-2.5 border-t border-gray-50 flex items-center gap-2 text-xs text-gray-500 hover:text-brand transition-colors group"
              title="ไฟล์ item master ที่ระบบประกอบจากไฟล์ดิบ — ใช้ตรวจตัวเลขก่อนออกรายงาน"
            >
              <span className="text-gray-300 group-hover:text-brand transition-colors">⬇</span>
              <span className="font-medium">item ที่ระบบประกอบ</span>
            </a>
          )}
        </div>

        {/* Right: outputs */}
        <div className="p-4">
          <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide mb-3">รายงาน & Dashboard</p>
          <OutputList
            reports={reports}
            snapshots={snapshots}
            onDeleteReport={onDeleteReport}
            onDeleteSnap={onDeleteSnap}
          />
        </div>
      </div>
    </div>
  )
}

// ── Main HistoryPanel ──────────────────────────────────────────────────────────

export default function HistoryPanel({ datasets, onDatasetDeleted, onLabelUpdated }) {
  const [reports,   setReports]   = useState([])
  const [snapshots, setSnapshots] = useState([])
  const [loading,   setLoading]   = useState(true)

  useEffect(() => {
    setLoading(true)
    Promise.all([
      fetch('/api/reports').then(r => r.json()),
      fetch('/api/snapshots').then(r => r.json()),
    ]).then(([rpts, snaps]) => {
      setReports(rpts.reports || [])
      setSnapshots(snaps.snapshots || [])
    }).finally(() => setLoading(false))
  }, []) // Triggered by key remount from parent

  const deleteReport = async (filename, e) => {
    e.stopPropagation()
    if (!confirm('ลบรายงานนี้?')) return
    await fetch(`/api/reports/${filename}`, { method: 'DELETE' })
    setReports(prev => prev.filter(r => r.filename !== filename))
  }

  const deleteSnap = async (filename, e) => {
    e.stopPropagation()
    if (!confirm('ลบ Dashboard นี้?')) return
    await fetch(`/api/snapshots/${filename}`, { method: 'DELETE' })
    setSnapshots(prev => prev.filter(s => s.filename !== filename))
  }

  const deleteDataset = async (id) => {
    if (!confirm('ลบชุดข้อมูลนี้? (รายงานและ Dashboard ยังคงอยู่)')) return
    await fetch(`/api/datasets/${id}`, { method: 'DELETE' })
    onDatasetDeleted(id)
  }

  // Group by dataset, sort by latest activity
  const dsIds = new Set(datasets.map(d => d.id))

  const grouped = datasets
    .map(ds => ({
      ds,
      reports:   reports.filter(r => r.dataset_id === ds.id),
      snapshots: snapshots.filter(s => s.dataset_id === ds.id),
    }))
    .sort((a, b) => {
      const latest = g => Math.max(
        +(g.ds.ts_slug || '0'),
        ...g.reports.map(r => +(r.ts_slug || '0')),
        ...g.snapshots.map(s => +(snapSlug(s.filename) || '0')),
      )
      return latest(b) - latest(a)
    })

  // Orphaned (no matching dataset)
  const orphanReports = reports.filter(r => !r.dataset_id || !dsIds.has(r.dataset_id))
  const orphanSnaps   = snapshots.filter(s => !s.dataset_id || !dsIds.has(s.dataset_id))
  const hasOrphans    = orphanReports.length > 0 || orphanSnaps.length > 0

  if (loading) return (
    <div className="py-6 text-center text-sm text-gray-400">กำลังโหลดประวัติ...</div>
  )

  if (grouped.length === 0 && !hasOrphans) return null

  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider whitespace-nowrap">ประวัติ</h2>
        <div className="flex-1 h-px bg-gray-200" />
      </div>

      <div className="space-y-3">
        {grouped.map(({ ds, reports: dsRpts, snapshots: dsSnaps }) => (
          <HistoryRow
            key={ds.id}
            ds={ds}
            reports={dsRpts}
            snapshots={dsSnaps}
            onDeleteDataset={deleteDataset}
            onDeleteReport={deleteReport}
            onDeleteSnap={deleteSnap}
            onLabelUpdated={onLabelUpdated}
          />
        ))}

        {hasOrphans && (
          <div className="rounded-xl border border-dashed border-gray-200 overflow-hidden">
            <div className="bg-gray-50 border-b border-gray-100 px-4 py-2">
              <span className="text-xs text-gray-400 font-medium">ผลลัพธ์ที่ไม่ระบุชุดข้อมูล</span>
            </div>
            <div className="p-4">
              <OutputList
                reports={orphanReports}
                snapshots={orphanSnaps}
                onDeleteReport={deleteReport}
                onDeleteSnap={deleteSnap}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
