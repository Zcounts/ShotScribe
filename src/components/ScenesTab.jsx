/**
 * ScenesTab.jsx
 * The SCENES tab — displays imported script scenes with cards,
 * complexity tags, confidence indicators, and shot linking.
 *
 * Layout:
 *   Left sidebar — imported scripts list + "Import Script" button
 *   Main area    — scrollable vertical list of scene cards
 */

import React, { useState, useCallback, useRef, useMemo } from 'react'
import {
  DndContext,
  DragOverlay,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import useStore from '../store'
import { COMPLEXITY_TAGS, computeConfidence, computeEstimate, getSuggestedTags } from '../utils/scriptParser'
import ImportScriptModal from './ImportScriptModal'

// ── Confidence indicator ──────────────────────────────────────────────────────

function ConfidenceDots({ level }) {
  const colors = { high: '#22c55e', medium: '#facc15', low: '#f87171' }
  const filled = level === 'high' ? 3 : level === 'medium' ? 2 : 1
  const color = colors[level] || '#888'
  return (
    <span title={`Confidence: ${level}`} style={{ display: 'inline-flex', gap: 2, alignItems: 'center' }}>
      {[1, 2, 3].map(i => (
        <span key={i} style={{
          width: 7, height: 7, borderRadius: '50%',
          background: i <= filled ? color : 'rgba(128,128,128,0.25)',
          display: 'inline-block',
        }} />
      ))}
    </span>
  )
}

// ── Complexity tag pill row ───────────────────────────────────────────────────

function ComplexityTagRow({ activeTags, suggestedTags, onChange }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
      {COMPLEXITY_TAGS.map(({ tag, label, emoji }) => {
        const isActive = activeTags.includes(tag)
        const isSuggested = suggestedTags.includes(tag) && !isActive
        return (
          <button
            key={tag}
            onClick={() => {
              const next = isActive
                ? activeTags.filter(t => t !== tag)
                : [...activeTags, tag]
              onChange(next)
            }}
            title={isSuggested ? `Suggested: ${label}` : label}
            style={{
              padding: '3px 8px',
              borderRadius: 12,
              fontSize: 10,
              fontFamily: 'monospace',
              cursor: 'pointer',
              border: isActive
                ? '1.5px solid transparent'
                : isSuggested
                  ? '1.5px dashed rgba(251,191,36,0.7)'
                  : '1.5px solid rgba(128,128,128,0.3)',
              background: isActive
                ? 'rgba(59,130,246,0.25)'
                : 'transparent',
              color: isActive ? '#93c5fd' : isSuggested ? '#fbbf24' : '#888',
              transition: 'all 0.12s',
            }}
          >
            {emoji} {label}
            {isSuggested && <span style={{ marginLeft: 3, fontSize: 9 }}>*</span>}
          </button>
        )
      })}
    </div>
  )
}

// ── Scene card (collapsed) ────────────────────────────────────────────────────

