import React, { useState, useCallback, useMemo, useRef, useEffect, useLayoutEffect } from 'react'
// ── Scene badge for schedule shot blocks ─────────────────────────────────────
// Displays a colored SC badge when a shot is linked to a script scene.
function SceneScheduleBadge({ linkedSceneData, onNavigate }) {
  if (!linkedSceneData) return null
  const color = linkedSceneData.color
  return (
    <span
      data-entity-type={linkedSceneData.id ? 'scene' : undefined}
      data-entity-id={linkedSceneData.id || undefined}
      title={`Script scene: ${linkedSceneData.intExt || ''} ${linkedSceneData.dayNight || ''} · ${linkedSceneData.location || ''}`}
      onClick={onNavigate}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 3,
        padding: '1px 6px',
        borderRadius: 3,
        background: color ? color + '28' : 'rgba(59,130,246,0.12)',
        border: `1px solid ${color || 'rgba(59,130,246,0.35)'}`,
        fontSize: 9, fontFamily: 'monospace', fontWeight: 700,
        color: color || '#93c5fd',
        cursor: onNavigate ? 'pointer' : 'default',
        flexShrink: 0,
        letterSpacing: '0.04em',
        lineHeight: 1.4,
      }}
    >
      SC {linkedSceneData.sceneNumber}
    </span>
  )
}
import {
  DndContext,
  DragOverlay,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
} from '@dnd-kit/core'
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  rectSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import useStore from '../store'
import { DayTabBar } from './DayTabBar'
import SidebarPane from './SidebarPane'

class ScheduleSubviewBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error) {
    // Keep Schedule shell visible even if a subview throws.
    // eslint-disable-next-line no-console
    console.error('Schedule subview render error:', error)
  }

  componentDidUpdate(prevProps) {
    if (prevProps.resetKey !== this.props.resetKey && this.state.hasError) {
      this.setState({ hasError: false })
    }
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback || null
    }
    return this.props.children
  }
}

// ── Time Utilities ────────────────────────────────────────────────────────────

/** Parse a plain-number string (minutes) into a float. Returns 0 for empty/invalid. */
function parseMinutes(str) {
  const s = String(str || '').trim()
  if (!s) return 0
  return Math.max(0, parseFloat(s) || 0)
}

/** Format a total-minutes count into "Xh Ym" or "Ym" display string. */
function formatMins(totalMins) {
  if (!totalMins || totalMins <= 0) return '0m'
  const h = Math.floor(totalMins / 60)
  const m = Math.round(totalMins % 60)
  if (h === 0) return `${m}m`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}

/**
 * Parse a "HH:MM" 24-hour time string (from <input type="time">) into
 * total minutes from midnight. Returns null for empty/invalid input.
 */
function parseStartTime(timeStr) {
  if (!timeStr || !timeStr.includes(':')) return null
  const [h, m] = timeStr.split(':').map(Number)
  if (isNaN(h) || isNaN(m)) return null
  return h * 60 + m
}

/** Format a total-minutes-from-midnight value as "H:MM AM/PM". */
function formatTimeOfDay(totalMins) {
  const safeTotal = ((Math.round(totalMins) % (24 * 60)) + 24 * 60) % (24 * 60)
  const h24 = Math.floor(safeTotal / 60)
  const m = safeTotal % 60
  const h12 = h24 % 12 || 12
  const ampm = h24 < 12 ? 'AM' : 'PM'
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function findBlockDay(blockId, localBlocksByDay) {
  for (const [dayId, ids] of Object.entries(localBlocksByDay)) {
    if (ids.includes(blockId)) return dayId
  }
  return null
}

function formatDate(isoDate) {
  if (!isoDate) return null
  try {
    const d = new Date(isoDate + 'T12:00:00')
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
  } catch {
    return null
  }
}

function normalizeIsoDate(value) {
  if (!value) return null
  if (typeof value === 'string') {
    const s = value.trim()
    if (!s) return null
    const isoLike = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
    if (isoLike) {
      const y = Number(isoLike[1])
      const m = Number(isoLike[2])
      const d = Number(isoLike[3])
      const dt = new Date(y, m - 1, d)
      if (dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d) {
        return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
      }
      return null
    }
    const parsed = new Date(s)
    if (!Number.isNaN(parsed.getTime())) {
      return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${String(parsed.getDate()).padStart(2, '0')}`
    }
    return null
  }
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`
  }
  return null
}

function getCastChipStyle() {
  return {
    fontSize: 9,
    fontFamily: 'monospace',
    fontWeight: 700,
    color: '#1e293b',
    border: '1px solid rgba(30,41,59,0.25)',
    background: 'rgba(255,255,255,0.75)',
    borderRadius: 999,
    padding: '2px 7px',
    letterSpacing: '0.04em',
  }
}

function getTimeTextStyle(hasValue = true) {
  return {
    fontSize: 12,
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
    fontVariantNumeric: 'tabular-nums',
    color: hasValue ? '#0f172a' : '#94a3b8',
    fontWeight: hasValue ? 800 : 600,
    letterSpacing: hasValue ? '0.02em' : '0.05em',
  }
}

function summarizeDay(blocks, pageCountByScene, enrichedBlockMap) {
  const safeBlocks = Array.isArray(blocks) ? blocks : []
  const safePages = pageCountByScene || {}
  const safeEnriched = enrichedBlockMap || {}
  let shotCount = 0
  let totalPages = 0
  let totalMins = 0

  safeBlocks.forEach(block => {
    if (!block || block.type === 'break') {
      totalMins += parseMinutes(block?.duration)
      return
    }
    shotCount += 1
    const enriched = safeEnriched[block.id] || {}
    const sceneId = enriched.linkedSceneId || block.sceneId
    if (sceneId && safePages[sceneId] !== undefined && safePages[sceneId] !== null) {
      totalPages += Number(safePages[sceneId]) || 0
    }
    totalMins += parseMinutes(enriched.shootTime) + parseMinutes(enriched.setupTime)
  })

  return { shotCount, totalPages, totalMins }
}

const LIST_GRID_TEMPLATE = '92px minmax(320px,2.5fr) 108px 128px minmax(160px,1.2fr) 88px 118px 126px 30px 30px'
const LIST_DAY_TAB_BAR_HEIGHT = 36
const LIST_DAY_TAB_BAR_TOP = 0
const LIST_COLUMN_HEADER_TOP = LIST_DAY_TAB_BAR_TOP + LIST_DAY_TAB_BAR_HEIGHT
const LIST_HEADER_COLUMNS = [
  'Scene #',
  'Set',
  'I/E & Day',
  'Cast ID',
  'Shoot Location',
  'Pages',
  'Est. Time',
  'Start Time',
]

function colorWithAlpha(hexColor, alpha = 0.16) {
  if (!hexColor) return `rgba(148,163,184,${alpha})`
  const hex = hexColor.replace('#', '')
  if (hex.length !== 6) return `rgba(148,163,184,${alpha})`
  const r = parseInt(hex.slice(0, 2), 16)
  const g = parseInt(hex.slice(2, 4), 16)
  const b = parseInt(hex.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

function getCastPills(cast) {
  if (!cast) return []
  return cast
    .split(',')
    .map(name => name.trim())
    .filter(Boolean)
    .slice(0, 4)
    .map(name => name.split(/\s+/).map(part => part[0] || '').join('').toUpperCase())
}

function splitCastNames(cast) {
  if (!cast) return []
  return cast.split(',').map(name => name.trim()).filter(Boolean)
}

function hasReadableValue(value) {
  return value !== null && value !== undefined && String(value).trim() !== ''
}

function AccordionSection({ title, isOpen, onToggle, children, grow = false }) {
  return (
    <section style={{ display: 'grid', minHeight: 0, alignContent: 'start', ...(grow ? { flex: 1 } : {}) }}>
      <button
        onClick={onToggle}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 10,
          padding: '9px 10px',
          border: 'none',
          borderBottom: '1px solid rgba(74,85,104,0.12)',
          background: '#f6f3ec',
          cursor: 'pointer',
        }}
      >
        <span style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#64748b' }}>
          {title}
        </span>
        <ChevronIcon collapsed={!isOpen} color="#64748b" size={10} />
      </button>
      {isOpen && (
        <div style={{ padding: '10px 10px 12px', borderBottom: '1px solid rgba(74,85,104,0.08)' }}>
          {children}
        </div>
      )}
    </section>
  )
}

// ── Small shared UI ───────────────────────────────────────────────────────────

function IconButton({ onClick, title, children, danger, small, onPointerDown }) {
  return (
    <button
      onClick={onClick}
      onPointerDown={onPointerDown}
      title={title}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: small ? '2px 6px' : '3px 8px',
        border: '1px solid',
        borderColor: danger ? '#f87171' : 'rgba(128,128,128,0.3)',
        borderRadius: 3,
        background: 'none',
        color: danger ? '#f87171' : 'inherit',
        cursor: 'pointer',
        opacity: 0.7,
        fontSize: small ? 10 : 11,
        fontFamily: 'monospace',
        lineHeight: 1,
        flexShrink: 0,
      }}
      onMouseEnter={e => (e.currentTarget.style.opacity = '1')}
      onMouseLeave={e => (e.currentTarget.style.opacity = '0.7')}
    >
      {children}
    </button>
  )
}

function Badge({ label }) {
  if (!label) return null
  return (
    <span style={{
      display: 'inline-block',
      padding: '1px 5px',
      borderRadius: 3,
      fontSize: 10,
      fontFamily: 'monospace',
      fontWeight: 700,
      letterSpacing: '0.06em',
      background: 'rgba(128,128,128,0.15)',
      flexShrink: 0,
    }}>
      {label}
    </span>
  )
}

function DragHandleIcon({ size = 14, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill={color} style={{ display: 'block' }}>
      <circle cx="5" cy="4" r="1.5" />
      <circle cx="11" cy="4" r="1.5" />
      <circle cx="5" cy="8" r="1.5" />
      <circle cx="11" cy="8" r="1.5" />
      <circle cx="5" cy="12" r="1.5" />
      <circle cx="11" cy="12" r="1.5" />
    </svg>
  )
}

function ChevronIcon({ collapsed, color = 'currentColor', size = 10 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 10 10"
      fill="none"
      stroke={color}
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{
        display: 'block',
        transform: collapsed ? 'rotate(-90deg)' : 'rotate(0deg)',
        transition: 'transform 0.18s ease',
      }}
    >
      <polyline points="2,3.5 5,6.5 8,3.5" />
    </svg>
  )
}

// ── InlineField ───────────────────────────────────────────────────────────────
// Click-to-edit text input styled as plain text at rest.

function InlineField({ value, onChange, placeholder, isDark, label, inputWidth }) {
  const [localVal, setLocalVal] = useState(value || '')
  const [editing, setEditing] = useState(false)

  useEffect(() => {
    if (!editing) setLocalVal(value || '')
  }, [value, editing])

  const commit = useCallback((val) => {
    setEditing(false)
    if (val !== (value || '')) onChange(val)
  }, [value, onChange])

  const mutedFg = isDark ? '#555' : '#999'
  const fg = isDark ? '#ccc' : '#222'
  const borderColor = isDark ? '#3a3a3a' : '#ddd9d0'

  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 5, marginTop: 5, minWidth: 0 }}>
      {label && (
        <span style={{
          fontSize: 9,
          fontFamily: 'monospace',
          color: mutedFg,
          flexShrink: 0,
          letterSpacing: '0.07em',
          textTransform: 'uppercase',
          fontWeight: 700,
        }}>
          {label}:
        </span>
      )}
      <input
        value={localVal}
        onChange={e => setLocalVal(e.target.value)}
        onFocus={() => setEditing(true)}
        onBlur={e => commit(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter') e.target.blur()
          if (e.key === 'Escape') { setLocalVal(value || ''); setEditing(false) }
        }}
        onPointerDown={e => e.stopPropagation()}
        placeholder={placeholder}
        style={{
          flex: inputWidth ? 'none' : 1,
          width: inputWidth || undefined,
          minWidth: 0,
          background: editing ? (isDark ? '#252525' : '#fff') : 'transparent',
          border: editing ? `1px solid ${borderColor}` : '1px solid transparent',
          borderRadius: 3,
          padding: editing ? '2px 6px' : '2px 0',
          fontSize: 11,
          fontFamily: 'monospace',
          color: localVal ? fg : mutedFg,
          outline: 'none',
          cursor: editing ? 'text' : 'pointer',
          transition: 'border-color 0.1s, background 0.1s',
        }}
      />
    </div>
  )
}

// ── ProjectedTimeBadge ────────────────────────────────────────────────────────

function ProjectedTimeBadge({ totalMins, isDark }) {
  return (
    <div style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 4,
      padding: '2px 7px',
      borderRadius: 3,
      background: isDark ? 'rgba(96,165,250,0.12)' : 'rgba(59,130,246,0.08)',
      border: `1px solid ${isDark ? 'rgba(96,165,250,0.25)' : 'rgba(59,130,246,0.2)'}`,
      fontSize: 10,
      fontFamily: 'monospace',
      fontWeight: 600,
      color: isDark ? '#93c5fd' : '#2563eb',
      letterSpacing: '0.04em',
      flexShrink: 0,
    }}>
      <span style={{ opacity: 0.7, fontSize: 9 }}>~</span>
      {formatTimeOfDay(totalMins)}
      <span style={{
        fontSize: 8,
        fontWeight: 400,
        opacity: 0.65,
        letterSpacing: '0.06em',
        marginLeft: 1,
      }}>
        EST.
      </span>
    </div>
  )
}

// ── ShotBlockContent ──────────────────────────────────────────────────────────
// Renders the visual content of a single shot block.
// Used both in the sortable list and in the DragOverlay.
// Props:
//   isCollapsed / onToggleCollapse — Feature 2: per-block collapse
//   shotData.shootTime / shotData.setupTime — Feature 1: synced via shot store

