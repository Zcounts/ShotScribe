import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react'
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
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import useStore from '../store'

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

function ShotBlockContent({ block, shotData, dayId, isDark, isOverlay, dragHandleProps, projectedTime }) {
  const removeShotBlock = useStore(s => s.removeShotBlock)
  const updateShotBlock = useStore(s => s.updateShotBlock)

  const fg = isDark ? '#ddd' : '#111'
  const mutedFg = isDark ? '#666' : '#555'
  const borderColor = isDark ? '#2a2a2a' : '#ede9df'
  const bg = isDark ? '#1c1c1c' : '#fff'

  const handleLocationChange = useCallback((val) => {
    if (dayId) updateShotBlock(dayId, block.id, { shootingLocation: val })
  }, [dayId, block.id, updateShotBlock])

  const handleCastChange = useCallback((val) => {
    if (dayId) {
      const arr = val.split(',').map(s => s.trim()).filter(Boolean)
      updateShotBlock(dayId, block.id, { castMembers: arr })
    }
  }, [dayId, block.id, updateShotBlock])

  const handleShootTimeChange = useCallback((val) => {
    if (dayId) updateShotBlock(dayId, block.id, { estimatedShootTime: val })
  }, [dayId, block.id, updateShotBlock])

  const handleSetupTimeChange = useCallback((val) => {
    if (dayId) updateShotBlock(dayId, block.id, { estimatedSetupTime: val })
  }, [dayId, block.id, updateShotBlock])

  return (
    <div style={{
      background: bg,
      borderRadius: isOverlay ? 6 : 0,
      boxShadow: isOverlay ? '0 8px 28px rgba(0,0,0,0.22)' : 'none',
      borderBottom: isOverlay ? 'none' : `1px solid ${borderColor}`,
      padding: '10px 14px',
      display: 'grid',
      gridTemplateColumns: 'auto 1fr auto',
      gap: '0 10px',
      alignItems: 'start',
    }}>

      {/* Drag handle */}
      <div
        {...(dragHandleProps || {})}
        style={{
          paddingTop: 2,
          color: mutedFg,
          cursor: dragHandleProps ? 'grab' : 'default',
          userSelect: 'none',
          opacity: isOverlay ? 0 : 1,
        }}
      >
        <DragHandleIcon color={mutedFg} />
      </div>

      {/* Main content */}
      <div style={{ minWidth: 0 }}>
        {shotData ? (
          <>
            {/* Shot identifier row + projected time */}
            <div style={{
              display: 'flex',
              alignItems: 'baseline',
              gap: 7,
              flexWrap: 'wrap',
              marginBottom: 3,
            }}>
              {/* Projected time badge (before shot ID if start time is set) */}
              {projectedTime !== null && projectedTime !== undefined && !isOverlay && (
                <ProjectedTimeBadge totalMins={projectedTime} isDark={isDark} />
              )}
              <span style={{
                fontFamily: 'monospace',
                fontSize: 14,
                fontWeight: 700,
                color: fg,
                flexShrink: 0,
              }}>
                {shotData.displayId}
              </span>
              {shotData.subject && (
                <span style={{ fontSize: 13, fontWeight: 600, color: fg }}>{shotData.subject}</span>
              )}
              <Badge label={shotData.intOrExt} />
              <Badge label={shotData.dayNight} />
            </div>

            {/* Scene label + location (live from store) */}
            <div style={{
              fontSize: 11,
              fontFamily: 'monospace',
              color: fg,
              marginBottom: shotData.notes ? 3 : 0,
            }}>
              {shotData.sceneLabel}
              {shotData.location ? <span style={{ color: mutedFg }}>{` · ${shotData.location}`}</span> : ''}
            </div>

            {/* Notes (truncated to 2 lines) */}
            {shotData.notes && (
              <div style={{
                fontSize: 11,
                color: mutedFg,
                fontStyle: 'italic',
                overflow: 'hidden',
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
                marginBottom: 2,
              }}>
                {shotData.notes}
              </div>
            )}

            {/* Inline-editable schedule fields (not shown in overlay) */}
            {!isOverlay && (
              <div style={{ marginTop: 4 }}>
                {/* Time fields row */}
                <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 0 }}>
                  <InlineField
                    value={block.estimatedShootTime}
                    onChange={handleShootTimeChange}
                    placeholder="—"
                    isDark={isDark}
                    label="Shoot (min)"
                    inputWidth={40}
                  />
                  <InlineField
                    value={block.estimatedSetupTime}
                    onChange={handleSetupTimeChange}
                    placeholder="—"
                    isDark={isDark}
                    label="Setup (min)"
                    inputWidth={40}
                  />
                </div>
                <InlineField
                  value={block.shootingLocation}
                  onChange={handleLocationChange}
                  placeholder="Shooting location…"
                  isDark={isDark}
                  label="Location"
                />
                <InlineField
                  value={(block.castMembers || []).join(', ')}
                  onChange={handleCastChange}
                  placeholder="Cast (comma-separated)…"
                  isDark={isDark}
                  label="Cast"
                />
              </div>
            )}
          </>
        ) : (
          <span style={{ fontSize: 12, color: '#f87171', fontFamily: 'monospace' }}>
            Shot deleted — remove this entry
          </span>
        )}
      </div>

      {/* Remove button */}
      {!isOverlay && (
        <div style={{ paddingTop: 1 }}>
          <IconButton
            onClick={() => removeShotBlock(dayId, block.id)}
            onPointerDown={e => e.stopPropagation()}
            title="Remove from schedule"
            danger
            small
          >
            ✕
          </IconButton>
        </div>
      )}
    </div>
  )
}

