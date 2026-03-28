import React, { useState, useRef, useCallback, useMemo, useEffect } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import useStore from '../store'
import ColorPicker from './ColorPicker'
import SpecsTable from './SpecsTable'
import NotesArea from './NotesArea'
import CustomDropdown from './CustomDropdown'
import { normalizeStoryboardDisplayConfig } from '../storyboardDisplayConfig'

function parseAspectRatioValue(value) {
  if (value === '2.39:1') return '239 / 100'
  const [left, right] = String(value || '16:9').split(':')
  const leftNum = Number(left)
  const rightNum = Number(right)
  if (!leftNum || !rightNum) return '16 / 9'
  return `${leftNum} / ${rightNum}`
}

const SHOT_ASPECT_RATIO_PRESETS = ['1:1', '4:3', '16:9', '3:2', '2.39:1']

function sanitizeNumericInput(value) {
  if (value == null) return ''
  const cleaned = String(value).replace(/[^0-9.]/g, '')
  const firstDot = cleaned.indexOf('.')
  if (firstDot === -1) return cleaned
  const integerPart = cleaned.slice(0, firstDot + 1)
  const decimalPart = cleaned.slice(firstDot + 1).replace(/\./g, '')
  return `${integerPart}${decimalPart}`
}

// Small scene link badge + picker for linking a shot to a script scene
function SceneLinkBadge({ shot }) {
  const scriptScenes = useStore(s => s.scriptScenes)
  const linkShotToScene = useStore(s => s.linkShotToScene)
  const requestScriptFocus = useStore(s => s.requestScriptFocus)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const pickerRef = useRef(null)

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

  useEffect(() => {
    if (!pickerOpen) return
    const handlePointerDown = (event) => {
      if (!pickerRef.current?.contains(event.target)) {
        setPickerOpen(false)
      }
    }
    document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [pickerOpen])

  useEffect(() => {
    const selectedIndex = filteredScenes.findIndex(ss => ss.id === shot.linkedSceneId)
    setActiveIndex(selectedIndex >= 0 ? selectedIndex : 0)
  }, [filteredScenes, shot.linkedSceneId])

  const handlePickerKeyDown = (event) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      setPickerOpen(false)
      return
    }
    if (!filteredScenes.length) return

    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActiveIndex((current) => Math.min(filteredScenes.length - 1, current + 1))
      return
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActiveIndex((current) => Math.max(0, current - 1))
      return
    }
    if (event.key === 'Enter') {
      event.preventDefault()
      const activeScene = filteredScenes[activeIndex]
      if (!activeScene) return
      linkShotToScene(shot.id, activeScene.id)
      setPickerOpen(false)
    }
  }

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
          ref={pickerRef}
          onPointerDown={e => e.stopPropagation()}
          onKeyDown={handlePickerKeyDown}
          style={{
            position: 'absolute', top: 22, right: 0, zIndex: 80,
            background: '#FAF8F4', border: '1px solid rgba(74,85,104,0.3)', borderRadius: 10,
            boxShadow: '0 18px 38px rgba(0,0,0,0.3)',
            width: 470,
            maxWidth: 'min(470px, 70vw)',
            maxHeight: 460,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          <div style={{ padding: 10, borderBottom: '1px solid rgba(74,85,104,0.2)', background: '#F1EDE5' }}>
            <input
              autoFocus
              placeholder="Search by number, location, or cast..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{
                width: '100%',
                border: '1px solid rgba(74,85,104,0.35)',
                background: '#FAF8F4',
                color: '#1A1A1A',
                fontSize: 12,
                padding: '8px 10px',
                borderRadius: 6,
                outline: 'none',
              }}
            />
          </div>
          <div style={{ padding: 8, borderBottom: linked ? '1px solid rgba(74,85,104,0.18)' : 'none' }}>
            {linked && (
              <button
                onClick={() => { linkShotToScene(shot.id, null); setPickerOpen(false) }}
                style={{
                  width: '100%', textAlign: 'left', padding: '8px 10px',
                  background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.26)', cursor: 'pointer',
                  fontSize: 11, fontWeight: 600, color: '#b42323', borderRadius: 6,
                }}
              >
                Unlink scene
              </button>
            )}
          </div>

          <div style={{ overflowY: 'auto', padding: 8, minHeight: 220 }}>
            {filteredScenes.map((ss, idx) => {
              const isSelected = ss.id === shot.linkedSceneId
              const isActive = idx === activeIndex
              return (
                <button
                  key={ss.id}
                  onClick={() => { linkShotToScene(shot.id, ss.id); setPickerOpen(false) }}
                  onMouseEnter={() => setActiveIndex(idx)}
                  style={{
                    width: '100%',
                    textAlign: 'left',
                    padding: '10px 12px',
                    marginBottom: 6,
                    background: isSelected
                      ? 'rgba(82,101,224,0.16)'
                      : isActive
                        ? 'rgba(74,85,104,0.1)'
                        : '#FAF8F4',
                    border: `1px solid ${isSelected ? 'rgba(82,101,224,0.48)' : isActive ? 'rgba(74,85,104,0.35)' : 'rgba(74,85,104,0.2)'}`,
                    cursor: 'pointer',
                    borderRadius: 8,
                    display: 'grid',
                    gap: 4,
                    color: '#2C2C2E',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {ss.color && (
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: ss.color, flexShrink: 0 }} />
                    )}
                    <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', color: '#4A5568' }}>SC {ss.sceneNumber || '—'}</span>
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#1A1A1A' }}>{ss.slugline || ss.location || 'Untitled scene'}</div>
                  <div style={{ fontSize: 11, color: '#718096', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {[ss.location, (ss.characters || []).length > 0 ? (ss.characters || []).join(', ') : null].filter(Boolean).join(' · ') || 'No additional metadata'}
                  </div>
                </button>
              )
            })}
            {filteredScenes.length === 0 && (
              <div style={{ textAlign: 'center', color: '#718096', padding: '28px 8px', fontSize: 12 }}>
                No scenes match this search.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default function ShotCard({ shot, displayId, useDropdowns, sceneId, storyboardDisplayConfig }) {
  const updateShotImage = useStore(s => s.updateShotImage)
  const updateShot = useStore(s => s.updateShot)
  const customDropdownOptions = useStore(s => s.customDropdownOptions)
  const addCustomDropdownOption = useStore(s => s.addCustomDropdownOption)
  const deleteShot = useStore(s => s.deleteShot)
  const [showColorPicker, setShowColorPicker] = useState(false)
  const [hovered, setHovered] = useState(false)
  const fileInputRef = useRef(null)
  const displayConfig = normalizeStoryboardDisplayConfig(storyboardDisplayConfig)
  const visibleInfo = displayConfig.visibleInfo
  const visibleSpecKeys = useMemo(
    () => ['size', 'type', 'move', 'equip'].filter(key => visibleInfo[key] !== false),
    [visibleInfo]
  )

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

  const handleFocalLengthChange = useCallback((e) => {
    updateShot(shot.id, { focalLength: e.target.value })
  }, [shot.id, updateShot])

  const handleCameraNameChange = useCallback((e) => {
    updateShot(shot.id, { cameraName: e.target.value })
  }, [shot.id, updateShot])

  const handleSetupTimeChange = useCallback((e) => {
    updateShot(shot.id, { setupTime: sanitizeNumericInput(e.target.value) })
  }, [shot.id, updateShot])

  const handleShotTimeChange = useCallback((e) => {
    updateShot(shot.id, { shootTime: sanitizeNumericInput(e.target.value) })
  }, [shot.id, updateShot])

  const handleShotAspectRatioChange = useCallback((value) => {
    updateShot(shot.id, { shotAspectRatio: value })
  }, [shot.id, updateShot])

  const shotAspectRatioOptions = useMemo(
    () => [...new Set([...SHOT_ASPECT_RATIO_PRESETS, ...(customDropdownOptions?.shotAspectRatio || [])])],
    [customDropdownOptions?.shotAspectRatio]
  )

  const timeMetadataColumns = useMemo(
    () => [
      visibleInfo.setupTime !== false ? { key: 'setupTime', label: 'SETUP TIME' } : null,
      visibleInfo.shotTime !== false ? { key: 'shotTime', label: 'SHOT TIME' } : null,
      visibleInfo.shotAspectRatio !== false ? { key: 'shotAspectRatio', label: 'ASPECT RATIO' } : null,
    ].filter(Boolean),
    [visibleInfo.setupTime, visibleInfo.shotTime, visibleInfo.shotAspectRatio]
  )

  return (
    <div
      ref={setNodeRef}
      style={style}
      id={`storyboard-shot-${shot.id}`}
      data-entity-type="shot"
      data-entity-id={shot.id}
      className={`shot-card ${isDragging ? 'is-dragging' : ''}`}
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
          {visibleInfo.camera !== false && (
            <input
              type="text"
              value={shot.cameraName}
              onChange={handleCameraNameChange}
              onPointerDown={e => e.stopPropagation()}
              className="text-xs bg-transparent border-none outline-none p-0 min-w-0 flex-1"
              style={{ maxWidth: 80 }}
              placeholder="Camera 1"
            />
          )}
        </div>

        {/* Focal length — right-aligned, never covered */}
        {visibleInfo.lens !== false && (
          <input
            type="text"
            value={shot.focalLength}
            onChange={handleFocalLengthChange}
            onPointerDown={e => e.stopPropagation()}
            className="text-xs bg-transparent border-none outline-none text-right p-0 flex-shrink-0"
            style={{ width: 46 }}
            placeholder="85mm"
          />
        )}

        {/* Scene link badge — only when script scenes exist */}
        <SceneLinkBadge shot={shot} />
      </div>

      {/* Image Area */}
      <div
        className="image-placeholder"
        onClick={handleImageClick}
        style={{ border: `2px solid ${shot.color}`, aspectRatio: parseAspectRatioValue(displayConfig.aspectRatio) }}
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
      {visibleSpecKeys.length > 0 && (
        <SpecsTable
          shotId={shot.id}
          specs={shot.specs}
          useDropdowns={useDropdowns}
          visibleSpecKeys={visibleSpecKeys}
        />
      )}

      {/* Notes Area */}
      {visibleInfo.notes !== false && (
        <div className="border-t border-gray-200">
          <NotesArea shotId={shot.id} value={shot.notes} />
        </div>
      )}

      {timeMetadataColumns.length > 0 && (
        <div className="shot-time-fields-wrapper">
          <table className="shot-time-fields">
            <caption>Shot timing and aspect ratio metadata</caption>
            <thead>
              <tr>
                {timeMetadataColumns.map(column => (
                  <th key={column.key}>{column.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                {timeMetadataColumns.map(column => (
                  <td key={column.key} className="shot-time-field-cell">
                    {column.key === 'setupTime' ? (
                      <input
                        className="shot-time-number"
                        type="text"
                        inputMode="decimal"
                        value={sanitizeNumericInput(shot.setupTime || '')}
                        onChange={handleSetupTimeChange}
                        placeholder="15"
                      />
                    ) : null}
                    {column.key === 'shotTime' ? (
                      <input
                        className="shot-time-number"
                        type="text"
                        inputMode="decimal"
                        value={sanitizeNumericInput(shot.shootTime || '')}
                        onChange={handleShotTimeChange}
                        placeholder="10"
                      />
                    ) : null}
                    {column.key === 'shotAspectRatio' ? (
                      <div className="shot-time-aspect-dropdown">
                        <CustomDropdown
                          value={shot.shotAspectRatio || ''}
                          options={shotAspectRatioOptions}
                          onChange={handleShotAspectRatioChange}
                          onAddCustomOption={(option) => addCustomDropdownOption('shotAspectRatio', option)}
                          inputStyle={{
                            width: '100%',
                            border: 'none',
                            background: 'transparent',
                            textAlign: 'center',
                            fontSize: 10,
                            padding: 0,
                            outline: 'none',
                            fontFamily: 'inherit',
                            cursor: 'pointer',
                            boxSizing: 'border-box',
                          }}
                          placeholder="—"
                        />
                      </div>
                    ) : null}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      )}

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
