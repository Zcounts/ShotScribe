import React, { useState, useRef, useEffect } from 'react'
import useStore from '../store'
import SaveSyncStatusControl from './SaveSyncStatusControl'

export default function Toolbar({
  onOpenExportHub,
  cloudAccessPolicy = {},
  cloudExportBlocked = false,
  cloudExportBlockedMessage = '',
}) {
  const projectName = useStore(s => s.projectName)
  const projectEmoji = useStore(s => s.projectEmoji)
  const projectPath = useStore(s => s.projectPath)
  const hasUnsavedChanges = useStore(s => s.hasUnsavedChanges)
  const autoSave = useStore(s => s.autoSave)
  const scenes = useStore(s => s.scenes)
  const activeTab = useStore(s => s.activeTab)
  const shotCount = scenes.reduce((acc, s) => acc + s.shots.length, 0)
  const sceneCount = scenes.length
  const saveProject = useStore(s => s.saveProject)
  const saveProjectAs = useStore(s => s.saveProjectAs)
  const flushCloudSync = useStore(s => s.flushCloudSync)
  const createCloudProjectFromLocal = useStore(s => s.createCloudProjectFromLocal)
  const disableCloudBackupForCurrentProject = useStore(s => s.disableCloudBackupForCurrentProject)
  const openProject = useStore(s => s.openProject)
  const openRecentProject = useStore(s => s.openRecentProject)
  const recentProjects = useStore(s => s.recentProjects)
  const newProject = useStore(s => s.newProject)
  const setProjectName = useStore(s => s.setProjectName)
  const setProjectEmoji = useStore(s => s.setProjectEmoji)
  const projectRef = useStore(s => s.projectRef)
  const cloudSyncContext = useStore(s => s.cloudSyncContext)
  const saveSyncState = useStore(s => s.saveSyncState)
  const cloudRepositoryReady = useStore(s => s.cloudRepositoryReady)
  const [editingName, setEditingName] = useState(false)
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false)
  const [emojiInput, setEmojiInput] = useState('')
  const [exportMenuOpen, setExportMenuOpen] = useState(false)
  const [saveMenuOpen, setSaveMenuOpen] = useState(false)
  const [openMenuOpen, setOpenMenuOpen] = useState(false)
  const [unsavedDialog, setUnsavedDialog] = useState(null) // { action: fn }
  const [saveActionBusy, setSaveActionBusy] = useState(false)
  const exportMenuRef = useRef(null)
  const saveMenuRef = useRef(null)
  const openMenuRef = useRef(null)
  const emojiPickerRef = useRef(null)

  // Extract just the filename from the full path for display
  const fileName = projectPath ? projectPath.split(/[\\/]/).pop() : null
  const isCloudProject = projectRef?.type === 'cloud'
  const cloudFeatureAvailable = !!cloudAccessPolicy?.paidCloudAccess
  const signedInForCloud = !!cloudSyncContext?.currentUserId
  const canEnableCloudBackup = !isCloudProject && cloudFeatureAvailable && signedInForCloud && cloudRepositoryReady
  const canSaveCloudNow = isCloudProject && cloudAccessPolicy?.canEditCloudProject
  const canDisableCloudBackup = isCloudProject


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

  // Guard that shows unsaved-changes dialog before running an action
  const guardUnsaved = (action) => {
    if (hasUnsavedChanges) {
      setUnsavedDialog({ action })
    } else {
      action()
    }
  }

  const emojiChoices = ['🎬', '🎥', '🎞️', '📋', '🗓️', '🎭', '🎤', '🎯']
  const openExportHub = () => {
    if (cloudExportBlocked) {
      alert(cloudExportBlockedMessage || 'Cloud project export is unavailable while billing is inactive. Local-only projects can still be exported.')
      return
    }
    onOpenExportHub?.(activeTab)
    setExportMenuOpen(false)
  }

  const handleEnableCloudBackup = async () => {
    if (!canEnableCloudBackup || saveActionBusy) return
    setSaveActionBusy(true)
    try {
      await createCloudProjectFromLocal({
        ownerUserId: cloudSyncContext.currentUserId,
        accountProfile: {
          planTier: cloudFeatureAvailable ? 'paid' : 'free',
        },
      })
      setSaveMenuOpen(false)
    } catch (error) {
      alert(error?.message || 'Could not enable cloud backup for this project.')
    } finally {
      setSaveActionBusy(false)
    }
  }

  const handleSaveToCloudNow = async () => {
    if (!canSaveCloudNow || saveActionBusy) return
    setSaveActionBusy(true)
    try {
      const result = await flushCloudSync({ reason: 'manual' })
      if (result?.ok === false) {
        alert(result.error || 'Cloud backup failed.')
      }
      setSaveMenuOpen(false)
    } finally {
      setSaveActionBusy(false)
    }
  }

  const handleWorkLocalOnly = () => {
    if (!canDisableCloudBackup || saveActionBusy) return
    disableCloudBackupForCurrentProject()
    setSaveMenuOpen(false)
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

        {/* Save / Sync status */}
        <SaveSyncStatusControl
          cloudAccessPolicy={cloudAccessPolicy}
          onEnableCloudBackup={handleEnableCloudBackup}
          onSaveToCloudNow={handleSaveToCloudNow}
          onWorkLocalOnly={handleWorkLocalOnly}
          actionBusy={saveActionBusy}
        />
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
            title={projectPath ? `Save local copy to ${fileName}` : 'Save local copy (choose location)'}
            style={{ borderRadius: '4px 0 0 4px', borderRight: 'none', paddingRight: 8 }}
          >
            Save Local
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
                onClick={() => { setSaveMenuOpen(false); saveProject() }}
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
                  borderBottom: '1px solid rgba(255,255,255,0.08)',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.1)' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'none' }}
              >
                Save locally now
              </button>
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
                  borderBottom: '1px solid rgba(255,255,255,0.08)',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.1)' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'none' }}
              >
                Save local copy as…
              </button>
              {isCloudProject ? (
                <>
                  <button
                    onClick={handleSaveToCloudNow}
                    disabled={!canSaveCloudNow || saveActionBusy}
                    style={{
                      display: 'block',
                      width: '100%',
                      padding: '8px 14px',
                      textAlign: 'left',
                      background: 'none',
                      border: 'none',
                      color: (!canSaveCloudNow || saveActionBusy) ? 'rgba(224,224,224,0.45)' : '#9ae6b4',
                      fontSize: 12,
                      cursor: (!canSaveCloudNow || saveActionBusy) ? 'not-allowed' : 'pointer',
                      fontFamily: 'inherit',
                      borderBottom: '1px solid rgba(255,255,255,0.08)',
                    }}
                    onMouseEnter={e => { if (canSaveCloudNow && !saveActionBusy) e.currentTarget.style.background = 'rgba(255,255,255,0.1)' }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'none' }}
                  >
                    {saveActionBusy ? 'Saving to cloud…' : 'Save to cloud now'}
                  </button>
                  <button
                    onClick={handleWorkLocalOnly}
                    style={{
                      display: 'block',
                      width: '100%',
                      padding: '8px 14px',
                      textAlign: 'left',
                      background: 'none',
                      border: 'none',
                      color: '#fbbf24',
                      fontSize: 12,
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.1)' }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'none' }}
                  >
                    Work local only
                  </button>
                </>
              ) : (
                <button
                  onClick={handleEnableCloudBackup}
                  disabled={!canEnableCloudBackup || saveActionBusy}
                  title={
                    canEnableCloudBackup
                      ? 'Create a cloud-backed version of this current project'
                      : !cloudAccessPolicy?.paidCloudAccess
                        ? 'Cloud backup requires a paid account'
                        : !signedInForCloud
                          ? 'Sign in to enable cloud backup'
                          : !cloudRepositoryReady
                            ? 'Cloud connection is still initializing'
                          : 'Cloud backup unavailable'
                  }
                  style={{
                    display: 'block',
                    width: '100%',
                    padding: '8px 14px',
                    textAlign: 'left',
                    background: 'none',
                    border: 'none',
                    color: (!canEnableCloudBackup || saveActionBusy) ? 'rgba(224,224,224,0.45)' : '#9ae6b4',
                    fontSize: 12,
                    cursor: (!canEnableCloudBackup || saveActionBusy) ? 'not-allowed' : 'pointer',
                    fontFamily: 'inherit',
                  }}
                  onMouseEnter={e => { if (canEnableCloudBackup && !saveActionBusy) e.currentTarget.style.background = 'rgba(255,255,255,0.1)' }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'none' }}
                >
                  {saveActionBusy ? 'Turning on cloud backup…' : 'Turn on cloud backup for this project'}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
      {!isCloudProject && cloudAccessPolicy?.paidCloudAccess && signedInForCloud && saveSyncState?.status !== 'cloud_sync_failed' ? (
        <div style={{ color: '#93c5fd', fontSize: 11, marginTop: 6, textAlign: 'center' }}>
          This project is local-only right now. Turn on cloud backup from Save when you want syncing.
        </div>
      ) : null}

      {/* Right: Export */}
      <div className="flex items-center gap-2">
        <div ref={exportMenuRef} style={{ position: 'relative', display: 'flex' }}>
          <button
            className="toolbar-btn"
            onClick={openExportHub}
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
                onClick={openExportHub}
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
                Open Export Hub
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