function ShotBlockContent({ block, shotData, dayId, isDark, isOverlay, dragHandleProps, projectedTime, isCollapsed, onToggleCollapse, onCtrlToggleAll, pageCountByScene }) {
  const removeShotBlock = useStore(s => s.removeShotBlock)
  const setActiveTab = useStore(s => s.setActiveTab)

  const [showRemoveConfirm, setShowRemoveConfirm] = useState(false)
  const [hovered, setHovered] = useState(false)

  const borderColor = isDark ? '#2a2a2a' : 'rgba(148,131,104,0.45)'
  const sceneTint = colorWithAlpha(shotData?.linkedSceneData?.color || '#94a3b8', isDark ? 0.34 : 0.36)
  const sceneEdge = shotData?.linkedSceneData?.color || (isDark ? '#64748b' : '#94a3b8')
  const title = shotData?.sceneLabel || 'Untitled scene'
  const secondary = shotData?.notes || shotData?.location || '—'
  const locationLabel = block.shootingLocation || shotData?.location || '—'
  const castPills = getCastPills(shotData?.cast)
  const castNames = Array.from(new Set([
    ...splitCastNames(shotData?.cast),
    ...(shotData?.castRosterEntries || []).map(person => (person?.name || person?.character || '').trim()).filter(Boolean),
  ]))
  const pageVal = (shotData?.linkedSceneId && pageCountByScene?.[shotData.linkedSceneId] !== undefined)
    ? Number(pageCountByScene[shotData.linkedSceneId]).toFixed(2)
    : '—'
  const estMins = parseMinutes(shotData?.shootTime) + parseMinutes(shotData?.setupTime)
  const hasEstTime = estMins > 0
  const hasStartTime = projectedTime !== null && projectedTime !== undefined
  const linkedShots = (shotData?.sceneShotSummaries || []).filter(item => item.id !== shotData?.shotId)
  const hasSceneMeta = hasReadableValue(shotData?.intOrExt) || hasReadableValue(shotData?.dayNight) || hasReadableValue(locationLabel)
  const sceneDescription = [shotData?.description, shotData?.subject, shotData?.sceneNotes, shotData?.notes].find(hasReadableValue) || ''
  const shotSpecs = [
    hasReadableValue(shotData?.cameraName) ? { label: 'Camera', value: shotData.cameraName } : null,
    hasReadableValue(shotData?.focalLength) ? { label: 'Lens', value: shotData.focalLength } : null,
    hasReadableValue(shotData?.specs?.size) ? { label: 'Shot Size', value: shotData.specs.size } : null,
    hasReadableValue(shotData?.specs?.move) ? { label: 'Move', value: shotData.specs.move } : null,
    hasReadableValue(shotData?.specs?.type) ? { label: 'Type', value: shotData.specs.type } : null,
  ].filter(Boolean)
  const productionMeta = [
    hasReadableValue(shotData?.sound) ? { label: 'Sound', value: shotData.sound } : null,
    hasReadableValue(shotData?.props) ? { label: 'Props', value: shotData.props } : null,
    hasReadableValue(shotData?.takeNumber) ? { label: 'Take', value: shotData.takeNumber } : null,
  ].filter(Boolean)
  const castChipStyle = getCastChipStyle()

  const handleConfirmRemove = useCallback(() => {
    removeShotBlock(dayId, block.id)
    setShowRemoveConfirm(false)
  }, [removeShotBlock, dayId, block.id])

  if (!shotData) {
    return (
      <div style={{
        display: 'grid', gridTemplateColumns: LIST_GRID_TEMPLATE, alignItems: 'center',
        gap: 8, minHeight: 34, padding: '4px 10px', borderBottom: `1px solid ${borderColor}`,
        background: '#fff5f5',
      }}>
        <span style={{ fontSize: 11, fontFamily: 'monospace', color: '#ef4444' }}>Deleted shot</span>
      </div>
    )
  }

  return (
    <div
      onMouseEnter={() => !isOverlay && setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'grid',
        gridTemplateColumns: LIST_GRID_TEMPLATE,
        alignItems: 'center',
        columnGap: 10,
        minHeight: 44,
        padding: '6px 10px',
        borderTop: `1px solid ${borderColor}`,
        borderBottom: `1px solid ${borderColor}`,
        borderLeft: `6px solid ${sceneEdge}`,
        background: sceneTint,
        boxShadow: isOverlay ? '0 12px 30px rgba(0,0,0,0.28)' : 'none',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingRight: 8, borderRight: '1px solid rgba(0,0,0,0.18)' }}>
        <span style={{ fontFamily: 'monospace', fontSize: 14, fontWeight: 800, color: '#111827', letterSpacing: '0.03em', minWidth: 42 }}>{shotData.displayId}</span>
        <div {...(dragHandleProps || {})} style={{ marginLeft: 'auto', color: '#6b7280', cursor: dragHandleProps ? 'grab' : 'default', opacity: isOverlay ? 0 : 0.7 }}>
          <DragHandleIcon color="#6b7280" />
        </div>
      </div>

      <div style={{ minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <span style={{ fontSize: 14, fontWeight: 800, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</span>
          {shotData.linkedSceneData && (
            <SceneScheduleBadge linkedSceneData={shotData.linkedSceneData} onNavigate={() => setActiveTab('scenes')} />
          )}
        </div>
        {!isCollapsed && (
          <div style={{ fontSize: 11, color: '#334155', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 2 }}>
            {secondary}
          </div>
        )}
      </div>

      <span style={{ fontSize: 10, fontFamily: 'monospace', color: '#1f2937', lineHeight: 1.25 }}>
        <strong style={{ display: 'block', fontSize: 10 }}>{shotData.intOrExt || '—'}</strong>
        <span style={{ opacity: 0.85 }}>{shotData.dayNight || '—'}</span>
      </span>

      <div style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 0, flexWrap: 'wrap' }}>
        {castPills.length ? castPills.map((pill, idx) => (
          <span key={`${pill}_${idx}`} style={castChipStyle}>{pill}</span>
        )) : <span style={{ fontSize: 10, color: '#6b7280' }}>—</span>}
      </div>

      <span style={{ fontSize: 10, color: '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{locationLabel || '—'}</span>
      <span style={{ fontSize: 11, fontFamily: 'monospace', color: '#111827' }}>{pageVal}</span>
      <span style={{ ...getTimeTextStyle(hasEstTime), textAlign: 'left' }}>
        {hasEstTime ? formatMins(estMins) : '—'}
      </span>
      <span style={{ ...getTimeTextStyle(hasStartTime), color: hasStartTime ? '#0b3a2f' : '#94a3b8', textAlign: 'left' }}>
        {hasStartTime ? formatTimeOfDay(projectedTime) : '—'}
      </span>

      <button
        onClick={e => { e.stopPropagation(); if (e.ctrlKey && onCtrlToggleAll) { onCtrlToggleAll() } else { onToggleCollapse?.() } }}
        onPointerDown={e => e.stopPropagation()}
        title={isCollapsed ? 'Expand' : 'Collapse'}
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#475569', padding: 2, display: isOverlay ? 'none' : 'inline-flex', opacity: 0.45 }}
      >
        <ChevronIcon collapsed={isCollapsed} color="#6b7280" size={10} />
      </button>

      <button
        onClick={() => setShowRemoveConfirm(true)}
        onPointerDown={e => e.stopPropagation()}
        title="Remove from schedule"
        style={{
          border: 'none', background: hovered ? 'rgba(15,23,42,0.2)' : 'transparent', color: '#334155', borderRadius: 4,
          width: 22, height: 22, cursor: 'pointer', display: isOverlay ? 'none' : 'inline-flex',
          alignItems: 'center', justifyContent: 'center', opacity: hovered ? 1 : 0.25,
        }}
      >
        ⋯
      </button>

      {!isCollapsed && (
        <div style={{
          gridColumn: '1 / -1',
          marginTop: 5,
          padding: '10px',
          borderRadius: 4,
          border: '1px solid rgba(15,23,42,0.16)',
          background: 'rgba(255,255,255,0.84)',
          display: 'grid',
          gridTemplateColumns: '120px minmax(0, 1fr)',
          gap: 12,
          alignItems: 'start',
        }}>
          <div>
            {hasReadableValue(shotData?.image) ? (
              <img
                src={shotData.image}
                alt={shotData?.sceneLabel ? `Storyboard for ${shotData.sceneLabel}` : 'Storyboard thumbnail'}
                style={{
                  width: 120,
                  height: 80,
                  objectFit: 'cover',
                  borderRadius: 6,
                  border: '1px solid rgba(15,23,42,0.18)',
                  display: 'block',
                }}
              />
            ) : (
              <div style={{
                width: 120,
                height: 80,
                borderRadius: 6,
                border: '1px solid rgba(15,23,42,0.16)',
                background: 'rgba(241,245,249,0.85)',
                color: '#64748b',
                fontSize: 10,
                display: 'grid',
                placeItems: 'center',
                textAlign: 'center',
                padding: 8,
              }}>
                No storyboard image
              </div>
            )}
          </div>

          <div style={{ minWidth: 0, display: 'grid', gap: 10 }}>
            <div style={{ display: 'grid', gap: 3 }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: '#0f172a', lineHeight: 1.25 }}>
                {hasReadableValue(shotData?.sceneTitle) ? shotData.sceneTitle : title}
              </div>
              {hasReadableValue(sceneDescription) && (
                <div style={{ fontSize: 11, color: '#334155', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {sceneDescription}
                </div>
              )}
            </div>

            <div style={{ display: 'grid', gap: 4 }}>
              <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#64748b' }}>Metadata</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(140px, 1fr))', gap: '3px 10px' }}>
                <span style={{ fontSize: 11, color: '#334155' }}><strong>Pages:</strong> {pageVal}</span>
                {hasReadableValue(shotData?.intOrExt) && <span style={{ fontSize: 11, color: '#334155' }}><strong>I/E:</strong> {shotData.intOrExt}</span>}
                {hasReadableValue(shotData?.dayNight) && <span style={{ fontSize: 11, color: '#334155' }}><strong>Day/Night:</strong> {shotData.dayNight}</span>}
                {locationLabel !== '—' && <span style={{ fontSize: 11, color: '#334155' }}><strong>Location:</strong> {locationLabel}</span>}
              </div>
            </div>

            {castNames.length > 0 && (
              <div style={{ display: 'grid', gap: 3 }}>
                <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#64748b' }}>People</div>
                <div style={{ fontSize: 11, color: '#0f172a' }}>
                  <strong>Cast:</strong> {castNames.join(', ')}
                </div>
              </div>
            )}

            {(shotSpecs.length > 0 || productionMeta.length > 0 || linkedShots.length > 0) && (
              <div style={{ display: 'grid', gap: 4 }}>
                <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#64748b' }}>Technical</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(120px, 1fr))', gap: '3px 10px' }}>
                  {shotSpecs.map(item => (
                    <span key={item.label} style={{ fontSize: 11, color: '#334155' }}>
                      <strong>{item.label}:</strong> {item.value}
                    </span>
                  ))}
                  {productionMeta.map(item => (
                    <span key={item.label} style={{ fontSize: 11, color: '#334155' }}>
                      <strong>{item.label}:</strong> {item.value}
                    </span>
                  ))}
                </div>
                {linkedShots.length > 0 && (
                  <div style={{ fontSize: 10, color: '#475569' }}>
                    Linked shots: {linkedShots.slice(0, 6).map(linked => linked.cameraName || linked.id).join(', ')}
                  </div>
                )}
              </div>
            )}

            {hasSceneMeta && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                <Badge label={`Pages ${pageVal}`} />
                {hasEstTime ? <Badge label={`Est ${formatMins(estMins)}`} /> : null}
                {hasReadableValue(shotData?.intOrExt) ? <Badge label={shotData.intOrExt} /> : null}
                {hasReadableValue(shotData?.dayNight) ? <Badge label={shotData.dayNight} /> : null}
              </div>
            )}
          </div>
        </div>
      )}

      {showRemoveConfirm && (
        <RemoveConfirmDialog
          displayId={shotData?.displayId}
          isDark={isDark}
          onConfirm={handleConfirmRemove}
          onCancel={() => setShowRemoveConfirm(false)}
        />
      )}
    </div>
  )
}

// ── RemoveConfirmDialog ────────────────────────────────────────────────────────
// Small modal confirming removal of a shot from the schedule (Feature 4).

function RemoveConfirmDialog({ displayId, isDark, onConfirm, onCancel }) {
  const bg = isDark ? '#1e1e1e' : '#fff'
  const borderColor = isDark ? '#3a3a3a' : '#d4d0c8'
  const fg = isDark ? '#ddd' : '#111'
  const mutedFg = isDark ? '#888' : '#555'

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 2000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0,0,0,0.35)',
      }}
      onPointerDown={e => { e.stopPropagation(); onCancel() }}
    >
      <div
        style={{
          background: bg,
          border: `1px solid ${borderColor}`,
          borderRadius: 8,
          boxShadow: isDark ? '0 12px 40px rgba(0,0,0,0.7)' : '0 12px 40px rgba(0,0,0,0.2)',
          padding: '20px 22px',
          maxWidth: 380,
          width: '90vw',
        }}
        onPointerDown={e => e.stopPropagation()}
      >
        <p style={{ fontFamily: 'monospace', fontSize: 14, fontWeight: 700, color: fg, margin: '0 0 8px' }}>
          Remove from schedule?
        </p>
        {displayId && (
          <p style={{ fontFamily: 'monospace', fontSize: 13, color: fg, margin: '0 0 6px' }}>
            Shot <strong>{displayId}</strong>
          </p>
        )}
        <p style={{ fontSize: 12, color: mutedFg, margin: '0 0 18px', lineHeight: 1.5 }}>
          This removes the shot from this day only. It will remain in your storyboard and shotlist.
        </p>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button
            onClick={onCancel}
            style={{ padding: '6px 14px', fontFamily: 'monospace', fontSize: 12, border: `1px solid ${borderColor}`, borderRadius: 4, background: 'none', color: fg, cursor: 'pointer' }}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            style={{ padding: '6px 14px', fontFamily: 'monospace', fontSize: 12, fontWeight: 700, background: '#ef4444', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}
          >
            Remove from Schedule
          </button>
        </div>
      </div>
    </div>
  )
}

// ── SortableShotBlock ─────────────────────────────────────────────────────────

function SortableShotBlock({ block, shotData, dayId, isDark, projectedTime, isCollapsed, onToggleCollapse, onCtrlToggleAll, pageCountByScene }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: block.id,
    data: { type: 'block', dayId },
  })

  return (
    <div
      ref={setNodeRef}
      data-entity-type={block.type === 'shot' && block.shotId ? 'shot' : undefined}
      data-entity-id={block.type === 'shot' ? block.shotId : undefined}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        // Hide fully when dragging — the DragOverlay renders the visual copy,
        // so keeping the original visible (even semi-transparent) causes flickering.
        opacity: isDragging ? 0 : 1,
        position: 'relative',
        zIndex: isDragging ? 1 : 'auto',
      }}
    >
      {block.type === 'break' ? (
        <BreakBlockContent
          block={block}
          dayId={dayId}
          isDark={isDark}
          projectedTime={projectedTime}
          dragHandleProps={{ ...attributes, ...listeners }}
        />
      ) : (
        <ShotBlockContent
          block={block}
          shotData={shotData}
          dayId={dayId}
          isDark={isDark}
          projectedTime={projectedTime}
          dragHandleProps={{ ...attributes, ...listeners }}
          isCollapsed={isCollapsed}
          onToggleCollapse={onToggleCollapse}
          onCtrlToggleAll={onCtrlToggleAll}
          pageCountByScene={pageCountByScene}
        />
      )}
    </div>
  )
}

// ── DayDropZone ───────────────────────────────────────────────────────────────

function DayDropZone({ dayId, isDark }) {
  const { setNodeRef, isOver } = useDroppable({
    id: `zone_${dayId}`,
    data: { type: 'day-body', dayId },
  })

  const mutedFg = isDark ? '#444' : '#ccc'
  const borderColor = isOver ? (isDark ? '#666' : '#aaa') : (isDark ? '#333' : '#e0dcd5')

  return (
    <div
      ref={setNodeRef}
      style={{
        margin: '8px 10px',
        padding: '16px 12px',
        border: `1.5px dashed ${borderColor}`,
        borderRadius: 2,
        textAlign: 'center',
        transition: 'border-color 0.15s',
        background: isDark ? 'rgba(17,17,17,0.4)' : 'rgba(255,255,255,0.6)',
      }}
    >
      <span style={{ fontSize: 11, fontFamily: 'monospace', color: mutedFg }}>
        {isOver ? 'Drop here' : 'No shots — drag in or use Add Shot below'}
      </span>
    </div>
  )
}

// ── DayEndDropZone ────────────────────────────────────────────────────────────

function DayEndDropZone({ dayId }) {
  const { setNodeRef, isOver } = useDroppable({
    id: `end_${dayId}`,
    data: { type: 'day-body', dayId },
  })

  return (
    <div
      ref={setNodeRef}
      style={{
        height: isOver ? 32 : 6,
        transition: 'height 0.15s',
        margin: '0 10px',
      }}
    />
  )
}

// ── Column visibility helper ──────────────────────────────────────────────────

function isColVisible(config, key) {
  if (!config || !Array.isArray(config)) return true
  const col = config.find(c => c.key === key)
  return col ? col.visible : true
}

// ── ScheduleColumnConfigList ──────────────────────────────────────────────────

function ScheduleColumnConfigList({ config, onChange }) {
  if (!Array.isArray(config) || config.length === 0) {
    return <div style={{ fontSize: 11, color: '#64748b' }}>No list column options available.</div>
  }
  return (
    <div style={{ display: 'grid', gap: 5 }}>
      <div style={{ fontSize: 10, color: '#64748b', letterSpacing: '0.04em', fontWeight: 700, textTransform: 'uppercase' }}>
        List Columns
      </div>
      {config.map(col => (
        <label
          key={col.key}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontSize: 12,
            color: '#1f2937',
            cursor: 'pointer',
            padding: '3px 0',
          }}
        >
          <input
            type="checkbox"
            checked={!!col.visible}
            onChange={() => onChange(config.map(c => c.key === col.key ? { ...c, visible: !c.visible } : c))}
          />
          <span>{col.label}</span>
        </label>
      ))}
    </div>
  )
}

// ── DayTotals ─────────────────────────────────────────────────────────────────

