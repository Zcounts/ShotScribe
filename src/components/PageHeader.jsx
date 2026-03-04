import React, { useState } from 'react'
import useStore from '../store'

export default function PageHeader({ scene, isContinuation = false, pageNum = 1 }) {
  const updateScene = useStore(s => s.updateScene)
  const deleteScene = useStore(s => s.deleteScene)
  const scenes = useStore(s => s.scenes)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  const set = (updates) => updateScene(scene.id, updates)

  const canDelete = scenes.length > 1
  const shotCount = scene.shots ? scene.shots.length : 0

  const handleDeleteClick = (e) => {
    e.stopPropagation()
    if (shotCount > 0) {
      setShowDeleteConfirm(true)
    } else {
      deleteScene(scene.id)
    }
  }

  const handleConfirmDelete = () => {
    setShowDeleteConfirm(false)
    deleteScene(scene.id)
  }

  const cycleIntExt = () => {
    const next = { INT: 'EXT', EXT: 'INT/EXT', 'INT/EXT': 'INT' }
    set({ intOrExt: next[scene.intOrExt] || 'INT' })
  }

  const cycleDayNight = () => {
    const next = { DAY: 'NIGHT', NIGHT: 'DAY/NIGHT', 'DAY/NIGHT': 'DAY' }
    set({ dayNight: next[scene.dayNight] || 'DAY' })
  }

  const cameras = scene.cameras || [{ name: scene.cameraName || 'Camera 1', body: scene.cameraBody || 'fx30' }]

  const updateCamera = (idx, field, value) => {
    const updated = cameras.map((c, i) => i === idx ? { ...c, [field]: value } : c)
    set({ cameras: updated })
  }

  const addCameraAfter = (idx) => {
    const updated = [
      ...cameras.slice(0, idx + 1),
      { name: `Camera ${cameras.length + 1}`, body: '' },
      ...cameras.slice(idx + 1),
    ]
    set({ cameras: updated })
  }

  const handleCameraKeyDown = (e, idx) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      addCameraAfter(idx)
    }
  }

  // All inputs in PageHeader are plain controlled inputs with no pointer-event
  // suppression.  The previous onPointerDown stopPropagation handlers were
  // removed because they could prevent first-click focus in Electron on Windows
  // and are unnecessary — dnd-kit only intercepts pointer events on elements
  // that have its drag listeners explicitly attached, which these inputs do not.

  return (
    <>
      <div className="page-header">
        {/* Left: Scene Label */}
        <div className="flex flex-col gap-1 min-w-0">
          <div className="flex items-baseline gap-2 flex-wrap">
            <input
              type="text"
              value={scene.sceneLabel}
              onChange={e => set({ sceneLabel: e.target.value })}
              className="text-xl font-black tracking-tight bg-transparent border-none outline-none p-0"
              style={{ minWidth: 80, width: `${Math.max((scene.sceneLabel || '').length, 6)}ch` }}
              placeholder="SCENE 1"
            />
            <span className="text-xl font-black">|</span>
            <input
              type="text"
              value={scene.location}
              onChange={e => set({ location: e.target.value })}
              className="text-xl font-black tracking-tight bg-transparent border-none outline-none p-0"
              style={{ minWidth: 60, width: `${Math.max((scene.location || '').length, 4)}ch` }}
              placeholder="LOCATION"
            />
            <span className="text-xl font-black">|</span>
            <button
              onClick={cycleIntExt}
              className="text-xl font-black bg-transparent border-none outline-none cursor-pointer hover:opacity-70 p-0"
            >
              {scene.intOrExt}
            </button>
            <span className="text-xl font-black">·</span>
            <button
              onClick={cycleDayNight}
              className="text-xl font-black bg-transparent border-none outline-none cursor-pointer hover:opacity-70 p-0"
            >
              {scene.dayNight || 'DAY'}
            </button>
          </div>
          {isContinuation && (
            <div className="text-xs text-gray-400 font-semibold tracking-wide">
              (CONTINUED — PAGE {pageNum})
            </div>
          )}
        </div>

        {/* Center: Notes block */}
        <div className="text-xs leading-relaxed border-l border-r border-gray-200 px-4">
          <textarea
            value={scene.pageNotes}
            onChange={e => set({ pageNotes: e.target.value })}
            className="w-full border-none outline-none resize-none text-xs leading-relaxed bg-transparent font-sans"
            rows={3}
            placeholder="*NOTE: &#10;*SHOOT ORDER: "
            style={{ minHeight: 60 }}
            onInput={e => {
              e.target.style.height = 'auto'
              e.target.style.height = e.target.scrollHeight + 'px'
            }}
          />
        </div>

        {/* Right: Camera lines + delete button */}
        <div className="flex flex-col items-end flex-shrink-0" style={{ gap: 4 }}>
          {/* Delete button — only on the first page of each scene, only when there are multiple scenes */}
          {!isContinuation && canDelete && (
            <button
              className="scene-delete-btn"
              onClick={handleDeleteClick}
              title="Delete scene"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"></path>
                <line x1="10" y1="11" x2="10" y2="17"></line>
                <line x1="14" y1="11" x2="14" y2="17"></line>
              </svg>
            </button>
          )}
          <div className="flex flex-col items-end gap-0.5">
            {cameras.map((cam, idx) => (
              <div key={idx} className="flex items-center gap-1 text-xs font-semibold">
                <input
                  type="text"
                  value={cam.name}
                  onChange={e => updateCamera(idx, 'name', e.target.value)}
                  onKeyDown={e => handleCameraKeyDown(e, idx)}
                  className="bg-transparent border-none outline-none text-xs font-semibold text-right p-0"
                  style={{ minWidth: 40, width: `${Math.max((cam.name || '').length, 8)}ch` }}
                  placeholder="Camera 1"
                />
                <span>=</span>
                <input
                  type="text"
                  value={cam.body}
                  onChange={e => updateCamera(idx, 'body', e.target.value)}
                  onKeyDown={e => handleCameraKeyDown(e, idx)}
                  className="bg-transparent border-none outline-none text-xs font-semibold p-0"
                  style={{ minWidth: 20, width: `${Math.max((cam.body || '').length, 4)}ch` }}
                  placeholder="fx30"
                />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Confirmation dialog — shown when deleting a scene that has shots */}
      {showDeleteConfirm && (
        <div className="modal-overlay" style={{ zIndex: 500 }} onClick={() => setShowDeleteConfirm(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 420 }}>
            <p style={{ marginBottom: 8, fontFamily: 'monospace', fontSize: 14, fontWeight: 700 }}>
              Delete scene?
            </p>
            <p style={{ marginBottom: 6, fontSize: 13, color: '#333' }}>
              <strong>{scene.sceneLabel}</strong> — {scene.location}
            </p>
            <p style={{ marginBottom: 16, fontSize: 13, color: '#666' }}>
              This will permanently delete the scene and all{' '}
              <strong>{shotCount} shot{shotCount !== 1 ? 's' : ''}</strong> within it.
              This cannot be undone.
            </p>
            {shotCount > 0 && (
              <p style={{ marginBottom: 16, fontSize: 12, color: '#ef4444', background: '#fef2f2', padding: '8px 10px', borderRadius: 4 }}>
                {shotCount} shot{shotCount !== 1 ? 's' : ''} will be lost, including any schedule blocks referencing {shotCount !== 1 ? 'them' : 'it'}.
              </p>
            )}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowDeleteConfirm(false)}
                style={{ padding: '6px 16px', cursor: 'pointer', fontFamily: 'monospace', fontSize: 12, border: '1px solid #ccc', borderRadius: 4, background: '#fff' }}
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmDelete}
                style={{ padding: '6px 16px', cursor: 'pointer', fontFamily: 'monospace', fontSize: 12, fontWeight: 700, background: '#ef4444', color: '#fff', border: 'none', borderRadius: 4 }}
              >
                Delete Scene
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