function SceneCardCollapsed({
  scene, isDark, linkedShotCount, confidence, onExpand,
  onSetColor, draggableListeners, draggableAttributes, showConfidence,
}) {
  const colorStyle = scene.color
    ? { borderLeft: `3px solid ${scene.color}` }
    : { borderLeft: '3px solid transparent' }

  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '7px 12px',
        ...colorStyle,
      }}
    >
      {/* Drag handle */}
      <button
        {...draggableAttributes}
        {...draggableListeners}
        style={{ background: 'none', border: 'none', cursor: 'grab', color: '#555', padding: '0 2px', flexShrink: 0 }}
        title="Drag to reorder"
      >
        <svg width="10" height="16" viewBox="0 0 10 16" fill="currentColor">
          <circle cx="3" cy="3" r="1.5" />
          <circle cx="7" cy="3" r="1.5" />
          <circle cx="3" cy="8" r="1.5" />
          <circle cx="7" cy="8" r="1.5" />
          <circle cx="3" cy="13" r="1.5" />
          <circle cx="7" cy="13" r="1.5" />
        </svg>
      </button>

      {/* Color swatch */}
      <div
        onClick={e => { e.stopPropagation(); onSetColor() }}
        title="Click to set color"
        style={{
          width: 10, height: 10, borderRadius: '50%', flexShrink: 0, cursor: 'pointer',
          background: scene.color || 'rgba(128,128,128,0.2)',
          border: scene.color ? '1.5px solid rgba(255,255,255,0.2)' : '1.5px dashed rgba(128,128,128,0.4)',
        }}
      />

      {/* Scene label */}
      <span style={{ fontSize: 12, fontFamily: 'monospace', fontWeight: 700, color: '#ddd', flexShrink: 0 }}>
        {scene.sceneNumber ? `SC ${scene.sceneNumber}` : '—'}
      </span>

      <span style={{ fontSize: 10, color: '#666', flexShrink: 0 }}>·</span>

      {scene.intExt && (
        <span style={{ fontSize: 10, fontFamily: 'monospace', color: '#aaa', flexShrink: 0 }}>{scene.intExt}</span>
      )}
      {scene.dayNight && (
        <span style={{ fontSize: 10, fontFamily: 'monospace', color: '#aaa', flexShrink: 0 }}>{scene.dayNight}</span>
      )}

      {/* Location (truncated) */}
      <span style={{ fontSize: 11, fontFamily: 'monospace', color: '#ccc', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {scene.location || scene.slugline}
      </span>

      {/* Cast count */}
      {scene.characters.length > 0 && (
        <span style={{ fontSize: 10, color: '#888', flexShrink: 0, whiteSpace: 'nowrap' }}>
          {scene.characters.slice(0, 4).join(', ')}{scene.characters.length > 4 ? `…+${scene.characters.length - 4}` : ''}
        </span>
      )}

      {/* Shot count */}
      <span style={{ fontSize: 10, fontFamily: 'monospace', color: '#888', flexShrink: 0 }}>
        {linkedShotCount} shot{linkedShotCount !== 1 ? 's' : ''}
      </span>

      {/* Estimate */}
      {scene.estimatedMinutes && (
        <span style={{ fontSize: 10, fontFamily: 'monospace', color: '#aaa', flexShrink: 0 }}>
          ~{scene.estimatedMinutes}m
        </span>
      )}

      {/* Confidence */}
      {showConfidence && (
        <ConfidenceDots level={confidence} />
      )}

      {/* Expand toggle */}
      <button
        onClick={onExpand}
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#666', padding: '0 2px', flexShrink: 0 }}
        title="Expand scene"
      >
        ▾
      </button>
    </div>
  )
}

// ── Scene card (expanded) ─────────────────────────────────────────────────────