function DayTotals({ blocks, enrichedBlockMap, isDark }) {
  const scriptScenes = useStore(s => s.scriptScenes)
  const scriptSettings = useStore(s => s.scriptSettings)
  const safeScriptScenes = Array.isArray(scriptScenes) ? scriptScenes : []
  const safeBlocks = Array.isArray(blocks) ? blocks : []

  if (safeBlocks.length === 0) return null

  const shotBlocks = safeBlocks.filter(b => b.type !== 'break')
  const breakBlocks = safeBlocks.filter(b => b.type === 'break')
  // Feature 1: use the shot's own shootTime/setupTime (via enrichedBlockMap) as the source of truth
  const totalShootMins = shotBlocks.reduce((sum, b) => {
    const sd = enrichedBlockMap ? enrichedBlockMap[b.id] : null
    return sum + parseMinutes(sd?.shootTime)
  }, 0)
  const totalSetupMins = shotBlocks.reduce((sum, b) => {
    const sd = enrichedBlockMap ? enrichedBlockMap[b.id] : null
    return sum + parseMinutes(sd?.setupTime)
  }, 0)
  const totalBreakMins = breakBlocks.reduce((sum, b) => sum + parseMinutes(b.duration), 0)
  const totalMins = totalShootMins + totalSetupMins + totalBreakMins

  // Only show if any times have been entered
  if (totalMins === 0) return null

  // Compute low-confidence scene count for this day's shot blocks
  const lowConfidenceScenes = scriptSettings?.showConfidenceIndicators
    ? (() => {
        const sceneIds = new Set()
        const lowIds = []
        shotBlocks.forEach(b => {
          const sd = enrichedBlockMap ? enrichedBlockMap[b.id] : null
          if (sd?.linkedSceneId && !sceneIds.has(sd.linkedSceneId)) {
            sceneIds.add(sd.linkedSceneId)
            const ss = safeScriptScenes.find(s => s.id === sd.linkedSceneId)
            if (ss) {
              // Count shots linked to this scene across all blocks in this day
              const linkedCount = shotBlocks.filter(bb => {
                const ssd = enrichedBlockMap ? enrichedBlockMap[bb.id] : null
                return ssd?.linkedSceneId === ss.id
              }).length
              const tags = ss.complexityTags || []
              const hasStuntVfx = tags.includes('stunt') || tags.includes('vfx')
              if (linkedCount === 0 || hasStuntVfx || tags.length >= 5) {
                lowIds.push(ss)
              }
            }
          }
        })
        return lowIds
      })()
    : []

  const borderColor = isDark ? '#2a2a2a' : '#e5e0d8'
  const fg = isDark ? '#ccc' : '#222'
  const mutedFg = isDark ? '#555' : '#666'
  const accentBg = isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)'

  return (
    <div style={{
      margin: '0 14px 0 14px',
      padding: '8px 10px',
      borderTop: `1px solid ${borderColor}`,
      borderRadius: '0 0 4px 4px',
      background: accentBg,
      display: 'flex',
      alignItems: 'center',
      gap: 18,
      flexWrap: 'wrap',
    }}>
      <span style={{
        fontSize: 10,
        fontFamily: 'monospace',
        fontWeight: 700,
        letterSpacing: '0.1em',
        textTransform: 'uppercase',
        color: mutedFg,
        flexShrink: 0,
      }}>
        Day Totals
      </span>

      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', flex: 1 }}>
        {totalShootMins > 0 && (
          <span style={{ fontSize: 11, fontFamily: 'monospace', color: fg }}>
            <span style={{ color: mutedFg }}>Shoot: </span>
            {formatMins(totalShootMins)}
          </span>
        )}
        {totalSetupMins > 0 && (
          <span style={{ fontSize: 11, fontFamily: 'monospace', color: fg }}>
            <span style={{ color: mutedFg }}>Setup: </span>
            {formatMins(totalSetupMins)}
          </span>
        )}
        {totalBreakMins > 0 && (
          <span style={{ fontSize: 11, fontFamily: 'monospace', color: fg }}>
            <span style={{ color: mutedFg }}>Breaks: </span>
            {formatMins(totalBreakMins)}
          </span>
        )}
        <span style={{
          fontSize: 11,
          fontFamily: 'monospace',
          fontWeight: 700,
          color: fg,
        }}>
          <span style={{ color: mutedFg, fontWeight: 400 }}>Combined: </span>
          {formatMins(totalMins)}
        </span>
      </div>

      {/* Risk summary — low confidence scenes */}
      {lowConfidenceScenes.length > 0 && (
        <span
          title={`Low-confidence scenes: ${lowConfidenceScenes.map(s => `SC ${s.sceneNumber} (${s.location})`).join(', ')}`}
          style={{
            fontSize: 10, fontFamily: 'monospace', color: '#f87171',
            display: 'inline-flex', alignItems: 'center', gap: 3,
            cursor: 'help', flexShrink: 0,
          }}
        >
          ⚠ {lowConfidenceScenes.length} LOW confidence
        </span>
      )}
    </div>
  )
}

// ── ShotPickerPanel ───────────────────────────────────────────────────────────

