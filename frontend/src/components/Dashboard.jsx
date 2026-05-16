import { useEffect, useState } from 'react'

const fmt = (n) => Number(n).toLocaleString('th-TH')
const fmtB = (n) => `฿${Number(n).toLocaleString('th-TH')}`

function StatCard({ label, value, sub, color = 'brand', small = false }) {
  const colors = {
    brand:  'border-brand  bg-brand/5  text-brand',
    green:  'border-green-500 bg-green-50 text-green-700',
    red:    'border-red-400  bg-red-50   text-red-700',
    amber:  'border-amber-400 bg-amber-50 text-amber-700',
    gray:   'border-gray-300  bg-gray-50  text-gray-400',
  }
  return (
    <div className={`rounded-xl border-l-4 p-4 ${colors[color]}`}>
      <p className="text-xs font-medium opacity-70 uppercase tracking-wide">{label}</p>
      <p className={`font-bold mt-1 ${small ? 'text-xl' : 'text-2xl'}`}>{value}</p>
      {sub && <p className="text-xs opacity-60 mt-0.5">{sub}</p>}
    </div>
  )
}

function MissingCard({ label, reason }) {
  return (
    <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-4">
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">{label}</p>
      <p className="text-lg font-bold text-gray-300 mt-1">N/A</p>
      <p className="text-xs text-gray-400 mt-1">⚠ ต้องการ: {reason}</p>
    </div>
  )
}