function SceneCardExpanded({ scene, isDark, linkedShotCount, confidence, linkedShots, onCollapse, onUpdate, onDelete, showConfidence }) {
  const [showActionText, setShowActionText] = useState(false)
  const [colorPickerOpen, setColorPickerOpen] = useState(false)
  const updateScriptScene = useStore(s => s.updateScriptScene)

  const suggested = useMemo(() => getSuggestedTags(scene), [scene])

  const handleFieldChange = (field, value) => {
    onUpdate(field, value)
  }

  const SCENE_COLORS = ['#4ade80', '#22d3ee', '#facc15', '#f87171', '#60a5fa', '#fb923c', '#c084fc', '#f472b6', null]

  const fieldRow = (label, content) => (
    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 8 }}>
      <div style={{ width: 110, flexShrink: 0, fontSize: 10, fontFamily: 'monospace', color: '#666', paddingTop: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        {label}
      </div>
      <div style={{ flex: 1 }}>
        {content}
      </div>
    </div>
  )

  const inputStyle = {
    width: '100%', boxSizing: 'border-box',
    background: 'rgba(128,128,128,0.1)', border: '1px solid rgba(128,128,128,0.25)',
    borderRadius: 3, color: '#ddd', fontFamily: 'monospace', fontSize: 11,
    padding: '4px 7px', outline: 'none',
  }

  return (
    <div style={{ padding: '12px 16px' }}>
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <div style={{ position: 'relative' }}>
          <div
            onClick={() => setColorPickerOpen(!colorPickerOpen)}
            title="Set color"
            style={{
              width: 14, height: 14, borderRadius: '50%', cursor: 'pointer',
              background: scene.color || 'rgba(128,128,128,0.2)',
              border: scene.color ? '1.5px solid rgba(255,255,255,0.3)' : '1.5px dashed rgba(128,128,128,0.5)',
            }}
          />
          {colorPickerOpen && (
            <div style={{
              position: 'absolute', top: 20, left: 0, zIndex: 20,
              background: '#222', border: '1px solid #444', borderRadius: 6,
              padding: 8, boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
              display: 'flex', gap: 4, flexWrap: 'wrap', width: 120,
            }}>
              {SCENE_COLORS.map((c, i) => (
                <button
                  key={i}
                  onClick={() => { handleFieldChange('color', c); setColorPickerOpen(false) }}
                  style={{
                    width: 16, height: 16, borderRadius: '50%',
                    border: scene.color === c ? '2px solid #fff' : '2px solid transparent',
                    background: c || 'transparent',
                    cursor: 'pointer', padding: 0,
                    outline: !c ? '1px dashed rgba(128,128,128,0.5)' : 'none',
                  }}
                />
              ))}
            </div>
          )}
        </div>

        <span style={{ fontSize: 13, fontFamily: 'monospace', fontWeight: 700, color: '#ddd' }}>
          {scene.sceneNumber ? `SC ${scene.sceneNumber}` : '—'}
          {scene.location ? ` · ${scene.location}` : ''}
        </span>

        {showConfidence && <ConfidenceDots level={confidence} />}

        <div style={{ flex: 1 }} />

        <button
          onClick={onCollapse}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#666', fontSize: 12 }}
          title="Collapse"
        >
          ▴
        </button>

        <button
          onClick={onDelete}
          title="Delete scene"
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#f87171', fontSize: 12 }}
        >
          ✕
        </button>
      </div>

      {/* Fields */}
      {fieldRow('Scene #',
        <input
          style={inputStyle}
          value={scene.sceneNumber || ''}
          onChange={e => handleFieldChange('sceneNumber', e.target.value)}
          placeholder="e.g. 12"
        />
      )}

      {fieldRow('Slugline',
        <div style={{ fontFamily: 'monospace', fontSize: 11, color: '#aaa', padding: '4px 0' }}>
          {scene.slugline}
        </div>
      )}

      {fieldRow('Custom Header',
        <input
          style={inputStyle}
          value={scene.customHeader || ''}
          onChange={e => handleFieldChange('customHeader', e.target.value)}
          placeholder="Custom header text…"
        />
      )}

      {fieldRow('INT/EXT',
        <select
          value={scene.intExt || ''}
          onChange={e => handleFieldChange('intExt', e.target.value || null)}
          style={{ ...inputStyle, cursor: 'pointer' }}
        >
          <option value="">—</option>
          <option>INT</option>
          <option>EXT</option>
          <option>INT/EXT</option>
        </select>
      )}

      {fieldRow('Day/Night',
        <select
          value={scene.dayNight || ''}
          onChange={e => handleFieldChange('dayNight', e.target.value || null)}
          style={{ ...inputStyle, cursor: 'pointer' }}
        >
          <option value="">—</option>
          <option>DAY</option>
          <option>NIGHT</option>
          <option>DAWN</option>
          <option>DUSK</option>
          <option>CONTINUOUS</option>
          <option>LATER</option>
        </select>
      )}

      {fieldRow('Location',
        <input
          style={inputStyle}
          value={scene.location || ''}
          onChange={e => handleFieldChange('location', e.target.value)}
          placeholder="Location name"
        />
      )}

      {fieldRow('Characters',
        <input
          style={inputStyle}
          value={scene.characters.join(', ')}
          onChange={e => handleFieldChange('characters', e.target.value.split(',').map(c => c.trim()).filter(Boolean))}
          placeholder="Joe, Tammy, …"
        />
      )}

      {fieldRow('Page Count',
        <input
          type="number"
          style={{ ...inputStyle, width: 80 }}
          value={scene.pageCount ?? ''}
          min={0}
          step={0.125}
          onChange={e => handleFieldChange('pageCount', e.target.value === '' ? null : parseFloat(e.target.value))}
          placeholder="e.g. 1.5"
        />
      )}

      {/* Action text */}
      {scene.actionText && (
        <div style={{ marginBottom: 8 }}>
          <button
            onClick={() => setShowActionText(!showActionText)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#666', fontSize: 11, fontFamily: 'monospace', padding: 0, marginBottom: 4 }}
          >
            {showActionText ? '▾' : '▸'} Action Text
          </button>
          {showActionText && (
            <div style={{
              background: 'rgba(128,128,128,0.07)',
              border: '1px solid rgba(128,128,128,0.15)',
              borderRadius: 4, padding: '6px 10px',
              fontFamily: 'monospace', fontSize: 10,
              color: '#999', whiteSpace: 'pre-wrap', lineHeight: 1.5,
              maxHeight: 120, overflowY: 'auto',
            }}>
              {scene.actionText}
            </div>
          )}
        </div>
      )}

      {/* Complexity tags */}
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 10, fontFamily: 'monospace', color: '#666', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 5 }}>
          Complexity Tags
        </div>
        <ComplexityTagRow
          activeTags={scene.complexityTags}
          suggestedTags={suggested}
          onChange={tags => handleFieldChange('complexityTags', tags)}
        />
      </div>

      {/* Estimate & confidence */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 10, alignItems: 'center' }}>
        <div style={{ fontSize: 11, fontFamily: 'monospace', color: '#aaa' }}>
          Est. shoot time:{' '}
          <strong style={{ color: '#ddd' }}>
            {scene.estimatedMinutes != null ? `~${scene.estimatedMinutes}min` : '—'}
          </strong>
        </div>
        {showConfidence && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <ConfidenceDots level={confidence} />
            <span style={{ fontSize: 10, fontFamily: 'monospace', color: '#666' }}>{confidence}</span>
          </div>
        )}
      </div>

      {/* Notes */}
      {fieldRow('Notes',
        <textarea
          style={{ ...inputStyle, resize: 'vertical', minHeight: 48 }}
          value={scene.notes || ''}
          onChange={e => handleFieldChange('notes', e.target.value)}
          placeholder="Production notes…"
          rows={2}
        />
      )}

      {/* Linked shots */}
      <div style={{ marginTop: 8 }}>
        <div style={{ fontSize: 10, fontFamily: 'monospace', color: '#666', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 5 }}>
          Linked Shots ({linkedShotCount})
        </div>
        {linkedShots.length === 0 ? (
          <div style={{ fontSize: 11, color: '#555', fontStyle: 'italic' }}>
            No shots linked. Use the chain icon on shot cards to link shots to this scene.
          </div>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {linkedShots.map(s => (
              <span key={s.id} style={{
                padding: '2px 7px',
                borderRadius: 4,
                background: 'rgba(59,130,246,0.15)',
                border: '1px solid rgba(59,130,246,0.3)',
                fontSize: 10, fontFamily: 'monospace', color: '#93c5fd',
              }}>
                {s.displayId}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Sortable scene card wrapper ───────────────────────────────────────────────

function SortableSceneCard({ scene, isDark, linkedShotCount, confidence, linkedShots, showConfidence, onImportClick }) {
  const [expanded, setExpanded] = useState(false)
  const [colorPickerOpen, setColorPickerOpen] = useState(false)
  const updateScriptScene = useStore(s => s.updateScriptScene)
  const deleteScriptScene = useStore(s => s.deleteScriptScene)

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: scene.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    borderRadius: 6,
    border: `1px solid ${isDark ? 'rgba(128,128,128,0.2)' : 'rgba(0,0,0,0.1)'}`,
    background: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.85)',
    marginBottom: 6,
    overflow: 'visible',
    position: 'relative',
  }

  const handleUpdate = (field, value) => {
    updateScriptScene(scene.id, { [field]: value })
  }

  const SCENE_COLORS = ['#4ade80', '#22d3ee', '#facc15', '#f87171', '#60a5fa', '#fb923c', '#c084fc', '#f472b6', null]

  return (
    <div ref={setNodeRef} style={style}>
      {/* Color left border */}
      {scene.color && (
        <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, background: scene.color, borderRadius: '6px 0 0 6px' }} />
      )}

      {expanded ? (
        <SceneCardExpanded
          scene={scene}
          isDark={isDark}
          linkedShotCount={linkedShotCount}
          confidence={confidence}
          linkedShots={linkedShots}
          onCollapse={() => setExpanded(false)}
          onUpdate={handleUpdate}
          onDelete={() => deleteScriptScene(scene.id)}
          showConfidence={showConfidence}
        />
      ) : (
        <SceneCardCollapsed
          scene={scene}
          isDark={isDark}
          linkedShotCount={linkedShotCount}
          confidence={confidence}
          onExpand={() => setExpanded(true)}
          onSetColor={() => setColorPickerOpen(!colorPickerOpen)}
          draggableListeners={listeners}
          draggableAttributes={attributes}
          showConfidence={showConfidence}
        />
      )}

      {/* Floating color picker when collapsed */}
      {colorPickerOpen && !expanded && (
        <div style={{
          position: 'absolute', top: 28, left: 24, zIndex: 30,
          background: '#222', border: '1px solid #444', borderRadius: 6,
          padding: 8, boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
          display: 'flex', gap: 4, flexWrap: 'wrap', width: 120,
        }}>
          {SCENE_COLORS.map((c, i) => (
            <button
              key={i}
              onClick={() => { handleUpdate('color', c); setColorPickerOpen(false) }}
              style={{
                width: 16, height: 16, borderRadius: '50%',
                border: scene.color === c ? '2px solid #fff' : '2px solid transparent',
                background: c || 'transparent',
                cursor: 'pointer', padding: 0,
                outline: !c ? '1px dashed rgba(128,128,128,0.5)' : 'none',
              }}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ── Left sidebar ──────────────────────────────────────────────────────────────

function ScriptsSidebar({ scripts, activeScript, onSelect, onImport, onDelete, isDark }) {
  return (
    <div style={{
      width: 200, flexShrink: 0,
      borderRight: `1px solid ${isDark ? 'rgba(128,128,128,0.2)' : '#ddd'}`,
      display: 'flex', flexDirection: 'column',
      background: isDark ? 'rgba(0,0,0,0.15)' : 'rgba(0,0,0,0.03)',
    }}>
      <div style={{ padding: '12px 14px 8px', fontSize: 10, fontFamily: 'monospace', color: '#666', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        Imported Scripts
      </div>

      <div style={{ flex: 1, overflowY: 'auto' }}>
        {/* "All scenes" option */}
        <button
          onClick={() => onSelect(null)}
          style={{
            width: '100%', textAlign: 'left',
            padding: '7px 14px',
            background: activeScript === null ? 'rgba(59,130,246,0.15)' : 'none',
            border: 'none',
            borderLeft: activeScript === null ? '3px solid #3b82f6' : '3px solid transparent',
            cursor: 'pointer',
            fontFamily: 'monospace', fontSize: 11,
            color: activeScript === null ? '#93c5fd' : (isDark ? '#aaa' : '#666'),
          }}
        >
          All Scenes
        </button>

        {scripts.map(script => (
          <div
            key={script.id}
            style={{
              position: 'relative',
              borderLeft: activeScript === script.id ? '3px solid #3b82f6' : '3px solid transparent',
              background: activeScript === script.id ? 'rgba(59,130,246,0.1)' : 'transparent',
            }}
          >
            <button
              onClick={() => onSelect(script.id)}
              style={{
                width: '100%', textAlign: 'left',
                padding: '8px 14px 6px',
                background: 'none', border: 'none', cursor: 'pointer',
              }}
            >
              <div style={{ fontSize: 11, fontFamily: 'monospace', color: isDark ? '#ccc' : '#333', marginBottom: 2, wordBreak: 'break-word' }}>
                {script.filename}
              </div>
              <div style={{ fontSize: 9, color: '#666' }}>
                {script.sceneCount} scenes · {new Date(script.importedAt).toLocaleDateString()}
              </div>
            </button>
            <button
              onClick={() => onDelete(script.id)}
              title="Remove this script and its scenes"
              style={{
                position: 'absolute', top: 6, right: 6,
                background: 'none', border: 'none', cursor: 'pointer',
                color: '#f87171', fontSize: 11, opacity: 0.5,
                padding: '2px 4px',
              }}
              onMouseEnter={e => (e.currentTarget.style.opacity = '1')}
              onMouseLeave={e => (e.currentTarget.style.opacity = '0.5')}
            >
              ✕
            </button>
          </div>
        ))}

        {scripts.length === 0 && (
          <div style={{ padding: '8px 14px', fontSize: 11, color: '#555', fontStyle: 'italic' }}>
            No scripts yet
          </div>
        )}
      </div>

      {/* Import button at bottom */}
      <div style={{ padding: 12, borderTop: `1px solid ${isDark ? 'rgba(128,128,128,0.15)' : '#ddd'}` }}>
        <button
          onClick={onImport}
          style={{
            width: '100%', padding: '7px 0',
            background: '#3b82f6', color: '#fff',
            border: 'none', borderRadius: 5,
            fontFamily: 'monospace', fontSize: 11, fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          + Import Script
        </button>
      </div>
    </div>
  )
}

// ── Main ScenesTab ────────────────────────────────────────────────────────────

export default function ScenesTab() {
  const theme = useStore(s => s.theme)
  const scriptScenes = useStore(s => s.scriptScenes)
  const importedScripts = useStore(s => s.importedScripts)
  const scenes = useStore(s => s.scenes)  // storyboard scenes (for linked shot lookup)
  const deleteImportedScript = useStore(s => s.deleteImportedScript)
  const reorderScriptScenes = useStore(s => s.reorderScriptScenes)
  const scriptSettings = useStore(s => s.scriptSettings)

  const [activeScript, setActiveScript] = useState(null) // null = all, scriptId = filter by source
  const [importModalOpen, setImportModalOpen] = useState(false)
  const [activeId, setActiveId] = useState(null)

  const isDark = theme === 'dark'

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  )

  // Build shot linkage map: scriptSceneId → [shot objects with displayId]
  const linkedShotsMap = useMemo(() => {
    const map = {}
    scenes.forEach((scene, sceneIdx) => {
      scene.shots.forEach((shot, shotIdx) => {
        if (shot.linkedSceneId) {
          const displayId = `${sceneIdx + 1}${shot.id.slice(-4)}` // rough display
          if (!map[shot.linkedSceneId]) map[shot.linkedSceneId] = []
          map[shot.linkedSceneId].push({ ...shot, displayId: `${sceneIdx + 1}${String.fromCharCode(65 + shotIdx)}` })
        }
      })
    })
    return map
  }, [scenes])

  // Filter scenes by active script
  const visibleScenes = useMemo(() => {
    if (!activeScript) return scriptScenes
    const script = importedScripts.find(s => s.id === activeScript)
    if (!script) return scriptScenes
    return scriptScenes.filter(s => s.importSource === script.filename)
  }, [scriptScenes, importedScripts, activeScript])

  const handleDragStart = useCallback(e => setActiveId(e.active.id), [])

  const handleDragEnd = useCallback(({ active, over }) => {
    setActiveId(null)
    if (!over || active.id === over.id) return
    reorderScriptScenes(active.id, over.id)
  }, [reorderScriptScenes])

  if (!importModalOpen && scriptScenes.length === 0) {
    // Empty state
    return (
      <div style={{
        height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        gap: 12, color: isDark ? '#555' : '#aaa',
      }}>
        <div style={{ fontSize: 40 }}>🎬</div>
        <div style={{ fontSize: 14, fontFamily: 'monospace', fontWeight: 700 }}>No scripts imported yet</div>
        <div style={{ fontSize: 12, color: isDark ? '#444' : '#bbb' }}>Import a .fountain, .fdx, .txt, or .pdf script file to get started</div>
        <button
          onClick={() => setImportModalOpen(true)}
          style={{
            marginTop: 8,
            padding: '9px 24px',
            background: '#3b82f6', color: '#fff',
            border: 'none', borderRadius: 6,
            fontFamily: 'monospace', fontSize: 12, fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          Import Script
        </button>
        <ImportScriptModal isOpen={importModalOpen} onClose={() => setImportModalOpen(false)} />
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
      {/* Left sidebar */}
      <ScriptsSidebar
        scripts={importedScripts}
        activeScript={activeScript}
        onSelect={setActiveScript}
        onImport={() => setImportModalOpen(true)}
        onDelete={deleteImportedScript}
        isDark={isDark}
      />

      {/* Main scene list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
        {/* Summary bar */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12,
          marginBottom: 14, paddingBottom: 10,
          borderBottom: `1px solid ${isDark ? 'rgba(128,128,128,0.15)' : '#ddd'}`,
        }}>
          <span style={{ fontSize: 12, fontFamily: 'monospace', fontWeight: 700, color: isDark ? '#ddd' : '#333' }}>
            {visibleScenes.length} scene{visibleScenes.length !== 1 ? 's' : ''}
          </span>
          {activeScript && (
            <span style={{ fontSize: 11, color: '#888' }}>
              from {importedScripts.find(s => s.id === activeScript)?.filename}
            </span>
          )}
          <div style={{ flex: 1 }} />

          {/* Risk summary */}
          {(() => {
            const lowCount = visibleScenes.filter(s => {
              const count = (linkedShotsMap[s.id] || []).length
              return computeConfidence(s, count) === 'low'
            }).length
            if (lowCount === 0) return null
            return (
              <span style={{ fontSize: 11, fontFamily: 'monospace', color: '#f87171' }} title={`${lowCount} scene(s) with low confidence`}>
                ⚠ {lowCount} LOW confidence
              </span>
            )
          })()}
        </div>

        {visibleScenes.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 0', color: '#555', fontSize: 12 }}>
            No scenes from this script. It may have been removed.
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
            <SortableContext items={visibleScenes.map(s => s.id)} strategy={verticalListSortingStrategy}>
              {visibleScenes.map(scene => {
                const linkedShots = linkedShotsMap[scene.id] || []
                const confidence = computeConfidence(scene, linkedShots.length)
                return (
                  <SortableSceneCard
                    key={scene.id}
                    scene={scene}
                    isDark={isDark}
                    linkedShotCount={linkedShots.length}
                    confidence={confidence}
                    linkedShots={linkedShots}
                    showConfidence={scriptSettings.showConfidenceIndicators}
                    onImportClick={() => setImportModalOpen(true)}
                  />
                )
              })}
            </SortableContext>

            <DragOverlay>
              {activeId ? (
                <div style={{
                  padding: '8px 14px',
                  background: isDark ? '#222' : '#fff',
                  border: '1px solid #3b82f6',
                  borderRadius: 6,
                  fontFamily: 'monospace', fontSize: 12, color: '#93c5fd',
                  opacity: 0.9,
                }}>
                  {visibleScenes.find(s => s.id === activeId)?.location || 'Scene'}
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>
        )}
      </div>

      <ImportScriptModal isOpen={importModalOpen} onClose={() => setImportModalOpen(false)} />
    </div>
  )
}