function ShotPickerPanel({ dayId, existingShotIds, isDark, onClose, anchorEl }) {
  const scenes = useStore(s => s.scenes)
  const getShotsForScene = useStore(s => s.getShotsForScene)
  const addShotBlock = useStore(s => s.addShotBlock)
  const safeScenes = Array.isArray(scenes) ? scenes : []
  const safeGetShotsForScene = typeof getShotsForScene === 'function' ? getShotsForScene : () => []
  const safeExistingShotIds = Array.isArray(existingShotIds) ? existingShotIds : []
  const panelRef = useRef(null)
  const [pos, setPos] = useState({ top: 'auto', bottom: 'auto', left: 0 })

  // Compute fixed position from anchor element so the panel isn't clipped by overflow containers
  useLayoutEffect(() => {
    if (!anchorEl) return
    const rect = anchorEl.getBoundingClientRect()
    const panelMaxH = 340
    const spaceAbove = rect.top
    if (spaceAbove >= panelMaxH + 8) {
      setPos({ bottom: window.innerHeight - rect.top + 4, top: 'auto', left: rect.left })
    } else {
      setPos({ top: rect.bottom + 4, bottom: 'auto', left: rect.left })
    }
  }, [anchorEl])

  useEffect(() => {
    const handler = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  // Close if user scrolls outside the panel (panel position would become stale)
  useEffect(() => {
    const handler = (e) => {
      if (panelRef.current && panelRef.current.contains(e.target)) return
      onClose()
    }
    window.addEventListener('scroll', handler, true)
    return () => window.removeEventListener('scroll', handler, true)
  }, [onClose])

  const bg = isDark ? '#1e1e1e' : '#fff'
  const borderColor = isDark ? '#333' : '#d4cfc6'
  const fg = isDark ? '#ddd' : '#1a1a1a'
  const mutedFg = isDark ? '#666' : '#999'
  const groupHeaderBg = isDark ? '#161616' : '#f3f1ec'
  const hoverBg = isDark ? '#252525' : '#f7f5f0'

  const totalShots = safeScenes.reduce((n, sc) => n + (Array.isArray(sc.shots) ? sc.shots.length : 0), 0)

  return (
    <div
      ref={panelRef}
      onMouseDown={e => e.stopPropagation()}
      style={{
        position: 'fixed',
        top: pos.top === 'auto' ? 'auto' : pos.top,
        bottom: pos.bottom === 'auto' ? 'auto' : pos.bottom,
        left: pos.left,
        zIndex: 1000,
        width: 380,
        maxWidth: 'calc(100vw - 48px)',
        background: bg,
        border: `1px solid ${borderColor}`,
        borderRadius: 6,
        boxShadow: isDark
          ? '0 8px 32px rgba(0,0,0,0.55)'
          : '0 8px 32px rgba(0,0,0,0.16)',
        maxHeight: 340,
        overflowY: 'auto',
        overflowX: 'hidden',
      }}
    >
      {/* Header */}
      <div style={{
        padding: '8px 12px',
        borderBottom: `1px solid ${borderColor}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        position: 'sticky',
        top: 0,
        background: bg,
        zIndex: 1,
      }}>
        <span style={{ fontSize: 11, fontFamily: 'monospace', fontWeight: 700, color: fg, letterSpacing: '0.06em' }}>
          ADD SHOT
        </span>
        <button
          onClick={onClose}
          style={{
            border: 'none',
            background: 'none',
            color: mutedFg,
            cursor: 'pointer',
            fontSize: 16,
            lineHeight: 1,
            padding: 0,
          }}
        >
          ×
        </button>
      </div>

      {totalShots === 0 ? (
        <div style={{ padding: '16px 12px', fontSize: 12, fontFamily: 'monospace', color: mutedFg, textAlign: 'center' }}>
          No shots in project yet.
        </div>
      ) : (
        safeScenes.map((scene, sceneIdx) => {
          const shots = safeGetShotsForScene(scene.id)
          if (shots.length === 0) return null
          return (
            <div key={scene.id}>
              <div
                data-entity-type="scene"
                data-entity-id={scene.id}
                style={{
                padding: '5px 12px',
                fontSize: 10,
                fontFamily: 'monospace',
                fontWeight: 700,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: mutedFg,
                background: groupHeaderBg,
                borderTop: sceneIdx > 0 ? `1px solid ${borderColor}` : 'none',
                borderBottom: `1px solid ${borderColor}`,
                position: 'sticky',
                top: 33,
                zIndex: 1,
              }}>
                {scene.sceneLabel}
                {scene.location ? ` — ${scene.location}` : ''}
                <span style={{ fontWeight: 400, marginLeft: 6, opacity: 0.6 }}>
                  {scene.intOrExt} · {scene.dayNight}
                </span>
              </div>

              {shots.map(shot => {
                const alreadyAdded = safeExistingShotIds.includes(shot.id)
                const intExt = shot.intOrExt || scene.intOrExt
                const dn = shot.dayNight || scene.dayNight
                return (
                  <button
                    key={shot.id}
                    data-entity-type="shot"
                    data-entity-id={shot.id}
                    onClick={() => addShotBlock(dayId, shot.id)}
                    title={alreadyAdded ? 'Already scheduled — click to add again' : 'Add to this day'}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      width: '100%',
                      padding: '7px 12px',
                      textAlign: 'left',
                      background: 'none',
                      border: 'none',
                      borderBottom: `1px solid ${borderColor}`,
                      cursor: 'pointer',
                      color: fg,
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = hoverBg)}
                    onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                  >
                    <span style={{
                      fontFamily: 'monospace',
                      fontSize: 12,
                      fontWeight: 700,
                      color: alreadyAdded ? mutedFg : fg,
                      minWidth: 26,
                      flexShrink: 0,
                    }}>
                      {shot.displayId}
                    </span>
                    <span style={{
                      fontSize: 11,
                      color: alreadyAdded ? mutedFg : fg,
                      flex: 1,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}>
                      {shot.subject || <span style={{ fontStyle: 'italic', opacity: 0.5 }}>No subject</span>}
                    </span>
                    <span style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                      {intExt && <Badge label={intExt} />}
                      {dn && <Badge label={dn} />}
                    </span>
                    {alreadyAdded && (
                      <span style={{ fontSize: 10, fontFamily: 'monospace', color: mutedFg, flexShrink: 0 }}>
                        ✓
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          )
        })
      )}
    </div>
  )
}

// ── BreakBlockContent ─────────────────────────────────────────────────────────

function BreakBlockContent({ block, dayId, isDark, isOverlay, dragHandleProps, projectedTime }) {
  const removeShotBlock = useStore(s => s.removeShotBlock)
  const updateShotBlock = useStore(s => s.updateShotBlock)

  const [editingName, setEditingName] = useState(false)
  const [localName, setLocalName] = useState(block.label || 'Break')

  useEffect(() => {
    if (!editingName) setLocalName(block.label || 'Break')
  }, [block.label, editingName])

  const commitName = useCallback((val) => {
    setEditingName(false)
    const newName = val.trim() || 'Break'
    if (newName !== block.label && dayId) updateShotBlock(dayId, block.id, { label: newName })
  }, [block.label, block.id, dayId, updateShotBlock])

  const handleDurationChange = useCallback((val) => {
    if (dayId) updateShotBlock(dayId, block.id, { duration: val })
  }, [block.id, dayId, updateShotBlock])

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: LIST_GRID_TEMPLATE,
      alignItems: 'center',
      columnGap: 10,
      minHeight: 42,
      padding: '6px 10px',
      background: isDark ? '#252525' : '#2f3640',
      color: '#e5e7eb',
      borderTop: '1px solid rgba(255,255,255,0.08)',
      borderBottom: '1px solid rgba(255,255,255,0.09)',
      boxShadow: isOverlay ? '0 12px 30px rgba(0,0,0,0.28)' : 'none',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingRight: 8, borderRight: '1px solid rgba(255,255,255,0.2)' }}>
        <span style={{ fontFamily: 'monospace', fontSize: 12, fontWeight: 800, minWidth: 42 }}>BREAK</span>
        <div {...(dragHandleProps || {})} style={{ color: '#cbd5e1', cursor: dragHandleProps ? 'grab' : 'default', opacity: isOverlay ? 0 : 0.7, marginLeft: 'auto' }}>
          <DragHandleIcon color="#cbd5e1" />
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
        <span style={{ fontSize: 12 }}>⏸</span>
        <input
          value={localName}
          onChange={e => setLocalName(e.target.value)}
          onFocus={() => setEditingName(true)}
          onBlur={e => commitName(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') e.target.blur()
            if (e.key === 'Escape') { setLocalName(block.label || 'Break'); setEditingName(false) }
          }}
          onPointerDown={e => e.stopPropagation()}
          style={{
            fontFamily: 'monospace', fontSize: 11, fontWeight: 700, color: '#f8fafc',
            background: editingName ? 'rgba(255,255,255,0.08)' : 'transparent',
            border: editingName ? '1px solid rgba(255,255,255,0.22)' : '1px solid transparent',
            borderRadius: 3, padding: editingName ? '2px 6px' : '2px 0', outline: 'none', maxWidth: 220,
          }}
        />
      </div>
      <span style={{ fontSize: 10, fontFamily: 'monospace', color: '#cbd5e1' }}>—</span>
      <span style={{ fontSize: 10, color: '#cbd5e1' }}>—</span>
      <span style={{ fontSize: 10, color: '#cbd5e1' }}>—</span>
      <span style={{ fontSize: 11, fontFamily: 'monospace', color: '#f8fafc' }}>—</span>
      <div>
        {!isOverlay && (
          <InlineField
            value={block.duration !== undefined && block.duration !== 0 ? String(block.duration) : ''}
            onChange={handleDurationChange}
            placeholder="—"
            isDark={true}
            label={null}
            inputWidth={56}
          />
        )}
      </div>
      <span style={{ fontSize: 11, fontFamily: 'monospace', color: '#f8fafc' }}>{projectedTime !== null && projectedTime !== undefined ? formatTimeOfDay(projectedTime) : '—'}</span>
      <span />
      {!isOverlay ? (
        <button
          onClick={() => removeShotBlock(dayId, block.id)}
          onPointerDown={e => e.stopPropagation()}
          title="Remove break"
          style={{ border: 'none', background: 'rgba(255,255,255,0.14)', color: '#f8fafc', borderRadius: 4, width: 22, height: 22, cursor: 'pointer' }}
        >
          ⋯
        </button>
      ) : <span />}
    </div>
  )
}

// ── BreakPickerPanel ──────────────────────────────────────────────────────────

const BREAK_PRESETS = ['Lunch', 'Company Move', '10-1', 'Meal Penalty', 'Camera Reload', 'Lighting Reset']

function BreakPickerPanel({ dayId, isDark, onClose, anchorEl }) {
  const addBreakBlock = useStore(s => s.addBreakBlock)
  const [name, setName] = useState('Lunch')
  const [duration, setDuration] = useState('30')
  const panelRef = useRef(null)
  const [pos, setPos] = useState({ top: 'auto', bottom: 'auto', left: 0 })

  // Compute fixed position from anchor element so the panel isn't clipped by overflow containers
  useLayoutEffect(() => {
    if (!anchorEl) return
    const rect = anchorEl.getBoundingClientRect()
    const panelEstH = 280
    const spaceAbove = rect.top
    if (spaceAbove >= panelEstH + 8) {
      setPos({ bottom: window.innerHeight - rect.top + 4, top: 'auto', left: rect.left })
    } else {
      setPos({ top: rect.bottom + 4, bottom: 'auto', left: rect.left })
    }
  }, [anchorEl])

  useEffect(() => {
    const handler = (e) => { if (panelRef.current && !panelRef.current.contains(e.target)) onClose() }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  // Close if user scrolls (panel position would become stale)
  useEffect(() => {
    const handler = () => onClose()
    window.addEventListener('scroll', handler, true)
    return () => window.removeEventListener('scroll', handler, true)
  }, [onClose])

  const handleAdd = useCallback(() => {
    addBreakBlock(dayId, name.trim() || 'Break', parseFloat(duration) || 0)
    onClose()
  }, [addBreakBlock, dayId, name, duration, onClose])

  const bg = isDark ? '#1e1e1e' : '#fff'
  const borderColor = isDark ? '#333' : '#d4cfc6'
  const fg = isDark ? '#ddd' : '#1a1a1a'
  const mutedFg = isDark ? '#888' : '#555'
  const inputBg = isDark ? '#252525' : '#fff'

  return (
    <div
      ref={panelRef}
      style={{
        position: 'fixed',
        top: pos.top === 'auto' ? 'auto' : pos.top,
        bottom: pos.bottom === 'auto' ? 'auto' : pos.bottom,
        left: pos.left,
        zIndex: 1000,
        width: 300,
        maxWidth: 'calc(100vw - 48px)',
        background: bg,
        border: `1px solid ${borderColor}`,
        borderRadius: 6,
        boxShadow: isDark ? '0 8px 32px rgba(0,0,0,0.55)' : '0 8px 32px rgba(0,0,0,0.16)',
        padding: 14,
      }}
    >
      <p style={{ fontFamily: 'monospace', fontSize: 11, fontWeight: 700, color: fg, marginBottom: 10, letterSpacing: '0.06em' }}>
        ADD BREAK
      </p>

      {/* Presets */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 10 }}>
        {BREAK_PRESETS.map(preset => (
          <button
            key={preset}
            onClick={() => setName(preset)}
            onPointerDown={e => e.stopPropagation()}
            style={{
              padding: '3px 8px',
              fontFamily: 'monospace',
              fontSize: 10,
              border: `1px solid ${name === preset ? (isDark ? '#aaa' : '#555') : borderColor}`,
              borderRadius: 3,
              background: name === preset ? (isDark ? '#333' : '#ede9e0') : 'none',
              color: fg,
              cursor: 'pointer',
            }}
          >
            {preset}
          </button>
        ))}
      </div>

      <div style={{ marginBottom: 8 }}>
        <label style={{ display: 'block', fontFamily: 'monospace', fontSize: 10, color: mutedFg, marginBottom: 3 }}>
          Name
        </label>
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          onPointerDown={e => e.stopPropagation()}
          onKeyDown={e => { if (e.key === 'Enter') handleAdd() }}
          style={{
            width: '100%',
            fontFamily: 'monospace',
            fontSize: 11,
            padding: '4px 7px',
            border: `1px solid ${borderColor}`,
            borderRadius: 3,
            background: inputBg,
            color: fg,
            outline: 'none',
          }}
        />
      </div>

      <div style={{ marginBottom: 12 }}>
        <label style={{ display: 'block', fontFamily: 'monospace', fontSize: 10, color: mutedFg, marginBottom: 3 }}>
          Duration (minutes)
        </label>
        <input
          type="number"
          value={duration}
          onChange={e => setDuration(e.target.value)}
          min={0}
          step={5}
          onPointerDown={e => e.stopPropagation()}
          onKeyDown={e => { if (e.key === 'Enter') handleAdd() }}
          placeholder="0"
          style={{
            width: 90,
            fontFamily: 'monospace',
            fontSize: 11,
            padding: '4px 7px',
            border: `1px solid ${borderColor}`,
            borderRadius: 3,
            background: inputBg,
            color: fg,
            outline: 'none',
          }}
        />
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={handleAdd}
          onPointerDown={e => e.stopPropagation()}
          style={{
            flex: 1,
            padding: '6px 10px',
            fontFamily: 'monospace',
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '0.04em',
            background: isDark ? '#333' : '#1a1a1a',
            color: '#fff',
            border: 'none',
            borderRadius: 4,
            cursor: 'pointer',
          }}
        >
          Add Break
        </button>
        <button
          onClick={onClose}
          onPointerDown={e => e.stopPropagation()}
          style={{
            padding: '6px 12px',
            fontFamily: 'monospace',
            fontSize: 11,
            background: 'none',
            color: mutedFg,
            border: `1px solid ${borderColor}`,
            borderRadius: 4,
            cursor: 'pointer',
          }}
        >
          Cancel
        </button>
      </div>
    </div>
  )
}

// ── AddShotFooter ─────────────────────────────────────────────────────────────

function AddShotFooter({ dayId, existingShotIds, isDark }) {
  const [pickerOpen, setPickerOpen] = useState(false)
  const [breakPickerOpen, setBreakPickerOpen] = useState(false)
  const shotBtnRef = useRef(null)
  const breakBtnRef = useRef(null)

  const borderColor = isDark ? '#2a2a2a' : '#e5e0d8'
  const fg = isDark ? '#ccc' : '#333'

  const btnStyle = (active) => ({
    display: 'inline-flex',
    alignItems: 'center',
    gap: 5,
    padding: '5px 10px',
    fontFamily: 'monospace',
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: '0.04em',
    border: `1px solid ${borderColor}`,
    borderRadius: 4,
    background: active ? (isDark ? '#252525' : '#ede9e0') : 'none',
    color: fg,
    cursor: 'pointer',
    transition: 'background 0.1s',
  })

  return (
    <div style={{
      padding: '6px 10px 10px',
      borderTop: `1px solid ${borderColor}`,
      background: isDark ? '#1f1f1f' : '#f1ede5',
    }}>
      {pickerOpen && (
        <ShotPickerPanel
          dayId={dayId}
          existingShotIds={existingShotIds}
          isDark={isDark}
          onClose={() => setPickerOpen(false)}
          anchorEl={shotBtnRef.current}
        />
      )}
      {breakPickerOpen && (
        <BreakPickerPanel
          dayId={dayId}
          isDark={isDark}
          onClose={() => setBreakPickerOpen(false)}
          anchorEl={breakBtnRef.current}
        />
      )}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <button
          ref={shotBtnRef}
          onClick={() => { setPickerOpen(p => !p); setBreakPickerOpen(false) }}
          style={btnStyle(pickerOpen)}
        >
          <span style={{ fontSize: 14, lineHeight: 1, marginTop: -1 }}>+</span>
          Add Shot
          <span style={{ fontSize: 8, opacity: 0.5, marginLeft: 2 }}>{pickerOpen ? '▲' : '▼'}</span>
        </button>
        <button
          ref={breakBtnRef}
          onClick={() => { setBreakPickerOpen(p => !p); setPickerOpen(false) }}
          style={btnStyle(breakPickerOpen)}
        >
          <span style={{ fontSize: 14, lineHeight: 1, marginTop: -1 }}>+</span>
          Add Break
        </button>
      </div>
    </div>
  )
}

function ScheduleListColumnHeader() {
  return (
    <div style={{
      position: 'sticky',
      top: LIST_COLUMN_HEADER_TOP,
      zIndex: 24,
      background: '#d3c9b8',
      borderTop: '1px solid #b8ae9d',
      borderBottom: '1px solid #8f8573',
      marginBottom: 0,
      boxShadow: '0 2px 0 rgba(17,24,39,0.06)',
    }}>
      <div style={{
        display: 'grid',
        gridTemplateColumns: LIST_GRID_TEMPLATE,
        alignItems: 'center',
        columnGap: 10,
        padding: '8px 10px',
      }}>
        {LIST_HEADER_COLUMNS.map((label) => (
          <span
            key={label}
            style={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              color: '#374151',
              fontFamily: 'monospace',
            }}
          >
            {label}
          </span>
        ))}
        <span />
        <span />
      </div>
    </div>
  )
}

// ── SortableShootingDay ───────────────────────────────────────────────────────

function SortableShootingDay({ day, dayIndex, blocks, enrichedBlockMap, isDark, totalDays, pageCountByScene }) {
  const removeShootingDay = useStore(s => s.removeShootingDay)
  const updateShootingDay = useStore(s => s.updateShootingDay)
  const setDayCollapsed = useStore(s => s.setDayCollapsed)
  const setBlockCollapsed = useStore(s => s.setBlockCollapsed)
  const setDayBlocksCollapsed = useStore(s => s.setDayBlocksCollapsed)
  const collapseState = useStore(s => s.scheduleCollapseState)
  const collapsed = collapseState?.days?.[day.id] ?? false
  const collapsedBlocksMap = collapseState?.blocks || {}

  const toggleBlockCollapse = useCallback((blockId) => {
    setBlockCollapsed(blockId, !(collapsedBlocksMap[blockId] ?? true))
  }, [setBlockCollapsed, collapsedBlocksMap])

  const handleCtrlToggleAllBlocks = useCallback(() => {
    const shotBlockIds = blocks.filter(b => b.type !== 'break').map(b => b.id)
    const anyExpanded = shotBlockIds.some(id => !(collapsedBlocksMap[id] ?? true))
    setDayBlocksCollapsed(shotBlockIds, anyExpanded)
  }, [blocks, collapsedBlocksMap, setDayBlocksCollapsed])

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: day.id,
    data: { type: 'day' },
  })

  const blockIds = blocks.map(b => b.id)
  const existingShotIds = blocks.filter(b => b.type !== 'break').map(b => b.shotId)
  const formattedDate = formatDate(day.date)
  const shotCount = blocks.filter(b => b.type !== 'break').length
  const breakCount = blocks.filter(b => b.type === 'break').length

  const startMins = parseStartTime(day.startTime)
  let cumulativeMins = 0
  const blockProjections = blocks.map(block => {
    const projectedTime = startMins !== null ? startMins + cumulativeMins : null
    if (block.type === 'break') {
      cumulativeMins += parseMinutes(block.duration)
    } else {
      const sd = enrichedBlockMap[block.id]
      cumulativeMins += parseMinutes(sd?.shootTime) + parseMinutes(sd?.setupTime)
    }
    return { block, projectedTime }
  })

  const totalShootMins = blocks.reduce((sum, b) => b.type === 'break' ? sum : sum + parseMinutes(enrichedBlockMap[b.id]?.shootTime), 0)
  const totalBreakMins = blocks.reduce((sum, b) => b.type === 'break' ? sum + parseMinutes(b.duration) : sum, 0)
  const totalPages = blocks.reduce((sum, b) => {
    const sid = enrichedBlockMap[b.id]?.linkedSceneId
    return sum + (sid && pageCountByScene[sid] ? Number(pageCountByScene[sid]) : 0)
  }, 0)

  return (
    <section
      ref={setNodeRef}
      id={`sched-day-${day.id}`}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.45 : 1,
        marginBottom: 0,
        borderBottom: '1px solid #c8bfaf',
        overflow: 'hidden',
        background: '#f5f2ea',
      }}
    >
      <div
        {...attributes}
        {...listeners}
        onClick={() => setDayCollapsed(day.id, !collapsed)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '6px 10px',
          background: '#dfd7c9',
          borderTop: dayIndex === 0 ? 'none' : '1px solid #bcb19f',
          borderBottom: collapsed ? 'none' : '1px solid #c5bcab',
          cursor: isDragging ? 'grabbing' : 'grab',
          userSelect: 'none',
        }}
      >
        <DragHandleIcon color="#6b7280" size={12} />
        <span style={{ fontFamily: 'monospace', fontSize: 12, fontWeight: 800, color: '#111827' }}>Day {dayIndex + 1}</span>
        <input
          type="date"
          value={day.date || ''}
          onChange={e => updateShootingDay(day.id, { date: e.target.value })}
          onPointerDown={e => e.stopPropagation()}
          onClick={e => e.stopPropagation()}
          style={{ fontFamily: 'monospace', fontSize: 11, border: 'none', background: 'transparent', color: '#111827', outline: 'none' }}
        />
        <span style={{ fontSize: 11, color: '#4b5563', fontFamily: 'monospace' }}>{formattedDate || 'No date set'}</span>
        <span style={{ fontSize: 10, color: '#6b7280', fontFamily: 'monospace' }}>CALL</span>
        <input
          type="time"
          value={day.startTime || ''}
          onChange={e => updateShootingDay(day.id, { startTime: e.target.value })}
          onPointerDown={e => e.stopPropagation()}
          onClick={e => e.stopPropagation()}
          style={{ fontFamily: 'monospace', fontSize: 11, border: '1px solid #d2cbbb', borderRadius: 3, background: '#fff', color: '#111827', padding: '1px 4px', width: 86 }}
        />
        <span style={{ fontSize: 10, color: '#6b7280', fontFamily: 'monospace' }}>BASE</span>
        <input
          type="text"
          value={day.basecamp || ''}
          onChange={e => updateShootingDay(day.id, { basecamp: e.target.value })}
          onPointerDown={e => e.stopPropagation()}
          onClick={e => e.stopPropagation()}
          placeholder="Basecamp"
          style={{ fontFamily: 'monospace', fontSize: 11, border: '1px solid #d2cbbb', borderRadius: 3, background: '#fff', color: '#111827', padding: '1px 4px', width: 120 }}
        />
        <span style={{ marginLeft: 'auto', fontSize: 10, color: '#4b5563', fontFamily: 'monospace', fontWeight: 700 }}>{shotCount} strips · {breakCount} breaks</span>
        <button
          onClick={(e) => { e.stopPropagation(); removeShootingDay(day.id) }}
          style={{ border: 'none', background: 'transparent', color: '#334155', borderRadius: 4, width: 24, height: 24, cursor: 'pointer', opacity: 0.55 }}
          title="Day actions"
        >
          ⋯
        </button>
        <ChevronIcon collapsed={collapsed} color="#6b7280" size={10} />
      </div>

      {!collapsed && (
        <>
          <SortableContext items={blockIds} strategy={verticalListSortingStrategy}>
            {blocks.length === 0 ? (
              <DayDropZone dayId={day.id} isDark={isDark} />
            ) : (
              <>
                {blockProjections.map(({ block, projectedTime }) => (
                  <SortableShotBlock
                    key={block.id}
                    block={block}
                    shotData={enrichedBlockMap[block.id]}
                    dayId={day.id}
                    isDark={isDark}
                    projectedTime={projectedTime}
                    isCollapsed={collapsedBlocksMap[block.id] ?? true}
                    onToggleCollapse={() => toggleBlockCollapse(block.id)}
                    onCtrlToggleAll={handleCtrlToggleAllBlocks}
                    pageCountByScene={pageCountByScene}
                  />
                ))}
                <DayEndDropZone dayId={day.id} />
              </>
            )}
          </SortableContext>

          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr auto auto auto auto',
            gap: 10,
            alignItems: 'center',
            padding: '8px 10px',
            background: '#111827',
            color: '#e5e7eb',
            borderTop: '1px solid rgba(255,255,255,0.08)',
            borderBottom: '1px solid rgba(255,255,255,0.08)',
          }}>
            <span style={{ fontFamily: 'monospace', fontSize: 11, fontWeight: 800, letterSpacing: '0.04em' }}>End of Day {dayIndex + 1} of {totalDays}</span>
            <span style={{ fontSize: 10, fontFamily: 'monospace' }}>Shoot {formatMins(totalShootMins)}</span>
            <span style={{ fontSize: 10, fontFamily: 'monospace' }}>Break {formatMins(totalBreakMins)}</span>
            <span style={{ fontSize: 10, fontFamily: 'monospace' }}>Pages {totalPages > 0 ? totalPages.toFixed(2) : '—'}</span>
            <span style={{ fontSize: 10, fontFamily: 'monospace' }}>{shotCount} strips</span>
          </div>

          <AddShotFooter
            dayId={day.id}
            existingShotIds={existingShotIds}
            isDark={isDark}
          />
        </>
      )}
    </section>
  )
}

// ── EmptyState ────────────────────────────────────────────────────────────────

function EmptyState({ isDark, onAddDay }) {
  const mutedFg = isDark ? '#555' : '#888'
  const fg = isDark ? '#ddd' : '#222'

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 16,
      padding: '80px 24px',
      textAlign: 'center',
    }}>
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke={mutedFg} strokeWidth="1.5">
        <rect x="3" y="4" width="18" height="18" rx="2" />
        <line x1="16" y1="2" x2="16" y2="6" />
        <line x1="8" y1="2" x2="8" y2="6" />
        <line x1="3" y1="10" x2="21" y2="10" />
        <line x1="8" y1="14" x2="16" y2="14" />
        <line x1="8" y1="18" x2="13" y2="18" />
      </svg>
      <p style={{ margin: 0, fontSize: 13, color: mutedFg, fontFamily: 'monospace' }}>
        No shooting days yet.
      </p>
      <button
        onClick={onAddDay}
        style={{
          padding: '8px 20px',
          fontFamily: 'monospace',
          fontSize: 12,
          fontWeight: 700,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          border: `1px solid ${isDark ? '#555' : '#bbb'}`,
          borderRadius: 4,
          background: 'none',
          color: fg,
          cursor: 'pointer',
        }}
      >
        + Add Shooting Day
      </button>
    </div>
  )
}

// ── Stripboard utilities ──────────────────────────────────────────────────────

function getCastInitials(cast) {
  if (!cast) return ''
  return cast
    .split(',')
    .map(name => {
      const trimmed = name.trim()
      if (!trimmed) return ''
      const parts = trimmed.split(/\s+/)
      return parts.map(p => p[0] || '').join('').toUpperCase()
    })
    .filter(Boolean)
    .join(' ')
}

const STRIP_COLUMN_MIN_WIDTH = 250

// ── StripDetailPopover ────────────────────────────────────────────────────────

function StripDetailPopover({ block, shotData, dayId, isDark, onClose, anchorRect, pageCountByScene }) {
  const updateShotBlock = useStore(s => s.updateShotBlock)
  const updateShot = useStore(s => s.updateShot)
  const removeShotBlock = useStore(s => s.removeShotBlock)
  const popoverRef = useRef(null)
  const [pos, setPos] = useState({ top: 0, left: 0 })

  const bg = isDark ? '#1e1e1e' : '#fff'
  const borderColor = isDark ? '#333' : '#d4cfc6'
  const fg = isDark ? '#ddd' : '#1a1a1a'
  const mutedFg = isDark ? '#666' : '#888'
  const castNames = splitCastNames(shotData?.cast)
  const linkedShots = (shotData?.sceneShotSummaries || []).filter(item => item.id !== shotData?.shotId)
  const pageVal = (shotData?.linkedSceneId && pageCountByScene?.[shotData.linkedSceneId] !== undefined)
    ? Number(pageCountByScene[shotData.linkedSceneId]).toFixed(2)
    : null
  const estMins = parseMinutes(shotData?.shootTime) + parseMinutes(shotData?.setupTime)

  useLayoutEffect(() => {
    if (!anchorRect || !popoverRef.current) return
    const pw = 360
    const ph = popoverRef.current.offsetHeight || 420
    let left = anchorRect.right + 10
    if (left + pw > window.innerWidth - 12) left = anchorRect.left - pw - 10
    left = Math.max(8, Math.min(left, window.innerWidth - pw - 8))
    let top = anchorRect.top
    if (top + ph > window.innerHeight - 12) top = window.innerHeight - ph - 12
    top = Math.max(8, top)
    setPos({ top, left })
  }, [anchorRect])

  useEffect(() => {
    const handler = (e) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target)) onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <div
      ref={popoverRef}
      style={{
        position: 'fixed',
        top: pos.top,
        left: pos.left,
        zIndex: 1500,
        width: 360,
        background: bg,
        border: `1px solid ${borderColor}`,
        borderRadius: 6,
        boxShadow: isDark ? '0 8px 32px rgba(0,0,0,0.7)' : '0 8px 32px rgba(0,0,0,0.22)',
        overflow: 'hidden',
      }}
      onMouseDown={e => e.stopPropagation()}
    >
      {/* Header */}
      <div style={{
        padding: '9px 12px',
        borderBottom: `1px solid ${borderColor}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        background: isDark ? '#252525' : '#f7f5f0',
      }}>
        {shotData ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <span style={{ fontFamily: 'monospace', fontSize: 15, fontWeight: 800, color: fg }}>
              {shotData.displayId}
            </span>
            <Badge label={shotData.intOrExt} />
            <Badge label={shotData.dayNight} />
          </div>
        ) : (
          <span style={{ fontSize: 12, color: '#f87171', fontFamily: 'monospace' }}>Shot deleted</span>
        )}
        <button
          onClick={onClose}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: mutedFg, fontSize: 16, lineHeight: 1, padding: '0 2px' }}
        >
          ×
        </button>
      </div>

      {shotData ? (
        <>
          {/* Body */}
          <div style={{ padding: '10px 12px', maxHeight: 420, overflowY: 'auto', display: 'grid', gap: 8 }}>
            {shotData.image && (
              <img
                src={shotData.image}
                alt={`${shotData.displayId} storyboard`}
                style={{ width: '100%', maxHeight: 140, objectFit: 'cover', borderRadius: 4, border: `1px solid ${borderColor}` }}
              />
            )}
            <div style={{ fontSize: 12, color: fg, fontWeight: 700 }}>{shotData.sceneSlugline || shotData.sceneTitle || shotData.sceneLabel}</div>
            <div style={{ marginBottom: 2, fontSize: 11, color: mutedFg }}>
              <span style={{ fontWeight: 600, fontFamily: 'monospace', color: fg }}>{shotData.sceneLabel}</span>
              {shotData.location && <><span style={{ margin: '0 4px' }}>·</span><span>{shotData.location}</span></>}
            </div>
            {shotData.notes && (
              <div style={{
                marginBottom: 6,
                fontSize: 11,
                color: mutedFg,
                fontStyle: 'italic',
                lineHeight: 1.5,
                borderLeft: `2px solid ${isDark ? '#333' : '#e5e0d8'}`,
                paddingLeft: 6,
                overflow: 'hidden',
                display: '-webkit-box',
                WebkitLineClamp: 3,
                WebkitBoxOrient: 'vertical',
              }}>
                {shotData.notes}
              </div>
            )}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {pageVal ? <Badge label={`Pages ${pageVal}`} /> : null}
              {estMins > 0 ? <Badge label={`Est ${formatMins(estMins)}`} /> : null}
              {shotData.intOrExt ? <Badge label={shotData.intOrExt} /> : null}
              {shotData.dayNight ? <Badge label={shotData.dayNight} /> : null}
            </div>
            {castNames.length > 0 && <div style={{ fontSize: 11, color: fg }}><strong>Cast:</strong> {castNames.join(', ')}</div>}
            {linkedShots.length > 0 && <div style={{ fontSize: 11, color: fg }}><strong>Linked shots:</strong> {linkedShots.map(s => s.cameraName || s.id).join(', ')}</div>}
            <InlineField value={shotData.cast || ''} onChange={(val) => updateShot(block.shotId, { cast: val })} placeholder="Cast…" isDark={isDark} label="CAST" />
            <InlineField
              value={block.shootingLocation || ''}
              onChange={(val) => updateShotBlock(dayId, block.id, { shootingLocation: val })}
              placeholder="Shooting location…"
              isDark={isDark}
              label="LOCATION"
            />
            <div style={{ display: 'flex', gap: 16 }}>
              <InlineField
                value={shotData.shootTime || ''}
                onChange={(val) => updateShot(block.shotId, { shootTime: val })}
                placeholder="—"
                isDark={isDark}
                label="SHOOT"
                inputWidth={40}
              />
              <InlineField
                value={shotData.setupTime || ''}
                onChange={(val) => updateShot(block.shotId, { setupTime: val })}
                placeholder="—"
                isDark={isDark}
              label="SETUP"
              inputWidth={40}
            />
            <InlineField
              value={shotData.cameraName || ''}
              onChange={(val) => updateShot(block.shotId, { cameraName: val })}
              placeholder="Camera package…"
              isDark={isDark}
              label="CAMERA"
            />
          </div>
          </div>

          {/* Footer */}
          <div style={{
            padding: '7px 12px',
            borderTop: `1px solid ${borderColor}`,
            display: 'flex',
            justifyContent: 'flex-end',
          }}>
            <button
              onClick={() => { removeShotBlock(dayId, block.id); onClose() }}
              style={{
                padding: '4px 10px',
                fontFamily: 'monospace',
                fontSize: 11,
                fontWeight: 700,
                background: 'none',
                border: '1px solid #f87171',
                borderRadius: 3,
                color: '#f87171',
                cursor: 'pointer',
              }}
            >
              Remove
            </button>
          </div>
        </>
      ) : (
        <div style={{ padding: '10px 12px' }}>
          <button
            onClick={onClose}
            style={{ color: mutedFg, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'monospace', fontSize: 11 }}
          >
            Close
          </button>
        </div>
      )}
    </div>
  )
}

