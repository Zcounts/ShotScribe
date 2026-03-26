import React, { useState, useRef, useEffect } from 'react'
import useStore from '../store'
import SceneColorPicker from './SceneColorPicker'

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

  const set = (updates) => updateScene(scene.id, updates)

  // Per-page notes: pageNotes is stored as an array (one element per page).
  // Legacy projects saved it as a plain string — treat that as page 0.
  const pageNotesArray = Array.isArray(scene.pageNotes) ? scene.pageNotes : [scene.pageNotes || '']
  const currentPageNotes = pageNotesArray[pageIndex] || ''
  const pageColors = Array.isArray(scene.pageColors) ? scene.pageColors : []
  const currentPageColor = pageColors[pageIndex] || null

  const setPageNotes = (val) => {
    const updated = [...pageNotesArray]
    while (updated.length <= pageIndex) updated.push('')
    updated[pageIndex] = val
    set({ pageNotes: updated })
  }

  const setPageColor = (color) => {
    const updated = [...pageColors]
    while (updated.length <= pageIndex) updated.push(null)
    updated[pageIndex] = color
    set({ pageColors: updated })
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
      {/* Left: Scene Label */}
      <div className="flex flex-col gap-1 min-w-0 items-start">
        <div className="flex items-baseline gap-1.5 flex-wrap justify-start">
          <SceneColorPicker
            value={currentPageColor}
            onChange={setPageColor}
            size={12}
            title={`Set page ${pageNum} color`}
          />
          <input
            type="text"
            value={scene.sceneLabel}
            onChange={e => set({ sceneLabel: e.target.value })}
            className="text-[19px] font-black tracking-tight bg-transparent border-none outline-none p-0"
            style={{ minWidth: 80, width: `${Math.max((scene.sceneLabel || '').length, 6)}ch` }}
            placeholder="SCENE 1"
          />
          <span className="text-[19px] font-black">|</span>
          <input
            type="text"
            value={scene.location}
            onChange={e => set({ location: e.target.value })}
            className="text-[19px] font-black tracking-tight bg-transparent border-none outline-none p-0"
            style={{ minWidth: 60, width: `${Math.max((scene.location || '').length, 4)}ch` }}
            placeholder="LOCATION"
          />
          <span className="text-[19px] font-black">|</span>
          <button
            onClick={cycleIntExt}
            className="text-[19px] font-black bg-transparent border-none outline-none cursor-pointer hover:opacity-70 p-0"
          >
            {scene.intOrExt}
          </button>
          <span className="text-[19px] font-black">·</span>
          <button
            onClick={cycleDayNight}
            className="text-[19px] font-black bg-transparent border-none outline-none cursor-pointer hover:opacity-70 p-0"
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

      {/* Center: Notes block (per-page) */}
      <div className="text-xs leading-relaxed border-l border-r border-gray-200 px-4">
        <textarea
          value={currentPageNotes}
          onChange={e => setPageNotes(e.target.value)}
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

      {/* Right: Camera lines */}
      <div className="flex flex-col items-end flex-shrink-0" style={{ gap: 4 }}>
        <div className="flex flex-col items-end gap-0.5">
          {cameras.map((cam, idx) => (
            <div key={idx} className="flex items-center gap-1 text-xs font-semibold">
              <CameraColorSwatch
                color={cam.color || null}
                onChange={color => updateCamera(idx, 'color', color)}
              />
              <input
                type="text"
                value={cam.name}
                onChange={e => updateCamera(idx, 'name', e.target.value)}
                onKeyDown={e => handleCameraKeyDown(e, idx, 'name')}
                className="bg-transparent border-none outline-none text-xs font-semibold text-right p-0"
                style={{ minWidth: 40, width: `${Math.max((cam.name || '').length, 8)}ch` }}
                placeholder="Camera 1"
              />
              <span>=</span>
              <input
                type="text"
                value={cam.body}
                onChange={e => updateCamera(idx, 'body', e.target.value)}
                onKeyDown={e => handleCameraKeyDown(e, idx, 'body')}
                className="bg-transparent border-none outline-none text-xs font-semibold p-0"
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
