import React, { useState, useCallback, useEffect, useRef } from 'react'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import useStore, { DEFAULT_CALLSHEET_SECTION_CONFIG } from '../store'

// ── Time Utilities (mirrored from ScheduleTab) ────────────────────────────────

function parseMinutes(str) {
  const s = String(str || '').trim()
  if (!s) return 0
  return Math.max(0, parseFloat(s) || 0)
}

function parseStartTime(timeStr) {
  if (!timeStr || !timeStr.includes(':')) return null
  const [h, m] = timeStr.split(':').map(Number)
  if (isNaN(h) || isNaN(m)) return null
  return h * 60 + m
}

function formatTimeOfDay(totalMins) {
  const safeTotal = ((Math.round(totalMins) % (24 * 60)) + 24 * 60) % (24 * 60)
  const h24 = Math.floor(safeTotal / 60)
  const m = safeTotal % 60
  const h12 = h24 % 12 || 12
  const ampm = h24 < 12 ? 'AM' : 'PM'
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(isoDate) {
  if (!isoDate) return ''
  const [y, m, d] = isoDate.split('-')
  if (!y || !m || !d) return isoDate
  return `${m}/${d}/${y}`
}

function formatTime12(time24) {
  if (!time24) return ''
  const [h, m] = time24.split(':').map(Number)
  if (isNaN(h) || isNaN(m)) return time24
  const ampm = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 || 12
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`
}

// ── Section label map ─────────────────────────────────────────────────────────

const SECTION_LABELS = {
  generalInfo:      'General Info',
  advancedSchedule: 'Advanced Schedule',
  castList:         'Cast List',
  crewList:         'Crew List',
  locationDetails:  'Location Details',
  additionalNotes:  'Additional Notes / Special Instructions',
}

// ── Configure Sections Panel ──────────────────────────────────────────────────

function SortableSectionItem({ id, label, visible, onToggle, isDark }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '5px 4px',
    borderRadius: 4,
    background: isDark ? '#2a2a2a' : '#f5f3ef',
    marginBottom: 2,
    cursor: 'default',
    userSelect: 'none',
  }

  return (
    <div ref={setNodeRef} style={style}>
      <span
        {...attributes}
        {...listeners}
        style={{ cursor: 'grab', color: isDark ? '#666' : '#bbb', flexShrink: 0, lineHeight: 1 }}
        title="Drag to reorder"
      >
        ⠿
      </span>
      <input
        type="checkbox"
        checked={visible}
        onChange={onToggle}
        style={{ cursor: 'pointer', flexShrink: 0 }}
      />
      <span style={{ fontSize: 12, fontFamily: 'monospace', color: isDark ? '#ccc' : '#333' }}>
        {label}
      </span>
    </div>
  )
}

function ConfigureSectionsPanel({ config, isDark, onChange, onClose }) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } })
  )

  const handleDragEnd = useCallback(({ active, over }) => {
    if (!over || active.id === over.id) return
    const oldIdx = config.findIndex(c => c.key === active.id)
    const newIdx = config.findIndex(c => c.key === over.id)
    if (oldIdx === -1 || newIdx === -1) return
    onChange(arrayMove(config, oldIdx, newIdx))
  }, [config, onChange])

  const handleToggle = (key) => {
    onChange(config.map(c => c.key === key ? { ...c, visible: !c.visible } : c))
  }

  return (
    <div style={{
      width: 260,
      background: isDark ? '#1e1e1e' : '#fff',
      border: `1px solid ${isDark ? '#444' : '#ccc'}`,
      borderRadius: 6,
      boxShadow: '0 4px 20px rgba(0,0,0,0.25)',
      padding: '12px 10px',
    }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 10,
      }}>
        <span style={{ fontSize: 11, fontFamily: 'monospace', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: isDark ? '#aaa' : '#555' }}>
          Configure Sections
        </span>
        <button
          onClick={onClose}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: isDark ? '#666' : '#aaa', fontSize: 16, lineHeight: 1 }}
        >
          ×
        </button>
      </div>
      <p style={{ fontSize: 10, color: isDark ? '#666' : '#aaa', marginBottom: 8, fontFamily: 'monospace' }}>
        Drag to reorder · toggle show/hide
      </p>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={config.map(c => c.key)} strategy={verticalListSortingStrategy}>
          {config.map(c => (
            <SortableSectionItem
              key={c.key}
              id={c.key}
              label={c.label || SECTION_LABELS[c.key] || c.key}
              visible={c.visible}
              onToggle={() => handleToggle(c.key)}
              isDark={isDark}
            />
          ))}
        </SortableContext>
      </DndContext>
    </div>
  )
}

// ── Section Wrapper ───────────────────────────────────────────────────────────

function SectionBlock({ title, isDark, children }) {
  return (
    <div style={{
      marginBottom: 20,
      borderRadius: 4,
      border: `1px solid ${isDark ? '#333' : '#d4cfc6'}`,
      overflow: 'hidden',
    }}>
      <div style={{
        background: isDark ? '#222' : '#2a2a2a',
        color: '#fff',
        padding: '6px 14px',
        fontFamily: 'monospace',
        fontSize: 11,
        fontWeight: 700,
        textTransform: 'uppercase',
        letterSpacing: '0.1em',
      }}>
        {title}
      </div>
      <div style={{ background: isDark ? '#1a1a1a' : '#fff', padding: '12px 14px' }}>
        {children}
      </div>
    </div>
  )
}

// ── Field Components ──────────────────────────────────────────────────────────

function FieldRow({ label, children, compact }) {
  return (
    <div style={{
      display: 'flex',
      alignItems: compact ? 'center' : 'flex-start',
      gap: 8,
      marginBottom: compact ? 6 : 10,
    }}>
      <span style={{
        fontSize: 10,
        fontFamily: 'monospace',
        fontWeight: 700,
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
        color: '#888',
        flexShrink: 0,
        width: 130,
        paddingTop: compact ? 0 : 2,
      }}>
        {label}
      </span>
      <div style={{ flex: 1 }}>
        {children}
      </div>
    </div>
  )
}

function TextInput({ value, onChange, isDark, placeholder, style: extraStyle }) {
  return (
    <input
      type="text"
      value={value || ''}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder || ''}
      style={{
        width: '100%',
        background: isDark ? '#2a2a2a' : '#f9f8f6',
        border: `1px solid ${isDark ? '#444' : '#ddd'}`,
        borderRadius: 3,
        padding: '3px 6px',
        fontSize: 12,
        fontFamily: 'monospace',
        color: isDark ? '#eee' : '#111',
        outline: 'none',
        ...extraStyle,
      }}
    />
  )
}

function TextareaInput({ value, onChange, isDark, placeholder, rows }) {
  return (
    <textarea
      value={value || ''}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder || ''}
      rows={rows || 3}
      style={{
        width: '100%',
        background: isDark ? '#2a2a2a' : '#f9f8f6',
        border: `1px solid ${isDark ? '#444' : '#ddd'}`,
        borderRadius: 3,
        padding: '4px 6px',
        fontSize: 12,
        fontFamily: 'monospace',
        color: isDark ? '#eee' : '#111',
        outline: 'none',
        resize: 'vertical',
        lineHeight: 1.5,
      }}
    />
  )
}

// ── General Info Section ──────────────────────────────────────────────────────

function GeneralInfoSection({ day, callsheet, projectName, isDark, onUpdate }) {
  return (
    <SectionBlock title="General Info" isDark={isDark}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 24px' }}>
        <FieldRow label="Production Title" compact>
          <TextInput
            value={callsheet.productionTitle !== undefined ? callsheet.productionTitle : projectName}
            onChange={v => onUpdate({ productionTitle: v })}
            isDark={isDark}
            placeholder={projectName}
          />
        </FieldRow>
        <FieldRow label="Date" compact>
          <div style={{ fontSize: 12, fontFamily: 'monospace', color: isDark ? '#eee' : '#111', padding: '3px 0' }}>
            {day.date ? formatDate(day.date) : <span style={{ color: '#aaa' }}>Set on Schedule tab</span>}
          </div>
        </FieldRow>
        <FieldRow label="General Call Time" compact>
          <div style={{ fontSize: 12, fontFamily: 'monospace', color: isDark ? '#eee' : '#111', padding: '3px 0' }}>
            {day.startTime
              ? <>{formatTime12(day.startTime)} <span style={{ color: '#aaa', fontSize: 11 }}>(edit on Schedule tab)</span></>
              : <span style={{ color: '#aaa' }}>Set on Schedule tab</span>
            }
          </div>
        </FieldRow>
        <FieldRow label="Basecamp / Unit Base" compact>
          <div style={{ fontSize: 12, fontFamily: 'monospace', color: isDark ? '#eee' : '#111', padding: '3px 0' }}>
            {day.basecamp
              ? <>{day.basecamp} <span style={{ color: '#aaa', fontSize: 11 }}>(edit on Schedule tab)</span></>
              : <span style={{ color: '#aaa' }}>Set on Schedule tab</span>
            }
          </div>
        </FieldRow>
        <FieldRow label="Shoot Location" compact>
          <TextInput
            value={callsheet.shootLocation}
            onChange={v => onUpdate({ shootLocation: v })}
            isDark={isDark}
            placeholder="Primary shooting location"
          />
        </FieldRow>
        <FieldRow label="Weather" compact>
          <TextInput
            value={callsheet.weather}
            onChange={v => onUpdate({ weather: v })}
            isDark={isDark}
            placeholder="e.g. Partly cloudy, 72°F"
          />
        </FieldRow>
        <FieldRow label="Nearest Hospital" compact>
          <TextInput
            value={callsheet.nearestHospital}
            onChange={v => onUpdate({ nearestHospital: v })}
            isDark={isDark}
            placeholder="Hospital name & address"
          />
        </FieldRow>
        <FieldRow label="Emergency Contacts" compact>
          <TextareaInput
            value={callsheet.emergencyContacts}
            onChange={v => onUpdate({ emergencyContacts: v })}
            isDark={isDark}
            placeholder="Name — role — phone"
            rows={2}
          />
        </FieldRow>
      </div>
    </SectionBlock>
  )
}

// ── Advanced Schedule Section ─────────────────────────────────────────────────

function AdvancedScheduleSection({ day, scheduleWithShots, isDark }) {
  const scheduledDay = scheduleWithShots.find(d => d.id === day.id)
  if (!scheduledDay) return null

  // Calculate projected start time for each block (mirrors ScheduleTab logic)
  const startMins = parseStartTime(day.startTime)
  let cumulativeMins = 0
  const blockProjections = scheduledDay.shotBlocks.map(block => {
    const projectedStart = startMins !== null ? startMins + cumulativeMins : null
    if (block.type === 'break') {
      cumulativeMins += parseMinutes(block.breakDuration)
    } else {
      cumulativeMins += parseMinutes(block.shotData?.shootTime) + parseMinutes(block.shotData?.setupTime)
    }
    const projectedEnd = startMins !== null ? startMins + cumulativeMins : null
    return { block, projectedStart, projectedEnd }
  })

  // Build a map of blockId → { projectedStart, projectedEnd }
  const projMap = {}
  blockProjections.forEach(({ block, projectedStart, projectedEnd }) => {
    projMap[block.id] = { projectedStart, projectedEnd }
  })

  // Group shot blocks by scene (using sceneLabel + location)
  const sceneGroups = []
  const seenScenes = new Map()

  scheduledDay.shotBlocks.forEach(block => {
    if (block.type === 'break') return
    if (!block.shotData) return
    const { sceneLabel, location, intOrExt, dayNight } = block.shotData
    const key = `${sceneLabel}||${location}||${intOrExt}||${dayNight}`
    if (!seenScenes.has(key)) {
      seenScenes.set(key, sceneGroups.length)
      sceneGroups.push({ sceneLabel, location, intOrExt, dayNight })
    }
  })

  const nonBreakBlocks = scheduledDay.shotBlocks.filter(b => b.type !== 'break' && b.shotData)
  const breakBlocks = scheduledDay.shotBlocks.filter(b => b.type === 'break')

  const thStyle = {
    padding: '4px 8px',
    fontFamily: 'monospace',
    fontSize: 10,
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.07em',
    color: '#888',
    borderBottom: `1px solid ${isDark ? '#333' : '#e0dbd0'}`,
    textAlign: 'left',
    whiteSpace: 'nowrap',
  }

  const tdStyle = {
    padding: '5px 8px',
    fontFamily: 'monospace',
    fontSize: 11,
    borderBottom: `1px solid ${isDark ? '#2a2a2a' : '#f0ede4'}`,
    verticalAlign: 'top',
  }

  const showTimes = startMins !== null

  return (
    <SectionBlock title="Advanced Schedule" isDark={isDark}>
      {sceneGroups.length === 0 && nonBreakBlocks.length === 0 ? (
        <p style={{ fontSize: 12, fontFamily: 'monospace', color: '#aaa', fontStyle: 'italic' }}>
          No shots scheduled for this day. Add shots on the Schedule tab.
        </p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={thStyle}>Scene</th>
              <th style={thStyle}>Location</th>
              <th style={thStyle}>I/E</th>
              <th style={thStyle}>D/N</th>
              {showTimes && <th style={thStyle}>Start</th>}
              {showTimes && <th style={thStyle}>End</th>}
              <th style={{ ...thStyle, textAlign: 'right' }}># Shots</th>
            </tr>
          </thead>
          <tbody>
            {sceneGroups.map((sg, i) => {
              const sceneBlocks = nonBreakBlocks.filter(b =>
                b.shotData?.sceneLabel === sg.sceneLabel &&
                b.shotData?.location === sg.location &&
                b.shotData?.intOrExt === sg.intOrExt &&
                b.shotData?.dayNight === sg.dayNight
              )
              const count = sceneBlocks.length

              // Start time = projected start of the first block in this scene
              // End time = projected end of the last block in this scene
              let sceneStart = null
              let sceneEnd = null
              if (showTimes && sceneBlocks.length > 0) {
                const firstProj = projMap[sceneBlocks[0].id]
                const lastProj = projMap[sceneBlocks[sceneBlocks.length - 1].id]
                if (firstProj) sceneStart = firstProj.projectedStart
                if (lastProj) sceneEnd = lastProj.projectedEnd
              }

              const colSpan = showTimes ? 7 : 5
              return (
                <tr key={i} style={{ background: i % 2 === 0 ? 'transparent' : (isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)') }}>
                  <td style={{ ...tdStyle, fontWeight: 600 }}>{sg.sceneLabel}</td>
                  <td style={tdStyle}>{sg.location}</td>
                  <td style={{ ...tdStyle, color: '#888' }}>{sg.intOrExt}</td>
                  <td style={{ ...tdStyle, color: '#888' }}>{sg.dayNight}</td>
                  {showTimes && (
                    <td style={{ ...tdStyle, color: isDark ? '#7dd3fc' : '#2563eb', whiteSpace: 'nowrap' }}>
                      {sceneStart !== null ? formatTimeOfDay(sceneStart) : '—'}
                    </td>
                  )}
                  {showTimes && (
                    <td style={{ ...tdStyle, color: isDark ? '#7dd3fc' : '#2563eb', whiteSpace: 'nowrap' }}>
                      {sceneEnd !== null ? formatTimeOfDay(sceneEnd) : '—'}
                    </td>
                  )}
                  <td style={{ ...tdStyle, textAlign: 'right', color: '#888' }}>{count}</td>
                </tr>
              )
            })}
            {breakBlocks.length > 0 && (
              <>
                <tr>
                  <td colSpan={showTimes ? 7 : 5} style={{ ...tdStyle, paddingTop: 8, paddingBottom: 2, fontSize: 10, color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    Breaks
                  </td>
                </tr>
                {breakBlocks.map((b, i) => {
                  const proj = projMap[b.id]
                  const projStart = proj?.projectedStart ?? null
                  return (
                    <tr key={b.id} style={{ background: isDark ? 'rgba(250,204,21,0.05)' : 'rgba(250,204,21,0.08)' }}>
                      <td colSpan={showTimes ? 6 : 4} style={{ ...tdStyle, fontStyle: 'italic', color: '#888' }}>
                        ☕{' '}
                        {showTimes && projStart !== null
                          ? <><span style={{ color: isDark ? '#7dd3fc' : '#2563eb', fontStyle: 'normal', fontWeight: 600, marginRight: 6 }}>{formatTimeOfDay(projStart)}</span>— {b.breakName}</>
                          : b.breakName
                        }
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'right', color: '#aaa', fontSize: 11 }}>
                        {b.breakDuration ? `${b.breakDuration} min` : '—'}
                      </td>
                    </tr>
                  )
                })}
              </>
            )}
          </tbody>
        </table>
      )}
      {!showTimes && nonBreakBlocks.length > 0 && (
        <p style={{ fontSize: 10, color: '#aaa', fontFamily: 'monospace', marginTop: 8, fontStyle: 'italic' }}>
          Set a call time on the Schedule tab to see start/end times.
        </p>
      )}
    </SectionBlock>
  )
}

// ── Member Picker Modal ───────────────────────────────────────────────────────

function MemberPickerModal({ title, roster, rosterFields, isDark, onSelect, onNewMember, onClose }) {
  const [search, setSearch] = useState('')
  const inputRef = useRef(null)

  useEffect(() => {
    if (inputRef.current) inputRef.current.focus()
  }, [])

  const filtered = roster.filter(r => {
    const q = search.toLowerCase()
    return rosterFields.some(f => (r[f] || '').toLowerCase().includes(q))
  })

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 500, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={onClose}
    >
      <div
        style={{
          background: isDark ? '#1e1e1e' : '#fff',
          border: `1px solid ${isDark ? '#444' : '#ccc'}`,
          borderRadius: 6,
          boxShadow: '0 8px 32px rgba(0,0,0,0.35)',
          width: 400,
          maxHeight: '70vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderBottom: `1px solid ${isDark ? '#333' : '#e0dbd0'}` }}>
          <span style={{ fontSize: 12, fontFamily: 'monospace', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: isDark ? '#ccc' : '#333' }}>
            {title}
          </span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: isDark ? '#666' : '#aaa', fontSize: 18, lineHeight: 1 }}>×</button>
        </div>

        {/* Search */}
        <div style={{ padding: '8px 14px', borderBottom: `1px solid ${isDark ? '#2a2a2a' : '#f0ede4'}` }}>
          <input
            ref={inputRef}
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search..."
            style={{
              width: '100%',
              background: isDark ? '#2a2a2a' : '#f9f8f6',
              border: `1px solid ${isDark ? '#444' : '#ddd'}`,
              borderRadius: 3,
              padding: '4px 8px',
              fontSize: 12,
              fontFamily: 'monospace',
              color: isDark ? '#eee' : '#111',
              outline: 'none',
            }}
          />
        </div>

        {/* List */}
        <div style={{ overflowY: 'auto', flex: 1 }}>
          {filtered.length === 0 && roster.length > 0 && (
            <div style={{ padding: '10px 14px', fontSize: 12, fontFamily: 'monospace', color: '#aaa', fontStyle: 'italic' }}>No matches</div>
          )}
          {roster.length === 0 && (
            <div style={{ padding: '10px 14px', fontSize: 12, fontFamily: 'monospace', color: '#aaa', fontStyle: 'italic' }}>No saved roster entries yet</div>
          )}
          {filtered.map(r => (
            <button
              key={r.id}
              onClick={() => onSelect(r)}
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                padding: '8px 14px',
                background: 'none',
                border: 'none',
                borderBottom: `1px solid ${isDark ? '#2a2a2a' : '#f5f3ef'}`,
                cursor: 'pointer',
                fontFamily: 'monospace',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = isDark ? '#2a2a2a' : '#f5f3ef' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'none' }}
            >
              <div style={{ fontSize: 12, fontWeight: 600, color: isDark ? '#ddd' : '#111' }}>{r.name}</div>
              <div style={{ fontSize: 11, color: '#888', marginTop: 1 }}>
                {rosterFields.filter(f => f !== 'name').map(f => r[f]).filter(Boolean).join(' · ')}
              </div>
            </button>
          ))}
        </div>

        {/* New member option */}
        <div style={{ borderTop: `1px solid ${isDark ? '#333' : '#e0dbd0'}`, padding: '8px 14px' }}>
          <button
            onClick={onNewMember}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '7px 10px',
              background: 'none',
              border: `1px dashed ${isDark ? '#444' : '#ccc'}`,
              borderRadius: 3,
              cursor: 'pointer',
              fontFamily: 'monospace',
              fontSize: 12,
              color: isDark ? '#888' : '#555',
            }}
          >
            <span style={{ fontSize: 16, lineHeight: 1 }}>+</span>
            New Member (not in roster)
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Update Roster Prompt ──────────────────────────────────────────────────────

function UpdateRosterPrompt({ isDark, memberName, onConfirm, onDismiss }) {
  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 600, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={onDismiss}
    >
      <div
        style={{
          background: isDark ? '#1e1e1e' : '#fff',
          border: `1px solid ${isDark ? '#444' : '#ccc'}`,
          borderRadius: 6,
          boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
          padding: '16px 20px',
          width: 340,
        }}
        onClick={e => e.stopPropagation()}
      >
        <p style={{ fontSize: 12, fontFamily: 'monospace', fontWeight: 700, color: isDark ? '#ddd' : '#111', marginBottom: 6 }}>
          Update saved info for <em>{memberName}</em>?
        </p>
        <p style={{ fontSize: 11, fontFamily: 'monospace', color: '#888', marginBottom: 14 }}>
          Save the edited details back to the roster so they're available on future callsheets.
        </p>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button
            onClick={onDismiss}
            style={{ padding: '5px 14px', cursor: 'pointer', fontFamily: 'monospace', fontSize: 11, border: `1px solid ${isDark ? '#444' : '#ccc'}`, borderRadius: 3, background: 'none', color: isDark ? '#aaa' : '#555' }}
          >
            Don't update
          </button>
          <button
            onClick={onConfirm}
            style={{ padding: '5px 14px', cursor: 'pointer', fontFamily: 'monospace', fontSize: 11, fontWeight: 700, background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 3 }}
          >
            Update roster
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Cast List Section ─────────────────────────────────────────────────────────

let castIdCounter = 0

function CastListSection({ callsheet, isDark, onUpdate }) {
  const cast = callsheet.cast || []
  const castRoster = useStore(s => s.castRoster)
  const upsertCastRosterEntry = useStore(s => s.upsertCastRosterEntry)

  const [pickerOpen, setPickerOpen] = useState(false)

  const addRowFromRoster = (rosterEntry) => {
    castIdCounter++
    onUpdate({
      cast: [...cast, {
        id: `cast_${Date.now()}_${castIdCounter}`,
        rosterId: rosterEntry.id,
        name: rosterEntry.name || '',
        character: rosterEntry.character || '',
        pickupTime: '',
        makeupCall: '',
        setCall: '',
      }]
    })
    // picker stays open so multiple members can be added in quick succession
  }

  const addNewRow = () => {
    castIdCounter++
    const newEntry = { id: `cast_${Date.now()}_${castIdCounter}`, name: '', character: '', pickupTime: '', makeupCall: '', setCall: '' }
    onUpdate({ cast: [...cast, newEntry] })
    setPickerOpen(false)
  }

  const updateRow = (id, field, value) => {
    onUpdate({ cast: cast.map(r => r.id === id ? { ...r, [field]: value } : r) })
  }

  const removeRow = (id) => {
    onUpdate({ cast: cast.filter(r => r.id !== id) })
  }

  // When a row's name or character is blurred, always save changes to the roster silently.
  const handleBlurSaveToRoster = (row) => {
    if (!row.name) return
    if (!row.rosterId) {
      // New member: save silently to the roster
      castIdCounter++
      const rosterId = `croster_${Date.now()}_${castIdCounter}`
      upsertCastRosterEntry({ id: rosterId, name: row.name, character: row.character || '' })
      onUpdate({ cast: cast.map(r => r.id === row.id ? { ...r, rosterId } : r) })
      return
    }
    // Existing roster member: update silently if changed
    const rosterEntry = castRoster.find(r => r.id === row.rosterId)
    if (rosterEntry && (rosterEntry.name !== row.name || rosterEntry.character !== row.character)) {
      upsertCastRosterEntry({ id: row.rosterId, name: row.name, character: row.character })
    }
  }

  const thStyle = {
    padding: '4px 6px',
    fontFamily: 'monospace',
    fontSize: 10,
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.07em',
    color: '#888',
    borderBottom: `1px solid ${isDark ? '#333' : '#e0dbd0'}`,
    textAlign: 'left',
    whiteSpace: 'nowrap',
  }

  const cellStyle = {
    padding: '3px 4px',
    borderBottom: `1px solid ${isDark ? '#2a2a2a' : '#f0ede4'}`,
    verticalAlign: 'middle',
  }

  const inputStyle = {
    width: '100%',
    background: isDark ? '#222' : '#faf8f5',
    border: `1px solid ${isDark ? '#3a3a3a' : '#e8e4db'}`,
    borderRadius: 2,
    padding: '2px 5px',
    fontSize: 12,
    fontFamily: 'monospace',
    color: isDark ? '#eee' : '#111',
    outline: 'none',
  }

  return (
    <SectionBlock title="Cast List" isDark={isDark}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <colgroup>
          <col style={{ width: '22%' }} />
          <col style={{ width: '20%' }} />
          <col style={{ width: '16%' }} />
          <col style={{ width: '16%' }} />
          <col style={{ width: '16%' }} />
          <col style={{ width: '10%' }} />
        </colgroup>
        <thead>
          <tr>
            <th style={thStyle}>Name</th>
            <th style={thStyle}>Character</th>
            <th style={thStyle}>Pickup Time</th>
            <th style={thStyle}>Makeup Call</th>
            <th style={thStyle}>Set Call</th>
            <th style={thStyle}></th>
          </tr>
        </thead>
        <tbody>
          {cast.length === 0 && (
            <tr>
              <td colSpan={6} style={{ ...cellStyle, padding: '8px 6px', color: '#aaa', fontFamily: 'monospace', fontSize: 12, fontStyle: 'italic' }}>
                No cast added yet
              </td>
            </tr>
          )}
          {cast.map((row, idx) => (
            <tr key={row.id} style={{ background: idx % 2 === 0 ? 'transparent' : (isDark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.015)') }}>
              <td style={cellStyle}>
                <input
                  style={inputStyle}
                  value={row.name}
                  onChange={e => updateRow(row.id, 'name', e.target.value)}
                  onBlur={() => handleBlurSaveToRoster(row)}
                  placeholder="Actor name"
                />
              </td>
              <td style={cellStyle}>
                <input
                  style={inputStyle}
                  value={row.character}
                  onChange={e => updateRow(row.id, 'character', e.target.value)}
                  onBlur={() => handleBlurSaveToRoster(row)}
                  placeholder="Character"
                />
              </td>
              <td style={cellStyle}><input style={inputStyle} value={row.pickupTime} onChange={e => updateRow(row.id, 'pickupTime', e.target.value)} placeholder="7:00 AM" /></td>
              <td style={cellStyle}><input style={inputStyle} value={row.makeupCall} onChange={e => updateRow(row.id, 'makeupCall', e.target.value)} placeholder="7:30 AM" /></td>
              <td style={cellStyle}><input style={inputStyle} value={row.setCall} onChange={e => updateRow(row.id, 'setCall', e.target.value)} placeholder="9:00 AM" /></td>
              <td style={cellStyle}>
                <button
                  onClick={() => removeRow(row.id)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', fontSize: 14, padding: '0 4px', lineHeight: 1 }}
                  title="Remove"
                >
                  ×
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button
        onClick={() => setPickerOpen(true)}
        style={{
          marginTop: 8,
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          background: 'none',
          border: `1px dashed ${isDark ? '#444' : '#ccc'}`,
          borderRadius: 3,
          padding: '4px 10px',
          fontFamily: 'monospace',
          fontSize: 11,
          color: isDark ? '#666' : '#aaa',
          cursor: 'pointer',
        }}
      >
        + Add Cast Member
      </button>

      {pickerOpen && (
        <MemberPickerModal
          title="Add Cast Member"
          roster={castRoster}
          rosterFields={['name', 'character']}
          isDark={isDark}
          onSelect={addRowFromRoster}
          onNewMember={addNewRow}
          onClose={() => setPickerOpen(false)}
        />
      )}

    </SectionBlock>
  )
}

// ── Crew List Section ─────────────────────────────────────────────────────────

let crewIdCounter = 0

function CrewListSection({ callsheet, isDark, onUpdate }) {
  const crew = callsheet.crew || []
  const crewRoster = useStore(s => s.crewRoster)
  const upsertCrewRosterEntry = useStore(s => s.upsertCrewRosterEntry)

  const [pickerOpen, setPickerOpen] = useState(false)

  const addRowFromRoster = (rosterEntry) => {
    crewIdCounter++
    onUpdate({
      crew: [...crew, {
        id: `crew_${Date.now()}_${crewIdCounter}`,
        rosterId: rosterEntry.id,
        name: rosterEntry.name || '',
        role: rosterEntry.role || '',
        callTime: '',
      }]
    })
    // picker stays open so multiple members can be added in quick succession
  }

  const addNewRow = () => {
    crewIdCounter++
    onUpdate({ crew: [...crew, { id: `crew_${Date.now()}_${crewIdCounter}`, name: '', role: '', callTime: '' }] })
    setPickerOpen(false)
  }

  const updateRow = (id, field, value) => {
    onUpdate({ crew: crew.map(r => r.id === id ? { ...r, [field]: value } : r) })
  }

  const removeRow = (id) => {
    onUpdate({ crew: crew.filter(r => r.id !== id) })
  }

  // When a row's name or role is blurred, always save changes to the roster silently.
  const handleBlurSaveToRoster = (row) => {
    if (!row.name) return
    if (!row.rosterId) {
      // New member: save silently to the roster
      crewIdCounter++
      const rosterId = `rroster_${Date.now()}_${crewIdCounter}`
      upsertCrewRosterEntry({ id: rosterId, name: row.name, role: row.role || '' })
      onUpdate({ crew: crew.map(r => r.id === row.id ? { ...r, rosterId } : r) })
      return
    }
    // Existing roster member: update silently if changed
    const rosterEntry = crewRoster.find(r => r.id === row.rosterId)
    if (rosterEntry && (rosterEntry.name !== row.name || rosterEntry.role !== row.role)) {
      upsertCrewRosterEntry({ id: row.rosterId, name: row.name, role: row.role })
    }
  }

  const thStyle = {
    padding: '4px 6px',
    fontFamily: 'monospace',
    fontSize: 10,
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.07em',
    color: '#888',
    borderBottom: `1px solid ${isDark ? '#333' : '#e0dbd0'}`,
    textAlign: 'left',
    whiteSpace: 'nowrap',
  }

  const cellStyle = {
    padding: '3px 4px',
    borderBottom: `1px solid ${isDark ? '#2a2a2a' : '#f0ede4'}`,
    verticalAlign: 'middle',
  }

  const inputStyle = {
    width: '100%',
    background: isDark ? '#222' : '#faf8f5',
    border: `1px solid ${isDark ? '#3a3a3a' : '#e8e4db'}`,
    borderRadius: 2,
    padding: '2px 5px',
    fontSize: 12,
    fontFamily: 'monospace',
    color: isDark ? '#eee' : '#111',
    outline: 'none',
  }

  return (
    <SectionBlock title="Crew List" isDark={isDark}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <colgroup>
          <col style={{ width: '35%' }} />
          <col style={{ width: '45%' }} />
          <col style={{ width: '15%' }} />
          <col style={{ width: '5%' }} />
        </colgroup>
        <thead>
          <tr>
            <th style={thStyle}>Name</th>
            <th style={thStyle}>Department / Role</th>
            <th style={thStyle}>Call Time</th>
            <th style={thStyle}></th>
          </tr>
        </thead>
        <tbody>
          {crew.length === 0 && (
            <tr>
              <td colSpan={4} style={{ ...cellStyle, padding: '8px 6px', color: '#aaa', fontFamily: 'monospace', fontSize: 12, fontStyle: 'italic' }}>
                No crew added yet
              </td>
            </tr>
          )}
          {crew.map((row, idx) => (
            <tr key={row.id} style={{ background: idx % 2 === 0 ? 'transparent' : (isDark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.015)') }}>
              <td style={cellStyle}>
                <input
                  style={inputStyle}
                  value={row.name}
                  onChange={e => updateRow(row.id, 'name', e.target.value)}
                  onBlur={() => handleBlurSaveToRoster(row)}
                  placeholder="Name"
                />
              </td>
              <td style={cellStyle}>
                <input
                  style={inputStyle}
                  value={row.role}
                  onChange={e => updateRow(row.id, 'role', e.target.value)}
                  onBlur={() => handleBlurSaveToRoster(row)}
                  placeholder="e.g. Director of Photography"
                />
              </td>
              <td style={cellStyle}><input style={inputStyle} value={row.callTime} onChange={e => updateRow(row.id, 'callTime', e.target.value)} placeholder="7:00 AM" /></td>
              <td style={cellStyle}>
                <button
                  onClick={() => removeRow(row.id)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', fontSize: 14, padding: '0 4px', lineHeight: 1 }}
                  title="Remove"
                >
                  ×
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button
        onClick={() => setPickerOpen(true)}
        style={{
          marginTop: 8,
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          background: 'none',
          border: `1px dashed ${isDark ? '#444' : '#ccc'}`,
          borderRadius: 3,
          padding: '4px 10px',
          fontFamily: 'monospace',
          fontSize: 11,
          color: isDark ? '#666' : '#aaa',
          cursor: 'pointer',
        }}
      >
        + Add Crew Member
      </button>

      {pickerOpen && (
        <MemberPickerModal
          title="Add Crew Member"
          roster={crewRoster}
          rosterFields={['name', 'role']}
          isDark={isDark}
          onSelect={addRowFromRoster}
          onNewMember={addNewRow}
          onClose={() => setPickerOpen(false)}
        />
      )}

    </SectionBlock>
  )
}

// ── Location Details Section ──────────────────────────────────────────────────

function LocationDetailsSection({ callsheet, isDark, onUpdate }) {
  return (
    <SectionBlock title="Location Details" isDark={isDark}>
      <FieldRow label="Address">
        <TextInput
          value={callsheet.locationAddress}
          onChange={v => onUpdate({ locationAddress: v })}
          isDark={isDark}
          placeholder="Full address"
        />
      </FieldRow>
      <FieldRow label="Parking Notes">
        <TextareaInput
          value={callsheet.parkingNotes}
          onChange={v => onUpdate({ parkingNotes: v })}
          isDark={isDark}
          placeholder="Parking instructions, lot info, etc."
          rows={2}
        />
      </FieldRow>
      <FieldRow label="Directions">
        <TextareaInput
          value={callsheet.directions}
          onChange={v => onUpdate({ directions: v })}
          isDark={isDark}
          placeholder="Directions to location"
          rows={2}
        />
      </FieldRow>
      <FieldRow label="Maps Link" compact>
        <TextInput
          value={callsheet.mapsLink}
          onChange={v => onUpdate({ mapsLink: v })}
          isDark={isDark}
          placeholder="https://maps.google.com/..."
        />
      </FieldRow>
    </SectionBlock>
  )
}

// ── Additional Notes Section ──────────────────────────────────────────────────

function AdditionalNotesSection({ callsheet, isDark, onUpdate }) {
  return (
    <SectionBlock title="Additional Notes / Special Instructions" isDark={isDark}>
      <TextareaInput
        value={callsheet.additionalNotes}
        onChange={v => onUpdate({ additionalNotes: v })}
        isDark={isDark}
        placeholder="Special instructions, reminders, safety notes, etc."
        rows={5}
      />
    </SectionBlock>
  )
}

// ── CallsheetTab Main Component ───────────────────────────────────────────────

export default function CallsheetTab() {
  const theme = useStore(s => s.theme)
  const schedule = useStore(s => s.schedule)
  const projectName = useStore(s => s.projectName)
  const callsheets = useStore(s => s.callsheets)
  const callsheetSectionConfig = useStore(s => s.callsheetSectionConfig)
  const getCallsheet = useStore(s => s.getCallsheet)
  const updateCallsheet = useStore(s => s.updateCallsheet)
  const setCallsheetSectionConfig = useStore(s => s.setCallsheetSectionConfig)
  const getScheduleWithShots = useStore(s => s.getScheduleWithShots)

  const isDark = theme === 'dark'
  const [selectedDayIdx, setSelectedDayIdx] = useState(0)
  const [configOpen, setConfigOpen] = useState(false)

  const scheduleWithShots = getScheduleWithShots()
  const activeDayIdx = Math.min(selectedDayIdx, Math.max(0, schedule.length - 1))
  const activeDay = schedule[activeDayIdx] || null

  const callsheet = activeDay ? getCallsheet(activeDay.id) : null

  const handleUpdate = useCallback((updates) => {
    if (!activeDay) return
    updateCallsheet(activeDay.id, updates)
  }, [activeDay, updateCallsheet])

  // Build visible sections in configured order
  const visibleSections = callsheetSectionConfig
    ? callsheetSectionConfig.filter(s => s.visible)
    : DEFAULT_CALLSHEET_SECTION_CONFIG.filter(s => s.visible)

  if (schedule.length === 0) {
    return (
      <div style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'column',
        gap: 12,
        color: isDark ? '#555' : '#aaa',
        fontFamily: 'monospace',
        fontSize: 13,
      }}>
        <svg width="40" height="40" viewBox="0 0 40 40" fill="none" stroke="currentColor" strokeWidth="1.5" opacity={0.4}>
          <rect x="6" y="4" width="28" height="32" rx="2" />
          <line x1="12" y1="12" x2="28" y2="12" />
          <line x1="12" y1="18" x2="22" y2="18" />
          <line x1="12" y1="24" x2="26" y2="24" />
        </svg>
        <p>No shooting days yet.</p>
        <p style={{ fontSize: 11, color: isDark ? '#444' : '#bbb' }}>Add shooting days on the Schedule tab to generate callsheets.</p>
      </div>
    )
  }

  return (
    <div style={{
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      backgroundColor: isDark ? '#1a1a1a' : '#f0ede4',
    }}>
      {/* Day navigation bar — wrapped in a position:relative container so the
          Configure Sections panel can escape the overflow-x:auto scroll bar */}
      <div style={{ position: 'relative', flexShrink: 0 }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 0,
          padding: '8px 16px',
          borderBottom: `1px solid ${isDark ? '#333' : '#ccc'}`,
          background: isDark ? '#111' : '#d4cfc6',
          overflowX: 'auto',
        }}>
          <span style={{ fontSize: 10, fontFamily: 'monospace', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: isDark ? '#666' : '#888', marginRight: 10, flexShrink: 0 }}>
            Day:
          </span>
          {schedule.map((day, idx) => {
            const isActive = idx === activeDayIdx
            const label = `Day ${idx + 1}${day.date ? ' — ' + formatDate(day.date) : ''}`
            return (
              <button
                key={day.id}
                onClick={() => setSelectedDayIdx(idx)}
                style={{
                  padding: '5px 12px',
                  fontFamily: 'monospace',
                  fontSize: 11,
                  fontWeight: isActive ? 700 : 400,
                  border: 'none',
                  borderRadius: 3,
                  background: isActive ? (isDark ? '#3b82f6' : '#2a2a2a') : 'transparent',
                  color: isActive ? '#fff' : (isDark ? '#888' : '#666'),
                  cursor: 'pointer',
                  flexShrink: 0,
                  marginRight: 4,
                  transition: 'background 0.1s, color 0.1s',
                }}
              >
                {label}
              </button>
            )
          })}

          {/* Spacer */}
          <div style={{ flex: 1, minWidth: 8 }} />

          {/* Configure Sections button */}
          <button
            onClick={() => setConfigOpen(o => !o)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              padding: '5px 10px',
              fontFamily: 'monospace',
              fontSize: 11,
              border: `1px solid ${isDark ? '#444' : '#bbb'}`,
              borderRadius: 3,
              background: configOpen ? (isDark ? '#2a2a2a' : '#e8e4db') : 'transparent',
              color: isDark ? '#aaa' : '#555',
              cursor: 'pointer',
              flexShrink: 0,
              whiteSpace: 'nowrap',
            }}
          >
            <svg width="12" height="12" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="4" y1="6" x2="16" y2="6" />
              <line x1="4" y1="10" x2="16" y2="10" />
              <line x1="4" y1="14" x2="16" y2="14" />
            </svg>
            Configure Sections
          </button>
        </div>

        {/* Panel rendered OUTSIDE the overflow scroll div so it is never clipped */}
        {configOpen && (
          <div style={{ position: 'absolute', top: '100%', right: 16, zIndex: 200 }}>
            <ConfigureSectionsPanel
              config={callsheetSectionConfig || DEFAULT_CALLSHEET_SECTION_CONFIG}
              isDark={isDark}
              onChange={setCallsheetSectionConfig}
              onClose={() => setConfigOpen(false)}
            />
          </div>
        )}
      </div>

      {/* Callsheet document canvas */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '24px 16px',
      }}>
        <div style={{
          maxWidth: 900,
          margin: '0 auto',
        }}>
          {/* Callsheet header */}
          <div style={{
            background: isDark ? '#111' : '#1a1a1a',
            color: '#fff',
            borderRadius: '4px 4px 0 0',
            padding: '16px 20px',
            marginBottom: 0,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
          }}>
            <div>
              <div style={{ fontSize: 18, fontFamily: 'monospace', fontWeight: 900, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                CALLSHEET
              </div>
              <div style={{ fontSize: 12, fontFamily: 'monospace', color: 'rgba(255,255,255,0.6)', marginTop: 3 }}>
                {callsheet?.productionTitle !== undefined ? callsheet.productionTitle : projectName}
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 14, fontFamily: 'monospace', fontWeight: 700, color: 'rgba(255,255,255,0.9)' }}>
                Day {activeDayIdx + 1}
                {activeDay?.date && (
                  <span style={{ marginLeft: 8, fontWeight: 400, color: 'rgba(255,255,255,0.6)' }}>
                    {formatDate(activeDay.date)}
                  </span>
                )}
              </div>
              {activeDay?.startTime && (
                <div style={{ fontSize: 12, fontFamily: 'monospace', color: 'rgba(255,255,255,0.6)', marginTop: 2 }}>
                  General Call: {formatTime12(activeDay.startTime)}
                </div>
              )}
            </div>
          </div>

          {/* Document area */}
          <div style={{
            background: isDark ? '#1e1e1e' : '#fff',
            border: `1px solid ${isDark ? '#333' : '#d4cfc6'}`,
            borderTop: 'none',
            borderRadius: '0 0 4px 4px',
            padding: '20px',
            marginBottom: 40,
          }}>
            {activeDay && callsheet && visibleSections.map(section => {
              switch (section.key) {
                case 'generalInfo':
                  return (
                    <GeneralInfoSection
                      key="generalInfo"
                      day={activeDay}
                      callsheet={callsheet}
                      projectName={projectName}
                      isDark={isDark}
                      onUpdate={handleUpdate}
                    />
                  )
                case 'advancedSchedule':
                  return (
                    <AdvancedScheduleSection
                      key="advancedSchedule"
                      day={activeDay}
                      scheduleWithShots={scheduleWithShots}
                      isDark={isDark}
                    />
                  )
                case 'castList':
                  return (
                    <CastListSection
                      key="castList"
                      callsheet={callsheet}
                      isDark={isDark}
                      onUpdate={handleUpdate}
                    />
                  )
                case 'crewList':
                  return (
                    <CrewListSection
                      key="crewList"
                      callsheet={callsheet}
                      isDark={isDark}
                      onUpdate={handleUpdate}
                    />
                  )
                case 'locationDetails':
                  return (
                    <LocationDetailsSection
                      key="locationDetails"
                      callsheet={callsheet}
                      isDark={isDark}
                      onUpdate={handleUpdate}
                    />
                  )
                case 'additionalNotes':
                  return (
                    <AdditionalNotesSection
                      key="additionalNotes"
                      callsheet={callsheet}
                      isDark={isDark}
                      onUpdate={handleUpdate}
                    />
                  )
                default:
                  return null
              }
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
