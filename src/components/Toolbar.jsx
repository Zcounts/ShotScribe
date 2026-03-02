import React, { useState, useRef, useEffect } from 'react'
import useStore from '../store'

export default function Toolbar({ onExportPDF, onExportPNG }) {
  const projectName = useStore(s => s.projectName)
  const lastSaved = useStore(s => s.lastSaved)
  const autoSave = useStore(s => s.autoSave)
  const scenes = useStore(s => s.scenes)
  const activeTab = useStore(s => s.activeTab)
  const shotCount = scenes.reduce((acc, s) => acc + s.shots.length, 0)
  const sceneCount = scenes.length
  const toggleSettings = useStore(s => s.toggleSettings)
  const saveProject = useStore(s => s.saveProject)
  const openProject = useStore(s => s.openProject)
  const newProject = useStore(s => s.newProject)
  const setProjectName = useStore(s => s.setProjectName)
  const [editingName, setEditingName] = useState(false)
  const [pdfMenuOpen, setPdfMenuOpen] = useState(false)
  const pdfMenuRef = useRef(null)

  const formatTime = (iso) => {
    if (!iso) return ''
    const d = new Date(iso)
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  // Close PDF menu when clicking outside it
  useEffect(() => {
    if (!pdfMenuOpen) return
    const handler = (e) => {
      if (pdfMenuRef.current && !pdfMenuRef.current.contains(e.target)) {
        setPdfMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [pdfMenuOpen])

  // The main PDF button always exports based on the current active tab.
  // The chevron opens a menu for explicit storyboard/shotlist/schedule choice.
  const handlePdfMain = () => {
    setPdfMenuOpen(false)
    onExportPDF(activeTab)
  }

  const handlePdfExplicit = (tab) => {
    setPdfMenuOpen(false)
    onExportPDF(tab)
  }

  const tabPdfLabel = activeTab === 'shotlist'
    ? 'Shotlist'
    : activeTab === 'schedule'
      ? 'Schedule'
      : 'Storyboard'

  return (
    <div className="toolbar">
      {/* Left: Project name */}
      <div className="flex items-center gap-3 flex-1 min-w-0">
        {/* App icon */}
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" className="flex-shrink-0">
          <rect x="2" y="2" width="16" height="16" rx="2" fill="#3b82f6" />
          <rect x="4" y="5" width="5" height="4" rx="1" fill="white" />
          <rect x="11" y="5" width="5" height="4" rx="1" fill="white" />
          <rect x="4" y="11" width="5" height="4" rx="1" fill="white" />
          <rect x="11" y="11" width="5" height="4" rx="1" fill="white" />
        </svg>

        {editingName ? (
          <input
            type="text"
            value={projectName}
            onChange={e => setProjectName(e.target.value)}
            onBlur={() => setEditingName(false)}
            onKeyDown={e => { if (e.key === 'Enter') setEditingName(false) }}
            className="bg-gray-700 border border-gray-500 rounded px-2 py-0.5 text-sm text-white outline-none"
            autoFocus
          />
        ) : (
          <button
            onClick={() => setEditingName(true)}
            className="text-sm font-semibold text-white hover:text-gray-300 transition-colors truncate"
          >
            {projectName}
          </button>
        )}

        {/* Shot / scene count */}
        <span className="text-xs text-gray-400 flex-shrink-0">
          {shotCount} shot{shotCount !== 1 ? 's' : ''} · {sceneCount} scene{sceneCount !== 1 ? 's' : ''}
        </span>

        {/* Auto-save indicator */}
        {autoSave && lastSaved && (
          <span className="text-xs text-gray-500 flex-shrink-0">
            Saved {formatTime(lastSaved)}
          </span>
        )}
      </div>

      {/* Center: File operations */}
      <div className="flex items-center gap-2">
        <button className="toolbar-btn" onClick={newProject} title="New project">
          New
        </button>
        <button className="toolbar-btn" onClick={openProject} title="Open .shotlist file">
          Open
        </button>
        <button className="toolbar-btn primary" onClick={saveProject} title="Save as .shotlist file">
          Save
        </button>
      </div>

      {/* Right: Export + Settings */}
      <div className="flex items-center gap-2">

        {/* Split PDF button: left half exports for the active tab, right half opens a choice menu */}
        <div ref={pdfMenuRef} style={{ position: 'relative', display: 'flex' }}>
          <button
            className="toolbar-btn"
            onClick={handlePdfMain}
            title={`Export ${tabPdfLabel} PDF`}
            style={{ borderRadius: '4px 0 0 4px', borderRight: 'none', paddingRight: 8 }}
          >
            PDF
          </button>
          <button
            className="toolbar-btn"
            onClick={() => setPdfMenuOpen(o => !o)}
            title="Choose PDF export type"
            style={{
              borderRadius: '0 4px 4px 0',
              borderLeft: '1px solid rgba(255,255,255,0.15)',
              padding: '4px 6px',
              fontSize: 9,
            }}
          >
            ▾
          </button>

          {pdfMenuOpen && (
            <div style={{
              position: 'absolute',
              top: 'calc(100% + 4px)',
              right: 0,
              zIndex: 500,
              background: '#2a2a2a',
              border: '1px solid rgba(255,255,255,0.15)',
              borderRadius: 4,
              boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
              minWidth: 180,
              overflow: 'hidden',
            }}>
              <button
                onClick={() => handlePdfExplicit('storyboard')}
                style={{
                  display: 'block',
                  width: '100%',
                  padding: '8px 14px',
                  textAlign: 'left',
                  background: 'none',
                  border: 'none',
                  color: '#e0e0e0',
                  fontSize: 12,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.1)' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'none' }}
              >
                Export Storyboard PDF
              </button>
              <button
                onClick={() => handlePdfExplicit('shotlist')}
                style={{
                  display: 'block',
                  width: '100%',
                  padding: '8px 14px',
                  textAlign: 'left',
                  background: 'none',
                  border: 'none',
                  borderTop: '1px solid rgba(255,255,255,0.08)',
                  color: '#e0e0e0',
                  fontSize: 12,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.1)' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'none' }}
              >
                Export Shotlist PDF
              </button>
              <button
                onClick={() => handlePdfExplicit('schedule')}
                style={{
                  display: 'block',
                  width: '100%',
                  padding: '8px 14px',
                  textAlign: 'left',
                  background: 'none',
                  border: 'none',
                  borderTop: '1px solid rgba(255,255,255,0.08)',
                  color: '#e0e0e0',
                  fontSize: 12,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.1)' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'none' }}
              >
                Export Schedule PDF
              </button>
            </div>
          )}
        </div>

        <button className="toolbar-btn" onClick={onExportPNG} title="Export Storyboard to PNG">
          PNG
        </button>
        <button className="toolbar-btn" onClick={toggleSettings} title="Settings">
          <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="10" cy="10" r="3" />
            <path d="M10 2v2M10 16v2M2 10h2M16 10h2M4.9 4.9l1.4 1.4M13.7 13.7l1.4 1.4M4.9 15.1l1.4-1.4M13.7 6.3l1.4-1.4" />
          </svg>
        </button>
      </div>
    </div>
  )
}