function SellThroughBar({ pct }) {
  const color = pct >= 60 ? 'bg-green-500' : pct >= 30 ? 'bg-amber-400' : 'bg-red-400'
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(pct, 100)}%` }} />
      </div>
      <span className="text-xs text-gray-500 w-10 text-right">{pct}%</span>
    </div>
  )
}

function Section({ title, children }) {
  return (
    <div className="mb-8">
      <h2 className="text-sm font-bold text-brand uppercase tracking-widest mb-3 border-b border-brand/20 pb-2">
        {title}
      </h2>
      {children}
    </div>
  )
}

export default function Dashboard({ sessionId }) {
  const [data, setData]       = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)

  useEffect(() => {
    setLoading(true)
    fetch(`/api/dashboard?session_id=${sessionId}`)
      .then(r => { if (!r.ok) throw new Error('โหลด Dashboard ล้มเหลว'); return r.json() })
      .then(setData)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [sessionId])

  if (loading) return (
    <div className="flex items-center justify-center py-24 text-gray-400">
      <svg className="animate-spin h-6 w-6 mr-3" viewBox="0 0 24 24" fill="none">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 00-8 8h4z"/>
      </svg>
      กำลังวิเคราะห์ข้อมูล...
    </div>
  )

  if (error) return (
    <div className="text-center py-16 text-red-500 text-sm">{error}</div>
  )

  const { summary, advance_status, agents, top_books, zero_books } = data
  const maxRoyalty = agents.length ? agents[0].royalty_thb : 1

  return (
    <div className="max-w-6xl mx-auto px-4 py-6">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="mb-6">
        <h1 className="text-xl font-bold text-brand">Executive Dashboard</h1>
        <p className="text-xs text-gray-400 mt-0.5">ข้อมูล ณ ปี 2025 · อิงจากไฟล์ที่อัปโหลด</p>
      </div>

      {/* ── Zone 1: Portfolio Summary ───────────────────────────────────────── */}
      <Section title="ภาพรวมพอร์ตโฟลิโอ">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
          <StatCard label="ISBNs ทั้งหมด"   value={fmt(summary.total_isbns)}   sub={`${summary.total_agencies} Agents · ${summary.total_publishers} Publishers`} />
          <StatCard label="มียอดขาย"         value={fmt(summary.with_sales)}    sub={`${Math.round(summary.with_sales/summary.total_isbns*100)}% ของทั้งหมด`} color="green" />
          <StatCard label="ยอดขาย = 0"       value={fmt(summary.zero_sales)}    sub="ต้องพิจารณาตัดหรือเจรจา" color="red" />
          <StatCard label="Sell-off หมดปี 2025" value={fmt(summary.expiring_2025)} sub="ต้องตัดสินใจต่อสัญญา" color="amber" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <StatCard label="ค่าลิขสิทธิ์รวม 2025" value={fmtB(summary.total_royalty_thb)} sub="คำนวณจากยอดขาย × ราคา × rate" color="brand" />
          <MissingCard label="เทียบปีก่อน (YoY)" reason="ข้อมูลยอดขายปี 2024" />
          <MissingCard label="Gross Margin"       reason="ข้อมูลต้นทุนต่อปก" />
        </div>
      </Section>

      {/* ── Zone 2: Advance Status ──────────────────────────────────────────── */}
      <Section title="สถานะ Advance Payment">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="rounded-xl border border-green-200 bg-green-50 p-4">
            <p className="text-xs font-semibold text-green-700 uppercase tracking-wide">จ่ายแล้ว</p>
            <p className="text-2xl font-bold text-green-700 mt-1">{advance_status['จ่ายแล้ว']}</p>
            <p className="text-xs text-green-500 mt-0.5">ปิดบัญชีแล้ว</p>
          </div>
          <div className="rounded-xl border border-red-200 bg-red-50 p-4">
            <p className="text-xs font-semibold text-red-600 uppercase tracking-wide">ค้างจ่าย</p>
            <p className="text-2xl font-bold text-red-600 mt-1">{advance_status['ค้างจ่าย']}</p>
            <p className="text-xs text-red-400 mt-0.5">Publisher ยังค้างอยู่</p>
          </div>
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
            <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide">ยังไม่เกิน ADV</p>
            <p className="text-2xl font-bold text-amber-700 mt-1">{advance_status['ยังไม่เกิน ADV']}</p>
            <p className="text-xs text-amber-500 mt-0.5">ยอดขายยังไม่คืน Advance</p>
          </div>
          <MissingCard label="ประวัติการจ่ายย้อนหลัง" reason="ฐานข้อมูลประวัติการชำระ" />
        </div>
      </Section>

      {/* ── Zone 3: Agent Performance ───────────────────────────────────────── */}
      <Section title="ผลงานแยกตาม Agent">
        <div className="rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-brand text-white text-xs uppercase">
                <th className="text-left px-4 py-3">Agent</th>
                <th className="text-right px-4 py-3 w-16">ISBNs</th>
                <th className="px-4 py-3 w-48">Sell-through Rate</th>
                <th className="text-right px-4 py-3 w-36">ค่าลิขสิทธิ์ (฿)</th>
                <th className="text-right px-4 py-3 w-28">สัดส่วน</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {agents.map((ag, i) => (
                <tr key={ag.name} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                  <td className="px-4 py-3 font-medium text-gray-800 truncate max-w-[200px]">{ag.name}</td>
                  <td className="px-4 py-3 text-right text-gray-500">{ag.isbn_count}</td>
                  <td className="px-4 py-3"><SellThroughBar pct={ag.sell_through_pct} /></td>
                  <td className="px-4 py-3 text-right text-gray-700 font-mono">{fmtB(ag.royalty_thb)}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <div className="h-1.5 bg-brand rounded-full" style={{ width: `${Math.round(ag.royalty_thb / maxRoyalty * 60)}px` }} />
                      <span className="text-xs text-gray-400">
                        {summary.total_royalty_thb > 0
                          ? Math.round(ag.royalty_thb / summary.total_royalty_thb * 100)
                          : 0}%
                      </span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      {/* ── Zone 4: Top Books & Zero Sales ─────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">

        {/* Top 10 */}
        <div>
          <h2 className="text-sm font-bold text-brand uppercase tracking-widest mb-3 border-b border-brand/20 pb-2">
            Top 10 ปกที่ขายดีสุด
          </h2>
          <div className="rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-brand text-white">
                  <th className="text-left px-3 py-2">#</th>
                  <th className="text-left px-3 py-2">ชื่อปก</th>
                  <th className="text-right px-3 py-2">ขาย</th>
                  <th className="text-right px-3 py-2">ค่าลิขสิทธิ์</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {top_books.map((b, i) => (
                  <tr key={b.isbn} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                    <td className="px-3 py-2 text-gray-400 font-mono">{i + 1}</td>
                    <td className="px-3 py-2">
                      <p className="font-medium text-gray-800 truncate max-w-[140px]" title={b.title}>{b.title || b.isbn}</p>
                      <p className="text-gray-400">{b.isbn}</p>
                    </td>
                    <td className="px-3 py-2 text-right text-gray-600 font-mono">{fmt(b.copies_sold)}</td>
                    <td className="px-3 py-2 text-right text-brand font-mono font-semibold">{fmtB(b.royalty_thb)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Zero Sales */}
        <div>
          <h2 className="text-sm font-bold text-red-600 uppercase tracking-widest mb-3 border-b border-red-200 pb-2">
            ปกที่ยอดขาย = 0 ({summary.zero_sales} เล่ม)
          </h2>
          {zero_books.length === 0 ? (
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-8 text-center text-gray-400 text-sm">
              ไม่มีปกที่ยอดขาย = 0
            </div>
          ) : (
            <div className="rounded-xl border border-red-100 overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-red-50 text-red-700">
                    <th className="text-left px-3 py-2">ชื่อปก</th>
                    <th className="text-left px-3 py-2">Agent</th>
                    <th className="text-right px-3 py-2">พิมพ์</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-red-50">
                  {zero_books.map((b, i) => (
                    <tr key={b.isbn} className={i % 2 === 0 ? 'bg-white' : 'bg-red-50/30'}>
                      <td className="px-3 py-2">
                        <p className="font-medium text-gray-700 truncate max-w-[140px]" title={b.title}>{b.title || b.isbn}</p>
                        <p className="text-gray-400">{b.isbn}</p>
                      </td>
                      <td className="px-3 py-2 text-gray-500 truncate max-w-[100px]">{b.agency}</td>
                      <td className="px-3 py-2 text-right text-gray-500 font-mono">{b.copies_sold}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {summary.zero_sales > 10 && (
                <p className="text-xs text-red-400 text-center py-2 bg-red-50">
                  แสดง 10 จาก {summary.zero_sales} รายการ
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Zone 5: Missing Data ────────────────────────────────────────────── */}
      <Section title="ข้อมูลที่ยังต้องการเพิ่มเติม">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <MissingCard label="ยอดขายปีก่อน (YoY)"       reason="ข้อมูลยอดขายปี 2024 ใน Item sheet" />
          <MissingCard label="วันที่สัญญาเริ่ม/หมด"      reason="วันที่สัญญาจริง (Intra มีแค่ Sell-off)" />
          <MissingCard label="ประวัติจ่าย Royalty"        reason="ฐานข้อมูลประวัติการชำระย้อนหลัง" />
          <MissingCard label="ต้นทุนต่อปก / Margin"       reason="ข้อมูลต้นทุนจากแผนกบัญชี" />
        </div>
      </Section>

    </div>
  )
}
