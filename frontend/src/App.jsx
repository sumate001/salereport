import { useState } from 'react'
import UploadStep  from './components/UploadStep'
import SelectStep  from './components/SelectStep'
import Dashboard   from './components/Dashboard'

const TABS = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'report',    label: 'สร้างรายงาน' },
]

export default function App() {
  const [session, setSession] = useState(null)
  const [tab, setTab]         = useState('dashboard')

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-brand text-white shadow">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <h1 className="text-lg font-semibold tracking-wide">Sales Royalty Report Generator</h1>
          {session && (
            <nav className="flex gap-1">
              {TABS.map(t => (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors
                    ${tab === t.id
                      ? 'bg-white text-brand'
                      : 'text-white/70 hover:text-white hover:bg-white/10'}`}
                >
                  {t.label}
                </button>
              ))}
            </nav>
          )}
        </div>
      </header>

      {!session ? (
        <div className="max-w-2xl mx-auto mt-10 px-4">
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <UploadStep onSuccess={(data) => { setSession(data); setTab('dashboard') }} />
          </div>
        </div>
      ) : tab === 'dashboard' ? (
        <Dashboard sessionId={session.session_id} />
      ) : (
        <div className="max-w-2xl mx-auto mt-8 px-4">
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <SelectStep
              sessionId={session.session_id}
              onBack={() => setTab('dashboard')}
            />
          </div>
        </div>
      )}
    </div>
  )
}
