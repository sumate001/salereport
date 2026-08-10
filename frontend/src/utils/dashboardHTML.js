export function generateHTML(data, ts) {
  const { summary, advance_status, agents, top_books, all_books } = data
  const zero_all = all_books.filter(b => b.copies_sold === 0)
  const fmtN = n => Number(n).toLocaleString('th-TH')
  const fmtB = n => `฿${Number(n).toLocaleString('th-TH')}`
  const stColor = p => p >= 60 ? '#22c55e' : p >= 30 ? '#f59e0b' : '#ef4444'

  const css = `
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:'Sarabun','IBM Plex Sans Thai',sans-serif;background:#f9fafb;color:#111827;font-size:14px}
    .hdr{background:#1F4E79;color:#fff;padding:16px 24px}
    .hdr h1{font-size:20px;font-weight:700}
    .hdr p{font-size:12px;color:rgba(255,255,255,.65);margin-top:3px}
    .wrap{max-width:1000px;margin:0 auto;padding:24px 16px}
    details{margin-bottom:28px}
    summary{font-size:11px;font-weight:700;color:#1F4E79;text-transform:uppercase;letter-spacing:.08em;
            border-bottom:1px solid #D6E4F0;padding-bottom:8px;margin-bottom:14px;cursor:pointer;
            list-style:none;display:flex;align-items:center;justify-content:space-between}
    summary::-webkit-details-marker{display:none}
    summary::after{content:'▲';font-size:10px;color:#9ca3af;transition:transform .2s}
    details:not([open]) summary::after{content:'▼'}
    .g4{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:12px}
    .g3{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}
    .g2{display:grid;grid-template-columns:1fr 1fr;gap:24px}
    .stat{border-radius:10px;border-left:4px solid;padding:12px 14px}
    .stat .lbl{font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;opacity:.7}
    .stat .val{font-size:22px;font-weight:700;margin-top:3px}
    .stat .sub{font-size:11px;opacity:.6;margin-top:2px}
    .brand{border-color:#1F4E79;background:rgba(31,78,121,.05);color:#1F4E79}
    .green{border-color:#22c55e;background:#f0fdf4;color:#15803d}
    .red  {border-color:#f87171;background:#fff5f5;color:#b91c1c}
    .amber{border-color:#fbbf24;background:#fffbeb;color:#92400e}
    .miss{border-radius:10px;border:1px dashed #d1d5db;background:#f9fafb;padding:12px 14px}
    .miss .lbl{font-size:10px;font-weight:600;color:#9ca3af;text-transform:uppercase;letter-spacing:.05em}
    .miss .val{font-size:20px;font-weight:700;color:#d1d5db;margin-top:3px}
    .miss .why{font-size:11px;color:#9ca3af;margin-top:3px}
    .adv4{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}
    .acard{border-radius:10px;border:1px solid;padding:12px 14px}
    .ag{border-color:#bbf7d0;background:#f0fdf4;color:#15803d}
    .ar{border-color:#fecaca;background:#fff5f5;color:#dc2626}
    .aa{border-color:#fde68a;background:#fffbeb;color:#92400e}
    .acard .lbl{font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.05em}
    .acard .val{font-size:22px;font-weight:700;margin-top:3px}
    .acard .sub{font-size:11px;margin-top:2px;opacity:.7}
    .tbl{border-radius:10px;border:1px solid #e5e7eb;overflow:hidden}
    .tbl.red{border-color:#fecaca}
    table{width:100%;border-collapse:collapse;font-size:12px}
    th{padding:9px 14px;background:#1F4E79;color:#fff;font-size:10px;text-transform:uppercase;letter-spacing:.05em;text-align:left}
    th.r{text-align:right}
    td{padding:7px 14px;color:#374151}
    td.r{text-align:right;font-family:monospace}
    td.g{color:#6b7280}
    .tr0{background:#fff}
    .tr1{background:#f9fafb}
    .tr1z{background:#fff5f5}
    .isbn{font-size:11px;color:#9ca3af}
    .bar-wrap{display:flex;align-items:center;gap:8px}
    .bar-bg{flex:1;height:6px;background:#f3f4f6;border-radius:999px;overflow:hidden}
    .bar-fg{height:100%;border-radius:999px}
    .bar-pct{font-size:11px;color:#6b7280;width:36px;text-align:right}
    .share{display:flex;align-items:center;justify-content:flex-end;gap:4px}
    .share-bar{height:6px;background:#1F4E79;border-radius:999px}
    .share-pct{font-size:11px;color:#9ca3af}
    .sub-detail{margin-top:10px}
    .sub-det-sum{font-size:11px;color:#1F4E79;cursor:pointer;font-weight:600;
                 padding:4px 0;display:inline-flex;align-items:center;gap:4px}
    @media(max-width:700px){.g4,.g3,.adv4,.g2{grid-template-columns:1fr 1fr}}
    @media(max-width:480px){.g4,.adv4,.g2{grid-template-columns:1fr}}
  `

  const advanceStatuses = new Set(['จ่ายแล้ว','ค้างจ่าย','ยังไม่เกิน ADV'])
  const advDetail = all_books.filter(b => advanceStatuses.has(b.status))
  const advRows = advDetail.map((b, i) => {
    const sc  = b.status === 'จ่ายแล้ว' ? '#15803d' : b.status === 'ค้างจ่าย' ? '#dc2626' : '#92400e'
    const sbg = b.status === 'จ่ายแล้ว' ? '#f0fdf4' : b.status === 'ค้างจ่าย' ? '#fff5f5' : '#fffbeb'
    return `<tr class="${i%2===0?'tr0':'tr1'}">
      <td><div style="max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:500" title="${b.title||b.isbn}">${b.title||b.isbn}</div><div class="isbn">${b.isbn}</div></td>
      <td class="g" style="max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${b.agency}</td>
      <td class="r">${fmtN(b.copies_sold)}</td>
      <td class="r" style="color:#1F4E79;font-weight:600">${fmtB(b.royalty_thb)}</td>
      <td style="text-align:center"><span style="background:${sbg};color:${sc};font-size:10px;font-weight:600;padding:2px 8px;border-radius:999px;white-space:nowrap">${b.status||'—'}</span></td>
    </tr>`
  }).join('')

  const topRows = top_books.map((b, i) => `
    <tr class="${i%2===0?'tr0':'tr1'}">
      <td style="color:#9ca3af;font-family:monospace;width:28px">${i+1}</td>
      <td><div style="font-weight:600;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${b.title||b.isbn}">${b.title||b.isbn}</div><div class="isbn">${b.isbn}</div></td>
      <td class="r g">${fmtN(b.copies_sold)}</td>
      <td class="r" style="color:#1F4E79;font-weight:700">${fmtB(b.royalty_thb)}</td>
    </tr>`).join('')

  const zeroRows = zero_all.length === 0
    ? `<tr><td colspan="3" style="padding:24px;text-align:center;color:#9ca3af">ไม่มีปกที่ยอดขาย = 0</td></tr>`
    : zero_all.map((b, i) => `
    <tr class="${i%2===0?'tr0':'tr1z'}">
      <td><div style="font-weight:500;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${b.title||b.isbn}">${b.title||b.isbn}</div><div class="isbn">${b.isbn}</div></td>
      <td class="g" style="max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${b.agency}</td>
      <td class="r g">${b.copies_sold}</td>
    </tr>`).join('')

  const maxR = agents.length ? agents[0].royalty_thb : 1
  const agentRows = agents.map((ag, i) => {
    const agBooks = all_books.filter(b => b.agency === ag.name)
    const agBookRows = agBooks.map((b, j) => `
      <tr class="${j%2===0?'tr0':'tr1'}">
        <td><div style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:500" title="${b.title||b.isbn}">${b.title||b.isbn}</div><div class="isbn">${b.isbn}</div></td>
        <td class="r g">${fmtN(b.copies_sold)}</td>
        <td class="r">${b.sell_through_pct}%</td>
        <td class="r" style="color:#1F4E79;font-weight:600">${fmtB(b.royalty_thb)}</td>
      </tr>`).join('')
    const sharePct = summary.total_royalty_thb > 0 ? Math.round(ag.royalty_thb / summary.total_royalty_thb * 100) : 0
    const barW = Math.round(ag.royalty_thb / maxR * 80)
    const sc = stColor(ag.sell_through_pct)
    return `<tr class="${i%2===0?'tr0':'tr1'}">
      <td>
        <div style="font-weight:500;color:#1f2937;max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${ag.name}</div>
        <details class="sub-detail">
          <summary class="sub-det-sum">ดูปกทั้งหมด (${agBooks.length})</summary>
          <div class="tbl" style="margin-top:8px">
            <table>
              <thead><tr><th>ชื่อปก</th><th class="r">ขาย</th><th class="r">Sell-through</th><th class="r">ค่าลิขสิทธิ์</th></tr></thead>
              <tbody>${agBookRows}</tbody>
            </table>
          </div>
        </details>
      </td>
      <td class="r g">${ag.isbn_count}</td>
      <td>
        <div class="bar-wrap">
          <div class="bar-bg"><div class="bar-fg" style="width:${Math.min(ag.sell_through_pct,100)}%;background:${sc}"></div></div>
          <span class="bar-pct">${ag.sell_through_pct}%</span>
        </div>
      </td>
      <td class="r" style="font-family:monospace">${fmtB(ag.royalty_thb)}</td>
      <td>
        <div class="share">
          <div class="share-bar" style="width:${barW}px"></div>
          <span class="share-pct">${sharePct}%</span>
        </div>
      </td>
    </tr>`
  }).join('')

  return `<!DOCTYPE html>
<html lang="th">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Executive Dashboard — ${ts}</title>
<style>${css}</style>
</head>
<body>
<div class="hdr">
  <h1>Executive Dashboard — Sales Royalty Report</h1>
  <p>สร้างเมื่อ ${ts}</p>
  <p>ข้อมูล ณ ปี 2025 · อิงจากไฟล์ที่อัปโหลด</p>
</div>
<div class="wrap">

  <details open>
    <summary>ภาพรวมพอร์ตโฟลิโอ</summary>
    <div class="g4">
      <div class="stat brand"><div class="lbl">ISBNs ทั้งหมด</div><div class="val">${fmtN(summary.total_isbns)}</div><div class="sub">${summary.total_agencies} Agents · ${summary.total_publishers} Publishers</div></div>
      <div class="stat green"><div class="lbl">มียอดขาย</div><div class="val">${fmtN(summary.with_sales)}</div><div class="sub">${Math.round(summary.with_sales/summary.total_isbns*100)}% ของทั้งหมด</div></div>
      <div class="stat red"><div class="lbl">ยอดขาย = 0</div><div class="val">${fmtN(summary.zero_sales)}</div><div class="sub">ต้องพิจารณาตัดหรือเจรจา</div></div>
      <div class="stat amber"><div class="lbl">Sell-off หมดปี ${summary.report_year ?? 2025}</div><div class="val">${fmtN(summary.expiring_2025)}</div><div class="sub">ต้องตัดสินใจต่อสัญญา</div></div>
    </div>
    <div class="g3">
      <div class="stat brand"><div class="lbl">ค่าลิขสิทธิ์รวม 2025</div><div class="val">${fmtB(summary.total_royalty_thb)}</div><div class="sub">คำนวณจากยอดขาย × ราคา × rate</div></div>
      <div class="miss"><div class="lbl">เทียบปีก่อน (YoY)</div><div class="val">N/A</div><div class="why">⚠ ต้องการ: ข้อมูลยอดขายปี 2024</div></div>
      <div class="miss"><div class="lbl">Gross Margin</div><div class="val">N/A</div><div class="why">⚠ ต้องการ: ข้อมูลต้นทุนต่อปก</div></div>
    </div>
  </details>

  <details open>
    <summary>สถานะ Advance Payment</summary>
    <div class="adv4">
      <div class="acard ag"><div class="lbl">จ่ายแล้ว</div><div class="val">${advance_status['จ่ายแล้ว']}</div><div class="sub">ปิดบัญชีแล้ว</div></div>
      <div class="acard ar"><div class="lbl">ค้างจ่าย</div><div class="val">${advance_status['ค้างจ่าย']}</div><div class="sub">Publisher ยังค้างอยู่</div></div>
      <div class="acard aa"><div class="lbl">ยังไม่เกิน ADV</div><div class="val">${advance_status['ยังไม่เกิน ADV']}</div><div class="sub">ยอดขายยังไม่คืน Advance</div></div>
      <div class="miss"><div class="lbl">ประวัติการจ่ายย้อนหลัง</div><div class="val">N/A</div><div class="why">⚠ ต้องการ: ฐานข้อมูลประวัติการชำระ</div></div>
    </div>
    ${advDetail.length > 0 ? `
    <details style="margin-top:12px">
      <summary style="border-bottom:none;padding-bottom:0;font-size:11px;color:#6b7280;text-transform:none;letter-spacing:0;font-weight:600">รายละเอียดสถานะ Advance (${advDetail.length} ISBN)</summary>
      <div class="tbl" style="margin-top:10px">
        <table>
          <thead><tr><th>ชื่อปก</th><th>Agent</th><th class="r">ยอดขาย</th><th class="r">ค่าลิขสิทธิ์</th><th style="text-align:center">สถานะ</th></tr></thead>
          <tbody>${advRows}</tbody>
        </table>
      </div>
    </details>` : ''}
  </details>

  <details open>
    <summary>Top 10 ปกขายดีสุด &amp; ปกยอดขาย = 0</summary>
    <div class="g2">
      <div>
        <div style="font-size:11px;font-weight:700;color:#1F4E79;text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px">Top 10 ปกที่ขายดีสุด</div>
        <div class="tbl">
          <table>
            <thead><tr><th>#</th><th>ชื่อปก</th><th class="r">ขาย</th><th class="r">ค่าลิขสิทธิ์</th></tr></thead>
            <tbody>${topRows}</tbody>
          </table>
        </div>
      </div>
      <div>
        <div style="font-size:11px;font-weight:700;color:#dc2626;text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px">ปกที่ยอดขาย = 0 (${summary.zero_sales} เล่ม)</div>
        <div class="tbl red">
          <table>
            <thead><tr style="background:#fef2f2"><th style="color:#dc2626">ชื่อปก</th><th style="color:#dc2626">Agent</th><th class="r" style="color:#dc2626">พิมพ์</th></tr></thead>
            <tbody>${zeroRows}</tbody>
          </table>
        </div>
      </div>
    </div>
  </details>

  <details open>
    <summary>ผลงานแยกตาม Agent</summary>
    <div class="tbl">
      <table>
        <thead><tr>
          <th>Agent</th>
          <th class="r" style="width:60px">ISBNs</th>
          <th style="width:160px">Sell-through Rate</th>
          <th class="r" style="width:130px">ค่าลิขสิทธิ์ (฿)</th>
          <th class="r" style="width:90px">สัดส่วน</th>
        </tr></thead>
        <tbody>${agentRows}</tbody>
      </table>
    </div>
  </details>

  <details open>
    <summary>ข้อมูลที่ยังต้องการเพิ่มเติม</summary>
    <div class="g4">
      <div class="miss"><div class="lbl">ยอดขายปีก่อน (YoY)</div><div class="val">N/A</div><div class="why">⚠ ข้อมูลยอดขายปี 2024 ใน Item sheet</div></div>
      <div class="miss"><div class="lbl">วันที่สัญญาเริ่ม/หมด</div><div class="val">N/A</div><div class="why">⚠ วันที่สัญญาจริง (Intra มีแค่ Sell-off)</div></div>
      <div class="miss"><div class="lbl">ประวัติจ่าย Royalty</div><div class="val">N/A</div><div class="why">⚠ ฐานข้อมูลประวัติการชำระย้อนหลัง</div></div>
      <div class="miss"><div class="lbl">ต้นทุนต่อปก / Margin</div><div class="val">N/A</div><div class="why">⚠ ข้อมูลต้นทุนจากแผนกบัญชี</div></div>
    </div>
  </details>

</div>
</body>
</html>`
}
