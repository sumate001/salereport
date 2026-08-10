import { useState } from 'react'

const INTRA_CONFIGS = [
  { key: 'intra_file_1', slot: 'intra_1', label: 'Intra Annual — Western' },
  { key: 'intra_file_2', slot: 'intra_2', label: 'Intra Annual — Asia' },
  { key: 'intra_file_3', slot: 'intra_3', label: 'Intra BI-Annual — Western' },
  { key: 'intra_file_4', slot: 'intra_4', label: 'Intra BI-Annual — Asia' },
  { key: 'exchange_file', slot: 'exchange', label: 'อัตราแลกเปลี่ยน' },
]

// โหมด item: ฝ่ายลิขสิทธิ์ส่งไฟล์ ยอดขาย-ลิขสิทธิ์ (item master) มาให้แล้ว — ชุดข้อมูลถึงปี 2025
// โหมด raw : ไม่มี item master ส่งมา ระบบประกอบเองจากไฟล์ดิบ — ชุดข้อมูลตั้งแต่ปี 2026.1
const UPLOAD_MODES = {
  item: {
    label: 'มีไฟล์ item',
    hint:  'ชุดที่ฝ่ายลิขสิทธิ์ส่งไฟล์ ยอดขาย-ลิขสิทธิ์ มาให้ (ถึงปี 2025)',
    endpoint: '/api/datasets',
    configs: [
      { key: 'item_file', slot: 'item', label: 'ยอดขาย-ลิขสิทธิ์' },
      ...INTRA_CONFIGS,
    ],
  },
  raw: {
    label: 'ไฟล์ดิบ',
    hint:  'ไม่มีไฟล์ item — ระบบประกอบให้เอง (ตั้งแต่ปี 2026.1)',
    endpoint: '/api/datasets/raw',
    configs: [
      { key: 'databook_file', slot: 'databook', label: 'item (data book)' },
      { key: 'acorp_file',    slot: 'acorp',    label: 'ยอดขาย-ฝากขาย Acorp' },
      { key: 'abook_file',    slot: 'abook',    label: 'ยอดขาย-ขายขาด Abook' },
      { key: 'stock_file',    slot: 'stock',    label: 'Stock คงเหลือ (WH03)' },
      ...INTRA_CONFIGS,
    ],
  },
}

const BUILD_PERIODS = [
  { id: 'bi1',    label: '.1  (ม.ค. – มิ.ย.)' },
  { id: 'bi2',    label: '.2  (ก.ค. – ธ.ค.)' },
  { id: 'annual', label: ' ทั้งปี' },
]

