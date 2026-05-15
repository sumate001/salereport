import { useState, useMemo } from 'react'

export default function AgentSelectStep({ agents, selected, onChange, onBack, onNext }) {
  const [search, setSearch] = useState('')

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return q ? agents.filter(a => a.toLowerCase().includes(q)) : agents
  }, [agents, search])

  const toggle = (agent) => {
    onChange(prev =>
      prev.includes(agent) ? prev.filter(a => a !== agent) : [...prev, agent]
    )
  }

  const selectAll = () => onChange(filtered)
  const clearAll  = () => onChange([])

  return (
    <div>
      <h2 className="text-lg font-semibold text-brand mb-1">เลือก Agent</h2>
      <p className="text-sm text-gray-500 mb-4">
        พบ <span className="font-semibold text-brand">{agents.length}</span> agents •
        เลือกไว้ <span className="font-semibold text-green-600">{selected.length}</span> รายการ
      </p>

      {/* Search */}
      <div className="relative mb-3">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">🔍</span>
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="ค้นหา Agent..."
          className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand/30"
        />
      </div>

      {/* Bulk actions */}
      <div className="flex gap-2 mb-3">
        <button
          onClick={selectAll}
          className="text-xs px-3 py-1.5 rounded border border-brand text-brand hover:bg-brand-pale transition-colors"
        >
          เลือกทั้งหมด ({filtered.length})
        </button>
        <button
          onClick={clearAll}
          className="text-xs px-3 py-1.5 rounded border border-gray-300 text-gray-500 hover:bg-gray-50 transition-colors"
        >
          ล้างการเลือก
        </button>
      </div>

      {/* Agent list */}
      <div className="border border-gray-200 rounded-lg overflow-hidden mb-5">
        <div className="max-h-72 overflow-y-auto divide-y divide-gray-100">
          {filtered.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">ไม่พบ Agent ที่ตรงกับการค้นหา</p>
          ) : (
            filtered.map(agent => {
              const isSelected = selected.includes(agent)
              return (
                <label
                  key={agent}
                  className={`flex items-center gap-3 px-4 py-2.5 cursor-pointer hover:bg-gray-50 transition-colors
                    ${isSelected ? 'bg-brand-pale' : ''}`}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggle(agent)}
                    className="accent-brand w-4 h-4 flex-shrink-0"
                  />
                  <span className="text-sm text-gray-700 leading-snug">{agent}</span>
                </label>
              )
            })
          )}
        </div>
      </div>

      {/* Navigation */}
      <div className="flex gap-3">
        <button
          onClick={onBack}
          className="flex-1 py-2.5 rounded-lg border border-gray-300 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
        >
          ← ย้อนกลับ
        </button>
        <button
          onClick={onNext}
          disabled={selected.length === 0}
          className={`flex-2 flex-1 py-2.5 rounded-lg font-semibold text-sm transition-colors
            ${selected.length > 0
              ? 'bg-brand text-white hover:bg-brand-light'
              : 'bg-gray-100 text-gray-400 cursor-not-allowed'}`}
        >
          ถัดไป: สร้างรายงาน →
        </button>
      </div>
    </div>
  )
}
