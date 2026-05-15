import { useState } from 'react'

const PERIODS = [
  { value: 'all',    label: 'ทุกรอบ (All Periods 2025)' },
  { value: 'bi1',   label: 'BI-Annual H1 2025 (ม.ค. – มิ.ย.)' },
  { value: 'bi2',   label: 'BI-Annual H2 2025 (ก.ค. – ธ.ค.)' },
  { value: 'annual',label: 'Annual 2025' },
]

function StatusBadge({ status }) {
  if (status === 'pending')  return <span className="text-xs text-gray-400">รอดำเนินการ</span>
  if (status === 'loading')  return <span className="text-xs text-blue-500 flex items-center gap-1"><svg className="animate-spin h-3 w-3" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 00-8 8h4z"/></svg>กำลังสร้าง...</span>
  if (status === 'done')     return <span className="text-xs text-green-600 font-medium">✓ สำเร็จ</span>
  if (status === 'error')    return <span className="text-xs text-red-500">✗ ผิดพลาด</span>
  return null
}

export default function GenerateStep({ sessionId, agents, onBack }) {
  const [period, setPeriod] = useState('all')
  const [results, setResults] = useState({})  // agent → { status, filename, path, error }
  const [batchLoading, setBatchLoading] = useState(false)
  const [batchZip, setBatchZip] = useState(null)

  const allDone = agents.every(a => results[a]?.status === 'done')

  const generateOne = async (agent) => {
    setResults(prev => ({ ...prev, [agent]: { status: 'loading' } }))
    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId, agent_name: agent, period }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || 'Generate ล้มเหลว')
      setResults(prev => ({ ...prev, [agent]: { status: 'done', filename: data.filename, path: data.file_path } }))
    } catch (e) {
      setResults(prev => ({ ...prev, [agent]: { status: 'error', error: e.message } }))
    }
  }

  const generateAll = async () => {
    setBatchLoading(true)
    setBatchZip(null)
    for (const agent of agents) {
      await generateOne(agent)
    }
    setBatchLoading(false)
  }

  const generateAllZip = async () => {
    setBatchLoading(true)
    setBatchZip(null)
    try {
      const res = await fetch('/api/generate-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId, period }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || 'Generate all ล้มเหลว')
      setBatchZip({ filename: data.filename, path: data.file_path })
      // Mark all as done
      const doneMap = {}
      agents.forEach(a => { doneMap[a] = { status: 'done', filename: '(รวมใน ZIP)', path: data.file_path } })
      setResults(doneMap)
    } catch (e) {
      alert(`Error: ${e.message}`)
    } finally {
      setBatchLoading(false)
    }
  }

  const downloadFile = (path) => {
    window.open(`/api/download?path=${encodeURIComponent(path)}`, '_blank')
  }

  const doneCount = agents.filter(a => results[a]?.status === 'done').length
  const progress  = agents.length > 0 ? Math.round((doneCount / agents.length) * 100) : 0

  return (
    <div>
      <h2 className="text-lg font-semibold text-brand mb-1">สร้างรายงาน</h2>
      <p className="text-sm text-gray-500 mb-5">
        เลือก <span className="font-semibold text-brand">{agents.length}</span> Agent
      </p>

      {/* Period selector */}
      <fieldset className="mb-5">
        <legend className="text-sm font-medium text-gray-700 mb-2">รอบการรายงาน</legend>
        <div className="grid grid-cols-2 gap-2">
          {PERIODS.map(p => (
            <label
              key={p.value}
              className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg border cursor-pointer text-sm transition-colors
                ${period === p.value
                  ? 'border-brand bg-brand-pale text-brand font-medium'
                  : 'border-gray-200 text-gray-600 hover:border-brand/40'}`}
            >
              <input
                type="radio"
                value={p.value}
                checked={period === p.value}
                onChange={() => setPeriod(p.value)}
                className="accent-brand"
              />
              {p.label}
            </label>
          ))}
        </div>
      </fieldset>

      {/* Progress bar */}
      {doneCount > 0 && (
        <div className="mb-4">
          <div className="flex justify-between text-xs text-gray-500 mb-1">
            <span>สำเร็จ {doneCount} / {agents.length}</span>
            <span>{progress}%</span>
          </div>
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-green-500 transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex gap-2 mb-5">
        <button
          onClick={generateAll}
          disabled={batchLoading}
          className={`flex-1 py-2.5 rounded-lg font-semibold text-sm transition-colors
            ${batchLoading ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-brand text-white hover:bg-brand-light'}`}
        >
          {batchLoading ? '⏳ กำลังสร้าง...' : `▶ สร้างทีละ Agent (${agents.length})`}
        </button>
        <button
          onClick={generateAllZip}
          disabled={batchLoading}
          title="Generate ทุก Agent แล้ว ZIP รวม"
          className={`px-4 py-2.5 rounded-lg font-semibold text-sm border transition-colors
            ${batchLoading ? 'border-gray-200 text-gray-400 cursor-not-allowed' : 'border-brand text-brand hover:bg-brand-pale'}`}
        >
          📦 ZIP ทั้งหมด
        </button>
      </div>

      {/* ZIP download */}
      {batchZip && (
        <div className="mb-4 flex items-center gap-3 px-4 py-3 bg-green-50 border border-green-200 rounded-lg">
          <span className="text-xl">📦</span>
          <div className="flex-1">
            <p className="text-sm font-semibold text-green-700">{batchZip.filename}</p>
            <p className="text-xs text-green-500">รวม {agents.length} ไฟล์</p>
          </div>
          <button
            onClick={() => downloadFile(batchZip.path)}
            className="px-4 py-1.5 bg-green-600 text-white rounded text-xs font-semibold hover:bg-green-700"
          >
            ⬇ ดาวน์โหลด
          </button>
        </div>
      )}

      {/* Agent result list */}
      <div className="border border-gray-200 rounded-lg overflow-hidden divide-y divide-gray-100 max-h-64 overflow-y-auto mb-5">
        {agents.map(agent => {
          const r = results[agent]
          return (
            <div key={agent} className="flex items-center gap-3 px-4 py-2.5">
              <div className="flex-1 min-w-0">
                <p className="text-sm text-gray-700 truncate">{agent}</p>
                {r?.error && <p className="text-xs text-red-400 truncate">{r.error}</p>}
              </div>
              <StatusBadge status={r?.status ?? 'pending'} />
              {r?.status === 'done' && r?.path && !batchZip && (
                <button
                  onClick={() => downloadFile(r.path)}
                  className="text-xs px-3 py-1 bg-brand text-white rounded hover:bg-brand-light transition-colors ml-2"
                >
                  ⬇ DL
                </button>
              )}
              {r?.status !== 'loading' && r?.status !== 'done' && (
                <button
                  onClick={() => generateOne(agent)}
                  disabled={batchLoading}
                  className="text-xs px-3 py-1 border border-brand text-brand rounded hover:bg-brand-pale transition-colors ml-2"
                >
                  สร้าง
                </button>
              )}
            </div>
          )
        })}
      </div>

      {/* Back */}
      <button
        onClick={onBack}
        disabled={batchLoading}
        className="w-full py-2.5 rounded-lg border border-gray-300 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
      >
        ← ย้อนกลับ
      </button>
    </div>
  )
}
