import { useState } from 'react'
import UploadStep from './components/UploadStep'
import SelectStep from './components/SelectStep'

const STEPS = ['อัปโหลดไฟล์', 'เลือกและสร้างรายงาน']

export default function App() {
  const [step, setStep]       = useState(0)
  const [session, setSession] = useState(null)

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-brand text-white px-6 py-4 shadow">
        <h1 className="text-xl font-semibold tracking-wide">Sales Royalty Report Generator</h1>
      </header>

      <div className="max-w-2xl mx-auto mt-8 px-4">
        <nav className="flex items-center mb-8">
          {STEPS.map((label, i) => (
            <div key={i} className="flex items-center flex-1 last:flex-none">
              <div className="flex flex-col items-center">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold border-2 transition-colors
                  ${i < step  ? 'bg-brand border-brand text-white'
                  : i === step ? 'bg-white border-brand text-brand'
                  :              'bg-white border-gray-300 text-gray-400'}`}>
                  {i < step ? '✓' : i + 1}
                </div>
                <span className={`text-xs mt-1 whitespace-nowrap ${i === step ? 'text-brand font-semibold' : 'text-gray-400'}`}>
                  {label}
                </span>
              </div>
              {i < STEPS.length - 1 && (
                <div className={`flex-1 h-0.5 mx-2 mb-4 ${i < step ? 'bg-brand' : 'bg-gray-200'}`} />
              )}
            </div>
          ))}
        </nav>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          {step === 0 && (
            <UploadStep onSuccess={(data) => { setSession(data); setStep(1) }} />
          )}
          {step === 1 && (
            <SelectStep
              sessionId={session?.session_id}
              onBack={() => setStep(0)}
            />
          )}
        </div>
      </div>
    </div>
  )
}