// ── SortableShotBlock ─────────────────────────────────────────────────────────

function SortableShotBlock({ block, shotData, dayId, isDark, projectedTime }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: block.id,
    data: { type: 'block', dayId },
  })

  return (
    <div
      ref={setNodeRef}
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
        margin: '10px 14px',
        padding: '16px 12px',
        border: `1.5px dashed ${borderColor}`,
        borderRadius: 4,
        textAlign: 'center',
        transition: 'border-color 0.15s',
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
        margin: '0 14px',
      }}
    />
  )
}

// ── DayTotals ─────────────────────────────────────────────────────────────────

function DayTotals({ blocks, isDark }) {
  if (blocks.length === 0) return null

  const shotBlocks = blocks.filter(b => b.type !== 'break')
  const breakBlocks = blocks.filter(b => b.type === 'break')
  const totalShootMins = shotBlocks.reduce((sum, b) => sum + parseMinutes(b.estimatedShootTime), 0)
  const totalSetupMins = shotBlocks.reduce((sum, b) => sum + parseMinutes(b.estimatedSetupTime), 0)
  const totalBreakMins = breakBlocks.reduce((sum, b) => sum + parseMinutes(b.breakDuration), 0)
  const totalMins = totalShootMins + totalSetupMins + totalBreakMins

  // Only show if any times have been entered
  if (totalMins === 0) return null

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
    </div>
  )
}

// ── ShotPickerPanel ───────────────────────────────────────────────────────────

