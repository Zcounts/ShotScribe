import React, { useState, useRef, useEffect } from 'react'
import useStore from '../store'

export default function Toolbar({ onExportPDF, onExportPNG }) {
  const projectName = useStore(s => s.projectName)
  const projectPath = useStore(s => s.projectPath)
  const lastSaved = useStore(s => s.lastSaved)
  const hasUnsavedChanges = useStore(s => s.hasUnsavedChanges)
  const autoSave = useStore(s => s.autoSave)
  const scenes = useStore(s => s.scenes)
  const activeTab = useStore(s => s.activeTab)
  const shotCount = scenes.reduce((acc, s) => acc + s.shots.length, 0)
  const sceneCount = scenes.length
  const toggleSettings = useStore(s => s.toggleSettings)
  const saveProject = useStore(s => s.saveProject)
  const saveProjectAs = useStore(s => s.saveProjectAs)
  const openProject = useStore(s => s.openProject)
  const openProjectFromPath = useStore(s => s.openProjectFromPath)
  const recentProjects = useStore(s => s.recentProjects)
  const newProject = useStore(s => s.newProject)
  const setProjectName = useStore(s => s.setProjectName)
  const [editingName, setEditingName] = useState(false)
  const [pdfMenuOpen, setPdfMenuOpen] = useState(false)
  const [saveMenuOpen, setSaveMenuOpen] = useState(false)
  const [openMenuOpen, setOpenMenuOpen] = useState(false)
  const [unsavedDialog, setUnsavedDialog] = useState(null) // { action: fn }
  const pdfMenuRef = useRef(null)
  const saveMenuRef = useRef(null)
  const openMenuRef = useRef(null)

  // Extract just the filename from the full path for display
  const fileName = projectPath ? projectPath.split(/[\\/]/).pop() : null

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

  // Close Save menu when clicking outside it
  useEffect(() => {
    if (!saveMenuOpen) return
    const handler = (e) => {
      if (saveMenuRef.current && !saveMenuRef.current.contains(e.target)) {
        setSaveMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [saveMenuOpen])

  // Close Open menu when clicking outside it
  useEffect(() => {
    if (!openMenuOpen) return
    const handler = (e) => {
      if (openMenuRef.current && !openMenuRef.current.contains(e.target)) {
        setOpenMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [openMenuOpen])

  // Guard that shows unsaved-changes dialog before running an action
  const guardUnsaved = (action) => {
    if (hasUnsavedChanges) {
      setUnsavedDialog({ action })
    } else {
      action()
    }
  }

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

        {/* Current file name */}
        {fileName && (
          <span className="text-xs text-gray-500 flex-shrink-0" title={projectPath}>
            {fileName}
          </span>
        )}

        {/* Save indicator */}
        {lastSaved && (
          <span className="text-xs text-gray-500 flex-shrink-0">
            Saved {formatTime(lastSaved)}
          </span>
        )}
      </div>

      {/* Center: File operations */}
      <div className="flex items-center gap-2">
        <button className="toolbar-btn" onClick={() => guardUnsaved(newProject)} title="New project">
          New
        </button>
        {/* Split Open button: left half opens file browser, right half shows recent projects */}
        <div ref={openMenuRef} style={{ position: 'relative', display: 'flex' }}>
          <button
            className="toolbar-btn"
            onClick={() => guardUnsaved(openProject)}
            title="Open .shotlist file"
            style={recentProjects.length > 0 ? { borderRadius: '4px 0 0 4px', borderRight: 'none', paddingRight: 8 } : {}}
          >
            Open
          </button>
          {recentProjects.length > 0 && (
            <button
              className="toolbar-btn"
              onClick={() => setOpenMenuOpen(o => !o)}
              title="Recent projects"
              style={{
                borderRadius: '0 4px 4px 0',
                borderLeft: '1px solid rgba(255,255,255,0.15)',
                padding: '4px 6px',
                fontSize: 9,
              }}
            >
              ▾
            </button>
          )}

          {openMenuOpen && (
            <div style={{
              position: 'absolute',
              top: 'calc(100% + 4px)',
              left: 0,
              zIndex: 500,
              background: '#2a2a2a',
              border: '1px solid rgba(255,255,255,0.15)',
              borderRadius: 4,
              boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
              minWidth: 220,
              overflow: 'hidden',
            }}>
              <div style={{
                padding: '5px 14px 4px',
                fontSize: 9,
                fontFamily: 'monospace',
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: 'rgba(255,255,255,0.35)',
                borderBottom: '1px solid rgba(255,255,255,0.08)',
              }}>
                Recent Projects
              </div>
              {recentProjects.slice(0, 10).map((project, i) => (
                <button
                  key={i}
                  onClick={() => {
                    setOpenMenuOpen(false)
                    if (window.electronAPI && project.path && project.path !== project.name) {
                      guardUnsaved(() => openProjectFromPath(project.path))
                    } else {
                      guardUnsaved(openProject)
                    }
                  }}
                  title={`${project.shots} shots — ${new Date(project.date).toLocaleDateString()}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    width: '100%',
                    padding: '7px 14px',
                    textAlign: 'left',
                    background: 'none',
                    border: 'none',
                    borderTop: i > 0 ? '1px solid rgba(255,255,255,0.06)' : 'none',
                    color: '#e0e0e0',
                    fontSize: 12,
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    overflow: 'hidden',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.1)' }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'none' }}
                >
                  <svg width="10" height="10" viewBox="0 0 20 20" fill="rgba(255,255,255,0.4)" style={{ flexShrink: 0 }}>
                    <path d="M3 4a1 1 0 011-1h5.586a1 1 0 01.707.293l5.414 5.414A1 1 0 0116 9.414V17a1 1 0 01-1 1H4a1 1 0 01-1-1V4z" />
                  </svg>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {project.name}
                  </span>
                  <span style={{ marginLeft: 'auto', fontSize: 10, color: 'rgba(255,255,255,0.3)', flexShrink: 0, paddingLeft: 8 }}>
                    {project.shots} shots
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
        {/* Split Save button: left half saves (silent if path known), right half opens Save As menu */}
        <div ref={saveMenuRef} style={{ position: 'relative', display: 'flex' }}>
          <button
            className="toolbar-btn primary"
            onClick={saveProject}
            title={projectPath ? `Save to ${fileName}` : 'Save project (choose location)'}
            style={{ borderRadius: '4px 0 0 4px', borderRight: 'none', paddingRight: 8 }}
          >
            Save
          </button>
          <button
            className="toolbar-btn primary"
            onClick={() => setSaveMenuOpen(o => !o)}
            title="More save options"
            style={{
              borderRadius: '0 4px 4px 0',
              borderLeft: '1px solid rgba(255,255,255,0.2)',
              padding: '4px 6px',
              fontSize: 9,
            }}
          >
            ▾
          </button>

          {saveMenuOpen && (
            <div style={{
              position: 'absolute',
              top: 'calc(100% + 4px)',
              right: 0,
              zIndex: 500,
              background: '#2a2a2a',
              border: '1px solid rgba(255,255,255,0.15)',
              borderRadius: 4,
              boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
              minWidth: 160,
              overflow: 'hidden',
            }}>
              <button
                onClick={() => { setSaveMenuOpen(false); saveProjectAs() }}
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
                Save As…
              </button>
            </div>
          )}
        </div>
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

      {/* Unsaved changes dialog */}
      {unsavedDialog && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.55)',
            zIndex: 9000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          onClick={() => setUnsavedDialog(null)}
        >
          <div
            style={{
              background: '#1e1e1e',
              border: '1px solid rgba(255,255,255,0.15)',
              borderRadius: 8,
              padding: '24px 28px',
              maxWidth: 360,
              width: '100%',
              boxShadow: '0 12px 40px rgba(0,0,0,0.6)',
            }}
            onClick={e => e.stopPropagation()}
          >
            <p style={{ fontSize: 14, fontWeight: 600, color: '#e0e0e0', margin: '0 0 6px', fontFamily: 'inherit' }}>
              Unsaved Changes
            </p>
            <p style={{ fontSize: 12, color: '#aaa', margin: '0 0 20px', fontFamily: 'inherit', lineHeight: 1.5 }}>
              You have unsaved changes. Do you want to save before continuing?
            </p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setUnsavedDialog(null)}
                style={{
                  padding: '7px 14px', fontSize: 12, fontFamily: 'inherit',
                  background: 'none', border: '1px solid rgba(255,255,255,0.2)',
                  borderRadius: 4, color: '#aaa', cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  const action = unsavedDialog.action
                  setUnsavedDialog(null)
                  action()
                }}
                style={{
                  padding: '7px 14px', fontSize: 12, fontFamily: 'inherit',
                  background: 'none', border: '1px solid rgba(255,255,255,0.2)',
                  borderRadius: 4, color: '#f87171', cursor: 'pointer',
                }}
              >
                Discard Changes
              </button>
              <button
                onClick={async () => {
                  const action = unsavedDialog.action
                  setUnsavedDialog(null)
                  await saveProject()
                  action()
                }}
                style={{
                  padding: '7px 14px', fontSize: 12, fontFamily: 'inherit',
                  background: '#3b82f6', border: 'none',
                  borderRadius: 4, color: '#fff', cursor: 'pointer', fontWeight: 600,
                }}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
