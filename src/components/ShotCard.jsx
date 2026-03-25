import React, { useState, useRef, useCallback } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import useStore from '../store'
import ColorPicker from './ColorPicker'
import SpecsTable from './SpecsTable'
import NotesArea from './NotesArea'

// Small scene link badge + picker for linking a shot to a script scene
function SceneLinkBadge({ shot }) {
  const scriptScenes = useStore(s => s.scriptScenes)
  const linkShotToScene = useStore(s => s.linkShotToScene)
  const requestScriptFocus = useStore(s => s.requestScriptFocus)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [search, setSearch] = useState('')

  const linked = shot.linkedSceneId
    ? scriptScenes.find(s => s.id === shot.linkedSceneId)
    : null

  const isStale = shot.linkedSceneId && !linked
  const isDialogueLinked = !!(linked && shot.linkedDialogueLine)
  const filteredScenes = scriptScenes.filter(ss => {
    const q = search.trim().toLowerCase()
    if (!q) return true
    return (`${ss.sceneNumber || ''}`.toLowerCase().includes(q)
      || `${ss.location || ''}`.toLowerCase().includes(q)
      || (ss.characters || []).join(' ').toLowerCase().includes(q))
  })

  if (scriptScenes.length === 0) return null

  return (
    <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
      <button
        onPointerDown={e => e.stopPropagation()}
        onClick={e => {
          e.stopPropagation()
          if (isDialogueLinked) {
            requestScriptFocus(linked.id, shot.id)
            return
          }
          setPickerOpen(!pickerOpen)
        }}
        title={isDialogueLinked
          ? (shot.linkedDialogueLine || '').slice(0, 60)
          : linked ? `Linked to SC ${linked.sceneNumber} — click to change` : 'Link to scene'}
        style={{
          background: linked
            ? (linked.color ? linked.color + '30' : 'rgba(59,130,246,0.15)')
            : 'transparent',
          border: linked
            ? `1px solid ${linked.color || 'rgba(59,130,246,0.4)'}`
            : isStale
              ? '1px dashed rgba(248,113,113,0.5)'
              : '1px dashed rgba(128,128,128,0.3)',
          borderRadius: 3,
          padding: '1px 5px',
          cursor: 'pointer',
          fontSize: 9,
          fontFamily: 'monospace',
          fontWeight: 700,
          color: linked
            ? (linked.color || '#93c5fd')
            : isStale ? '#f87171' : '#666',
          lineHeight: 1.4,
          display: 'inline-flex', alignItems: 'center', gap: 2,
          flexShrink: 0,
        }}
      >
        {linked
          ? `SC ${linked.sceneNumber}${shot.linkedDialogueLine ? ' 🔖' : ''}`
          : isStale ? '⚠' : '⛓'}
      </button>

      {pickerOpen && (
        <div
          onPointerDown={e => e.stopPropagation()}
          style={{
            position: 'absolute', top: 18, right: 0, zIndex: 50,
            background: '#1e1e2e', border: '1px solid #444', borderRadius: 6,
            boxShadow: '0 4px 16px rgba(0,0,0,0.6)',
            minWidth: 180, maxHeight: 220, overflowY: 'auto',
            padding: 4,
          }}
        >
          <div className="p-2 border-b border-slate/15">
            <input
              autoFocus
              placeholder="Search by number, location, or cast..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full bg-[#2C2C2E] text-white text-sm px-2 py-1.5 rounded outline-none placeholder-slate/50 focus:ring-1 focus:ring-[#E84040]/50"
            />
          </div>
          {/* Unlink option */}
          {linked && (
            <button
              onClick={() => { linkShotToScene(shot.id, null); setPickerOpen(false) }}
              style={{
                width: '100%', textAlign: 'left', padding: '5px 8px',
                background: 'none', border: 'none', cursor: 'pointer',
                fontSize: 10, fontFamily: 'monospace', color: '#f87171',
                borderRadius: 3,
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(248,113,113,0.1)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'none')}
            >
              Unlink scene
            </button>
          )}

          {/* Scene options */}
          {filteredScenes.map(ss => (
            <button
              key={ss.id}
              onClick={() => { linkShotToScene(shot.id, ss.id); setPickerOpen(false) }}
              style={{
                width: '100%', textAlign: 'left', padding: '5px 8px',
                background: ss.id === shot.linkedSceneId ? 'rgba(59,130,246,0.2)' : 'none',
                border: 'none', cursor: 'pointer',
                fontSize: 10, fontFamily: 'monospace',
                color: ss.id === shot.linkedSceneId ? '#93c5fd' : '#ccc',
                borderRadius: 3,
                display: 'flex', alignItems: 'center', gap: 5,
              }}
              onMouseEnter={e => (e.currentTarget.style.background = ss.id === shot.linkedSceneId ? 'rgba(59,130,246,0.3)' : 'rgba(128,128,128,0.1)')}
              onMouseLeave={e => (e.currentTarget.style.background = ss.id === shot.linkedSceneId ? 'rgba(59,130,246,0.2)' : 'none')}
            >
              {ss.color && (
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: ss.color, flexShrink: 0 }} />
              )}
              <span style={{ fontWeight: 700 }}>SC {ss.sceneNumber}</span>
              {ss.location && <span style={{ opacity: 0.7, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 100 }}>· {ss.location}</span>}
              {(ss.characters || []).length > 0 && (
                <span style={{ opacity: 0.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 90 }}>
                  · {(ss.characters || []).join(', ')}
                </span>
              )}
            </button>
          ))}
          {filteredScenes.length === 0 && (
            <div style={{ textAlign: 'center', color: '#718096', padding: '10px 8px', fontSize: 11 }}>
              No scenes match
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function ShotCard({ shot, displayId, useDropdowns, sceneId }) {
  const updateShotImage = useStore(s => s.updateShotImage)
  const updateShot = useStore(s => s.updateShot)
  const showContextMenu = useStore(s => s.showContextMenu)
  const deleteShot = useStore(s => s.deleteShot)
  const [showColorPicker, setShowColorPicker] = useState(false)
  const [hovered, setHovered] = useState(false)
  const fileInputRef = useRef(null)

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: shot.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    '--card-color': shot.color,
    opacity: isDragging ? 0.4 : 1,
  }

  const handleImageClick = () => fileInputRef.current?.click()

  const handleImageChange = (e) => {
    const file = e.target.files[0]
    if (!file) return
    if (!file.type.match(/^image\//)) {
      alert('Please select an image file (JPG, PNG, WEBP)')
      return
    }
    const reader = new FileReader()
    reader.onload = (ev) => updateShotImage(shot.id, ev.target.result)
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  const handleContextMenu = (e) => {
    e.preventDefault()
    showContextMenu(shot.id, sceneId, e.clientX, e.clientY)
  }

  const handleFocalLengthChange = useCallback((e) => {
    updateShot(shot.id, { focalLength: e.target.value })
  }, [shot.id, updateShot])

  const handleCameraNameChange = useCallback((e) => {
    updateShot(shot.id, { cameraName: e.target.value })
  }, [shot.id, updateShot])

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`shot-card ${isDragging ? 'is-dragging' : ''}`}
      onContextMenu={handleContextMenu}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Card Header Row — entire row is the drag handle */}
      <div
        {...attributes}
        {...listeners}
        className="flex items-center gap-1 px-2 py-1 cursor-grab active:cursor-grabbing select-none"
        style={{ paddingLeft: 8, display: 'flex', alignItems: 'center' }}
        title="Drag to reorder"
      >
        {/* Color indicator */}
        <div className="relative flex-shrink-0" style={{ display: 'flex', alignItems: 'center', alignSelf: 'center' }}>
          <div
            className="color-swatch"
            style={{ backgroundColor: shot.color, width: 12, height: 12, display: 'block', alignSelf: 'center', flexShrink: 0 }}
            onClick={(e) => { e.stopPropagation(); setShowColorPicker(!showColorPicker) }}
            title="Click to change color"
          />
          {showColorPicker && (
            <ColorPicker
              shotId={shot.id}
              currentColor={shot.color}
              onClose={() => setShowColorPicker(false)}
            />
          )}
        </div>

        {/* Shot ID + Camera name */}
        <div className="flex-1 flex items-center gap-1 min-w-0" style={{ alignItems: 'center' }}>
          <span className="font-bold text-xs whitespace-nowrap" style={{ verticalAlign: 'middle', lineHeight: 1 }}>{displayId} -</span>
          <input
            type="text"
            value={shot.cameraName}
            onChange={handleCameraNameChange}
            onPointerDown={e => e.stopPropagation()}
            className="text-xs bg-transparent border-none outline-none p-0 min-w-0 flex-1"
            style={{ maxWidth: 80 }}
            placeholder="Camera 1"
          />
        </div>

        {/* Focal length — right-aligned, never covered */}
        <input
          type="text"
          value={shot.focalLength}
          onChange={handleFocalLengthChange}
          onPointerDown={e => e.stopPropagation()}
          className="text-xs bg-transparent border-none outline-none text-right p-0 flex-shrink-0"
          style={{ width: 46 }}
          placeholder="85mm"
        />

        {/* Scene link badge — only when script scenes exist */}
        <SceneLinkBadge shot={shot} />
      </div>

      {/* Image Area */}
      <div
        className="image-placeholder"
        onClick={handleImageClick}
        style={{ border: `2px solid ${shot.color}`, aspectRatio: '16/9' }}
      >
        {shot.image ? (
          <img src={shot.image} alt="Shot frame" />
        ) : (
          <div className="flex flex-col items-center gap-1 text-gray-500">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <polyline points="21 15 16 10 5 21" />
            </svg>
            <span className="text-xs font-medium">Click to add image</span>
          </div>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleImageChange}
        />
      </div>

      {/* Specs Table */}
      <SpecsTable
        shotId={shot.id}
        specs={shot.specs}
        useDropdowns={useDropdowns}
      />

      {/* Notes Area */}
      <div className="border-t border-gray-200">
        <NotesArea shotId={shot.id} value={shot.notes} />
      </div>

      {/* Delete button — bottom-right corner, avoids focal length field */}
      {hovered && (
        <button
          className="delete-btn absolute bottom-0 right-0 w-5 h-5 flex items-center justify-center bg-red-500 text-white hover:bg-red-600 transition-colors z-20"
          style={{ fontSize: 14, lineHeight: 1 }}
          onClick={(e) => { e.stopPropagation(); deleteShot(shot.id) }}
          title="Delete shot"
        >
          ×
        </button>
      )}
    </div>
  )
}