function ShotPickerPanel({ dayId, existingShotIds, isDark, onClose }) {
  const scenes = useStore(s => s.scenes)
  const getShotsForScene = useStore(s => s.getShotsForScene)
  const addShotBlock = useStore(s => s.addShotBlock)
  const panelRef = useRef(null)

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

  const bg = isDark ? '#1e1e1e' : '#fff'
  const borderColor = isDark ? '#333' : '#d4cfc6'
  const fg = isDark ? '#ddd' : '#1a1a1a'
  const mutedFg = isDark ? '#666' : '#999'
  const groupHeaderBg = isDark ? '#161616' : '#f3f1ec'
  const hoverBg = isDark ? '#252525' : '#f7f5f0'

  const totalShots = scenes.reduce((n, sc) => n + sc.shots.length, 0)

  return (
    <div
      ref={panelRef}
      style={{
        position: 'absolute',
        bottom: 'calc(100% + 4px)',
        left: 0,
        zIndex: 200,
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
        scenes.map((scene, sceneIdx) => {
          const shots = getShotsForScene(scene.id)
          if (shots.length === 0) return null
          return (
            <div key={scene.id}>
              <div style={{
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
                const alreadyAdded = existingShotIds.includes(shot.id)
                const intExt = shot.intOrExt || scene.intOrExt
                const dn = shot.dayNight || scene.dayNight
                return (
                  <button
                    key={shot.id}
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

  const fg = isDark ? '#ddd' : '#111'
  const mutedFg = isDark ? '#666' : '#555'
  const borderColor = isDark ? '#2a2a2a' : '#ede9df'
  const bg = isDark ? '#2a2310' : '#fffbef'

  const [editingName, setEditingName] = useState(false)
  const [localName, setLocalName] = useState(block.breakName || 'Break')

  useEffect(() => {
    if (!editingName) setLocalName(block.breakName || 'Break')
  }, [block.breakName, editingName])

  const commitName = useCallback((val) => {
    setEditingName(false)
    const newName = val.trim() || 'Break'
    if (newName !== block.breakName && dayId) updateShotBlock(dayId, block.id, { breakName: newName })
  }, [block.breakName, block.id, dayId, updateShotBlock])

  const handleDurationChange = useCallback((val) => {
    if (dayId) updateShotBlock(dayId, block.id, { breakDuration: val })
  }, [block.id, dayId, updateShotBlock])

  return (
    <div style={{
      background: bg,
      borderRadius: isOverlay ? 6 : 0,
      boxShadow: isOverlay ? '0 8px 28px rgba(0,0,0,0.22)' : 'none',
      borderBottom: isOverlay ? 'none' : `1px solid ${borderColor}`,
      borderLeft: isOverlay ? 'none' : `3px solid ${isDark ? '#6b5a00' : '#d4a820'}`,
      padding: '9px 14px',
      display: 'grid',
      gridTemplateColumns: 'auto 1fr auto',
      gap: '0 10px',
      alignItems: 'center',
    }}>
      {/* Drag handle */}
      <div
        {...(dragHandleProps || {})}
        style={{
          color: mutedFg,
          cursor: dragHandleProps ? 'grab' : 'default',
          userSelect: 'none',
          opacity: isOverlay ? 0 : 1,
        }}
      >
        <DragHandleIcon color={mutedFg} />
      </div>

      {/* Content */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flexWrap: 'wrap' }}>
        {/* Projected time */}
        {projectedTime !== null && projectedTime !== undefined && !isOverlay && (
          <ProjectedTimeBadge totalMins={projectedTime} isDark={isDark} />
        )}

        {/* Break icon + editable name */}
        <span style={{ fontSize: 13, flexShrink: 0 }}>⏸</span>
        <input
          value={localName}
          onChange={e => setLocalName(e.target.value)}
          onFocus={() => setEditingName(true)}
          onBlur={e => commitName(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') e.target.blur()
            if (e.key === 'Escape') { setLocalName(block.breakName || 'Break'); setEditingName(false) }
          }}
          onPointerDown={e => e.stopPropagation()}
          style={{
            fontFamily: 'monospace',
            fontSize: 13,
            fontWeight: 700,
            color: fg,
            background: editingName ? (isDark ? '#2a2a2a' : '#fff') : 'transparent',
            border: editingName ? `1px solid ${borderColor}` : '1px solid transparent',
            borderRadius: 3,
            padding: editingName ? '2px 6px' : '2px 0',
            outline: 'none',
            cursor: 'text',
            minWidth: 60,
            maxWidth: 200,
          }}
        />

        {/* Duration field */}
        {!isOverlay && (
          <InlineField
            value={block.breakDuration !== undefined && block.breakDuration !== 0 ? String(block.breakDuration) : ''}
            onChange={handleDurationChange}
            placeholder="—"
            isDark={isDark}
            label="Duration (min)"
            inputWidth={40}
          />
        )}
      </div>

      {/* Remove button */}
      {!isOverlay && dayId && (
        <IconButton
          onClick={() => removeShotBlock(dayId, block.id)}
          onPointerDown={e => e.stopPropagation()}
          title="Remove break"
          danger
          small
        >
          ✕
        </IconButton>
      )}
    </div>
  )
}

// ── BreakPickerPanel ──────────────────────────────────────────────────────────

const BREAK_PRESETS = ['Lunch', 'Company Move', '10-1', 'Meal Penalty', 'Camera Reload', 'Lighting Reset']

function BreakPickerPanel({ dayId, isDark, onClose }) {
  const addBreakBlock = useStore(s => s.addBreakBlock)
  const [name, setName] = useState('Lunch')
  const [duration, setDuration] = useState('30')
  const panelRef = useRef(null)

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
        position: 'absolute',
        bottom: 'calc(100% + 4px)',
        left: 0,
        zIndex: 200,
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
      padding: '8px 14px',
      borderTop: `1px solid ${borderColor}`,
      position: 'relative',
    }}>
      {pickerOpen && (
        <ShotPickerPanel
          dayId={dayId}
          existingShotIds={existingShotIds}
          isDark={isDark}
          onClose={() => setPickerOpen(false)}
        />
      )}
      {breakPickerOpen && (
        <BreakPickerPanel
          dayId={dayId}
          isDark={isDark}
          onClose={() => setBreakPickerOpen(false)}
        />
      )}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <button
          onClick={() => { setPickerOpen(p => !p); setBreakPickerOpen(false) }}
          style={btnStyle(pickerOpen)}
        >
          <span style={{ fontSize: 14, lineHeight: 1, marginTop: -1 }}>+</span>
          Add Shot
          <span style={{ fontSize: 8, opacity: 0.5, marginLeft: 2 }}>{pickerOpen ? '▲' : '▼'}</span>
        </button>
        <button
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

// ── SortableShootingDay ───────────────────────────────────────────────────────

function SortableShootingDay({ day, dayIndex, blocks, enrichedBlockMap, isDark }) {
  const removeShootingDay = useStore(s => s.removeShootingDay)
  const updateShootingDay = useStore(s => s.updateShootingDay)
  const [collapsed, setCollapsed] = useState(false)

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: day.id,
    data: { type: 'day' },
  })

  const bg = isDark ? '#1a1a1a' : '#fff'
  const headerBg = isDark ? '#1e1e1e' : '#f5f3ee'
  const borderColor = isDark ? '#2a2a2a' : '#d9d4cb'
  const fg = isDark ? '#ddd' : '#111'
  const mutedFg = isDark ? '#555' : '#666'

  const blockIds = blocks.map(b => b.id)
  const existingShotIds = blocks.filter(b => b.type !== 'break').map(b => b.shotId)
  const formattedDate = formatDate(day.date)
  const shotCount = blocks.filter(b => b.type !== 'break').length
  const breakCount = blocks.filter(b => b.type === 'break').length

  // Calculate cumulative projected times for each block (if start time is set)
  const startMins = parseStartTime(day.startTime)
  let cumulativeMins = 0
  const blockProjections = blocks.map(block => {
    const projectedTime = startMins !== null ? startMins + cumulativeMins : null
    if (block.type === 'break') {
      cumulativeMins += parseMinutes(block.breakDuration)
    } else {
      cumulativeMins += parseMinutes(block.estimatedShootTime) + parseMinutes(block.estimatedSetupTime)
    }
    return { block, projectedTime }
  })

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : 1,
        border: `1px solid ${borderColor}`,
        borderRadius: 6,
        overflow: 'visible',
        background: bg,
        marginBottom: 16,
        position: 'relative',
      }}
    >
      {/* Day header — acts as drag handle for day reordering; click toggles collapse */}
      <div
        {...attributes}
        {...listeners}
        onClick={() => setCollapsed(c => !c)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '8px 14px',
          background: headerBg,
          borderBottom: collapsed ? 'none' : `1px solid ${borderColor}`,
          borderRadius: collapsed ? 6 : '6px 6px 0 0',
          cursor: isDragging ? 'grabbing' : 'grab',
          userSelect: 'none',
          flexWrap: 'wrap',
        }}
      >
        {/* Handle icon */}
        <span style={{ color: mutedFg, display: 'flex', alignItems: 'center', flexShrink: 0 }}>
          <DragHandleIcon color={mutedFg} size={12} />
        </span>

        {/* Day number */}
        <span style={{
          fontFamily: 'monospace',
          fontSize: 12,
          fontWeight: 700,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: fg,
          flexShrink: 0,
        }}>
          Day {dayIndex + 1}
        </span>

        {/* Date picker */}
        <input
          type="date"
          value={day.date || ''}
          onChange={e => updateShootingDay(day.id, { date: e.target.value })}
          onPointerDown={e => e.stopPropagation()}
          onClick={e => e.stopPropagation()}
          style={{
            fontFamily: 'monospace',
            fontSize: 12,
            border: 'none',
            background: 'none',
            color: fg,
            cursor: 'pointer',
            outline: 'none',
            padding: 0,
          }}
        />

        {/* Formatted date label */}
        {formattedDate && (
          <span style={{ fontSize: 12, color: fg, fontFamily: 'monospace' }}>
            {formattedDate}
          </span>
        )}
        {!day.date && (
          <span style={{ fontSize: 11, color: mutedFg, fontStyle: 'italic', fontFamily: 'monospace' }}>
            No date set
          </span>
        )}

        {/* Call time / start time input */}
        <div
          style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}
          onPointerDown={e => e.stopPropagation()}
          onClick={e => e.stopPropagation()}
        >
          <span style={{
            fontSize: 9,
            fontFamily: 'monospace',
            color: mutedFg,
            letterSpacing: '0.07em',
            textTransform: 'uppercase',
            fontWeight: 700,
            flexShrink: 0,
          }}>
            Call:
          </span>
          <input
            type="time"
            value={day.startTime || ''}
            onChange={e => updateShootingDay(day.id, { startTime: e.target.value })}
            onPointerDown={e => e.stopPropagation()}
            onClick={e => e.stopPropagation()}
            title="Set call time / start time to generate projected timeline"
            style={{
              fontFamily: 'monospace',
              fontSize: 11,
              border: `1px solid ${day.startTime ? (isDark ? '#3a3a3a' : '#d4cfc6') : 'transparent'}`,
              background: day.startTime ? (isDark ? '#252525' : '#fff') : 'transparent',
              color: day.startTime ? fg : mutedFg,
              cursor: 'pointer',
              outline: 'none',
              borderRadius: 3,
              padding: day.startTime ? '1px 5px' : '1px 0',
              width: 80,
              transition: 'border-color 0.1s, background 0.1s',
            }}
          />
        </div>

        {/* Basecamp input */}
        <div
          style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}
          onPointerDown={e => e.stopPropagation()}
          onClick={e => e.stopPropagation()}
        >
          <span style={{
            fontSize: 9,
            fontFamily: 'monospace',
            color: mutedFg,
            letterSpacing: '0.07em',
            textTransform: 'uppercase',
            fontWeight: 700,
            flexShrink: 0,
          }}>
            Basecamp:
          </span>
          <input
            type="text"
            value={day.basecamp || ''}
            onChange={e => updateShootingDay(day.id, { basecamp: e.target.value })}
            onPointerDown={e => e.stopPropagation()}
            onClick={e => e.stopPropagation()}
            placeholder="Location…"
            title="Basecamp / unit base location for the whole day"
            style={{
              fontFamily: 'monospace',
              fontSize: 11,
              border: `1px solid ${day.basecamp ? (isDark ? '#3a3a3a' : '#d4cfc6') : 'transparent'}`,
              background: day.basecamp ? (isDark ? '#252525' : '#fff') : 'transparent',
              color: day.basecamp ? fg : mutedFg,
              cursor: 'text',
              outline: 'none',
              borderRadius: 3,
              padding: day.basecamp ? '1px 5px' : '1px 0',
              width: 130,
              transition: 'border-color 0.1s, background 0.1s',
            }}
          />
        </div>

        {/* Shot count */}
        <span style={{ fontSize: 11, color: mutedFg, fontFamily: 'monospace', marginLeft: 4 }}>
          {shotCount} shot{shotCount !== 1 ? 's' : ''}
          {breakCount > 0 ? `, ${breakCount} break${breakCount !== 1 ? 's' : ''}` : ''}
        </span>

        <div style={{ flex: 1 }} />

        {/* Collapse chevron */}
        <span style={{
          display: 'flex',
          alignItems: 'center',
          color: mutedFg,
          flexShrink: 0,
          marginRight: 2,
        }}>
          <ChevronIcon collapsed={collapsed} color={mutedFg} size={11} />
        </span>

        {/* Remove day */}
        <div onPointerDown={e => e.stopPropagation()} onClick={e => e.stopPropagation()}>
          <IconButton
            onClick={() => removeShootingDay(day.id)}
            title="Remove this shooting day"
            danger
            small
          >
            Remove Day
          </IconButton>
        </div>
      </div>

      {/* Body — hidden when collapsed */}
      {!collapsed && (
        <>
          {/* Shot block list */}
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
                  />
                ))}
                <DayEndDropZone dayId={day.id} />
              </>
            )}
          </SortableContext>

          {/* Day totals */}
          <DayTotals blocks={blocks} isDark={isDark} />

          {/* Add shot footer */}
          <AddShotFooter
            dayId={day.id}
            existingShotIds={existingShotIds}
            isDark={isDark}
          />
        </>
      )}
    </div>
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