// ── ShotStripContent ──────────────────────────────────────────────────────────

function ShotStripContent({ block, shotData, color, isDark, height, dragHandleProps, onClick, isOverlay }) {
  const fg = isDark ? '#ddd' : '#111'
  const mutedFg = isDark ? '#777' : '#666'
  const borderColor = isDark ? '#2a2a2a' : '#ede9df'
  const bg = isDark ? '#1c1c1c' : '#fff'
  const hoverBg = isDark ? '#252525' : '#f7f5f0'
  const [hovered, setHovered] = useState(false)
  const minHeight = Math.max(height || 0, 52)

  if (!shotData) {
    return (
      <div style={{
        minHeight,
        display: 'flex',
        alignItems: 'center',
        paddingLeft: 8,
        background: isDark ? '#2a1f1f' : '#fff5f5',
        borderBottom: `1px solid ${borderColor}`,
      }}>
        <span style={{ fontSize: 9, color: '#f87171', fontFamily: 'monospace' }}>Deleted</span>
      </div>
    )
  }

  const castStr = getCastInitials(shotData.cast)
  const castNames = splitCastNames(shotData.cast)
  const castSummary = castNames.length > 0
    ? `${castNames.slice(0, 2).join(', ')}${castNames.length > 2 ? ` +${castNames.length - 2}` : ''}`
    : ''
  const locationStr = block.shootingLocation || shotData.location || ''
  const title = shotData.sceneSlugline || shotData.sceneTitle || shotData.sceneLabel || ''
  const pageLabel = hasReadableValue(shotData.pageLength) ? `${shotData.pageLength} pgs` : null
  const estMins = parseMinutes(shotData.shootTime) + parseMinutes(shotData.setupTime)
  const estLabel = estMins > 0 ? formatMins(estMins) : null

  return (
    <div
      {...(dragHandleProps || {})}
      onClick={onClick}
      onMouseEnter={() => !isOverlay && setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      title={`${shotData.displayId} — ${shotData.sceneLabel}${locationStr ? ` · ${locationStr}` : ''}`}
      style={{
        minHeight,
        display: 'grid',
        gridTemplateRows: 'auto auto auto',
        gap: 3,
        padding: '7px 8px',
        borderBottom: `1px solid ${borderColor}`,
        background: hovered ? hoverBg : bg,
        cursor: isOverlay ? 'grabbing' : dragHandleProps ? 'grab' : 'pointer',
        userSelect: 'none',
        transition: isOverlay ? undefined : 'background 0.1s',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
        <div style={{
          width: 4,
          alignSelf: 'stretch',
          borderRadius: 2,
          background: color || '#9ca3af',
          flexShrink: 0,
        }} />
        <span style={{
          fontFamily: 'monospace',
          fontSize: 10,
          fontWeight: 800,
          color: fg,
          flexShrink: 0,
          letterSpacing: '-0.01em',
        }}>
          {shotData.displayId}
        </span>
        {shotData.intOrExt && (
          <span style={{ fontFamily: 'monospace', fontSize: 8, color: mutedFg, flexShrink: 0 }}>
            {shotData.intOrExt}
          </span>
        )}
        {shotData.dayNight && (
          <span style={{ fontFamily: 'monospace', fontSize: 8, color: mutedFg, flexShrink: 0 }}>
            {shotData.dayNight}
          </span>
        )}
        <span style={{
          fontSize: 10,
          fontWeight: 700,
          color: fg,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          minWidth: 0,
        }}>
          {title || shotData.sceneLabel}
        </span>
      </div>

      <div style={{
        fontSize: 10,
        color: mutedFg,
        overflow: 'hidden',
        display: '-webkit-box',
        WebkitLineClamp: 2,
        WebkitBoxOrient: 'vertical',
        minHeight: 26,
        lineHeight: 1.3,
      }}>
        {locationStr || 'Location not set'}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap', minWidth: 0 }}>
        {pageLabel && <span style={{ fontSize: 9, fontFamily: 'monospace', color: mutedFg }}>{pageLabel}</span>}
        {estLabel && <span style={{ fontSize: 9, fontFamily: 'monospace', color: mutedFg }}>{estLabel}</span>}
        {castStr && <span style={{ fontSize: 9, fontFamily: 'monospace', color: mutedFg }}>{castStr}</span>}
        {castSummary && (
          <span style={{ fontSize: 9, color: mutedFg, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
            {castSummary}
          </span>
        )}
      </div>
    </div>
  )
}

// ── SpecialStripContent ───────────────────────────────────────────────────────

function SpecialStripContent({ block, isDark, height, dragHandleProps, isOverlay }) {
  const borderColor = isDark ? '#2a2a2a' : '#ede9df'
  const minHeight = Math.max(height || 0, 38)

  let bg, textColor, label, icon
  if (block.type === 'break') {
    bg = isDark ? '#2a1f00' : '#fff7e6'
    textColor = isDark ? '#d4a820' : '#92580a'
    label = block.label || 'Break'
    icon = '⏸'
  } else if (block.type === 'move') {
    bg = isDark ? '#180f2e' : '#f3e8ff'
    textColor = isDark ? '#c084fc' : '#7c3aed'
    label = block.label || 'Company Move'
    icon = '↗'
  } else if (block.type === 'meal') {
    bg = isDark ? '#1f1a00' : '#fefce8'
    textColor = isDark ? '#facc15' : '#92730a'
    label = block.label || 'Meal'
    icon = '●'
  } else {
    bg = isDark ? '#1e1e1e' : '#f5f5f5'
    textColor = isDark ? '#888' : '#666'
    label = block.label || block.type
    icon = '●'
  }

  const duration = block.duration
  const durationStr = duration ? ` ${duration}m` : ''

  return (
    <div
      {...(dragHandleProps || {})}
      style={{
        minHeight,
        display: 'flex',
        alignItems: 'center',
        gap: 5,
        paddingLeft: 8,
        paddingRight: 6,
        borderBottom: `1px solid ${borderColor}`,
        background: bg,
        cursor: isOverlay ? 'grabbing' : dragHandleProps ? 'grab' : 'default',
        userSelect: 'none',
        overflow: 'hidden',
      }}
    >
      <span style={{ fontSize: 10, flexShrink: 0 }}>{icon}</span>
      <span style={{
        fontFamily: 'monospace',
        fontSize: 10,
        fontWeight: 700,
        color: textColor,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        flex: 1,
      }}>
        {label}{durationStr}
      </span>
    </div>
  )
}

// ── SortableStrip ─────────────────────────────────────────────────────────────

function SortableStrip({ block, shotData, color, dayId, isDark, height, onStripClick }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: block.id,
    data: { type: 'block', dayId },
  })

  const isShotBlock = !!block.shotId

  const handleClick = useCallback((e) => {
    if (!isShotBlock) return
    const rect = e.currentTarget.getBoundingClientRect()
    onStripClick(block, shotData, dayId, rect)
  }, [block, shotData, dayId, onStripClick, isShotBlock])

  return (
    <div
      ref={setNodeRef}
      data-entity-type={isShotBlock ? 'shot' : undefined}
      data-entity-id={isShotBlock ? block.shotId : undefined}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0 : 1,
      }}
    >
      {isShotBlock ? (
        <ShotStripContent
          block={block}
          shotData={shotData}
          color={color}
          isDark={isDark}
          height={height}
          dragHandleProps={{ ...attributes, ...listeners }}
          onClick={handleClick}
        />
      ) : (
        <SpecialStripContent
          block={block}
          isDark={isDark}
          height={height}
          dragHandleProps={{ ...attributes, ...listeners }}
        />
      )}
    </div>
  )
}

// ── StripboardColumnDropZone ──────────────────────────────────────────────────

function StripboardColumnDropZone({ dayId, isDark }) {
  const { setNodeRef, isOver } = useDroppable({
    id: `zone_${dayId}`,
    data: { type: 'day-body', dayId },
  })
  const borderColor = isOver ? (isDark ? '#666' : '#aaa') : (isDark ? '#333' : '#ddd9d0')
  const mutedFg = isDark ? '#444' : '#bbb'

  return (
    <div
      ref={setNodeRef}
      style={{
        margin: 6,
        padding: '12px 8px',
        border: `1.5px dashed ${borderColor}`,
        borderRadius: 3,
        textAlign: 'center',
        transition: 'border-color 0.15s',
      }}
    >
      <span style={{ fontSize: 9, fontFamily: 'monospace', color: mutedFg }}>
        {isOver ? 'Drop here' : 'No shots'}
      </span>
    </div>
  )
}

// ── SortableStripboardColumn ──────────────────────────────────────────────────

function SortableStripboardColumn({ day, dayIndex, blocks, enrichedBlockMap, shotColorMap, isDark, height, onStripClick, pageCountByScene }) {
  const updateShootingDay = useStore(s => s.updateShootingDay)
  const [editingDate, setEditingDate] = useState(false)
  const dateInputRef = useRef(null)

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: day.id,
    data: { type: 'day' },
  })

  const bg = isDark ? '#1a1a1a' : '#fff'
  const headerBg = isDark ? '#202020' : '#f5f3ee'
  const borderColor = isDark ? '#2a2a2a' : '#d9d4cb'
  const fg = isDark ? '#ddd' : '#111'
  const mutedFg = isDark ? '#555' : '#777'

  const { shotCount, totalPages, totalMins } = summarizeDay(blocks, pageCountByScene, enrichedBlockMap)
  const blockIds = blocks.map(b => b.id)
  const formattedDate = formatDate(day.date)
  const startMins = parseStartTime(day.startTime)
  const callStr = startMins !== null ? formatTimeOfDay(startMins) : null

  const handleHeaderDoubleClick = useCallback((e) => {
    e.stopPropagation()
    setEditingDate(true)
    // Attempt to show native date picker after mount
    setTimeout(() => {
      if (dateInputRef.current) {
        dateInputRef.current.focus()
        dateInputRef.current.showPicker?.()
      }
    }, 50)
  }, [])

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : 1,
        width: '100%',
        minWidth: STRIP_COLUMN_MIN_WIDTH,
        border: `1px solid ${borderColor}`,
        borderRadius: 5,
        overflow: 'hidden',
        background: bg,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Column header — drag handle + double-click to edit date */}
      <div
        {...attributes}
        {...listeners}
        onDoubleClick={handleHeaderDoubleClick}
        style={{
          padding: '7px 9px',
          background: headerBg,
          borderBottom: `1px solid ${borderColor}`,
          cursor: 'grab',
          userSelect: 'none',
          flexShrink: 0,
        }}
      >
        <div style={{
          fontFamily: 'monospace',
          fontSize: 10,
          fontWeight: 800,
          color: fg,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          marginBottom: 2,
        }}>
          Day {dayIndex + 1}
        </div>

        {/* Date row — inline editor on double-click */}
        <div
          onPointerDown={e => editingDate && e.stopPropagation()}
          onClick={e => editingDate && e.stopPropagation()}
        >
          {editingDate ? (
            <input
              ref={dateInputRef}
              type="date"
              value={day.date || ''}
              onChange={e => updateShootingDay(day.id, { date: e.target.value })}
              onBlur={() => setEditingDate(false)}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === 'Escape') setEditingDate(false) }}
              onPointerDown={e => e.stopPropagation()}
              style={{
                fontFamily: 'monospace',
                fontSize: 10,
                border: `1px solid ${isDark ? '#444' : '#ccc'}`,
                borderRadius: 3,
                background: isDark ? '#252525' : '#fff',
                color: fg,
                outline: 'none',
                padding: '1px 4px',
                width: '100%',
              }}
            />
          ) : (
            <div
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: formattedDate ? fg : mutedFg,
                fontFamily: 'monospace',
                minHeight: 15,
                fontStyle: formattedDate ? undefined : 'italic',
              }}
              title="Double-click column header to edit date"
            >
              {formattedDate || 'No date set'}
            </div>
          )}
        </div>

        {/* Call time + day summary */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 4, flexWrap: 'wrap' }}>
          {callStr && (
            <span style={{ ...getTimeTextStyle(true), fontSize: 10, color: mutedFg }}>
              CALL {callStr}
            </span>
          )}
          <span style={{ fontFamily: 'monospace', fontSize: 9, color: mutedFg }}>
            {shotCount} shot{shotCount !== 1 ? 's' : ''}
          </span>
          {totalPages > 0 && <span style={{ fontFamily: 'monospace', fontSize: 9, color: mutedFg }}>{totalPages.toFixed(2)} pgs</span>}
          {totalMins > 0 && <span style={{ fontFamily: 'monospace', fontSize: 9, color: mutedFg }}>{formatMins(totalMins)}</span>}
        </div>
      </div>

      {/* Strips */}
      <SortableContext items={blockIds} strategy={verticalListSortingStrategy}>
        {blocks.length === 0 ? (
          <StripboardColumnDropZone dayId={day.id} isDark={isDark} />
        ) : (
          <>
            {blocks.map(block => {
              const isShotBlock = !!block.shotId
              const shotData = isShotBlock ? enrichedBlockMap[block.id] : null
              const color = isShotBlock ? (shotColorMap[block.shotId] || '#9ca3af') : null
              return (
                <SortableStrip
                  key={block.id}
                  block={block}
                  shotData={shotData}
                  color={color}
                  dayId={day.id}
                  isDark={isDark}
                  height={height}
                  onStripClick={onStripClick}
                />
              )
            })}
            <DayEndDropZone dayId={day.id} />
          </>
        )}
      </SortableContext>
    </div>
  )
}

