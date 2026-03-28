import React, { useState, useRef, useEffect } from 'react'
import useStore from '../store'

const CAMERA_COLORS = [
  '#4ade80', '#22d3ee', '#facc15', '#f87171', '#60a5fa',
  '#fb923c', '#c084fc', '#f472b6', '#ffffff', '#9ca3af',
]

function CameraColorSwatch({ color, onChange }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', flexShrink: 0 }}>
      <button
        onClick={(e) => { e.stopPropagation(); setOpen(o => !o) }}
        title="Camera color"
        style={{
          width: 10,
          height: 10,
          borderRadius: 2,
          background: color || '#9ca3af',
          border: color ? '1px solid rgba(0,0,0,0.25)' : '1px dashed rgba(0,0,0,0.25)',
          cursor: 'pointer',
          padding: 0,
          flexShrink: 0,
          display: 'block',
        }}
      />
      {open && (
        <div
          style={{
            position: 'absolute',
            right: 0,
            top: '100%',
            marginTop: 4,
            zIndex: 100,
            background: '#fff',
            border: '1px solid #d1d5db',
            borderRadius: 6,
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            padding: 6,
          }}
          onMouseDown={e => e.stopPropagation()}
        >
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 3 }}>
            {CAMERA_COLORS.map(c => (
              <button
                key={c}
                onClick={() => { onChange(c); setOpen(false) }}
                title={c}
                style={{
                  width: 16,
                  height: 16,
                  borderRadius: 3,
                  background: c,
                  border: color === c ? '2px solid #1a1a1a' : '1px solid rgba(0,0,0,0.15)',
                  cursor: 'pointer',
                  padding: 0,
                }}
              />
            ))}
            <button
              onClick={() => { onChange(null); setOpen(false) }}
              title="No color"
              style={{
                width: 16,
                height: 16,
                borderRadius: 3,
                background: 'none',
                border: '1px dashed #d1d5db',
                cursor: 'pointer',
                padding: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 9,
                color: '#9ca3af',
                lineHeight: 1,
              }}
            >
              ×
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default function PageHeader({ scene, isContinuation = false, pageNum = 1, pageIndex = 0, onDoubleClick }) {
  const updateScene = useStore(s => s.updateScene)
  const getCanonicalStoryboardSceneMetadata = useStore(s => s.getCanonicalStoryboardSceneMetadata)
  const updateCanonicalStoryboardSceneMetadata = useStore(s => s.updateCanonicalStoryboardSceneMetadata)

  const set = (updates) => updateScene(scene.id, updates)
  const canonical = getCanonicalStoryboardSceneMetadata(scene.id)
  const displaySceneNumber = String(canonical?.sceneNumber || '').trim()
  const displaySlugline = canonical?.titleSlugline || ''

  // Per-page notes: pageNotes is stored as an array (one element per page).
  // Legacy projects saved it as a plain string — treat that as page 0.
  const pageNotesArray = Array.isArray(scene.pageNotes) ? scene.pageNotes : [scene.pageNotes || '']
  const currentPageNotes = pageNotesArray[pageIndex] || ''

  const setPageNotes = (val) => {
    const updated = [...pageNotesArray]
    while (updated.length <= pageIndex) updated.push('')
    updated[pageIndex] = val
    set({ pageNotes: updated })
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

  const deleteCameraAt = (idx) => {
    if (cameras.length <= 1) return // always keep at least one camera row
    set({ cameras: cameras.filter((_, i) => i !== idx) })
  }

  const handleCameraKeyDown = (e, idx, field) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      addCameraAfter(idx)
    } else if ((e.key === 'Backspace' || e.key === 'Delete') && field === 'name' && cameras[idx].name === '') {
      e.preventDefault()
      deleteCameraAt(idx)
    }
  }

  // All inputs in PageHeader are plain controlled inputs with no pointer-event
  // suppression.  The previous onPointerDown stopPropagation handlers were
  // removed because they could prevent first-click focus in Electron on Windows
  // and are unnecessary — dnd-kit only intercepts pointer events on elements
  // that have its drag listeners explicitly attached, which these inputs do not.

  return (
    <div className="page-header" onDoubleClick={onDoubleClick}>
      {/* Scene identifier + slugline */}
      <div className="page-header-scene">
        <div className="page-header-row page-header-scene-top page-header-scene-tag">
          {`SCENE ${displaySceneNumber || '—'}`}
        </div>
        <div className="page-header-row page-header-scene-bottom">
          <input
            type="text"
            value={displaySlugline}
            onChange={e => updateCanonicalStoryboardSceneMetadata(scene.id, { titleSlugline: e.target.value })}
            className="text-[17px] font-black tracking-tight bg-transparent border-none outline-none p-0 page-header-input page-header-slugline"
            style={{ minWidth: 50, width: `${Math.min(Math.max((displaySlugline || '').length, 4), 38)}ch` }}
            placeholder="TITLE / SLUGLINE"
          />
        </div>
        {isContinuation && (
          <div className="text-xs text-gray-400 font-semibold tracking-wide">
            (CONTINUED — PAGE {pageNum})
          </div>
        )}
      </div>

      {/* Notes block (per-page) */}
      <div className="page-header-notes">
        <textarea
          value={currentPageNotes}
          onChange={e => setPageNotes(e.target.value)}
          className="page-header-notes-input"
          rows={2}
          placeholder="*NOTE: &#10;*SHOOT ORDER: "
          style={{ minHeight: 42 }}
          onInput={e => {
            e.target.style.height = 'auto'
            e.target.style.height = e.target.scrollHeight + 'px'
          }}
        />
      </div>

      {/* Camera legend */}
      <div className="page-header-cameras">
        <div className="page-header-cameras-list">
          {cameras.map((cam, idx) => (
            <div key={idx} className="page-header-camera-row">
              <CameraColorSwatch
                color={cam.color || null}
                onChange={color => updateCamera(idx, 'color', color)}
              />
              <input
                type="text"
                value={cam.name}
                onChange={e => updateCamera(idx, 'name', e.target.value)}
                onKeyDown={e => handleCameraKeyDown(e, idx, 'name')}
                className="page-header-camera-input page-header-camera-name"
                style={{ minWidth: 40, width: `${Math.max((cam.name || '').length, 8)}ch` }}
                placeholder="Camera 1"
              />
              <span className="page-header-camera-equals">=</span>
              <input
                type="text"
                value={cam.body}
                onChange={e => updateCamera(idx, 'body', e.target.value)}
                onKeyDown={e => handleCameraKeyDown(e, idx, 'body')}
                className="page-header-camera-input"
                style={{ minWidth: 20, width: `${Math.max((cam.body || '').length, 4)}ch` }}
                placeholder="fx30"
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