// ── ScheduleTab (main) ────────────────────────────────────────────────────────

export default function ScheduleTab() {
  const schedule = useStore(s => s.schedule)
  const theme = useStore(s => s.theme)
  const getScheduleWithShots = useStore(s => s.getScheduleWithShots)
  const addShootingDay = useStore(s => s.addShootingDay)
  const reorderDays = useStore(s => s.reorderDays)
  const applyScheduleDrag = useStore(s => s.applyScheduleDrag)

  const isDark = theme === 'dark'
  const fg = isDark ? '#ddd' : '#111'
  const mutedFg = isDark ? '#666' : '#555'

  // ── DnD state ───────────────────────────────────────────────────────────────

  const [localBlocksByDay, setLocalBlocksByDay] = useState(null)
  const [activeDrag, setActiveDrag] = useState(null)

  const blockMap = useMemo(() => {
    const map = {}
    schedule.forEach(d => d.shotBlocks.forEach(b => { map[b.id] = b }))
    return map
  }, [schedule])

  const enrichedBlockMap = useMemo(() => {
    const map = {}
    getScheduleWithShots().forEach(d => {
      d.shotBlocks.forEach(b => { map[b.id] = b.shotData })
    })
    return map
  }, [schedule]) // eslint-disable-line react-hooks/exhaustive-deps

  const getBlocksForDay = useCallback((dayId) => {
    const ids = localBlocksByDay
      ? (localBlocksByDay[dayId] || [])
      : (schedule.find(d => d.id === dayId)?.shotBlocks.map(b => b.id) || [])
    return ids.map(id => blockMap[id]).filter(Boolean)
  }, [localBlocksByDay, schedule, blockMap])

  const dayIds = schedule.map(d => d.id)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  )

  // ── DnD handlers ────────────────────────────────────────────────────────────

  const handleDragStart = useCallback(({ active }) => {
    const type = active.data.current?.type || 'day'
    setActiveDrag({ id: active.id, type })

    if (type === 'block') {
      const order = {}
      schedule.forEach(d => { order[d.id] = d.shotBlocks.map(b => b.id) })
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
          shotBlocks: (localBlocksByDay[d.id] || []).map(id => blockMap[id]).filter(Boolean),
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

  const totalShots = schedule.reduce((n, d) => n + d.shotBlocks.length, 0)

  return (
    <div style={{
      padding: '24px',
      maxWidth: 920,
      margin: '0 auto',
      width: '100%',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        marginBottom: 24,
        gap: 12,
      }}>
        <div>
          <h2 style={{
            margin: 0,
            fontFamily: 'monospace',
            fontSize: 14,
            fontWeight: 700,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            color: fg,
          }}>
            Schedule
          </h2>
          {schedule.length > 0 && (
            <p style={{ margin: '4px 0 0', fontSize: 12, color: mutedFg, fontFamily: 'monospace' }}>
              {schedule.length} shooting day{schedule.length !== 1 ? 's' : ''}&nbsp;&middot;&nbsp;
              {totalShots} shot{totalShots !== 1 ? 's' : ''} scheduled
              <span style={{ marginLeft: 8, opacity: 0.65 }}>
                · Set a call time on each day to see the projected timeline
              </span>
            </p>
          )}
        </div>

        {schedule.length > 0 && (
          <button
            onClick={() => addShootingDay()}
            style={{
              padding: '7px 16px',
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
              flexShrink: 0,
            }}
          >
            + Add Day
          </button>
        )}
      </div>

      {/* Content */}
      {schedule.length === 0 ? (
        <EmptyState isDark={isDark} onAddDay={() => addShootingDay()} />
      ) : (
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
                />
              )
            ) : null}
          </DragOverlay>
        </DndContext>
      )}
    </div>
  )
}
