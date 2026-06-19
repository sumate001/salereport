import { useState, useEffect, useCallback } from 'react'
import UploadPanel      from './components/UploadPanel'
import GeneratePanel    from './components/GeneratePanel'
import ResultsPanel     from './components/ResultsPanel'
import HistoryPanel     from './components/HistoryPanel'
import LegacyImportPanel from './components/LegacyImportPanel'
import MergePanel       from './components/MergePanel'

export default function App() {
  const [activeTab,        setActiveTab]        = useState('report')  // 'report' | 'legacy'
  const [activeDataset,    setActiveDataset]    = useState(null)
  const [datasets,         setDatasets]         = useState([])
  const [currentReports,   setCurrentReports]   = useState([])
  const [currentErrors,    setCurrentErrors]    = useState([])
  const [currentDashboard, setCurrentDashboard] = useState(null)
  const [historyKey,       setHistoryKey]       = useState(0)

  const fetchDatasets = useCallback(async () => {
    const r = await fetch('/api/datasets')
    const d = await r.json()
    const list = d.datasets || []
    setDatasets(list)
    return list
  }, [])

  useEffect(() => {
    fetchDatasets().then(list => {
      if (list.length > 0) setActiveDataset(list[0])
    })
  }, [fetchDatasets])

  const handleDatasetUploaded = async (ds) => {
    const list = await fetchDatasets()
    const freshDs = list.find(d => d.id === (ds.dataset_id || ds.id)) || list[0] || null
    setActiveDataset(freshDs)
    setCurrentReports([])
    setCurrentDashboard(null)
    setHistoryKey(k => k + 1)
  }

  const handleDatasetSelect = (ds) => {
    setActiveDataset(ds)
    setCurrentReports([])
    setCurrentDashboard(null)
  }

  const handleDatasetDeleted = async (id) => {
    const list = await fetchDatasets()
    if (activeDataset?.id === id) {
      setActiveDataset(list[0] || null)
      setCurrentReports([])
      setCurrentDashboard(null)
    }
    setHistoryKey(k => k + 1)
  }

  const handleLabelUpdated = async () => {
    const list = await fetchDatasets()
    if (activeDataset) {
      const updated = list.find(d => d.id === activeDataset.id)
      if (updated) setActiveDataset(updated)
    }
  }

  const handleGenerationStart = () => {
    setCurrentReports([])
    setCurrentErrors([])
    setCurrentDashboard(null)
  }

  const handleReportGenerated = (report) => {
    setCurrentReports(prev => [...prev, report])
    setHistoryKey(k => k + 1)
  }

  const handleReportError = (err) => {
    setCurrentErrors(prev => [...prev, err])
  }

  const handleDashboardGenerated = (dash) => {
    setCurrentDashboard(dash)
    setHistoryKey(k => k + 1)
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-brand text-white shadow">
        <div className="max-w-[1400px] mx-auto px-6 py-4 flex items-center justify-between">
          <h1 className="text-lg font-semibold tracking-wide">Sales Royalty Report Generator</h1>
          {/* Tab switcher */}
          <div className="flex gap-1 bg-white/20 rounded-lg p-1">
            <button
              onClick={() => setActiveTab('report')}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors
                ${activeTab === 'report'
                  ? 'bg-white text-brand shadow-sm'
                  : 'text-white/80 hover:text-white'}`}
            >
              📊 สร้าง Report
            </button>
            <button
              onClick={() => setActiveTab('legacy')}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors
                ${activeTab === 'legacy'
                  ? 'bg-white text-amber-700 shadow-sm'
                  : 'text-white/80 hover:text-white'}`}
            >
              📂 ข้อมูลย้อนหลัง
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-[1400px] mx-auto px-4 py-5 space-y-5">

        {/* ── Tab: สร้าง Report (เดิม) ── */}
        {activeTab === 'report' && (
          <>
            <div className="grid gap-4" style={{ gridTemplateColumns: '260px 1fr 1fr 1fr', alignItems: 'start' }}>
              <UploadPanel
                datasets={datasets}
                activeDataset={activeDataset}
                onUploaded={handleDatasetUploaded}
                onSelect={handleDatasetSelect}
                onDeleted={handleDatasetDeleted}
                onLabelUpdated={handleLabelUpdated}
              />
              <GeneratePanel
                activeDataset={activeDataset}
                onGenerationStart={handleGenerationStart}
                onReportGenerated={handleReportGenerated}
                onReportError={handleReportError}
                onDashboardGenerated={handleDashboardGenerated}
              />
              <ResultsPanel
                reports={currentReports}
                errors={currentErrors}
                dashboard={currentDashboard}
              />
              <MergePanel latestReports={currentReports} />
            </div>
            <HistoryPanel
              key={historyKey}
              datasets={datasets}
              onDatasetDeleted={handleDatasetDeleted}
              onLabelUpdated={handleLabelUpdated}
            />
          </>
        )}

        {/* ── Tab: ข้อมูลย้อนหลัง (ใหม่) ── */}
        {activeTab === 'legacy' && (
          <div className="max-w-2xl mx-auto">
            <LegacyImportPanel />
          </div>
        )}

      </main>
    </div>
  )
}
