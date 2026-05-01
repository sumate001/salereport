import { useState } from 'react'

const PERIODS = [
  { value: 'bi1',    label: 'BI-Annual 2025.1  (ม.ค. – มิ.ย.)' },
  { value: 'bi2',    label: 'BI-Annual 2025.2  (ก.ค. – ธ.ค.)' },
  { value: 'annual', label: 'Annual 2025  (ม.ค. – ธ.ค.)' },
  { value: 'all',    label: 'ทุกรอบ (BI-Annual + Annual)' },
]

export default function SelectStep({ sessionId, onBack }) {
  const [period,  setPeriod]  = useState('annual')
  const [loading, setLoading] = useState(false)
  const [result,  setResult]  = useState(null)
  const [error,   setError]   = useState('')

  const handleGenerate = async () => {
    setLoading(true); setError(''); setResult(null)
    try {
      const res  = await fetch('/api/generate-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId, period }),
      })
      const text = await res.text()
      if (!text) throw new Error('Backend ไม่ตอบสนอง')
      const data = JSON.parse(text)
      if (!res.ok) throw new Error(data.detail || 'Generate ล้มเหลว')
      setResult(data)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const download = () => {
    window.open(`/api/download?path=${encodeURIComponent(result.file_path)}`, '_blank')
  }

  return (
    <div>
      <h2 className="text-lg font-semibold text-brand mb-1">สร้างรายงาน</h2>
      <p className="text-sm text-gray-500 mb-5">เลือก Period แล้วกด สร้างรายงาน — ระบบจะสร้างรายงานทุก Agency อัตโนมัติ</p>

      <div className="mb-5">
        <label className="block text-sm font-medium text-gray-700 mb-2">Period</label>
        <div className="grid grid-cols-2 gap-2">
          {PERIODS.map(p => (
            <label key={p.value}
              className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border cursor-pointer text-sm transition-colors
                ${period === p.value
                  ? 'border-brand bg-brand-pale text-brand font-medium'
                  : 'border-gray-200 text-gray-600 hover:border-brand/40'}`}>
              <input type="radio" value={p.value} checked={period === p.value}
                onChange={() => setPeriod(p.value)} className="accent-brand" />
              {p.label}
            </label>
          ))}
        </div>
      </div>

      {error && (
        <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
          {error}
        </div>
      )}

      {result && (
        <div className="mb-4 flex items-center gap-3 px-4 py-3 bg-green-50 border border-green-200 rounded-lg">
          <span className="text-xl">📦</span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-green-700 truncate">{result.filename}</p>
            <p className="text-xs text-green-500">พร้อมดาวน์โหลด (ZIP)</p>
          </div>
          <button onClick={download}
            className="px-4 py-1.5 bg-green-600 text-white rounded text-xs font-semibold hover:bg-green-700">
            ⬇ ดาวน์โหลด
          </button>
        </div>
      )}

      <div className="flex gap-3">
        <button onClick={onBack} disabled={loading}
          className="flex-1 py-2.5 rounded-lg border border-gray-300 text-sm text-gray-600 hover:bg-gray-50 transition-colors">
          ← ย้อนกลับ
        </button>
        <button onClick={handleGenerate} disabled={loading}
          className={`flex-[2] py-2.5 rounded-lg font-semibold text-sm transition-colors
            ${!loading
              ? 'bg-brand text-white hover:bg-brand-light'
              : 'bg-gray-100 text-gray-400 cursor-not-allowed'}`}>
          {loading
            ? <span className="flex items-center justify-center gap-2">
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 00-8 8h4z"/>
                </svg>
                กำลังสร้าง...
              </span>
            : '▶ สร้างรายงาน'}
        </button>
      </div>
    </div>
  )
}
