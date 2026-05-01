import { useState, useRef } from 'react'

const FILE_CONFIGS = [
  {
    key: 'item_file',
    label: 'ยอดขาย-ลิขสิทธิ์',
    filename: 'ยอดขาย-ลิขสิทธิ์.xlsx',
    hint: 'Sheet: Item  •  Master หนังสือทุกเล่ม',
    accept: '.xlsx,.xls',
  },
  {
    key: 'intra_file_1',
    label: 'Intra Annual — Western',
    filename: '1.Intra RptRightAcc_Annual-Western.xlsx',
    hint: 'สัญญา Annual ฝั่ง Western',
    accept: '.xlsx,.xls',
  },
  {
    key: 'intra_file_2',
    label: 'Intra Annual — Asia',
    filename: '2.Intra RptRightAcc_Annual-Asia.xlsx',
    hint: 'สัญญา Annual ฝั่ง Asia',
    accept: '.xlsx,.xls',
  },
  {
    key: 'intra_file_3',
    label: 'Intra BI-Annual — Western',
    filename: '3.Intra RptRightAcc_BI-Annual-Western.xlsx',
    hint: 'สัญญา BI-Annual ฝั่ง Western',
    accept: '.xlsx,.xls',
  },
  {
    key: 'intra_file_4',
    label: 'Intra BI-Annual — Asia',
    filename: '4.Intra RptRightAcc_BI-Annual-Asia.xlsx',
    hint: 'สัญญา BI-Annual ฝั่ง Asia',
    accept: '.xlsx,.xls',
  },
  {
    key: 'exchange_file',
    label: 'อัตราแลกเปลี่ยน',
    filename: 'อัตราแลกเปลี่ยน.xlsx',
    hint: 'Sheet: อัตราแลกเปลี่ยน  •  Exchange rate รายไตรมาส',
    accept: '.xlsx,.xls',
  },
]

function FileDropZone({ config, file, onChange }) {
  const inputRef = useRef()
  const [dragging, setDragging] = useState(false)

  const handleDrop = (e) => {
    e.preventDefault()
    setDragging(false)
    const f = e.dataTransfer.files[0]
    if (f) onChange(config.key, f)
  }

  return (
    <div
      className={`relative border-2 border-dashed rounded-lg p-4 cursor-pointer transition-colors
        ${dragging ? 'border-brand-light bg-brand-pale' : file ? 'border-green-400 bg-green-50' : 'border-gray-300 hover:border-brand-light'}`}
      onClick={() => inputRef.current.click()}
      onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
    >
      <input
        ref={inputRef}
        type="file"
        accept={config.accept}
        className="hidden"
        onChange={(e) => { if (e.target.files[0]) onChange(config.key, e.target.files[0]) }}
      />
      <div className="flex items-start gap-3">
        <div className={`text-2xl ${file ? 'opacity-100' : 'opacity-40'}`}>
          {file ? '📗' : '📄'}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm text-gray-700">{config.label}</p>
          <p className="text-xs text-gray-400 mt-0.5">{config.hint}</p>
          <p className="text-xs text-blue-400 font-mono mt-0.5">{config.filename}</p>
          {file ? (
            <p className="text-xs text-green-600 font-medium mt-1 truncate">✓ {file.name}</p>
          ) : (
            <p className="text-xs text-gray-400 mt-1">คลิกหรือลากไฟล์มาวาง</p>
          )}
        </div>
        {file && (
          <button
            className="text-gray-300 hover:text-red-400 text-lg leading-none"
            onClick={(e) => { e.stopPropagation(); onChange(config.key, null) }}
          >×</button>
        )}
      </div>
    </div>
  )
}

export default function UploadStep({ onSuccess }) {
  const [files, setFiles] = useState({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleChange = (key, file) => {
    setFiles(prev => ({ ...prev, [key]: file }))
    setError('')
  }

  const allSelected = FILE_CONFIGS.every(c => files[c.key])

  const handleSubmit = async () => {
    if (!allSelected) return
    setLoading(true)
    setError('')

    const fd = new FormData()
    FILE_CONFIGS.forEach(c => fd.append(c.key, files[c.key]))

    try {
      const res = await fetch('/api/upload', { method: 'POST', body: fd })
      const text = await res.text()
      if (!text) throw new Error('Backend ไม่ตอบสนอง — ตรวจสอบว่า uvicorn รันอยู่ที่ port 8001')
      const data = JSON.parse(text)
      if (!res.ok) throw new Error(data.detail || 'อัปโหลดไม่สำเร็จ')
      onSuccess(data)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <h2 className="text-lg font-semibold text-brand mb-1">อัปโหลดไฟล์ข้อมูล</h2>
      <p className="text-sm text-gray-500 mb-5">เลือกไฟล์ Excel ทั้ง 6 ไฟล์เพื่อเริ่มต้น</p>

      <div className="space-y-3 mb-6">
        {FILE_CONFIGS.map(cfg => (
          <FileDropZone key={cfg.key} config={cfg} file={files[cfg.key]} onChange={handleChange} />
        ))}
      </div>

      {error && (
        <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
          {error}
        </div>
      )}

      <button
        onClick={handleSubmit}
        disabled={!allSelected || loading}
        className={`w-full py-3 rounded-lg font-semibold text-sm transition-colors
          ${allSelected && !loading
            ? 'bg-brand text-white hover:bg-brand-light'
            : 'bg-gray-100 text-gray-400 cursor-not-allowed'}`}
      >
        {loading ? (
          <span className="flex items-center justify-center gap-2">
            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 00-8 8h4z"/>
            </svg>
            กำลังโหลดข้อมูล...
          </span>
        ) : 'อัปโหลดและโหลดรายชื่อ Agent →'}
      </button>
    </div>
  )
}
