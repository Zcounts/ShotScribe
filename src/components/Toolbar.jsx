import React, { useState, useRef, useEffect } from 'react'
import useStore from '../store'

let mobileExportServicePromise = null

async function getMobileExportService() {
  if (!mobileExportServicePromise) {
    mobileExportServicePromise = import('../services/mobile/mobileExportService.js')
  }
  return mobileExportServicePromise
}

export default function Toolbar({
  onExportPDF,
  onExportPNG,
  cloudExportBlocked = false,
  cloudExportBlockedMessage = '',
}) {
  const projectName = useStore(s => s.projectName)
  const projectEmoji = useStore(s => s.projectEmoji)
  const projectPath = useStore(s => s.projectPath)
  const lastSaved = useStore(s => s.lastSaved)
  const hasUnsavedChanges = useStore(s => s.hasUnsavedChanges)
  const autoSave = useStore(s => s.autoSave)
  const scenes = useStore(s => s.scenes)
  const activeTab = useStore(s => s.activeTab)
  const shotCount = scenes.reduce((acc, s) => acc + s.shots.length, 0)
  const sceneCount = scenes.length
  const saveProject = useStore(s => s.saveProject)
  const saveProjectAs = useStore(s => s.saveProjectAs)
  const openProject = useStore(s => s.openProject)
  const openRecentProject = useStore(s => s.openRecentProject)
  const recentProjects = useStore(s => s.recentProjects)
  const newProject = useStore(s => s.newProject)
  const setProjectName = useStore(s => s.setProjectName)
  const setProjectEmoji = useStore(s => s.setProjectEmoji)
  const [editingName, setEditingName] = useState(false)
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false)
  const [emojiInput, setEmojiInput] = useState('')
  const [exportMenuOpen, setExportMenuOpen] = useState(false)
  const [exportModalOpen, setExportModalOpen] = useState(false)
  const [exportTab, setExportTab] = useState('pdf')
  const [pdfMenuOpen, setPdfMenuOpen] = useState(false)
  const [saveMenuOpen, setSaveMenuOpen] = useState(false)
  const [openMenuOpen, setOpenMenuOpen] = useState(false)
  const [unsavedDialog, setUnsavedDialog] = useState(null) // { action: fn }
  const exportMenuRef = useRef(null)
  const pdfMenuRef = useRef(null)
  const saveMenuRef = useRef(null)
  const openMenuRef = useRef(null)
  const emojiPickerRef = useRef(null)
  const [mobileExportMode, setMobileExportMode] = useState(null) // 'day' | 'snapshot' | null
  const schedule = useStore(s => s.schedule)
  const getProjectData = useStore(s => s.getProjectData)
  const [selectedMobileDayId, setSelectedMobileDayId] = useState('')
  const [snapshotDayIds, setSnapshotDayIds] = useState([])

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

  useEffect(() => {
    if (!exportMenuOpen) return
    const handler = (e) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target)) {
        setExportMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [exportMenuOpen])

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

  useEffect(() => {
    if (!emojiPickerOpen) return
    const handler = (e) => {
      if (emojiPickerRef.current && !emojiPickerRef.current.contains(e.target)) {
        setEmojiPickerOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [emojiPickerOpen])

  useEffect(() => {
    if (!schedule.length) {
      setSelectedMobileDayId('')
      setSnapshotDayIds([])
      return
    }
    if (!selectedMobileDayId || !schedule.some(day => day.id === selectedMobileDayId)) {
      setSelectedMobileDayId(schedule[0].id)
    }
    if (!snapshotDayIds.length) {
      setSnapshotDayIds(schedule.slice(0, 3).map(day => day.id))
    }
  }, [schedule, selectedMobileDayId, snapshotDayIds])

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
      : activeTab === 'callsheet'
        ? 'Callsheet'
        : 'Storyboard'
  const emojiChoices = ['🎬', '🎥', '🎞️', '📋', '🗓️', '🎭', '🎤', '🎯']
  const openExportModal = (tab = 'pdf') => {
    if (cloudExportBlocked) {
      alert(cloudExportBlockedMessage || 'Cloud project export is unavailable while billing is inactive. Local-only projects can still be exported.')
      return
    }
    setExportTab(tab)
    setExportModalOpen(true)
    setExportMenuOpen(false)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
      <div className="toolbar">
      {/* Left: Project name */}
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <div ref={emojiPickerRef} style={{ position: 'relative', flexShrink: 0 }}>
          <button
            onClick={() => {
              setEmojiInput(projectEmoji || '')
              setEmojiPickerOpen(o => !o)
            }}
            title="Choose project emoji"
            style={{
              width: 24,
              height: 24,
              borderRadius: 6,
              border: '1px solid rgba(255,255,255,0.18)',
              background: 'rgba(255,255,255,0.05)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              fontSize: 15,
              lineHeight: 1,
              padding: 0,
            }}
          >
            {projectEmoji || '🎬'}
          </button>
          {emojiPickerOpen && (
            <div style={{
              position: 'absolute',
              top: 'calc(100% + 6px)',
              left: 0,
              zIndex: 200,
              width: 188,
              background: '#FAF8F4',
              border: '1px solid rgba(74,85,104,0.2)',
              borderRadius: 8,
              boxShadow: '0 10px 26px rgba(0,0,0,0.18)',
              padding: 8,
            }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, marginBottom: 8 }}>
                {emojiChoices.map(emoji => (
                  <button
                    key={emoji}
                    onClick={() => {
                      setProjectEmoji(emoji)
                      setEmojiPickerOpen(false)
                    }}
                    style={{
                      border: '1px solid rgba(74,85,104,0.2)',
                      borderRadius: 6,
                      background: '#fff',
                      cursor: 'pointer',
                      fontSize: 16,
                      lineHeight: 1,
                      padding: '6px 0',
                    }}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
              <input
                value={emojiInput}
                onChange={(e) => setEmojiInput(e.target.value)}
                placeholder="Any emoji"
                maxLength={3}
                style={{
                  width: '100%',
                  fontSize: 12,
                  border: '1px solid rgba(74,85,104,0.2)',
                  borderRadius: 6,
                  padding: '6px 8px',
                  marginBottom: 6,
                  outline: 'none',
                }}
              />
              <button
                className="toolbar-btn"
                onClick={() => {
                  const val = emojiInput.trim()
                  if (val) setProjectEmoji(val)
                  setEmojiPickerOpen(false)
                }}
                style={{ width: '100%', justifyContent: 'center' }}
              >
                Set Emoji
              </button>
            </div>
          )}
        </div>

        {editingName ? (
          <input
            type="text"
            value={projectName}
            onChange={e => setProjectName(e.target.value)}
            onBlur={() => setEditingName(false)}
            onKeyDown={e => { if (e.key === 'Enter') setEditingName(false) }}
            style={{
              background: '#2C2C2E',
              border: '1px solid #3A3A3C',
              borderRadius: 4,
              padding: '2px 8px',
              fontSize: 13,
              fontFamily: 'Sora, sans-serif',
              fontWeight: 800,
              color: '#FAF8F4',
              outline: 'none',
            }}
            autoFocus
          />
        ) : (
          <button
            onClick={() => setEditingName(true)}
            style={{
              fontSize: 13,
              fontFamily: 'Sora, sans-serif',
              fontWeight: 800,
              color: '#FAF8F4',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: 0,
              letterSpacing: '0.01em',
              transition: 'color 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.color = '#EDE9E1' }}
            onMouseLeave={e => { e.currentTarget.style.color = '#FAF8F4' }}
          >
            {projectName}
          </button>
        )}

        {/* Shot / scene count */}
        <span style={{ fontSize: 11, color: '#718096', flexShrink: 0, fontFamily: 'Sora, sans-serif' }}>
          {shotCount} shot{shotCount !== 1 ? 's' : ''} · {sceneCount} scene{sceneCount !== 1 ? 's' : ''}
        </span>

        {/* Current file name */}
        {fileName && (
          <span style={{ fontSize: 11, color: '#4A5568', flexShrink: 0, fontFamily: 'monospace' }} title={projectPath}>
            {fileName}
          </span>
        )}

        {/* Save indicator */}
        {lastSaved && (
          <span style={{ fontSize: 11, color: '#4A5568', flexShrink: 0, fontFamily: 'Sora, sans-serif' }}>
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
                    guardUnsaved(() => openRecentProject(project))
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

      {/* Right: Export */}
      <div className="flex items-center gap-2">
        <div ref={exportMenuRef} style={{ position: 'relative', display: 'flex' }}>
          <button
            className="toolbar-btn"
            onClick={() => openExportModal('pdf')}
            title={cloudExportBlocked ? (cloudExportBlockedMessage || 'Cloud exports are blocked while billing is inactive') : 'Open export options'}
            disabled={cloudExportBlocked}
            style={{
              borderRadius: '4px 0 0 4px',
              borderRight: 'none',
              paddingRight: 8,
              opacity: cloudExportBlocked ? 0.6 : 1,
              cursor: cloudExportBlocked ? 'not-allowed' : 'pointer',
            }}
          >
            EXPORT
          </button>
          <button
            className="toolbar-btn"
            onClick={() => {
              if (cloudExportBlocked) {
                alert(cloudExportBlockedMessage || 'Cloud project export is unavailable while billing is inactive. Local-only projects can still be exported.')
                return
              }
              setExportMenuOpen(o => !o)
            }}
            title={cloudExportBlocked ? (cloudExportBlockedMessage || 'Cloud exports are blocked while billing is inactive') : 'Choose export type'}
            disabled={cloudExportBlocked}
            style={{
              borderRadius: '0 4px 4px 0',
              borderLeft: '1px solid rgba(255,255,255,0.15)',
              padding: '4px 6px',
              fontSize: 9,
            }}
          >
            ▾
          </button>

          {exportMenuOpen && (
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
                onClick={() => openExportModal('pdf')}
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
                PDF
              </button>
              <button
                onClick={() => openExportModal('png')}
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
                PNG
              </button>
              <button
                onClick={() => openExportModal('mobile')}
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
                Mobile
              </button>
            </div>
          )}
        </div>
      </div>
      {cloudExportBlocked && (
        <div style={{ color: '#fbbf24', fontSize: 11, marginTop: 6, textAlign: 'right' }}>
          Cloud project export is disabled while billing is inactive. Local-only export still works.
        </div>
      )}

      {exportModalOpen && (
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
          onClick={() => setExportModalOpen(false)}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: '#1e1e1e',
              border: '1px solid rgba(255,255,255,0.15)',
              borderRadius: 8,
              padding: '18px 20px',
              maxWidth: 520,
              width: '100%',
            }}
          >
            <h3 style={{ margin: 0, color: '#FAF8F4', fontSize: 16 }}>Export</h3>
            <div style={{ display: 'flex', gap: 8, marginTop: 12, marginBottom: 14 }}>
              {['pdf', 'png', 'mobile'].map(tab => (
                <button
                  key={tab}
                  className="toolbar-btn"
                  onClick={() => setExportTab(tab)}
                  style={exportTab === tab ? { background: '#E84040', borderColor: '#E84040', color: '#fff' } : {}}
                >
                  {tab === 'pdf' ? 'PDF' : tab === 'png' ? 'PNG' : 'Mobile'}
                </button>
              ))}
            </div>

            {exportTab === 'pdf' && (
              <div ref={pdfMenuRef} style={{ position: 'relative' }}>
                <div style={{ display: 'flex', marginBottom: 10 }}>
                  <button
                    className="toolbar-btn"
                    onClick={handlePdfMain}
                    title={`Export ${tabPdfLabel} PDF`}
                    style={{ borderRadius: '4px 0 0 4px', borderRight: 'none', paddingRight: 8 }}
                  >
                    Export {tabPdfLabel} PDF
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
                </div>

                {pdfMenuOpen && (
                  <div style={{
                    position: 'absolute',
                    top: 'calc(100% - 6px)',
                    left: 0,
                    zIndex: 500,
                    background: '#2a2a2a',
                    border: '1px solid rgba(255,255,255,0.15)',
                    borderRadius: 4,
                    boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
                    minWidth: 220,
                    overflow: 'hidden',
                  }}>
                    <button
                      onClick={() => handlePdfExplicit('storyboard')}
                      style={{ display: 'block', width: '100%', padding: '8px 14px', textAlign: 'left', background: 'none', border: 'none', color: '#e0e0e0', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}
                      onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.1)' }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'none' }}
                    >
                      Export Storyboard PDF
                    </button>
                    <button
                      onClick={() => handlePdfExplicit('shotlist')}
                      style={{ display: 'block', width: '100%', padding: '8px 14px', textAlign: 'left', background: 'none', border: 'none', borderTop: '1px solid rgba(255,255,255,0.08)', color: '#e0e0e0', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}
                      onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.1)' }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'none' }}
                    >
                      Export Shotlist PDF
                    </button>
                    <button
                      onClick={() => handlePdfExplicit('schedule')}
                      style={{ display: 'block', width: '100%', padding: '8px 14px', textAlign: 'left', background: 'none', border: 'none', borderTop: '1px solid rgba(255,255,255,0.08)', color: '#e0e0e0', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}
                      onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.1)' }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'none' }}
                    >
                      Export Schedule PDF
                    </button>
                    <button
                      onClick={() => handlePdfExplicit('callsheet')}
                      style={{ display: 'block', width: '100%', padding: '8px 14px', textAlign: 'left', background: 'none', border: 'none', borderTop: '1px solid rgba(255,255,255,0.08)', color: '#e0e0e0', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}
                      onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.1)' }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'none' }}
                    >
                      Export Callsheet PDF
                    </button>
                    <button
                      onClick={() => handlePdfExplicit('all')}
                      style={{ display: 'block', width: '100%', padding: '8px 14px', textAlign: 'left', background: 'none', border: 'none', borderTop: '2px solid rgba(255,255,255,0.15)', color: '#93c5fd', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600 }}
                      onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.1)' }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'none' }}
                    >
                      Export All…
                    </button>
                  </div>
                )}
              </div>
            )}

            {exportTab === 'png' && (
              <button className="toolbar-btn" onClick={onExportPNG} title="Export Storyboard to PNG">
                Export PNG
              </button>
            )}

            {exportTab === 'mobile' && (
              <div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    className="toolbar-btn"
                    onClick={() => {
                      if (!schedule.length) {
                        alert('Add at least one shooting day in the Schedule tab before exporting.')
                        return
                      }
                      setMobileExportMode('day')
                    }}
                  >
                    Export Shoot Day Package…
                  </button>
                  <button
                    className="toolbar-btn"
                    onClick={() => {
                      if (!schedule.length) {
                        alert('Add at least one shooting day in the Schedule tab before exporting.')
                        return
                      }
                      setMobileExportMode('snapshot')
                    }}
                  >
                    Export Project Snapshot…
                  </button>
                </div>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}>
              <button className="toolbar-btn" onClick={() => setExportModalOpen(false)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Unsaved changes dialog */}
      {mobileExportMode && (
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
          onClick={() => setMobileExportMode(null)}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: '#1e1e1e',
              border: '1px solid rgba(255,255,255,0.15)',
              borderRadius: 8,
              padding: '18px 20px',
              maxWidth: 460,
              width: '100%',
            }}
          >
            <h3 style={{ margin: 0, color: '#FAF8F4', fontSize: 16 }}>
              {mobileExportMode === 'day' ? 'Export Mobile Day Package' : 'Export Mobile Snapshot'}
            </h3>
            <p style={{ marginTop: 8, marginBottom: 14, color: '#a0aec0', fontSize: 12 }}>
              {mobileExportMode === 'day'
                ? 'Choose one shoot day and export a valid mobile-day-package JSON file.'
                : 'Choose one or more shoot days and export a valid mobile-snapshot JSON file.'}
            </p>

            {mobileExportMode === 'day' ? (
              <select
                value={selectedMobileDayId}
                onChange={e => setSelectedMobileDayId(e.target.value)}
                style={{ width: '100%', marginBottom: 12, padding: 8, borderRadius: 4, background: '#2a2a2a', color: '#e0e0e0', border: '1px solid #444' }}
              >
                {schedule.map((day, idx) => (
                  <option key={day.id} value={day.id}>
                    Day {idx + 1} · {day.date || 'No date'}
                  </option>
                ))}
              </select>
            ) : (
              <div style={{ maxHeight: 220, overflowY: 'auto', border: '1px solid #333', borderRadius: 4, padding: 8, marginBottom: 12 }}>
                {schedule.map((day, idx) => (
                  <label key={day.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, color: '#e2e8f0', fontSize: 12 }}>
                    <input
                      type="checkbox"
                      checked={snapshotDayIds.includes(day.id)}
                      onChange={e => {
                        setSnapshotDayIds(prev => e.target.checked
                          ? [...new Set([...prev, day.id])]
                          : prev.filter(id => id !== day.id))
                      }}
                    />
                    Day {idx + 1} · {day.date || 'No date'}
                  </label>
                ))}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button className="toolbar-btn" onClick={() => setMobileExportMode(null)}>Cancel</button>
              <button
                className="toolbar-btn primary"
                onClick={async () => {
                  const projectData = getProjectData()
                  try {
                    const { exportMobilePackageFromProject } = await getMobileExportService()
                    if (mobileExportMode === 'day') {
                      if (!selectedMobileDayId) {
                        alert('Please select a shoot day to export.')
                        return
                      }
                      await exportMobilePackageFromProject(projectData, {
                        mode: 'day',
                        dayId: selectedMobileDayId,
                      })
                    } else {
                      if (!snapshotDayIds.length) {
                        alert('Select at least one shoot day for the snapshot export.')
                        return
                      }
                      await exportMobilePackageFromProject(projectData, {
                        mode: 'snapshot',
                        dayIds: snapshotDayIds,
                      })
                    }
                    setMobileExportMode(null)
                  } catch (err) {
                    alert(`Mobile export failed: ${err?.message || err}`)
                  }
                }}
              >
                Export
              </button>
            </div>
          </div>
        </div>
      )}

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
                  background: '#E84040', border: 'none',
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
    </div>
  )
}