// ── CalendarView ──────────────────────────────────────────────────────────────
// A month-view calendar where each shoot day with a date appears as a draggable
// card inside the corresponding cell. Drag a card to a new cell to reschedule.
// Click a card to jump to that day in the List view.

const CAL_DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function CalendarView({ schedule, scenes, isDark, onOpenDayInList, enrichedBlockMap, pageCountByScene }) {
  const addShootingDay = useStore(s => s.addShootingDay)
  const removeShootingDay = useStore(s => s.removeShootingDay)
  const updateShootingDay = useStore(s => s.updateShootingDay)

  // ── Month navigation ───────────────────────────────────────────────────────
  const [currentMonth, setCurrentMonth] = useState(() => {
    const first = schedule.find(d => normalizeIsoDate(d.calendarDate || d.date))
    if (first) {
      const normalized = normalizeIsoDate(first.calendarDate || first.date)
      if (normalized) {
        const d = new Date(`${normalized}T12:00:00`)
        if (!Number.isNaN(d.getTime())) {
          return { year: d.getFullYear(), month: d.getMonth() }
        }
      }
    }
    const now = new Date()
    return { year: now.getFullYear(), month: now.getMonth() }
  })

  const prevMonth = useCallback(() => {
    setCurrentMonth(({ year, month }) =>
      month === 0 ? { year: year - 1, month: 11 } : { year, month: month - 1 }
    )
  }, [])
  const nextMonth = useCallback(() => {
    setCurrentMonth(({ year, month }) =>
      month === 11 ? { year: year + 1, month: 0 } : { year, month: month + 1 }
    )
  }, [])

  // ── Add Shoot Day popover ─────────────────────────────────────────────────
  const [addPickerDate, setAddPickerDate] = useState('')
  const [showAddPicker, setShowAddPicker] = useState(false)
  const addPickerRef = useRef(null)
  const addBtnRef = useRef(null)

  const handleAddDay = useCallback(() => {
    const dateToUse = addPickerDate || ''
    addShootingDay({ date: dateToUse })
    setShowAddPicker(false)
    setAddPickerDate('')
  }, [addShootingDay, addPickerDate])

  useEffect(() => {
    if (!showAddPicker) return
    const handler = (e) => {
      if (
        addPickerRef.current && !addPickerRef.current.contains(e.target) &&
        addBtnRef.current && !addBtnRef.current.contains(e.target)
      ) {
        setShowAddPicker(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showAddPicker])

  // ── Derived data ──────────────────────────────────────────────────────────
  const shotColorMap = useMemo(() => {
    const map = {}
    ;(Array.isArray(scenes) ? scenes : []).forEach(sc => {
      ;(Array.isArray(sc?.shots) ? sc.shots : []).forEach(sh => { map[sh.id] = sh.color })
    })
    return map
  }, [scenes])

  // isoDate → array of schedule days
  const daysByDate = useMemo(() => {
    const m = {}
    schedule.forEach(day => {
      const dateKey = normalizeIsoDate(day.calendarDate || day.date)
      if (dateKey) {
        if (!m[dateKey]) m[dateKey] = []
        m[dateKey].push(day)
      }
    })
    return m
  }, [schedule])

  // Up to 6 unique scene colors for a day's shots
  const getSceneColors = useCallback((day) => {
    const seen = new Set()
    const colors = []
    ;(Array.isArray(day?.blocks) ? day.blocks : []).forEach(block => {
      if (block.shotId) {
        const c = shotColorMap[block.shotId]
        if (c && !seen.has(c)) { seen.add(c); colors.push(c) }
      }
    })
    return colors.slice(0, 6)
  }, [shotColorMap])

  // 1-based position in the schedule array
  const getDayNumber = useCallback((dayId) => {
    return schedule.findIndex(d => d.id === dayId) + 1
  }, [schedule])

  // ── Calendar grid ─────────────────────────────────────────────────────────
  const { year, month } = currentMonth
  const firstDay = new Date(year, month, 1)
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const startDow = firstDay.getDay() // 0 = Sunday

  const toIso = useCallback((dayNum) => {
    return `${year}-${String(month + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`
  }, [year, month])

  // Cells: null for padding, number for actual days
  const cells = useMemo(() => {
    const c = []
    for (let i = 0; i < startDow; i++) c.push(null)
    for (let d = 1; d <= daysInMonth; d++) c.push(d)
    while (c.length % 7 !== 0) c.push(null)
    return c
  }, [startDow, daysInMonth])

  const today = useMemo(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  }, [])

  const monthLabel = firstDay.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })

  // ── Native HTML5 drag-and-drop for calendar ───────────────────────────────
  const [draggingId, setDraggingId] = useState(null)
  const [dragOverDate, setDragOverDate] = useState(null)
  const [detailDayId, setDetailDayId] = useState(null)
  const [emptyDayContextMenu, setEmptyDayContextMenu] = useState(null) // { x, y, isoDate }
  const detailDay = detailDayId ? schedule.find(d => d.id === detailDayId) : null

  const handleCardDragStart = useCallback((e, dayId) => {
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', dayId)
    // Small delay so the ghost image renders before we reduce opacity
    requestAnimationFrame(() => setDraggingId(dayId))
  }, [])

  const handleCardDragEnd = useCallback(() => {
    setDraggingId(null)
    setDragOverDate(null)
  }, [])

  const handleCellDragOver = useCallback((e, isoDate) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOverDate(isoDate)
  }, [])

  const handleCellDragLeave = useCallback((e) => {
    // Only clear if actually leaving the cell (not entering a child)
    if (!e.currentTarget.contains(e.relatedTarget)) {
      setDragOverDate(null)
    }
  }, [])

  const handleCellDrop = useCallback((e, isoDate) => {
    e.preventDefault()
    const dayId = e.dataTransfer.getData('text/plain')
    if (dayId && isoDate) {
      updateShootingDay(dayId, { date: isoDate })
    }
    setDraggingId(null)
    setDragOverDate(null)
  }, [updateShootingDay])

  const handleAddDayAtDate = useCallback((isoDate) => {
    if (!isoDate) return
    addShootingDay({ date: isoDate })
    setEmptyDayContextMenu(null)
  }, [addShootingDay])

  useEffect(() => {
    if (!emptyDayContextMenu) return undefined
    const close = () => setEmptyDayContextMenu(null)
    const onKeyDown = (event) => {
      if (event.key === 'Escape') close()
    }
    document.addEventListener('click', close)
    document.addEventListener('contextmenu', close)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('click', close)
      document.removeEventListener('contextmenu', close)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [emptyDayContextMenu])

  // ── Colours ───────────────────────────────────────────────────────────────
  const bg = isDark ? '#111' : '#faf9f6'
  const cellBg = isDark ? '#1a1a1a' : '#fff'
  const emptyBg = isDark ? '#141414' : '#f5f3ee'
  const headerBg = isDark ? '#202020' : '#f0ede4'
  const borderColor = isDark ? '#2a2a2a' : '#e0dbd2'
  const fg = isDark ? '#ddd' : '#111'
  const mutedFg = isDark ? '#555' : '#999'
  const todayAccent = isDark ? '#3b82f6' : '#2563eb'
  const dropBg = isDark ? 'rgba(96,165,250,0.12)' : 'rgba(59,130,246,0.07)'
  const dropBorder = isDark ? 'rgba(96,165,250,0.4)' : 'rgba(59,130,246,0.35)'

  const navBtnStyle = {
    width: 28,
    height: 28,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: `1px solid ${isDark ? '#383838' : '#c4bfb5'}`,
    borderRadius: 4,
    background: 'none',
    color: fg,
    cursor: 'pointer',
    fontFamily: 'monospace',
    fontSize: 14,
    lineHeight: 1,
    flexShrink: 0,
  }

  return (
    <div style={{
      background: bg,
      borderRadius: 6,
      border: `1px solid ${borderColor}`,
      overflow: 'hidden',
    }}>
      {/* ── Month nav header ────────────────────────────────────────────── */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '10px 16px',
        borderBottom: `1px solid ${borderColor}`,
        background: headerBg,
      }}>
        <button
          onClick={prevMonth}
          style={navBtnStyle}
          onMouseEnter={e => { e.currentTarget.style.background = isDark ? '#2a2a2a' : '#e4e0d8' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'none' }}
          title="Previous month"
        >
          ‹
        </button>

        <span style={{
          fontFamily: 'monospace',
          fontSize: 13,
          fontWeight: 700,
          color: fg,
          letterSpacing: '0.04em',
        }}>
          {monthLabel}
        </span>

        <button
          onClick={nextMonth}
          style={navBtnStyle}
          onMouseEnter={e => { e.currentTarget.style.background = isDark ? '#2a2a2a' : '#e4e0d8' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'none' }}
          title="Next month"
        >
          ›
        </button>
      </div>

      {/* ── Day-of-week header row ──────────────────────────────────────── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(7, 1fr)',
        borderBottom: `1px solid ${borderColor}`,
        background: headerBg,
      }}>
        {CAL_DOW.map((dow, i) => (
          <div key={dow} style={{
            padding: '5px 8px',
            fontFamily: 'monospace',
            fontSize: 9,
            fontWeight: 700,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: (i === 0 || i === 6) ? (isDark ? '#666' : '#aaa') : mutedFg,
            textAlign: 'center',
            borderRight: i < 6 ? `1px solid ${borderColor}` : 'none',
          }}>
            {dow}
          </div>
        ))}
      </div>

      {/* ── Calendar grid ──────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
        {cells.map((dayNum, cellIdx) => {
          const col = cellIdx % 7
          const isoDate = dayNum ? toIso(dayNum) : null
          const isToday = isoDate === today
          const isWeekend = col === 0 || col === 6
          const daysOnDate = isoDate ? (daysByDate[isoDate] || []) : []
          const isDropTarget = isoDate && dragOverDate === isoDate && draggingId

          let cellBackground = cellBg
          if (!dayNum) cellBackground = emptyBg
          if (isDropTarget) cellBackground = dropBg

          const isLastRow = cellIdx >= cells.length - 7

          return (
            <div
              key={cellIdx}
              onDragOver={isoDate ? (e) => handleCellDragOver(e, isoDate) : undefined}
              onDragLeave={isoDate ? handleCellDragLeave : undefined}
              onDrop={isoDate ? (e) => handleCellDrop(e, isoDate) : undefined}
              onContextMenu={dayNum ? (event) => {
                if (daysOnDate.length > 0) return
                event.preventDefault()
                event.stopPropagation()
                setEmptyDayContextMenu({ x: event.clientX, y: event.clientY, isoDate })
              } : undefined}
              style={{
                minHeight: 90,
                padding: '6px 5px 5px',
                borderRight: col < 6 ? `1px solid ${borderColor}` : 'none',
                borderBottom: !isLastRow ? `1px solid ${borderColor}` : 'none',
                background: cellBackground,
                outline: isDropTarget ? `1.5px solid ${dropBorder}` : 'none',
                outlineOffset: -1.5,
                transition: 'background 0.1s, outline 0.1s',
                position: 'relative',
                // Subtle weekend tint
                ...(isWeekend && dayNum && !isDropTarget ? {
                  background: isDark ? 'rgba(0,0,0,0.15)' : 'rgba(0,0,0,0.016)',
                } : {}),
              }}
            >
              {/* Date number */}
              {dayNum && (
                <div style={{
                  fontFamily: 'monospace',
                  fontSize: 11,
                  fontWeight: isToday ? 800 : 400,
                  color: isToday
                    ? todayAccent
                    : isWeekend
                    ? (isDark ? '#555' : '#bbb')
                    : mutedFg,
                  lineHeight: 1,
                  marginBottom: 5,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                }}>
                  {dayNum}
                  {isToday && (
                    <span style={{
                      width: 5,
                      height: 5,
                      borderRadius: '50%',
                      background: todayAccent,
                      display: 'inline-block',
                      flexShrink: 0,
                    }} />
                  )}
                </div>
              )}

              {/* Shoot day cards */}
              {daysOnDate.map(day => {
                const dayNum_ = getDayNumber(day.id)
                const dayBlocks = Array.isArray(day?.blocks) ? day.blocks : []
                const shotCount = dayBlocks.filter(b => !!b.shotId).length
                const breakCount = dayBlocks.filter(b => b?.type === 'break').length
                const startMins = parseStartTime(day.startTime)
                const callStr = startMins !== null ? formatTimeOfDay(startMins) : null
                const sceneColors = getSceneColors(day)
                const isDraggingThis = draggingId === day.id
                const summary = summarizeDay(dayBlocks, pageCountByScene, enrichedBlockMap)
                const shotBlocks = dayBlocks.filter(b => !!b.shotId)
                const uniqueLocations = []
                shotBlocks.forEach(block => {
                  const shotData = enrichedBlockMap[block.id]
                  const location = (block.shootingLocation || shotData?.location || '').trim()
                  if (location && !uniqueLocations.includes(location)) uniqueLocations.push(location)
                })
                const locationSummary = uniqueLocations.length === 0
                  ? null
                  : uniqueLocations.length === 1
                  ? uniqueLocations[0]
                  : `${uniqueLocations[0]} +${uniqueLocations.length - 1}`

                return (
                  <div
                    key={day.id}
                    draggable
                    onDragStart={(e) => handleCardDragStart(e, day.id)}
                    onDragEnd={handleCardDragEnd}
                    onClick={(e) => { e.stopPropagation(); setDetailDayId(day.id) }}
                    title={`Day ${dayNum_} details`}
                    style={{
                      marginBottom: 3,
                      padding: '5px 6px',
                      borderRadius: 4,
                      background: isDark ? '#202020' : '#dfd7c9',
                      border: `1px solid ${isDark ? '#333' : '#bcb19f'}`,
                      cursor: 'grab',
                      opacity: isDraggingThis ? 0.35 : 1,
                      transition: 'opacity 0.1s, box-shadow 0.12s',
                      userSelect: 'none',
                    }}
                    onMouseEnter={e => {
                      e.currentTarget.style.boxShadow = isDark
                        ? '0 2px 8px rgba(0,0,0,0.5)'
                        : '0 2px 8px rgba(0,0,0,0.14)'
                    }}
                    onMouseLeave={e => { e.currentTarget.style.boxShadow = 'none' }}
                  >
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 6,
                      fontFamily: 'monospace',
                      fontSize: 9,
                      fontWeight: 700,
                      letterSpacing: '0.04em',
                      color: isDark ? '#bbb' : '#333',
                      lineHeight: 1.3,
                    }}>
                      <span style={{ color: isDark ? '#ddd' : '#111' }}>DAY {dayNum_}</span>
                      <span style={{ color: isDark ? '#999' : '#4b5563' }}>{shotCount} strip{shotCount !== 1 ? 's' : ''}</span>
                    </div>
                    <div style={{ marginTop: 2, fontSize: 9, color: isDark ? '#999' : '#525252' }}>
                      {callStr ? `Call ${callStr}` : 'Call not set'}
                    </div>
                    <div style={{ marginTop: 2, fontSize: 9, color: isDark ? '#999' : '#525252', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {summary.totalPages > 0 ? `${summary.totalPages.toFixed(2)} pgs` : 'No pages'}
                      <span style={{ opacity: 0.55, margin: '0 4px' }}>·</span>
                      {summary.totalMins > 0 ? formatMins(summary.totalMins) : 'No est. time'}
                      {breakCount > 0 && (
                        <>
                          <span style={{ opacity: 0.55, margin: '0 4px' }}>·</span>
                          {breakCount} break{breakCount !== 1 ? 's' : ''}
                        </>
                      )}
                    </div>
                    {locationSummary && (
                      <div style={{
                        marginTop: 2,
                        fontSize: 9,
                        color: isDark ? '#aaa' : '#4b5563',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}>
                        {locationSummary}
                      </div>
                    )}

                    {/* Scene color dots */}
                    {sceneColors.length > 0 && (
                      <div style={{
                        display: 'flex',
                        gap: 3,
                        marginTop: 4,
                        flexWrap: 'wrap',
                      }}>
                        {sceneColors.map((color, i) => (
                          <div
                            key={i}
                            style={{
                              width: 7,
                              height: 7,
                              borderRadius: '50%',
                              background: color,
                              flexShrink: 0,
                              boxShadow: `0 0 0 1px ${isDark ? 'rgba(0,0,0,0.4)' : 'rgba(255,255,255,0.6)'}`,
                            }}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>

      {/* ── Footer: Add Shoot Day ──────────────────────────────────────── */}
      <div style={{
        padding: '10px 14px',
        borderTop: `1px solid ${borderColor}`,
        background: headerBg,
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        position: 'relative',
      }}>
        <button
          ref={addBtnRef}
          onClick={() => setShowAddPicker(p => !p)}
          style={{
            padding: '5px 14px',
            fontFamily: 'monospace',
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '0.07em',
            textTransform: 'uppercase',
            border: `1px solid ${isDark ? '#555' : '#bbb'}`,
            borderRadius: 4,
            background: 'none',
            color: fg,
            cursor: 'pointer',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = isDark ? '#252525' : '#e4e0d8' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'none' }}
        >
          + Add Shoot Day
        </button>

        {showAddPicker && (
          <div
            ref={addPickerRef}
            style={{
              position: 'absolute',
              bottom: '100%',
              left: 14,
              marginBottom: 6,
              background: isDark ? '#1e1e1e' : '#fff',
              border: `1px solid ${isDark ? '#333' : '#d4cfc6'}`,
              borderRadius: 6,
              boxShadow: isDark ? '0 8px 28px rgba(0,0,0,0.6)' : '0 8px 28px rgba(0,0,0,0.16)',
              padding: 14,
              zIndex: 200,
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
              minWidth: 220,
            }}
          >
            <span style={{
              fontFamily: 'monospace',
              fontSize: 9,
              fontWeight: 700,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              color: mutedFg,
            }}>
              New Shoot Day
            </span>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{
                fontFamily: 'monospace',
                fontSize: 9,
                color: mutedFg,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
              }}>
                Date (optional)
              </span>
              <input
                type="date"
                value={addPickerDate}
                onChange={e => setAddPickerDate(e.target.value)}
                autoFocus
                onKeyDown={e => {
                  if (e.key === 'Enter') handleAddDay()
                  if (e.key === 'Escape') setShowAddPicker(false)
                }}
                style={{
                  fontFamily: 'monospace',
                  fontSize: 12,
                  padding: '4px 8px',
                  border: `1px solid ${isDark ? '#3a3a3a' : '#d0cbc2'}`,
                  borderRadius: 4,
                  background: isDark ? '#252525' : '#fff',
                  color: fg,
                  outline: 'none',
                  cursor: 'pointer',
                }}
              />
            </div>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowAddPicker(false)}
                style={{
                  padding: '4px 12px',
                  fontFamily: 'monospace',
                  fontSize: 11,
                  border: `1px solid ${isDark ? '#444' : '#ccc'}`,
                  borderRadius: 3,
                  background: 'none',
                  color: mutedFg,
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleAddDay}
                style={{
                  padding: '4px 14px',
                  fontFamily: 'monospace',
                  fontSize: 11,
                  fontWeight: 700,
                  border: `1px solid ${isDark ? '#555' : '#bbb'}`,
                  borderRadius: 3,
                  background: isDark ? '#2a2a2a' : '#e4e0d8',
                  color: fg,
                  cursor: 'pointer',
                }}
              >
                Add Day
              </button>
            </div>
          </div>
        )}

        <span style={{
          fontFamily: 'monospace',
          fontSize: 10,
          color: mutedFg,
        }}>
          Drag a day card to a new date to reschedule · Click a day card for details
        </span>
      </div>
      {emptyDayContextMenu && (
        <div
          style={{
            position: 'fixed',
            top: emptyDayContextMenu.y,
            left: emptyDayContextMenu.x,
            zIndex: 1900,
            minWidth: 172,
            padding: 4,
            borderRadius: 8,
            border: `1px solid ${isDark ? '#333' : '#d4cfc6'}`,
            background: isDark ? '#1e1e1e' : '#fff',
            boxShadow: isDark ? '0 10px 28px rgba(0,0,0,0.5)' : '0 10px 28px rgba(15, 23, 42, 0.16)',
          }}
          onClick={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            onClick={() => handleAddDayAtDate(emptyDayContextMenu.isoDate)}
            style={{
              width: '100%',
              border: 'none',
              borderRadius: 6,
              background: 'transparent',
              color: isDark ? '#e2e8f0' : '#334155',
              cursor: 'pointer',
              textAlign: 'left',
              padding: '7px 9px',
              fontSize: 12,
              fontWeight: 600,
              fontFamily: 'monospace',
            }}
          >
            Add Shoot Day
          </button>
        </div>
      )}
      {detailDay && (
        <div
          onMouseDown={() => setDetailDayId(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 1800, display: 'grid', placeItems: 'center' }}
        >
          <div onMouseDown={(e) => e.stopPropagation()} style={{ width: 500, maxWidth: '94vw', maxHeight: '82vh', overflow: 'auto', background: isDark ? '#1e1e1e' : '#fff', borderRadius: 8, border: `1px solid ${borderColor}`, padding: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <div style={{ fontFamily: 'monospace', fontWeight: 800, color: fg }}>Day {getDayNumber(detailDay.id)} · {formatDate(detailDay.date) || 'No date set'}</div>
              <button onClick={() => setDetailDayId(null)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: mutedFg, fontSize: 18 }}>×</button>
            </div>
            {(() => {
              const summary = summarizeDay(Array.isArray(detailDay?.blocks) ? detailDay.blocks : [], pageCountByScene, enrichedBlockMap)
              const dayBlocks = Array.isArray(detailDay?.blocks) ? detailDay.blocks : []
              const breakCount = dayBlocks.filter(b => b?.type === 'break').length
              const shotBlocks = dayBlocks.filter(b => !!b.shotId)
              const locations = []
              shotBlocks.forEach((block) => {
                const shotData = enrichedBlockMap[block.id]
                const location = (block.shootingLocation || shotData?.location || '').trim()
                if (location && !locations.includes(location)) locations.push(location)
              })
              const castNames = []
              shotBlocks.forEach((block) => {
                const shotData = enrichedBlockMap[block.id]
                splitCastNames(shotData?.cast).forEach(name => {
                  if (!castNames.includes(name)) castNames.push(name)
                })
              })
              return (
                <div style={{ display: 'grid', gap: 6, marginBottom: 10 }}>
                  <div style={{ fontSize: 11, color: mutedFg }}>
                    {detailDay.startTime ? `Call ${formatTimeOfDay(parseStartTime(detailDay.startTime))}` : 'Call not set'}
                  </div>
                  <div style={{ fontSize: 11, color: fg }}>
                    {summary.shotCount} strips · {summary.totalPages > 0 ? `${summary.totalPages.toFixed(2)} pgs` : 'No pages'} · {summary.totalMins > 0 ? formatMins(summary.totalMins) : 'No est. time'}{breakCount > 0 ? ` · ${breakCount} break${breakCount !== 1 ? 's' : ''}` : ''}
                  </div>
                  {locations.length > 0 && (
                    <div style={{ fontSize: 11, color: mutedFg, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      Locations: {locations.slice(0, 3).join(' · ')}{locations.length > 3 ? ` +${locations.length - 3}` : ''}
                    </div>
                  )}
                  {castNames.length > 0 && (
                    <div style={{ fontSize: 11, color: mutedFg, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      Cast: {castNames.slice(0, 6).join(', ')}{castNames.length > 6 ? ` +${castNames.length - 6}` : ''}
                    </div>
                  )}
                </div>
              )
            })()}
            <div style={{ display: 'grid', gap: 6 }}>
              {(Array.isArray(detailDay.blocks) ? detailDay.blocks : []).filter(b => b.shotId).map((block) => {
                const shotData = enrichedBlockMap[block.id]
                if (!shotData) return null
                return (
                  <div key={block.id} style={{ border: `1px solid ${borderColor}`, borderRadius: 4, padding: '6px 8px', fontSize: 11 }}>
                    <div style={{ fontWeight: 700, color: fg }}>{shotData.displayId} · {shotData.sceneSlugline || shotData.sceneTitle || shotData.sceneLabel}</div>
                    <div style={{ color: mutedFg }}>{block.shootingLocation || shotData.location || 'No location'}{shotData.cast ? ` · ${shotData.cast}` : ''}</div>
                  </div>
                )
              })}
            </div>
            <div style={{ marginTop: 10, display: 'flex', justifyContent: 'flex-end' }}>
              <button onClick={() => { onOpenDayInList?.(detailDay.id); setDetailDayId(null) }} style={{ padding: '5px 10px', fontFamily: 'monospace', fontSize: 11, borderRadius: 4, border: `1px solid ${borderColor}`, background: isDark ? '#262626' : '#f4f1ea', color: fg, cursor: 'pointer' }}>
                Open in List View
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── ScheduleTab (main) ────────────────────────────────────────────────────────

export default function ScheduleTab({
  configureOpen = false,
  onConfigureOpenChange = () => {},
}) {
  const scheduleRaw = useStore(s => s.schedule)
  const scenesRaw = useStore(s => s.scenes)
  const scriptScenesRaw = useStore(s => s.scriptScenes)
  const getScheduleWithShots = useStore(s => s.getScheduleWithShots)
  const addShootingDay = useStore(s => s.addShootingDay)
  const removeShootingDay = useStore(s => s.removeShootingDay)
  const reorderDays = useStore(s => s.reorderDays)
  const applyScheduleDrag = useStore(s => s.applyScheduleDrag)
  const scheduleColumnConfig = useStore(s => s.scheduleColumnConfig)
  const setScheduleColumnConfig = useStore(s => s.setScheduleColumnConfig)
  const scheduleViewState = useStore(s => s.tabViewState?.schedule || {})
  const setTabViewState = useStore(s => s.setTabViewState)
  const scheduleCollapseState = useStore(s => s.scheduleCollapseState)

  const schedule = useMemo(() => {
    const src = Array.isArray(scheduleRaw) ? scheduleRaw : []
    return src.map((day, idx) => ({
      ...day,
      id: day?.id || `day-${idx + 1}`,
      blocks: Array.isArray(day?.blocks) ? day.blocks : [],
      calendarDate: normalizeIsoDate(day?.date),
    }))
  }, [scheduleRaw])
  const scenes = Array.isArray(scenesRaw) ? scenesRaw : []
  const scriptScenes = Array.isArray(scriptScenesRaw) ? scriptScenesRaw : []
  const safeGetScheduleWithShots = typeof getScheduleWithShots === 'function' ? getScheduleWithShots : () => []
  const safeColumnConfig = Array.isArray(scheduleColumnConfig) ? scheduleColumnConfig : []
  const isDark = false

  // ── Sub-view state ───────────────────────────────────────────────────────────
  const [scheduleView, setScheduleView] = useState(scheduleViewState.scheduleView || 'list') // 'list' | 'stripboard' | 'calendar'
  const [stripDensity, setStripDensity] = useState(scheduleViewState.stripDensity || 'comfortable') // 'compact' | 'comfortable'
  const [stripPopover, setStripPopover] = useState(null) // { block, shotData, dayId, rect }
  const [sectionOpen, setSectionOpen] = useState(() => ({
    views: true,
    actions: true,
    selectedDay: true,
    display: true,
    summary: true,
  }))

  // Open a specific day in the List view (used by CalendarView dialog action)
  const handleJumpToDay = useCallback((dayId) => {
    setScheduleView('list')
    // Allow React to re-render the list view before scrolling
    setTimeout(() => {
      const el = document.getElementById(`sched-day-${dayId}`)
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 60)
  }, [])

  // Map shotId → shot.color, derived fresh from scenes
  const shotColorMap = useMemo(() => {
    const map = {}
    scenes.forEach(scene => {
      const shots = Array.isArray(scene?.shots) ? scene.shots : []
      shots.forEach(shot => { map[shot.id] = shot.color })
    })
    return map
  }, [scenes])

  const pageCountByScene = useMemo(() => {
    const map = {}
    scriptScenes.forEach(scene => {
      map[scene.id] = scene.pageCount ?? null
    })
    return map
  }, [scriptScenes])

  const stripHeight = stripDensity === 'compact' ? 24 : 36

  const handleStripClick = useCallback((block, shotData, dayId, rect) => {
    setStripPopover(prev =>
      prev && prev.block.id === block.id ? null : { block, shotData, dayId, rect }
    )
  }, [])

  const [listActiveDayId, setListActiveDayId] = useState(scheduleViewState.listActiveDayId || null)
  const containerRef = useRef(null)

  // ── DnD state ───────────────────────────────────────────────────────────────

  const [localBlocksByDay, setLocalBlocksByDay] = useState(null)
  const [activeDrag, setActiveDrag] = useState(null)

  const blockMap = useMemo(() => {
    const map = {}
    schedule.forEach(d => (Array.isArray(d?.blocks) ? d.blocks : []).forEach(b => { map[b.id] = b }))
    return map
  }, [schedule])

  const enrichedBlockMap = useMemo(() => {
    const map = {}
    safeGetScheduleWithShots().forEach(d => {
      ;(Array.isArray(d?.blocks) ? d.blocks : []).forEach(b => { map[b.id] = b.shotData })
    })
    return map
  }, [schedule, scenes, safeGetScheduleWithShots]) // eslint-disable-line react-hooks/exhaustive-deps

  const getBlocksForDay = useCallback((dayId) => {
    const ids = localBlocksByDay
      ? (localBlocksByDay[dayId] || [])
      : ((schedule.find(d => d.id === dayId)?.blocks || []).map(b => b.id) || [])
    return ids.map(id => blockMap[id]).filter(Boolean)
  }, [localBlocksByDay, schedule, blockMap])

  const dayIds = schedule.map(d => d.id).filter(Boolean)
  const dayTabs = useMemo(
    () => schedule.map((day, idx) => ({
      id: day.id || `day-${idx + 1}`,
      label: `Day ${idx + 1}${day.date ? ` — ${formatDate(day.date)}` : ''}`,
    })),
    [schedule]
  )

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  )

  // ── DnD handlers ────────────────────────────────────────────────────────────

  const handleDragStart = useCallback(({ active }) => {
    const type = active.data.current?.type || 'day'
    setActiveDrag({ id: active.id, type })

    if (type === 'block') {
      const order = {}
      schedule.forEach(d => { order[d.id] = (Array.isArray(d?.blocks) ? d.blocks : []).map(b => b.id) })
      setLocalBlocksByDay(order)
    }
  }, [schedule])

  const handleDragOver = useCallback(({ active, over }) => {
    if (!over) return
    // Read drag type from the event itself — avoids a stale-closure on
    // the `activeDrag` React state, which may not have been committed yet
    // when the very first dragOver fires right after dragStart.
    if ((active.data.current?.type || 'day') !== 'block') return

    const overType = over.data.current?.type
    if (!overType || overType === 'day') return

    const targetDayId = over.data.current?.dayId
    if (!targetDayId) return

    const activeBlockId = active.id

    setLocalBlocksByDay(prev => {
      if (!prev) return prev

      const activeDayId = findBlockDay(activeBlockId, prev)
      if (!activeDayId) return prev

      // No-op: hovering over itself
      if (activeBlockId === over.id) return prev

      const next = {}
      Object.keys(prev).forEach(k => { next[k] = [...prev[k]] })

      if (overType === 'block') {
        if (activeDayId === targetDayId) {
          // Same container: use arrayMove so direction (up vs down) is handled
          // correctly and there's no off-by-one from a remove-then-splice pattern.
          const activeIdx = next[activeDayId].indexOf(activeBlockId)
          const overIdx = next[targetDayId].indexOf(over.id)
          if (activeIdx !== -1 && overIdx !== -1) {
            next[targetDayId] = arrayMove(next[targetDayId], activeIdx, overIdx)
          }
        } else {
          // Cross-container: pull out of source day, insert before the hovered item
          next[activeDayId] = next[activeDayId].filter(id => id !== activeBlockId)
          const targetBlocks = next[targetDayId] || []
          const insertIdx = targetBlocks.indexOf(over.id)
          if (insertIdx !== -1) {
            targetBlocks.splice(insertIdx, 0, activeBlockId)
          } else {
            targetBlocks.push(activeBlockId)
          }
          next[targetDayId] = targetBlocks
        }
      } else if (overType === 'day-body') {
        // Hovering over the empty-day zone or end-of-day zone of a different day
        if (activeDayId !== targetDayId) {
          next[activeDayId] = next[activeDayId].filter(id => id !== activeBlockId)
          next[targetDayId] = [...(next[targetDayId] || []), activeBlockId]
        }
      }

      return next
    })
  // All state access happens via the functional setState form (stable reference).
  // No external state is closed over, so an empty dep array is safe and prevents
  // stale-closure issues entirely.
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleDragEnd = useCallback(({ active, over }) => {
    // Read type from event data for the same reason as handleDragOver — avoids
    // any theoretical stale-closure on the activeDrag React state.
    const dragType = active.data.current?.type || 'day'

    if (dragType === 'day' && over && active.id !== over.id) {
      const overType = over.data.current?.type
      let targetDayId = null
      if (overType === 'day') targetDayId = over.id
      else if (overType === 'block') targetDayId = over.data.current?.dayId
      else if (overType === 'day-body') targetDayId = over.data.current?.dayId

      if (targetDayId && targetDayId !== active.id) {
        reorderDays(active.id, targetDayId)
      }
    } else if (dragType === 'block' && localBlocksByDay) {
      applyScheduleDrag(
        schedule.map(d => ({
          id: d.id,
          blocks: (localBlocksByDay[d.id] || []).map(id => blockMap[id]).filter(Boolean),
        }))
      )
    }

    setLocalBlocksByDay(null)
    setActiveDrag(null)
  }, [localBlocksByDay, schedule, blockMap, reorderDays, applyScheduleDrag])

  const handleDragCancel = useCallback(() => {
    setLocalBlocksByDay(null)
    setActiveDrag(null)
  }, [])

  // ── Render ──────────────────────────────────────────────────────────────────

  const totalShots = schedule.reduce((n, d) => n + (Array.isArray(d?.blocks) ? d.blocks.length : 0), 0)
  const totalBreaks = schedule.reduce((n, d) => n + (Array.isArray(d?.blocks) ? d.blocks.filter(b => b.type === 'break').length : 0), 0)
  const totalStrips = totalShots - totalBreaks
  const totalPages = schedule.reduce((sum, day) => (
    sum + (Array.isArray(day?.blocks) ? day.blocks : []).reduce((daySum, block) => {
      if (block.type === 'break') return daySum
      return daySum + (pageCountByScene[block.sceneId] ?? 0)
    }, 0)
  ), 0)
  const totalShootMins = schedule.reduce((sum, day) => (
    sum + (Array.isArray(day?.blocks) ? day.blocks : []).reduce((daySum, block) => (
      block.type === 'break' ? daySum : daySum + parseMinutes(enrichedBlockMap[block.id]?.shootTime)
    ), 0)
  ), 0)
  const totalBreakMins = schedule.reduce((sum, day) => (
    sum + (Array.isArray(day?.blocks) ? day.blocks : []).reduce((daySum, block) => (
      block.type === 'break' ? daySum + parseMinutes(block.duration) : daySum
    ), 0)
  ), 0)
  useEffect(() => {
    if (!schedule.length) {
      setListActiveDayId(null)
      return
    }
    if (!listActiveDayId || !schedule.some(day => day.id === listActiveDayId)) {
      setListActiveDayId(schedule[0].id)
    }
  }, [schedule, listActiveDayId])

  useEffect(() => {
    setTabViewState('schedule', { scheduleView, stripDensity, listActiveDayId })
  }, [scheduleView, stripDensity, listActiveDayId, setTabViewState])

  const handleDeleteDay = useCallback((dayId, fallbackDayId) => {
    removeShootingDay(dayId)
    if (listActiveDayId === dayId) {
      setListActiveDayId(fallbackDayId || null)
    }
  }, [listActiveDayId, removeShootingDay])

  const handleAddDay = useCallback(() => {
    const newDayId = addShootingDay()
    if (newDayId) setListActiveDayId(newDayId)
  }, [addShootingDay])

  useEffect(() => {
    const node = containerRef.current
    if (!node) return
    const savedTop = scheduleViewState.scrollTop
    if (typeof savedTop === 'number') {
      requestAnimationFrame(() => {
        node.scrollTop = savedTop
      })
    }
  }, [scheduleViewState.scrollTop])

  const selectedDay = useMemo(() => {
    if (!schedule.length) return null
    const fallbackDayId = listActiveDayId || schedule[0].id
    return schedule.find(day => day.id === fallbackDayId) || schedule[0]
  }, [schedule, listActiveDayId])

  const selectedDayIndex = selectedDay ? schedule.findIndex(day => day.id === selectedDay.id) : -1
  const selectedDayBlocks = Array.isArray(selectedDay?.blocks) ? selectedDay.blocks : []
  const selectedDayShotBlocks = selectedDayBlocks.filter(block => block.type !== 'break')
  const selectedDayBreakBlocks = selectedDayBlocks.filter(block => block.type === 'break')
  const selectedDayPages = selectedDayShotBlocks.reduce((sum, block) => sum + (pageCountByScene[block.sceneId] ?? 0), 0)
  const selectedDayShootMins = selectedDayShotBlocks.reduce((sum, block) => sum + parseMinutes(enrichedBlockMap[block.id]?.shootTime), 0)
  const selectedDayBreakMins = selectedDayBreakBlocks.reduce((sum, block) => sum + parseMinutes(block.duration), 0)
  const resetKey = `${scheduleView}-${schedule.length}-${selectedDay?.id || 'none'}`

  return (
    <div
      className="flex flex-col h-full overflow-hidden canvas-texture"
    >
      <div className="flex-1 min-h-0 pb-6 pt-0">
        <div style={{ display: 'flex', alignItems: 'stretch', minHeight: 520, height: '100%' }}>
          <SidebarPane
            width={258}
            title="Schedule"
            controls={
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 6 }}>
                {[
                  { key: 'list', label: 'List' },
                  { key: 'stripboard', label: 'Strip' },
                  { key: 'calendar', label: 'Cal' },
                ].map(view => (
                  <button
                    key={view.key}
                    onClick={() => setScheduleView(view.key)}
                    style={{
                      border: `1px solid ${scheduleView === view.key ? '#334155' : 'rgba(100,116,139,0.35)'}`,
                      background: scheduleView === view.key ? '#e2e8f0' : '#fff',
                      color: '#334155',
                      borderRadius: 4,
                      padding: '6px 4px',
                      fontSize: 11,
                      fontFamily: 'monospace',
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    {view.label}
                  </button>
                ))}
              </div>
            }
          >
            <AccordionSection title="Selected Day" isOpen={sectionOpen.selectedDay} onToggle={() => setSectionOpen(prev => ({ ...prev, selectedDay: !prev.selectedDay }))}>
              <div style={{ display: 'grid', gap: 6, fontSize: 12, color: '#334155' }}>
                <div>{selectedDay ? `Day ${selectedDayIndex + 1}` : 'No day selected'}</div>
                <div style={{ color: '#64748b', fontSize: 11 }}>{selectedDay?.date ? formatDate(selectedDay.date) : 'No date set'}</div>
              </div>
            </AccordionSection>
            <AccordionSection title="Summary" isOpen={sectionOpen.summary} onToggle={() => setSectionOpen(prev => ({ ...prev, summary: !prev.summary }))}>
              <div style={{ display: 'grid', gap: 5, fontSize: 11, color: '#334155' }}>
                <div>Total: {totalStrips} strips · {schedule.length} days</div>
                <div>Pages: {totalPages > 0 ? totalPages.toFixed(2) : '0.00'}</div>
                <div>Time: {totalShootMins > 0 ? formatMins(totalShootMins) : '0m'} + breaks {totalBreakMins > 0 ? formatMins(totalBreakMins) : '0m'}</div>
                <div>Selected: {selectedDayShotBlocks.length} strips · {selectedDayPages > 0 ? selectedDayPages.toFixed(2) : '0.00'} pgs · {selectedDayShootMins > 0 ? formatMins(selectedDayShootMins) : '0m'}</div>
              </div>
            </AccordionSection>
          </SidebarPane>
          <div
            ref={containerRef}
            onScroll={(e) => setTabViewState('schedule', { scrollTop: e.currentTarget.scrollTop })}
            style={{ flex: 1, minWidth: 0, paddingLeft: 10, overflowY: 'auto', minHeight: 0 }}
          >
      {schedule.length === 0 ? (
        <EmptyState isDark={isDark} onAddDay={() => addShootingDay()} />
      ) : scheduleView === 'calendar' ? (
        <>
          <div style={{ position: 'sticky', top: LIST_DAY_TAB_BAR_TOP, zIndex: 30, marginBottom: 4 }}>
            <DayTabBar
              days={dayTabs}
              activeDay={listActiveDayId}
              onSelect={(dayId) => {
                setListActiveDayId(dayId)
                if (scheduleView !== 'list') return
                const el = document.getElementById(`sched-day-${dayId}`)
                if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
              }}
              onAddDay={handleAddDay}
              onDeleteDay={handleDeleteDay}
              enableDayContextMenu
            />
          </div>
        <ScheduleSubviewBoundary resetKey={resetKey} fallback={<div style={{ padding: 16, color: '#64748b', fontFamily: 'monospace' }}>Calendar view is temporarily unavailable for this data. Switch to List or Stripboard.</div>}>
        <CalendarView
          schedule={schedule}
          scenes={scenes}
          isDark={isDark}
          onOpenDayInList={handleJumpToDay}
          enrichedBlockMap={enrichedBlockMap}
          pageCountByScene={pageCountByScene}
        />
        </ScheduleSubviewBoundary>
        </>
      ) : scheduleView === 'list' ? (
        <ScheduleSubviewBoundary resetKey={resetKey} fallback={<div style={{ padding: 16, color: '#64748b', fontFamily: 'monospace' }}>List view failed to render for current data. Try another view.</div>}>
        <div>
              <div style={{ position: 'sticky', top: LIST_DAY_TAB_BAR_TOP, zIndex: 30, marginBottom: 4 }}>
                <DayTabBar
                  days={dayTabs}
                  activeDay={listActiveDayId}
                  onSelect={(dayId) => {
                    setListActiveDayId(dayId)
                    const el = document.getElementById(`sched-day-${dayId}`)
                    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
                  }}
                  onAddDay={handleAddDay}
                  onDeleteDay={handleDeleteDay}
                  enableDayContextMenu
                />
              </div>
              <ScheduleListColumnHeader />
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragStart={handleDragStart}
                onDragOver={handleDragOver}
                onDragEnd={handleDragEnd}
                onDragCancel={handleDragCancel}
              >
                <SortableContext items={dayIds} strategy={verticalListSortingStrategy}>
                  {schedule.map((day, dayIndex) => (
                    <SortableShootingDay
                      key={day.id}
                      day={day}
                      dayIndex={dayIndex}
                      blocks={getBlocksForDay(day.id)}
                      enrichedBlockMap={enrichedBlockMap}
                      isDark={isDark}
                      totalDays={schedule.length}
                      pageCountByScene={pageCountByScene}
                    />
                  ))}
                </SortableContext>

          {/* DragOverlay only for shot blocks and break blocks.
              dropAnimation={null}: the store is committed synchronously in
              handleDragEnd, so the DOM is already in the right place by the
              time the pointer is released.  Letting dnd-kit animate the overlay
              back to the item's new DOM position causes a brief double-render
              flash, so we skip the animation entirely. */}
                <DragOverlay dropAnimation={null}>
                  {activeDrag?.type === 'block' && blockMap[activeDrag.id] ? (
                    blockMap[activeDrag.id].type === 'break' ? (
                      <BreakBlockContent
                        block={blockMap[activeDrag.id]}
                        dayId={null}
                        isDark={isDark}
                        isOverlay
                      />
                    ) : (
                      <ShotBlockContent
                        block={blockMap[activeDrag.id]}
                        shotData={enrichedBlockMap[activeDrag.id]}
                        dayId={null}
                        isDark={isDark}
                        isOverlay
                        isCollapsed={scheduleCollapseState?.blocks?.[activeDrag.id] ?? true}
                        pageCountByScene={pageCountByScene}
                      />
                    )
                  ) : null}
                </DragOverlay>
              </DndContext>
            </div>
        </ScheduleSubviewBoundary>
          ) : (
        <>
        <div style={{ position: 'sticky', top: LIST_DAY_TAB_BAR_TOP, zIndex: 30, marginBottom: 4 }}>
          <DayTabBar
            days={dayTabs}
            activeDay={listActiveDayId}
            onSelect={(dayId) => setListActiveDayId(dayId)}
            onAddDay={handleAddDay}
            onDeleteDay={handleDeleteDay}
            enableDayContextMenu
          />
        </div>
        <ScheduleSubviewBoundary resetKey={resetKey} fallback={<div style={{ padding: 16, color: '#64748b', fontFamily: 'monospace' }}>Stripboard view is temporarily unavailable for this data. Switch to List or Calendar.</div>}>
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
          onDragCancel={handleDragCancel}
        >
          {/* Strip detail popover */}
          {stripPopover && (
            <StripDetailPopover
              block={stripPopover.block}
              shotData={stripPopover.shotData}
              dayId={stripPopover.dayId}
              isDark={isDark}
              onClose={() => setStripPopover(null)}
              anchorRect={stripPopover.rect}
              pageCountByScene={pageCountByScene}
            />
          )}

          {/* Responsive stripboard grid */}
          <SortableContext items={dayIds} strategy={rectSortingStrategy}>
            <div style={{
              display: 'grid',
              gridTemplateColumns: `repeat(auto-fit, minmax(${STRIP_COLUMN_MIN_WIDTH}px, 1fr))`,
              gap: 12,
              overflowX: 'hidden',
              overflowY: 'auto',
              paddingBottom: 16,
              alignItems: 'flex-start',
              // Extend past the padded container so columns reach the edge
              marginLeft: -4,
              marginRight: -4,
              paddingLeft: 4,
              paddingRight: 4,
            }}>
              {schedule.map((day, dayIndex) => (
                <SortableStripboardColumn
                  key={day.id}
                  day={day}
                  dayIndex={dayIndex}
                  blocks={getBlocksForDay(day.id)}
                  enrichedBlockMap={enrichedBlockMap}
                  shotColorMap={shotColorMap}
                  isDark={isDark}
                  height={stripHeight}
                  onStripClick={handleStripClick}
                  pageCountByScene={pageCountByScene}
                />
              ))}
            </div>
          </SortableContext>

              <DragOverlay dropAnimation={null}>
                {activeDrag?.type === 'block' && blockMap[activeDrag.id] ? (() => {
                  const block = blockMap[activeDrag.id]
                  const isShotBlock = !!block.shotId
                  return (
                    <div style={{
                      width: STRIP_COLUMN_MIN_WIDTH,
                      borderRadius: 3,
                      overflow: 'hidden',
                      boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
                      opacity: 0.92,
                    }}>
                      {isShotBlock ? (
                        <ShotStripContent
                          block={block}
                          shotData={enrichedBlockMap[activeDrag.id]}
                          color={shotColorMap[block.shotId] || '#9ca3af'}
                          isDark={isDark}
                          height={stripHeight}
                          isOverlay
                        />
                      ) : (
                        <SpecialStripContent
                          block={block}
                          isDark={isDark}
                          height={stripHeight}
                          isOverlay
                        />
                      )}
                    </div>
                  )
                })() : null}
              </DragOverlay>
            </DndContext>
        </ScheduleSubviewBoundary>
        </>
      )}
          </div>
        </div>
      </div>
      <div
        onClick={() => onConfigureOpenChange(false)}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.3)',
          zIndex: 150,
          opacity: configureOpen ? 1 : 0,
          pointerEvents: configureOpen ? 'auto' : 'none',
          transition: 'opacity 200ms ease',
        }}
      />
      <aside
        role="dialog"
        aria-label="Schedule Configure"
        aria-hidden={!configureOpen}
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          width: 'min(400px, calc(100vw - 24px))',
          height: '100vh',
          zIndex: 160,
          background: '#F7F3EC',
          borderLeft: '1px solid rgba(74,85,104,0.28)',
          boxShadow: '-16px 0 36px rgba(0,0,0,0.22)',
          transform: configureOpen ? 'translateX(0)' : 'translateX(104%)',
          transition: 'transform 220ms ease',
          display: 'flex',
          flexDirection: 'column',
        }}
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => event.stopPropagation()}
      >
        <div style={{ padding: '14px 14px 10px', borderBottom: '1px solid rgba(74,85,104,0.2)', background: '#1C1C1E' }}>
          <div style={{ fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#A0AEC0', fontWeight: 700 }}>Schedule</div>
          <div style={{ fontSize: 17, fontWeight: 700, color: '#FAF8F4', marginTop: 2 }}>Configure</div>
        </div>
        <div style={{ padding: 12, overflowY: 'auto', display: 'grid', gap: 10 }}>
          {scheduleView === 'list'
            ? <ScheduleColumnConfigList config={safeColumnConfig} onChange={setScheduleColumnConfig} />
            : <div style={{ fontSize: 11, color: '#64748b' }}>No additional options for this view.</div>}
        </div>
      </aside>
    </div>
  )
}