function fmtDate(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleString('th-TH', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

export default function UploadPanel({ datasets, activeDataset, onUploaded, onSelect, onDeleted, onLabelUpdated }) {
  const [showForm,  setShowForm]  = useState(false)
  const [label,     setLabel]     = useState('')
  const [files,     setFiles]     = useState({})
  const [uploading, setUploading] = useState(false)
  const [error,     setError]     = useState('')
  const [editingId, setEditingId] = useState(null)
  const [editLabel, setEditLabel] = useState('')
  const [mode,      setMode]      = useState('raw')
  const [year,      setYear]      = useState(new Date().getFullYear())
  const [period,    setPeriod]    = useState('bi1')

  const modeCfg     = UPLOAD_MODES[mode]
  const noDatasets  = datasets.length === 0
  const showingForm = showForm || noDatasets
  const allSelected = modeCfg.configs.every(c => files[c.key])

  const handleUpload = async () => {
    if (!allSelected || uploading) return
    setUploading(true)
    setError('')
    const fd = new FormData()
    fd.append('label', label.trim() || 'Dataset')
    fd.append('year', String(year))
    if (mode === 'raw') fd.append('period', period)
    modeCfg.configs.forEach(c => fd.append(c.key, files[c.key]))
    try {
      const r = await fetch(modeCfg.endpoint, { method: 'POST', body: fd })
      let d = {}
      try { d = await r.json() } catch { /* empty body */ }
      if (!r.ok) throw new Error(d.detail || `Server error ${r.status} — ดู backend log`)
      setFiles({})
      setLabel('')
      setShowForm(false)
      onUploaded(d)
    } catch (e) {
      setError(e.message)
    } finally {
      setUploading(false)
    }
  }

  const handleDelete = async (id, e) => {
    e.stopPropagation()
    if (!confirm('ลบชุดข้อมูลนี้?')) return
    await fetch(`/api/datasets/${id}`, { method: 'DELETE' })
    onDeleted(id)
  }

  const startEdit = (ds, e) => {
    e.stopPropagation()
    setEditingId(ds.id)
    setEditLabel(ds.label)
  }

  const saveEdit = async (id) => {
    await fetch(`/api/datasets/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ label: editLabel }),
    })
    setEditingId(null)
    onLabelUpdated()
  }

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="px-4 pt-4 pb-2 flex items-center justify-between">
        <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">ไฟล์ข้อมูล</span>
        {!noDatasets && (
          <button
            onClick={() => setShowForm(v => !v)}
            className="text-xs text-brand font-medium hover:underline"
          >
            {showingForm ? 'ซ่อน' : '+ อัปโหลดชุดใหม่'}
          </button>
        )}
      </div>

      {/* Dataset list */}
      {datasets.length > 0 && (
        <div className="divide-y divide-gray-50 border-t border-gray-50">
          {datasets.map(ds => {
            const isActive = activeDataset?.id === ds.id
            return (
              <div
                key={ds.id}
                onClick={() => !isActive && onSelect(ds)}
                className={`px-4 py-3 cursor-pointer transition-colors ${
                  isActive ? 'bg-brand/5' : 'hover:bg-gray-50'
                }`}
              >
                <div className="flex items-start gap-2">
                  <div className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${isActive ? 'bg-brand' : 'bg-gray-200'}`} />
                  <div className="flex-1 min-w-0">
                    {editingId === ds.id ? (
                      <div className="flex gap-1" onClick={e => e.stopPropagation()}>
                        <input
                          autoFocus
                          value={editLabel}
                          onChange={e => setEditLabel(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') saveEdit(ds.id); if (e.key === 'Escape') setEditingId(null) }}
                          className="flex-1 text-xs border border-brand rounded px-1.5 py-0.5 outline-none"
                        />
                        <button onClick={() => saveEdit(ds.id)} className="text-xs text-brand font-semibold px-1">✓</button>
                        <button onClick={() => setEditingId(null)} className="text-xs text-gray-400 px-1">✕</button>
                      </div>
                    ) : (
                      <p className={`text-sm font-semibold truncate leading-tight ${isActive ? 'text-brand' : 'text-gray-700'}`}>
                        {ds.label}
                      </p>
                    )}
                    <p className="text-[11px] text-gray-400 mt-0.5">{fmtDate(ds.uploaded_at)}</p>
                  </div>
                  <div className="flex items-center shrink-0" onClick={e => e.stopPropagation()}>
                    <button onClick={e => startEdit(ds, e)} className="text-gray-300 hover:text-brand p-1 text-xs transition-colors">✎</button>
                    <button onClick={e => handleDelete(ds.id, e)} className="text-gray-300 hover:text-red-400 p-1 text-xs transition-colors">✕</button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Upload form */}
      {showingForm && (
        <div className="border-t border-gray-100 px-4 py-4 space-y-2.5">
          {!noDatasets && (
            <p className="text-xs font-semibold text-gray-500 mb-1">อัปโหลดชุดใหม่</p>
          )}
          <div className="flex gap-1.5">
            {Object.entries(UPLOAD_MODES).map(([id, m]) => (
              <button
                key={id}
                onClick={() => { setMode(id); setFiles({}) }}
                title={m.hint}
                className={`flex-1 text-xs py-1.5 rounded-lg font-medium transition-colors ${
                  mode === id
                    ? 'bg-brand text-white'
                    : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
          <p className="text-[11px] text-gray-400 leading-snug">{modeCfg.hint}</p>

          <input
            type="text"
            placeholder="ชื่อชุดข้อมูล เช่น BI-Annual 2026.1"
            value={label}
            onChange={e => setLabel(e.target.value)}
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-brand transition-colors"
          />

          <div className="flex gap-2">
            <label className="flex items-center gap-1.5 text-xs text-gray-500 shrink-0">
              <span className="font-medium">ปีของ report</span>
              <input
                type="number"
                value={year}
                onChange={e => setYear(e.target.value)}
                className="w-20 text-sm border border-gray-200 rounded-lg px-2 py-1.5 outline-none focus:border-brand transition-colors"
              />
            </label>
            {mode === 'raw' && (
              <select
                value={period}
                onChange={e => setPeriod(e.target.value)}
                title="รอบที่ยอดขายในไฟล์ดิบเป็นของรอบนั้น"
                className="flex-1 text-xs border border-gray-200 rounded-lg px-2 py-1.5 outline-none focus:border-brand transition-colors"
              >
                {BUILD_PERIODS.map(p => (
                  <option key={p.id} value={p.id}>{year}{p.label}</option>
                ))}
              </select>
            )}
          </div>

          <div className="space-y-1.5">
            {modeCfg.configs.map(cfg => (
              <label
                key={cfg.key}
                className={`flex items-center gap-2 text-xs border rounded-lg px-2.5 py-2 cursor-pointer transition-colors ${
                  files[cfg.key]
                    ? 'border-green-300 bg-green-50 text-green-700'
                    : 'border-gray-200 text-gray-500 hover:border-brand/50 hover:bg-gray-50'
                }`}
              >
                <input
                  type="file"
                  accept=".xlsx,.xls"
                  className="hidden"
                  onChange={e => {
                    const f = e.target.files?.[0]
                    if (f) setFiles(prev => ({ ...prev, [cfg.key]: f }))
                  }}
                />
                <span className="w-[108px] shrink-0 truncate font-medium">{cfg.label}</span>
                <span className="flex-1 truncate">
                  {files[cfg.key] ? `✓ ${files[cfg.key].name}` : 'เลือกไฟล์'}
                </span>
              </label>
            ))}
          </div>

          {error && <p className="text-xs text-red-500">{error}</p>}

          <button
            onClick={handleUpload}
            disabled={!allSelected || uploading}
            className={`w-full py-2.5 rounded-lg text-sm font-semibold transition-colors ${
              allSelected && !uploading
                ? 'bg-brand text-white hover:bg-brand-light'
                : 'bg-gray-100 text-gray-400 cursor-not-allowed'
            }`}
          >
            {uploading ? 'กำลังอัปโหลด...' : `อัปโหลด${allSelected ? '' : ` (${modeCfg.configs.filter(c => files[c.key]).length}/${modeCfg.configs.length})`}`}
          </button>
        </div>
      )}
    </div>
  )
}
