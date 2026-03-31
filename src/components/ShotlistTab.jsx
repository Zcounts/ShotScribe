import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import CustomDropdown from './CustomDropdown'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import useStore from '../store'
import { DayTabBar } from './DayTabBar'
import ScenePropertiesPanel from './ScenePropertiesPanel'
import { estimateScreenplayPagination } from '../utils/screenplay'

// ── Dropdown options (matching SpecsTable.jsx) ───────────────────────────────
const SIZE_OPTIONS  = ['WIDE SHOT', 'MEDIUM', 'CLOSE UP', 'OTS', 'ECU', 'INSERT', 'ESTABLISHING']
const TYPE_OPTIONS  = ['EYE LVL', 'SHOULDER LVL', 'CROWD LVL', 'HIGH ANGLE', 'LOW ANGLE', 'DUTCH']
const MOVE_OPTIONS  = ['STATIC', 'PUSH', 'PULL', 'PAN', 'TILT', 'STATIC or PUSH', 'TRACKING', 'CRANE']
const EQUIP_OPTIONS = ['STICKS', 'GIMBAL', 'HANDHELD', 'STICKS or GIMBAL', 'CRANE', 'DOLLY', 'STEADICAM']
const INT_EXT_OPTIONS  = ['INT', 'EXT', 'INT/EXT']
const DAY_NIGHT_OPTIONS = ['DAY', 'NIGHT', 'DAY/NIGHT']

// ── Built-in column definitions (source of truth for metadata) ──────────────
const BUILTIN_COLUMNS = [
  { key: 'status',         label: 'STATUS',             width: 74,  type: 'status' },
  { key: 'thumbnail',      label: 'THUMB',              width: 72,  type: 'thumbnail' },
  { key: 'displayId',      label: 'SHOT#',              width: 72,  type: 'readonly' },
  { key: 'description',    label: 'DESCRIPTION',        width: 300, type: 'text' },
  { key: 'specs.size',     label: 'SHOT SIZE',          width: 110, type: 'dropdown', options: SIZE_OPTIONS,  customOptionsField: 'size' },
  { key: 'specs.type',     label: 'TYPE/COVERAGE',      width: 118, type: 'dropdown', options: TYPE_OPTIONS,  customOptionsField: 'type' },
  { key: 'specs.move',     label: 'MOVEMENT',           width: 106, type: 'dropdown', options: MOVE_OPTIONS,  customOptionsField: 'move' },
  { key: 'specs.equip',    label: 'EQUIPMENT',          width: 112, type: 'dropdown', options: EQUIP_OPTIONS, customOptionsField: 'equip' },
  { key: 'focalLength',    label: 'LENS',               width: 76,  type: 'text' },
  { key: 'frameRate',      label: 'FRAME RATE',         width: 92,  type: 'text' },
  { key: 'sound',          label: 'SOUND',              width: 100, type: 'text' },
  { key: 'props',          label: 'PROPS',              width: 110, type: 'text' },
  { key: 'notes',          label: 'NOTES',              width: 220, type: 'textarea' },
  { key: 'setupTime',      label: 'SETUP',              width: 78,  type: 'text' },
  { key: 'shootTime',      label: 'SHOOT',              width: 78,  type: 'text' },
  { key: 'cast',           label: 'CAST',               width: 120, type: 'text' },
  { key: '__int__',        label: 'I/E',                width: 58,  type: 'intExt' },
  { key: '__dn__',         label: 'D/N',                width: 58,  type: 'dayNight' },
  { key: 'scriptTime',     label: 'SCRIPT TIME',        width: 84,  type: 'text' },
  { key: 'predictedTakes', label: 'PRED. TAKES',        width: 92,  type: 'text' },
  { key: 'takeNumber',     label: 'TAKE #',             width: 64,  type: 'text' },
]

// Non-configurable drag-handle/delete utility column width
const DRAG_COL_WIDTH = 36
const DENSITY_ROW_HEIGHT = {
  compact: 24,
  comfortable: 30,
}

// ── Time utilities ────────────────────────────────────────────────────────────
function parseTimeStr(str) {
  if (!str || !str.trim()) return null
  const parts = str.trim().split(':').map(Number)
  if (parts.some(isNaN)) return null
  if (parts.length === 2) return parts[0] * 60 + parts[1]
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2]
  return null
}

function formatSeconds(totalSecs) {
  const h = Math.floor(totalSecs / 3600)
  const m = Math.floor((totalSecs % 3600) / 60)
  const s = totalSecs % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}

function sumScriptTimes(shots) {
  let total = 0
  let anyParsed = false
  for (const shot of shots) {
    const secs = parseTimeStr(shot.scriptTime)
    if (secs !== null) { total += secs; anyParsed = true }
  }
  return anyParsed ? formatSeconds(total) : null
}

function fmtDate(iso) {
  if (!iso) return ''
  const [y, m, d] = iso.split('-')
  if (!y || !m || !d) return iso
  return `${m}/${d}/${y}`
}

function formatSceneNumber(sceneNumber) {
  const value = String(sceneNumber ?? '').trim()
  return value ? `SC ${value}` : 'SC —'
}

function formatShotCountLabel(count) {
  return `${count} shot${count === 1 ? '' : 's'}`
}

function formatCharacterSummary(characters = [], maxVisible = 2) {
  if (!Array.isArray(characters) || characters.length === 0) return 'No cast'
  const visible = characters.slice(0, maxVisible)
  const overflow = characters.length - visible.length
  return overflow > 0 ? `${visible.join(', ')} +${overflow}` : visible.join(', ')
}

// ── EditableCell ──────────────────────────────────────────────────────────────
// Always renders an <input> or <textarea> — never toggles between a display div
// and an edit input.  The input is styled to look like plain table text when
// inactive and like a focused input when active.  This eliminates the entire
// class of "first click selects, second click types" bugs because there is no
// display/edit toggle — the input is always there.
function EditableCell({ value, onChange, type, options, customOptions, onAddCustomOption, isChecked, isDark }) {
  const [localValue, setLocalValue] = useState(value ?? '')
  const [isFocused, setIsFocused] = useState(false)
  // Ref used to suppress onChange when user presses Escape to cancel an edit.
  const escapedRef = useRef(false)

  // Keep localValue in sync with the external value whenever the cell is not focused.
  useEffect(() => {
    if (!isFocused) setLocalValue(value ?? '')
  }, [value, isFocused])

  const handleFocus = () => {
    setIsFocused(true)
    escapedRef.current = false
  }

  const handleBlur = (e) => {
    if (!escapedRef.current) {
      const newVal = e.target.value
      if (type === 'dropdown') {
        const allOpts = [...new Set([...(options || []), ...(customOptions || [])])]
        const trimmed = newVal.trim()
        if (trimmed && !allOpts.includes(trimmed) && onAddCustomOption) {
          onAddCustomOption(trimmed)
        }
      }
      if (newVal !== (value ?? '')) onChange(newVal)
    }
    escapedRef.current = false
    setIsFocused(false)
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') e.target.blur()
    if (e.key === 'Escape') {
      escapedRef.current = true
      e.target.blur()
    }
  }

  const inputStyle = {
    width: '100%',
    height: '100%',
    border: 'none',
    background: isFocused ? (isDark ? '#1e3a5f' : '#eff6ff') : 'transparent',
    color: (localValue || value)
      ? (isDark ? '#e0e0e0' : '#1a1a1a')
      : (isDark ? '#555' : '#ccc'),
    fontSize: 11,
    fontFamily: 'inherit',
    padding: '0 6px',
    outline: 'none',
    cursor: isFocused ? 'text' : 'default',
    boxSizing: 'border-box',
    display: 'block',
  }

  // ── Checkbox ──
  if (type === 'checkbox') {
    return (
      <div
        onClick={() => onChange(!isChecked)}
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', cursor: 'pointer' }}
      >
        <div style={{
          width: 14,
          height: 14,
          border: `1.5px solid ${isChecked ? '#E84040' : 'rgba(74,85,104,0.35)'}`,
          borderRadius: 2,
          background: isChecked ? '#E84040' : 'transparent',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          transition: 'background 0.1s, border-color 0.1s',
        }}>
          {isChecked && (
            <svg width="9" height="7" viewBox="0 0 9 7" fill="none">
              <path d="M1 3.5L3.5 6L8 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </div>
      </div>
    )
  }

  // ── Read-only (SHOT#) ──
  if (type === 'readonly') {
    return (
      <div style={{
        padding: '0 6px',
        display: 'flex',
        alignItems: 'center',
        height: '100%',
        fontWeight: 700,
        fontFamily: 'monospace',
        fontSize: 12,
        color: isDark ? '#d4d4d8' : '#1f2937',
        userSelect: 'none',
      }}>
        {value}
      </div>
    )
  }

  // ── Dropdown via CustomDropdown (replaces native datalist) ──
  if (type === 'dropdown') {
    const allOpts = [...new Set([...(options || []), ...(customOptions || [])])]
    return (
      <CustomDropdown
        value={value}
        options={allOpts}
        onChange={onChange}
        onAddCustomOption={onAddCustomOption}
        inputStyle={{
          width: '100%',
          height: '100%',
          border: 'none',
          background: 'transparent',
          color: value
            ? (isDark ? '#e0e0e0' : '#1a1a1a')
            : (isDark ? '#555' : '#ccc'),
          fontSize: 11,
          fontFamily: 'inherit',
          padding: '0 4px',
          outline: 'none',
          cursor: 'default',
          boxSizing: 'border-box',
          display: 'block',
        }}
        focusBg={isDark ? '#1e3a5f' : '#eff6ff'}
        isDark={isDark}
      />
    )
  }

  // ── Textarea ──
  if (type === 'textarea') {
    return (
      <textarea
        value={localValue}
        onChange={e => {
          setLocalValue(e.target.value)
          // Auto-resize to fit content
          const el = e.target
          el.style.height = 'auto'
          el.style.height = el.scrollHeight + 'px'
        }}
        onFocus={(e) => {
          handleFocus(e)
          // Resize on focus too
          const el = e.target
          el.style.height = 'auto'
          el.style.height = el.scrollHeight + 'px'
        }}
        onBlur={handleBlur}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            escapedRef.current = true
            e.target.blur()
          }
        }}
        ref={(el) => {
          if (el) {
            el.style.height = 'auto'
            el.style.height = el.scrollHeight + 'px'
          }
        }}
        style={{
          ...inputStyle,
          height: 'auto',
          minHeight: DENSITY_ROW_HEIGHT.compact,
          padding: '2px 6px',
          resize: 'none',
          overflow: 'hidden',
          lineHeight: 1.4,
          verticalAlign: 'top',
        }}
      />
    )
  }

  // ── Text (default) ──
  return (
    <input
      type="text"
      value={localValue}
      onChange={e => setLocalValue(e.target.value)}
      onFocus={handleFocus}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      style={inputStyle}
    />
  )
}

// ── SceneLevelDropdownCell — for scene-wide I/E and D/N ───────────────────────
// Uses CustomDropdown so options are never filtered by the browser.
function SceneLevelDropdownCell({ value, onChange, options, customOptions, onAddCustomOption, isDark }) {
  const allOpts = [...new Set([...(options || []), ...(customOptions || [])])]
  return (
    <CustomDropdown
      value={value}
      options={allOpts}
      onChange={onChange}
      onAddCustomOption={onAddCustomOption}
      inputStyle={{
        width: '100%',
        height: '100%',
        border: 'none',
        background: 'transparent',
        color: isDark ? '#aaa' : '#444',
        fontSize: 11,
        fontFamily: 'monospace',
        fontWeight: 600,
        padding: '0 4px',
        outline: 'none',
        cursor: 'default',
        boxSizing: 'border-box',
        display: 'block',
      }}
      focusBg={isDark ? '#1e3a5f' : '#eff6ff'}
      isDark={isDark}
    />
  )
}

// ── Drag handle icon ──────────────────────────────────────────────────────────
function DragHandleIcon() {
  return (
    <svg width="10" height="14" viewBox="0 0 10 14" fill="currentColor">
      <circle cx="3" cy="2.5" r="1.5" />
      <circle cx="7" cy="2.5" r="1.5" />
      <circle cx="3" cy="7"   r="1.5" />
      <circle cx="7" cy="7"   r="1.5" />
      <circle cx="3" cy="11.5" r="1.5" />
      <circle cx="7" cy="11.5" r="1.5" />
    </svg>
  )
}

// ── SortableColumnItem (inside the config panel) ──────────────────────────────
function SortableColumnItem({ id, label, visible, onToggle, isDark, isCustom, onDelete }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.45 : 1,
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '4px 4px',
        borderRadius: 3,
        background: isDark ? '#252525' : '#f8f7f3',
        marginBottom: 3,
        cursor: 'default',
        userSelect: 'none',
        border: `1px solid ${isDark ? '#333' : '#e5e1d8'}`,
      }}
    >
      {/* Drag handle */}
      <span
        {...attributes}
        {...listeners}
        style={{
          cursor: isDragging ? 'grabbing' : 'grab',
          color: isDark ? '#555' : '#ccc',
          display: 'flex',
          alignItems: 'center',
          flexShrink: 0,
          lineHeight: 0,
          padding: '0 2px',
        }}
      >
        <DragHandleIcon />
      </span>

      {/* Visibility toggle */}
      <input
        type="checkbox"
        checked={visible}
        onChange={() => onToggle(id)}
        style={{ cursor: 'pointer', flexShrink: 0, margin: 0 }}
      />

      {/* Column label */}
      <span style={{
        fontSize: 10,
        fontFamily: 'monospace',
        fontWeight: 600,
        letterSpacing: '0.05em',
        color: isDark ? '#bbb' : '#444',
        flex: 1,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      }}>
        {label}
      </span>

      {/* Delete button for custom columns */}
      {isCustom && onDelete && (
        <button
          onPointerDown={e => e.stopPropagation()}
          onClick={e => { e.stopPropagation(); onDelete(id) }}
          title="Remove custom column"
          style={{
            border: 'none',
            background: 'none',
            cursor: 'pointer',
            color: isDark ? '#f87171' : '#dc2626',
            fontSize: 14,
            lineHeight: 1,
            padding: '0 2px',
            display: 'flex',
            alignItems: 'center',
            flexShrink: 0,
            opacity: 0.7,
          }}
        >
          ×
        </button>
      )}
    </div>
  )
}

// ── Column config panel ───────────────────────────────────────────────────────
function ColumnConfigPanel({
  config, isDark, onChange, onClose, customColumns, onAddCustomColumn, onRemoveCustomColumn,
  viewSettings, onViewSettingsChange,
}) {
  const panelSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } })
  )

  const [newColName, setNewColName] = useState('')
  const [newColType, setNewColType] = useState('text')
  const [addingCol, setAddingCol] = useState(false)

  const handleDragEnd = useCallback(({ active, over }) => {
    if (!over || active.id === over.id) return
    const oldIdx = config.findIndex(c => c.key === active.id)
    const newIdx = config.findIndex(c => c.key === over.id)
    if (oldIdx === -1 || newIdx === -1) return
    onChange(arrayMove(config, oldIdx, newIdx))
  }, [config, onChange])

  const toggle = useCallback((key) => {
    onChange(config.map(c => c.key === key ? { ...c, visible: !c.visible } : c))
  }, [config, onChange])

  const getColLabel = useCallback((key) => {
    const builtin = BUILTIN_COLUMNS.find(col => col.key === key)
    if (builtin) return builtin.label
    const custom = customColumns.find(c => c.key === key)
    return custom ? custom.label : key
  }, [customColumns])

  const isCustomCol = useCallback((key) => {
    return customColumns.some(c => c.key === key)
  }, [customColumns])

  const handleAddColumn = () => {
    const name = newColName.trim()
    if (!name) return
    onAddCustomColumn(name, newColType)
    setNewColName('')
    setNewColType('text')
    setAddingCol(false)
  }

  return (
    <div
      style={{
        position: 'absolute',
        top: 34,
        right: 0,
        zIndex: 200,
        width: 240,
        background: isDark ? '#1a1a1a' : '#fff',
        border: `1px solid ${isDark ? '#3a3a3a' : '#d4d0c8'}`,
        borderRadius: 6,
        boxShadow: isDark
          ? '0 8px 28px rgba(0,0,0,0.7)'
          : '0 8px 28px rgba(0,0,0,0.18)',
        padding: '10px 8px 8px',
        maxHeight: '80vh',
        overflowY: 'auto',
      }}
      onClick={e => e.stopPropagation()}
    >
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 8,
        paddingBottom: 7,
        borderBottom: `1px solid ${isDark ? '#2e2e2e' : '#eee'}`,
      }}>
        <span style={{
          fontSize: 9,
          fontWeight: 700,
          fontFamily: 'monospace',
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
          color: isDark ? '#777' : '#666',
        }}>
          Configure Columns
        </span>
        <button
          onClick={onClose}
          style={{
            border: 'none',
            background: 'none',
            cursor: 'pointer',
            color: isDark ? '#666' : '#999',
            fontSize: 16,
            lineHeight: 1,
            padding: '0 2px',
            display: 'flex',
            alignItems: 'center',
          }}
        >
          ×
        </button>
      </div>

      {/* Hint */}
      <p style={{
        margin: '0 0 6px',
        fontSize: 9,
        color: isDark ? '#444' : '#bbb',
        fontFamily: 'monospace',
        letterSpacing: '0.03em',
      }}>
        Drag to reorder · toggle to show/hide
      </p>

      <div style={{
        marginBottom: 8,
        paddingBottom: 8,
        borderBottom: `1px solid ${isDark ? '#2e2e2e' : '#eee'}`,
        display: 'grid',
        gap: 6,
      }}>
        <label style={{ fontSize: 10, display: 'flex', justifyContent: 'space-between', gap: 8 }}>
          <span>Density</span>
          <select value={viewSettings.density} onChange={e => onViewSettingsChange({ density: e.target.value })}>
            <option value="compact">Compact</option>
            <option value="comfortable">Comfortable</option>
          </select>
        </label>
        <label style={{ fontSize: 10, display: 'flex', justifyContent: 'space-between', gap: 8 }}>
          <span>Sorting</span>
          <select value={viewSettings.sortingMode} onChange={e => onViewSettingsChange({ sortingMode: e.target.value })}>
            <option value="shotNumber">Shot number</option>
            <option value="status">Status</option>
          </select>
        </label>
        <label style={{ fontSize: 10, display: 'flex', justifyContent: 'space-between', gap: 8 }}>
          <span>Grouping</span>
          <select value={viewSettings.groupingMode} onChange={e => onViewSettingsChange({ groupingMode: e.target.value })}>
            <option value="scene">By scene</option>
            <option value="none">Flat</option>
          </select>
        </label>
        {[
          ['showThumbnails', 'Show thumbnails'],
          ['showSidebar', 'Show sidebar'],
          ['showSceneDetails', 'Show scene details'],
        ].map(([key, label]) => (
          <label key={key} style={{ fontSize: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
            <input type="checkbox" checked={!!viewSettings[key]} onChange={() => onViewSettingsChange({ [key]: !viewSettings[key] })} />
            <span>{label}</span>
          </label>
        ))}
      </div>

      {/* Sortable column list */}
      <DndContext
        sensors={panelSensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={config.map(c => c.key)}
          strategy={verticalListSortingStrategy}
        >
          {config.map(c => {
            const label = getColLabel(c.key)
            if (!label && !isCustomCol(c.key)) return null
            return (
              <SortableColumnItem
                key={c.key}
                id={c.key}
                label={label || c.key}
                visible={c.visible}
                onToggle={toggle}
                isDark={isDark}
                isCustom={isCustomCol(c.key)}
                onDelete={onRemoveCustomColumn}
              />
            )
          })}
        </SortableContext>
      </DndContext>

      {/* ── Add new custom column ── */}
      <div style={{
        marginTop: 8,
        paddingTop: 8,
        borderTop: `1px solid ${isDark ? '#2e2e2e' : '#eee'}`,
      }}>
        {addingCol ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <input
              type="text"
              value={newColName}
              onChange={e => setNewColName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleAddColumn(); if (e.key === 'Escape') setAddingCol(false) }}
              placeholder="Column name…"
              autoFocus
              style={{
                width: '100%',
                padding: '4px 6px',
                fontSize: 10,
                fontFamily: 'monospace',
                border: `1px solid ${isDark ? '#444' : '#ccc'}`,
                borderRadius: 3,
                background: isDark ? '#252525' : '#fafafa',
                color: isDark ? '#ddd' : '#222',
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
            <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
              <select
                value={newColType}
                onChange={e => setNewColType(e.target.value)}
                style={{
                  flex: 1,
                  padding: '3px 4px',
                  fontSize: 10,
                  fontFamily: 'monospace',
                  border: `1px solid ${isDark ? '#444' : '#ccc'}`,
                  borderRadius: 3,
                  background: isDark ? '#252525' : '#fafafa',
                  color: isDark ? '#ddd' : '#222',
                  outline: 'none',
                }}
              >
                <option value="text">Free text</option>
                <option value="dropdown">Dropdown</option>
              </select>
              <button
                onClick={handleAddColumn}
                disabled={!newColName.trim()}
                style={{
                  padding: '3px 8px',
                  fontSize: 10,
                  fontFamily: 'monospace',
                  fontWeight: 700,
                  border: 'none',
                  borderRadius: 3,
                  background: isDark ? '#4ade80' : '#16a34a',
                  color: '#fff',
                  cursor: newColName.trim() ? 'pointer' : 'not-allowed',
                  opacity: newColName.trim() ? 1 : 0.5,
                }}
              >
                Add
              </button>
              <button
                onClick={() => { setAddingCol(false); setNewColName('') }}
                style={{
                  padding: '3px 6px',
                  fontSize: 10,
                  fontFamily: 'monospace',
                  border: `1px solid ${isDark ? '#444' : '#ccc'}`,
                  borderRadius: 3,
                  background: 'none',
                  color: isDark ? '#888' : '#666',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setAddingCol(true)}
            style={{
              width: '100%',
              padding: '5px 0',
              fontSize: 9,
              fontFamily: 'monospace',
              fontWeight: 700,
              letterSpacing: '0.07em',
              textTransform: 'uppercase',
              border: `1px dashed ${isDark ? '#3a3a3a' : '#d4d0c8'}`,
              borderRadius: 3,
              background: 'none',
              color: isDark ? '#555' : '#aaa',
              cursor: 'pointer',
              textAlign: 'center',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.color = isDark ? '#4ade80' : '#16a34a'
              e.currentTarget.style.borderColor = isDark ? '#4ade80' : '#16a34a'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.color = isDark ? '#555' : '#aaa'
              e.currentTarget.style.borderColor = isDark ? '#3a3a3a' : '#d4d0c8'
            }}
          >
            + New Column
          </button>
        )}
      </div>
    </div>
  )
}

// ── ColResizeHandle ───────────────────────────────────────────────────────────
function ColResizeHandle({ colKey, width, isDark, onResizeStart }) {
  const [hovered, setHovered] = useState(false)
  return (
    <div
      onMouseDown={e => onResizeStart(e, colKey, width)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: 'absolute',
        right: -7,
        top: 0,
        bottom: 0,
        width: 8,
        cursor: 'col-resize',
        zIndex: 2,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
      title="Drag to resize column"
    >
      <div style={{
        width: 2,
        height: '60%',
        borderRadius: 1,
        background: isDark ? '#555' : '#a09a92',
        opacity: hovered ? 1 : 0,
        transition: 'opacity 0.12s',
        pointerEvents: 'none',
      }} />
    </div>
  )
}

function ShotlistAddShotModal({ scene, candidates, onClose, onCreateNew, onAttachExisting }) {
  const [mode, setMode] = useState('new')
  const [search, setSearch] = useState('')
  const [selectedShotId, setSelectedShotId] = useState(candidates[0]?.id || null)
  const filtered = candidates.filter(shot => {
    const q = search.trim().toLowerCase()
    if (!q) return true
    return `${shot.displayId || ''} ${shot.description || shot.subject || ''} ${shot.notes || ''}`.toLowerCase().includes(q)
  })

  useEffect(() => {
    if (!filtered.some(shot => shot.id === selectedShotId)) {
      setSelectedShotId(filtered[0]?.id || null)
    }
  }, [filtered, selectedShotId])

  return (
    <div className="modal-overlay" style={{ zIndex: 760 }} onClick={onClose}>
      <div className="modal app-dialog" style={{ maxWidth: 680, width: '92vw' }} onClick={e => e.stopPropagation()}>
        <h3 className="dialog-title" style={{ marginBottom: 4 }}>Add Shot to {formatSceneNumber(scene._canonical?.sceneNumber || scene.sceneLabel)}</h3>
        <p className="dialog-description" style={{ marginBottom: 12 }}>{scene._canonical?.titleSlugline || scene.slugline || scene.location || 'Scene'}</p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
          <button onClick={() => setMode('new')} style={{ border: mode === 'new' ? '1px solid rgba(232,64,64,0.5)' : '1px solid rgba(74,85,104,0.2)', background: mode === 'new' ? 'rgba(232,64,64,0.08)' : '#fff', borderRadius: 8, padding: 10, textAlign: 'left', cursor: 'pointer' }}>
            <div style={{ fontWeight: 700, fontSize: 12 }}>Create New Shot</div>
            <div style={{ fontSize: 11, color: '#64748b' }}>Create a new shot record and schedule it in this day.</div>
          </button>
          <button onClick={() => setMode('existing')} style={{ border: mode === 'existing' ? '1px solid rgba(232,64,64,0.5)' : '1px solid rgba(74,85,104,0.2)', background: mode === 'existing' ? 'rgba(232,64,64,0.08)' : '#fff', borderRadius: 8, padding: 10, textAlign: 'left', cursor: 'pointer' }}>
            <div style={{ fontWeight: 700, fontSize: 12 }}>Add Existing Shot</div>
            <div style={{ fontSize: 11, color: '#64748b' }}>Attach an existing project shot to this shoot day.</div>
          </button>
        </div>
        {mode === 'existing' && (
          <div style={{ marginBottom: 8 }}>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search shot #, description, or notes"
              style={{ width: '100%', marginBottom: 8, padding: '8px 10px', borderRadius: 6, border: '1px solid rgba(74,85,104,0.2)' }}
            />
            <div style={{ maxHeight: 220, overflowY: 'auto', border: '1px solid rgba(74,85,104,0.2)', borderRadius: 6 }}>
              {filtered.length === 0 && <div style={{ padding: 12, fontSize: 12, color: '#718096' }}>No unscheduled shots found.</div>}
              {filtered.map(shot => (
                <label key={shot.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderBottom: '1px solid rgba(74,85,104,0.08)' }}>
                  <input type="radio" checked={selectedShotId === shot.id} onChange={() => setSelectedShotId(shot.id)} />
                  <span style={{ fontFamily: 'monospace', fontSize: 11, minWidth: 36 }}>{shot.displayId}</span>
                  <span style={{ fontSize: 11, color: '#4A5568', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {shot.description || shot.subject || shot.notes || 'Untitled shot'}
                  </span>
                </label>
              ))}
            </div>
          </div>
        )}
        <div className="dialog-actions">
          <button className="dialog-button-secondary" onClick={onClose}>Cancel</button>
          {mode === 'new' ? (
            <button className="dialog-button-primary" onClick={onCreateNew}>Create New Shot</button>
          ) : (
            <button className="dialog-button-primary" onClick={() => onAttachExisting(selectedShotId)} disabled={!selectedShotId}>Add Existing Shot</button>
          )}
        </div>
      </div>
    </div>
  )
}

// ── SortableShotRow ───────────────────────────────────────────────────────────
function SortableShotRow({
  shot, shotIndex, scene, visibleColumns,
  c, isDark, handleShotChange, onDelete, rowHeight, sceneIntOrExt, sceneDayNight, stickyOffsets,
}) {
  const [hovered, setHovered] = useState(false)
  const {
    attributes, listeners, setNodeRef,
    transform, transition, isDragging,
  } = useSortable({ id: shot.id })

  const customDropdownOptions = useStore(s => s.customDropdownOptions)
  const addCustomDropdownOption = useStore(s => s.addCustomDropdownOption)

  const isChecked = !!shot.checked
  const rowBg = isChecked
    ? (isDark ? '#1a2a1a' : '#f0fdf4')
    : (shotIndex % 2 === 0 ? c.tableBg : c.rowAlt)

  return (
    <tr
      ref={setNodeRef}
      data-entity-type="shot"
      data-entity-id={shot.id}
      style={{
        height: rowHeight,
        backgroundColor: rowBg,
        opacity: isChecked ? 0.5 : isDragging ? 0.35 : 1,
        transform: CSS.Transform.toString(transform),
        transition,
        position: 'relative',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Drag handle + delete utility cell */}
      <td className="shotlist-ui-col" style={{
        width: DRAG_COL_WIDTH,
        padding: 0,
        borderBottom: `1px solid ${c.border}`,
        borderRight: `1px solid ${c.border}`,
        verticalAlign: 'middle',
        overflow: 'hidden',
        userSelect: 'none',
        position: 'sticky',
        left: 0,
        zIndex: 4,
        backgroundColor: rowBg,
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          height: rowHeight,
          padding: '0 3px',
        }}>
          {/* Drag grip */}
          <div
            {...attributes}
            {...listeners}
            style={{
              cursor: isDragging ? 'grabbing' : 'grab',
              width: 16,
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: isDark ? '#555' : '#c0bdb8',
              opacity: hovered ? 1 : 0,
              transition: 'opacity 0.12s',
              flexShrink: 0,
            }}
          >
            <DragHandleIcon />
          </div>

          {/* Delete button */}
          <button
            onPointerDown={e => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); onDelete(shot.id) }}
            title="Delete shot"
            style={{
              border: 'none',
              background: 'none',
              cursor: 'pointer',
              color: isDark ? '#f87171' : '#dc2626',
              fontSize: 15,
              lineHeight: 1,
              padding: '0 1px',
              opacity: hovered ? 1 : 0,
              transition: 'opacity 0.12s',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 14,
              flexShrink: 0,
            }}
          >
            ×
          </button>
        </div>
      </td>

      {/* Data cells */}
      {visibleColumns.map((col, colIdx) => {
        const isLastCol = colIdx === visibleColumns.length - 1
        const isNotes = col.type === 'textarea'
        const stickyLeft = stickyOffsets[col.key]
        const cellStyle = {
          borderBottom: `1px solid ${c.border}`,
          borderRight: !isLastCol ? `1px solid ${c.border}` : 'none',
          padding: 0,
          ...(isNotes ? { minHeight: rowHeight, overflow: 'visible', verticalAlign: 'top' } : { height: rowHeight, overflow: 'hidden', verticalAlign: 'middle' }),
          textOverflow: 'ellipsis',
          whiteSpace: isNotes ? 'normal' : 'nowrap',
          userSelect: 'none',
          ...(stickyLeft != null ? {
            position: 'sticky',
            left: stickyLeft,
            zIndex: 3,
            backgroundColor: rowBg,
            boxShadow: `1px 0 0 ${c.border}`,
          } : {}),
        }

        if (col.type === 'status') {
          return (
            <td key={col.key} style={{ ...cellStyle, textAlign: 'center' }}>
              <button
                onClick={() => handleShotChange(shot.id, 'checked', !isChecked)}
                style={{
                  border: `1px solid ${isChecked ? '#16a34a' : c.border}`,
                  background: isChecked ? 'rgba(22,163,74,0.14)' : 'transparent',
                  color: isChecked ? '#166534' : '#6b7280',
                  borderRadius: 999,
                  fontSize: 10,
                  fontWeight: 700,
                  padding: '2px 8px',
                  cursor: 'pointer',
                }}
              >
                {isChecked ? 'Done' : 'Open'}
              </button>
            </td>
          )
        }

        if (col.type === 'thumbnail') {
          const thumb = shot.image
          return (
            <td key={col.key} style={cellStyle}>
              <div style={{ height: rowHeight, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {thumb ? (
                  <img src={thumb} alt="Storyboard thumbnail" style={{ width: 46, height: rowHeight - 6, borderRadius: 3, objectFit: 'cover', border: `1px solid ${c.border}` }} />
                ) : (
                  <span style={{ fontSize: 9, opacity: 0.35 }}>—</span>
                )}
              </div>
            </td>
          )
        }

        if (col.type === 'readonly') {
          return (
            <td key={col.key} style={cellStyle}>
              <div style={{ display: 'flex', alignItems: 'center', height: rowHeight, paddingRight: 2, overflow: 'hidden' }}>
                <EditableCell
                  type="readonly"
                  value={shot.displayId}
                  isDark={isDark}
                  onChange={() => {}}
                />
              </div>
            </td>
          )
        }

        // I/E (Interior/Exterior) — per-shot independent value
        if (col.type === 'intExt') {
          return (
            <td key={col.key} style={cellStyle}>
              <EditableCell
                type="dropdown"
                value={shot.intOrExt ?? ''}
                options={INT_EXT_OPTIONS}
                customOptions={customDropdownOptions['int'] || []}
                onAddCustomOption={(v) => addCustomDropdownOption('int', v)}
                isDark={isDark}
                onChange={(val) => handleShotChange(shot.id, 'intOrExt', val)}
                placeholder={sceneIntOrExt || ''}
              />
            </td>
          )
        }

        // D/N (Day/Night) — per-shot independent value
        if (col.type === 'dayNight') {
          return (
            <td key={col.key} style={cellStyle}>
              <EditableCell
                type="dropdown"
                value={shot.dayNight ?? ''}
                options={DAY_NIGHT_OPTIONS}
                customOptions={customDropdownOptions['dn'] || []}
                onAddCustomOption={(v) => addCustomDropdownOption('dn', v)}
                isDark={isDark}
                onChange={(val) => handleShotChange(shot.id, 'dayNight', val)}
                placeholder={sceneDayNight || ''}
              />
            </td>
          )
        }

        // Compute value for regular cells
        const val = col.key.startsWith('specs.')
          ? (shot.specs?.[col.key.split('.')[1]] ?? '')
          : (col.key === 'description' ? (shot.description ?? shot.subject ?? '') : (shot[col.key] ?? ''))

        const customOpts = col.customOptionsField
          ? (customDropdownOptions[col.customOptionsField] || [])
          : []

        return (
          <td key={col.key} style={cellStyle}>
            <EditableCell
              type={col.type}
              options={col.options}
              customOptions={customOpts}
              onAddCustomOption={col.customOptionsField
                ? (v) => addCustomDropdownOption(col.customOptionsField, v)
                : undefined
              }
              value={val}
              isDark={isDark}
              onChange={(newVal) => handleShotChange(shot.id, col.key === 'description' ? 'description' : col.key, newVal)}
            />
          </td>
        )
      })}
    </tr>
  )
}

// ── Main ShotlistTab ──────────────────────────────────────────────────────────
export default function ShotlistTab({
  containerRef,
  configureOpen = false,
  onConfigureOpenChange = () => {},
}) {
  const scenes                  = useStore(s => s.scenes)
  const scriptScenes            = useStore(s => s.scriptScenes)
  const schedule                = useStore(s => s.schedule)
  const addShootingDay          = useStore(s => s.addShootingDay)
  const removeShootingDay       = useStore(s => s.removeShootingDay)
  const getShotsForScene        = useStore(s => s.getShotsForScene)
  const updateShot              = useStore(s => s.updateShot)
  const updateShotSpec          = useStore(s => s.updateShotSpec)
  const updateCanonicalStoryboardSceneMetadata = useStore(s => s.updateCanonicalStoryboardSceneMetadata)
  const getCanonicalStoryboardSceneMetadata = useStore(s => s.getCanonicalStoryboardSceneMetadata)
  const addShot                 = useStore(s => s.addShot)
  const addShotBlock            = useStore(s => s.addShotBlock)
  const deleteShot              = useStore(s => s.deleteShot)
  const reorderShots            = useStore(s => s.reorderShots)
  const shotlistColumnConfig    = useStore(s => s.shotlistColumnConfig)
  const setShotlistColumnConfig = useStore(s => s.setShotlistColumnConfig)
  const customColumns           = useStore(s => s.customColumns)
  const addCustomColumn         = useStore(s => s.addCustomColumn)
  const removeCustomColumn      = useStore(s => s.removeCustomColumn)
  const shotlistColumnWidths    = useStore(s => s.shotlistColumnWidths)
  const setShotlistColumnWidth  = useStore(s => s.setShotlistColumnWidth)
  const openScenePropertiesDialog = useStore(s => s.openScenePropertiesDialog)
  const shotlistViewState = useStore(s => s.tabViewState?.shotlist || {})
  const setTabViewState = useStore(s => s.setTabViewState)
  const isDark = false

  const [selectedDayId, setSelectedDayId] = useState(shotlistViewState.selectedDayId || null)
  const [activeNavSceneId, setActiveNavSceneId] = useState(shotlistViewState.activeNavSceneId || null)
  const [expandedSceneDetails, setExpandedSceneDetails] = useState(shotlistViewState.expandedSceneDetails || {})
  const [highlightedSceneId, setHighlightedSceneId] = useState(null)
  const sceneSectionRefs = useRef({})
  const mainPanelRef = useRef(null)
  const [viewSettings, setViewSettings] = useState({
    density: shotlistViewState.density || 'compact',
    showThumbnails: shotlistViewState.showThumbnails ?? true,
    showSidebar: shotlistViewState.showSidebar ?? true,
    showSceneDetails: shotlistViewState.showSceneDetails ?? false,
    groupingMode: shotlistViewState.groupingMode || 'scene',
    sortingMode: shotlistViewState.sortingMode || 'shotNumber',
  })
  const scrollerRef = useRef(null)
  const dayTabs = useMemo(
    () => schedule.map((day, idx) => ({
      id: day.id,
      label: `Day ${idx + 1}${day.date ? ` — ${fmtDate(day.date)}` : ''}`,
    })),
    [schedule]
  )

  // Clamp selectedDayIdx if schedule shrinks
  const resolvedDayIdx = selectedDayId
    ? schedule.findIndex(day => day.id === selectedDayId)
    : 0
  const activeDayIdx = schedule.length === 0 ? -1 : Math.max(0, resolvedDayIdx)
  const activeDay = activeDayIdx >= 0 ? schedule[activeDayIdx] : null

  useEffect(() => {
    setTabViewState('shotlist', {
      selectedDayId: activeDay?.id || null,
      activeNavSceneId,
      expandedSceneDetails,
      ...viewSettings,
    })
  }, [activeDay, activeNavSceneId, expandedSceneDetails, setTabViewState, viewSettings])

  useEffect(() => {
    const node = scrollerRef.current
    if (!node) return
    const savedTop = shotlistViewState.scrollTop
    if (typeof savedTop === 'number') {
      requestAnimationFrame(() => {
        node.scrollTop = savedTop
      })
    }
  }, [shotlistViewState.scrollTop])

  // Build a Set of shotIds scheduled for the active day
  const activeDayShotIds = useMemo(() => {
    if (!activeDay) return new Set()
    return new Set(
      activeDay.blocks
        .filter(b => b.type !== 'break' && b.shotId)
        .map(b => b.shotId)
    )
  }, [activeDay])

  // Filtered scenes: only scenes that have at least one shot in activeDayShotIds
  // Each scene's shots are also filtered to only include those in activeDayShotIds
  const filteredScenes = useMemo(() => {
    if (!activeDay) return []
    return scenes
      .map(scene => {
        const shots = getShotsForScene(scene.id).filter(s => activeDayShotIds.has(s.id))
        const canonical = getCanonicalStoryboardSceneMetadata(scene.id)
        return { ...scene, _filteredShots: shots, _canonical: canonical }
      })
      .filter(scene => scene._filteredShots.length > 0)
  }, [scenes, scriptScenes, activeDay, activeDayShotIds, getShotsForScene, getCanonicalStoryboardSceneMetadata])

  useEffect(() => {
    if (!filteredScenes.length) {
      setActiveNavSceneId(null)
      return
    }
    if (!activeNavSceneId || !filteredScenes.some(scene => scene.id === activeNavSceneId)) {
      setActiveNavSceneId(filteredScenes[0].id)
    }
  }, [activeNavSceneId, filteredScenes])


  const scriptPaginationByScene = useMemo(
    () => estimateScreenplayPagination(scriptScenes).byScene,
    [scriptScenes]
  )

  // ── Column resize state ────────────────────────────────────────────────────
  // Track active resize: { key, startX, startWidth }
  const resizingRef = useRef(null)

  const handleResizeStart = useCallback((e, colKey, currentWidth) => {
    e.preventDefault()
    e.stopPropagation()
    resizingRef.current = { key: colKey, startX: e.clientX, startWidth: currentWidth }

    const onMouseMove = (me) => {
      if (!resizingRef.current) return
      const delta = me.clientX - resizingRef.current.startX
      const newWidth = Math.max(40, resizingRef.current.startWidth + delta)
      setShotlistColumnWidth(resizingRef.current.key, newWidth)
    }

    const onMouseUp = () => {
      resizingRef.current = null
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
    }

    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
  }, [setShotlistColumnWidth])

  // Shared sensors for row drag-and-drop (one per scene DndContext).
  // distance: 8 means the pointer must move 8px before drag activates,
  // so a normal click on any cell will never accidentally start a drag.
  const rowSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  )

  // Merge built-in columns with custom columns into a unified lookup map
  const allColumnsMap = useMemo(() => {
    const map = {}
    BUILTIN_COLUMNS.forEach(col => { map[col.key] = col })
    customColumns.forEach(c => {
      map[c.key] = {
        key: c.key,
        label: c.label,
        width: 100,
        type: c.fieldType === 'dropdown' ? 'dropdown' : 'text',
        options: [],
        customOptionsField: c.fieldType === 'dropdown' ? c.key : undefined,
        isCustom: true,
      }
    })
    return map
  }, [customColumns])

  // Compute visible columns in config order, applying any user-set width overrides
  const visibleColumns = useMemo(() => {
    return (shotlistColumnConfig || [])
      .filter(c => c.visible)
      .map(c => {
        const col = allColumnsMap[c.key]
        if (!col) return null
        if (!viewSettings.showThumbnails && col.key === 'thumbnail') return null
        const overrideWidth = shotlistColumnWidths?.[col.key]
        return overrideWidth != null ? { ...col, width: overrideWidth } : col
      })
      .filter(Boolean)
  }, [shotlistColumnConfig, allColumnsMap, shotlistColumnWidths, viewSettings.showThumbnails])

  const totalTableWidth = DRAG_COL_WIDTH + visibleColumns.reduce((sum, col) => sum + col.width, 0)
  const stickyOffsets = useMemo(() => {
    const stickyKeys = new Set(['displayId', 'description'])
    const offsets = {}
    let running = DRAG_COL_WIDTH
    visibleColumns.forEach(col => {
      if (stickyKeys.has(col.key)) offsets[col.key] = running
      running += col.width
    })
    return offsets
  }, [visibleColumns])

  const c = {
    pageBg:      '#F5F2EC',
    tableBg:     '#FAF8F4',
    rowAlt:      '#F1ECE2',
    headerBg:    '#2C2C2E',
    border:      'rgba(74,85,104,0.1)',
    thickBorder: 'rgba(74,85,104,0.15)',
    text:        '#111827',
    muted:       '#374151',
  }

  const rowHeight = DENSITY_ROW_HEIGHT[viewSettings.density] || DENSITY_ROW_HEIGHT.compact

  const sortShots = useCallback((rawShots) => {
    const shots = [...rawShots]
    if (viewSettings.sortingMode === 'status') {
      shots.sort((a, b) => Number(!!a.checked) - Number(!!b.checked))
      return shots
    }
    const displayRank = (displayId) => {
      const match = String(displayId || '').match(/^(\d+)([A-Z]*)$/i)
      if (!match) return Number.MAX_SAFE_INTEGER
      const n = Number(match[1] || 0)
      const suffix = String(match[2] || '').toUpperCase()
      const s = suffix ? suffix.charCodeAt(0) - 64 : 0
      return n * 100 + s
    }
    shots.sort((a, b) => displayRank(a.displayId) - displayRank(b.displayId))
    return shots
  }, [viewSettings.sortingMode])

  const handleShotChange = useCallback((shotId, key, value) => {
    if (key.startsWith('specs.')) {
      updateShotSpec(shotId, key.split('.')[1], value)
    } else if (key === 'description') {
      updateShot(shotId, { description: value, subject: value })
    } else {
      updateShot(shotId, { [key]: value })
    }
  }, [updateShot, updateShotSpec])

  // Add a shot to a scene AND schedule it for the active day
  const handleAddShotForDay = useCallback((sceneId) => {
    const shotId = addShot(sceneId)
    if (shotId && activeDay) {
      addShotBlock(activeDay.id, shotId)
    }
  }, [addShot, addShotBlock, activeDay])

  const handleAddAllShotsForDay = useCallback((sceneId) => {
    if (!activeDay) return
    const existingShotIds = new Set(
      activeDay.blocks
        .filter(block => block.type !== 'break' && block.shotId)
        .map(block => block.shotId)
    )
    getShotsForScene(sceneId).forEach((shot) => {
      if (existingShotIds.has(shot.id)) return
      addShotBlock(activeDay.id, shot.id)
      existingShotIds.add(shot.id)
    })
  }, [activeDay, addShotBlock, getShotsForScene])

  const handleAddDay = useCallback(() => {
    const newDayId = addShootingDay()
    if (newDayId) setSelectedDayId(newDayId)
  }, [addShootingDay])

  const handleDeleteDay = useCallback((dayId, fallbackDayId) => {
    removeShootingDay(dayId)
    if (selectedDayId === dayId) {
      setSelectedDayId(fallbackDayId || null)
    }
  }, [removeShootingDay, selectedDayId])

  const handleRowDragEnd = useCallback((event, sceneId) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    reorderShots(sceneId, active.id, over.id)
  }, [reorderShots])

  const [addShotModalSceneId, setAddShotModalSceneId] = useState(null)
  const addShotModalScene = useMemo(
    () => filteredScenes.find(scene => scene.id === addShotModalSceneId) || null,
    [filteredScenes, addShotModalSceneId]
  )
  const allProjectShots = useMemo(
    () => scenes.flatMap(scene => getShotsForScene(scene.id)),
    [scenes, getShotsForScene]
  )
  const addExistingCandidates = useMemo(() => {
    if (!addShotModalScene || !activeDay) return []
    return allProjectShots.filter(shot => !activeDayShotIds.has(shot.id))
  }, [addShotModalScene, activeDay, allProjectShots, activeDayShotIds])

  useEffect(() => {
    const root = mainPanelRef.current
    if (!root || filteredScenes.length === 0) return
    const observer = new IntersectionObserver((entries) => {
      const visible = entries
        .filter(entry => entry.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0]
      if (visible?.target?.dataset?.sceneId) {
        setActiveNavSceneId(visible.target.dataset.sceneId)
      }
    }, { root, threshold: [0.25, 0.5, 0.75] })
    filteredScenes.forEach(scene => {
      const node = sceneSectionRefs.current[scene.id]
      if (node) observer.observe(node)
    })
    return () => observer.disconnect()
  }, [filteredScenes])

  const jumpToScene = useCallback((sceneId) => {
    const root = mainPanelRef.current
    const node = sceneSectionRefs.current[sceneId]
    if (!root || !node) return
    const rootRect = root.getBoundingClientRect()
    const nodeRect = node.getBoundingClientRect()
    const alreadyVisible = nodeRect.top >= rootRect.top + 40 && nodeRect.bottom <= rootRect.bottom - 40
    if (alreadyVisible) {
      setHighlightedSceneId(sceneId)
      setTimeout(() => setHighlightedSceneId(prev => (prev === sceneId ? null : prev)), 900)
      return
    }
    node.scrollIntoView({ behavior: 'smooth', block: 'start' })
    setHighlightedSceneId(sceneId)
    setTimeout(() => setHighlightedSceneId(prev => (prev === sceneId ? null : prev)), 900)
  }, [])

  return (
    <div
      ref={el => {
        scrollerRef.current = el
        if (containerRef) containerRef.current = el
      }}
      onScroll={(e) => setTabViewState('shotlist', { scrollTop: e.currentTarget.scrollTop })}
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        background: c.pageBg,
      }}
    >

      {/* ── Day Subtab Bar ── */}
      <DayTabBar
        days={dayTabs}
        activeDay={schedule[activeDayIdx]?.id}
        onSelect={(dayId) => setSelectedDayId(dayId)}
        onAddDay={handleAddDay}
        onDeleteDay={handleDeleteDay}
        enableDayContextMenu
      />

      {/* ── Toolbar ── */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'flex-end',
        padding: '5px 16px',
        borderBottom: `1px solid ${c.thickBorder}`,
        backgroundColor: c.pageBg,
        position: 'relative',
        zIndex: 20,
        flexShrink: 0,
      }}>
        {configureOpen && (
          <ColumnConfigPanel
            config={shotlistColumnConfig || []}
            isDark={isDark}
            onChange={setShotlistColumnConfig}
            onClose={() => onConfigureOpenChange(false)}
            customColumns={customColumns}
            onAddCustomColumn={addCustomColumn}
            onRemoveCustomColumn={removeCustomColumn}
            viewSettings={viewSettings}
            onViewSettingsChange={(patch) => setViewSettings(prev => ({ ...prev, ...patch }))}
          />
        )}
      </div>

      {/* ── No days empty state ── */}
      {schedule.length === 0 && (
        <div style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          color: isDark ? '#555' : '#bbb',
          fontFamily: 'monospace',
          fontSize: 12,
          gap: 10,
          padding: 40,
          textAlign: 'center',
        }}>
          <svg width="36" height="36" viewBox="0 0 36 36" fill="none" stroke="currentColor" strokeWidth="1.5" opacity="0.5">
            <rect x="4" y="6" width="28" height="26" rx="2" />
            <line x1="12" y1="2" x2="12" y2="10" />
            <line x1="24" y1="2" x2="24" y2="10" />
            <line x1="4" y1="14" x2="32" y2="14" />
          </svg>
          <div>No shooting days yet.</div>
          <div style={{ opacity: 0.6 }}>Add days in the Schedule tab, or use + Add Day above.</div>
        </div>
      )}

      {/* ── No shots for day empty state ── */}
      {schedule.length > 0 && activeDay && filteredScenes.length === 0 && (
        <div style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          color: isDark ? '#555' : '#aaa',
          fontFamily: 'monospace',
          fontSize: 12,
          gap: 16,
          padding: 40,
          textAlign: 'center',
        }}>
          <svg width="36" height="36" viewBox="0 0 36 36" fill="none" stroke="currentColor" strokeWidth="1.5" opacity="0.4">
            <rect x="4" y="6" width="28" height="26" rx="2" />
            <line x1="12" y1="2" x2="12" y2="10" />
            <line x1="24" y1="2" x2="24" y2="10" />
            <line x1="4" y1="14" x2="32" y2="14" />
          </svg>
          <div style={{ color: isDark ? '#666' : '#999' }}>No shots scheduled for this day.</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center' }}>
            <div style={{ fontSize: 10, opacity: 0.6, marginBottom: 4 }}>Add a shot to this day:</div>
            {scenes.map(scene => (
              <button
                key={scene.id}
                onClick={() => handleAddShotForDay(scene.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '6px 14px',
                  border: `1px dashed ${isDark ? '#333' : '#d0ccc5'}`,
                  borderRadius: 4,
                  background: 'none',
                  cursor: 'pointer',
                  fontSize: 11,
                  fontFamily: 'monospace',
                  color: isDark ? '#555' : '#aaa',
                  transition: 'color 0.12s, border-color 0.12s',
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.color = isDark ? '#4ade80' : '#16a34a'
                  e.currentTarget.style.borderColor = isDark ? '#4ade80' : '#16a34a'
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.color = isDark ? '#555' : '#aaa'
                  e.currentTarget.style.borderColor = isDark ? '#333' : '#d0ccc5'
                }}
              >
                <svg width="9" height="9" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                  <line x1="5" y1="1" x2="5" y2="9" />
                  <line x1="1" y1="5" x2="9" y2="5" />
                </svg>
                Add Shot — {scene.sceneLabel}{scene.location ? ` · ${scene.location}` : ''}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Table ── */}
      {schedule.length > 0 && activeDay && filteredScenes.length > 0 && (
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', borderTop: `1px solid ${c.border}` }}>
        {viewSettings.showSidebar && (
          <aside style={{ width: 318, borderRight: `1px solid ${c.thickBorder}`, background: '#F8F5EF', overflow: 'auto' }}>
            <div style={{ padding: '10px 12px', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700, opacity: 0.6 }}>
              Day scenes
            </div>
            {filteredScenes.map((scene) => (
              <button
                key={scene.id}
                onClick={() => jumpToScene(scene.id)}
                data-entity-type="scene"
                data-entity-id={scene.id}
                style={{
                  width: '100%',
                  border: 'none',
                  background: activeNavSceneId === scene.id ? 'rgba(0,0,0,0.08)' : 'transparent',
                  textAlign: 'left',
                  padding: '8px 12px',
                  borderLeft: `3px solid ${scene._canonical?.color || scene.color || '#94a3b8'}`,
                  cursor: 'pointer',
                }}
              >
                <div style={{ fontSize: 10, fontWeight: 800, fontFamily: 'monospace', opacity: 0.75 }}>{formatSceneNumber(scene._canonical?.sceneNumber || scene.sceneLabel)}</div>
                <div style={{ fontSize: 12, fontWeight: 600, opacity: 0.85, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {scene._canonical?.titleSlugline || scene.slugline || scene.location || 'Untitled scene'}
                </div>
                <div style={{ marginTop: 2, fontSize: 10, opacity: 0.62 }}>{formatShotCountLabel(scene._filteredShots.length)}</div>
              </button>
            ))}
          </aside>
        )}

        <div ref={mainPanelRef} style={{ flex: 1, overflow: 'auto', padding: '8px 14px 18px' }}>
          {filteredScenes.map((scene) => {
            const shots = sortShots(scene._filteredShots)
            const showDetails = viewSettings.showSceneDetails || !!expandedSceneDetails[scene.id]
            const sceneCharacters = scene._canonical?.characters || []
            return (
              <section
                key={scene.id}
                data-scene-id={scene.id}
                data-entity-type="scene"
                data-entity-id={scene.id}
                ref={node => { sceneSectionRefs.current[scene.id] = node }}
                style={{
                  marginBottom: 8,
                  borderRadius: 6,
                  border: `1px solid ${highlightedSceneId === scene.id ? 'rgba(232,64,64,0.45)' : c.thickBorder}`,
                  boxShadow: highlightedSceneId === scene.id ? '0 0 0 3px rgba(232,64,64,0.08)' : 'none',
                  transition: 'box-shadow 0.25s, border-color 0.25s',
                  background: c.tableBg,
                  overflow: 'hidden',
                }}
              >
                <div data-entity-type="scene" data-entity-id={scene.id} onDoubleClick={() => openScenePropertiesDialog('storyboard', scene.id)} style={{ padding: '8px 12px 7px', borderLeft: `4px solid ${scene._canonical?.color || scene.color || '#F2C250'}` }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                        <span style={{ fontWeight: 800, fontFamily: 'monospace', fontSize: 11 }}>{formatSceneNumber(scene._canonical?.sceneNumber || scene.sceneLabel)}</span>
                        <span style={{ fontWeight: 700, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {scene._canonical?.titleSlugline || scene.slugline || scene.location || 'Untitled Scene'}
                        </span>
                      </div>
                      <div style={{ fontSize: 11, color: '#6b7280', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', lineHeight: 1.25 }}>
                        <span>{scene._canonical?.location || scene.location || 'Location'}</span>
                        <span>•</span>
                        <span>{scene._canonical?.intOrExt || scene.intOrExt || 'INT'}</span>
                        <span>{scene._canonical?.dayNight || scene.dayNight || 'DAY'}</span>
                        <span>•</span>
                        <span>{scene.linkedScriptSceneId && scriptPaginationByScene[scene.linkedScriptSceneId] ? `${scriptPaginationByScene[scene.linkedScriptSceneId].pageCount.toFixed(2)} pages` : '— pages'}</span>
                        <span>•</span>
                        <span>{formatShotCountLabel(shots.length)}</span>
                        <span>•</span>
                        <span title={sceneCharacters.join(', ')}>Cast: {formatCharacterSummary(sceneCharacters, 2)}</span>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                      <button
                        onClick={() => setExpandedSceneDetails(prev => ({ ...prev, [scene.id]: !prev[scene.id] }))}
                        style={{ border: `1px solid ${c.border}`, borderRadius: 4, background: 'transparent', cursor: 'pointer', fontSize: 10, padding: '3px 7px' }}
                      >
                        {showDetails ? 'Hide details' : 'Show details'}
                      </button>
                    </div>
                  </div>
                </div>

                {showDetails && (
                  <div style={{ padding: '8px 12px', borderTop: `1px solid ${c.border}` }}>
                    <ScenePropertiesPanel
                      values={{
                        sceneNumber: scene._canonical?.sceneNumber || scene.sceneLabel || '',
                        titleSlugline: scene._canonical?.titleSlugline || scene.slugline || '',
                        location: scene._canonical?.location || scene.location || '',
                        intExt: scene._canonical?.intOrExt || scene.intOrExt || '',
                        dayNight: scene._canonical?.dayNight || scene.dayNight || '',
                        color: scene._canonical?.color || scene.color || null,
                        characters: scene._canonical?.characters || [],
                      }}
                      estimatedPages={scene.linkedScriptSceneId && scriptPaginationByScene[scene.linkedScriptSceneId]
                        ? `${scriptPaginationByScene[scene.linkedScriptSceneId].pageCount.toFixed(2)} pp · p${scriptPaginationByScene[scene.linkedScriptSceneId].startPage}–${scriptPaginationByScene[scene.linkedScriptSceneId].endPage}`
                        : '—'}
                    />
                  </div>
                )}

                <div style={{ position: 'relative', overflowX: 'auto', borderTop: `1px solid ${c.border}` }}>
                  <table style={{ borderCollapse: 'collapse', tableLayout: 'fixed', width: Math.max(totalTableWidth, 980), minWidth: '100%', backgroundColor: c.tableBg, fontSize: 11, fontFamily: 'system-ui, -apple-system, "Segoe UI", Helvetica, Arial, sans-serif' }}>
                    <colgroup>
                      <col style={{ width: DRAG_COL_WIDTH }} />
                      {visibleColumns.map(col => <col key={col.key} style={{ width: col.width }} />)}
                    </colgroup>
                    <thead>
                      <tr style={{ height: rowHeight + 2 }}>
                        <th className="shotlist-ui-col" style={{ position: 'sticky', top: 0, left: 0, zIndex: 16, backgroundColor: c.headerBg, borderBottom: `2px solid ${c.thickBorder}`, borderRight: `1px solid ${c.thickBorder}`, width: DRAG_COL_WIDTH }} />
                        {visibleColumns.map((col, i) => (
                          <th key={col.key} style={{ position: 'sticky', top: 0, left: stickyOffsets[col.key], zIndex: stickyOffsets[col.key] != null ? 15 : 10, backgroundColor: c.headerBg, color: '#FFFFFF', fontSize: 9, fontWeight: 700, fontFamily: 'Sora, sans-serif', letterSpacing: '0.07em', textTransform: 'uppercase', textAlign: 'left', padding: '0 8px', borderBottom: `2px solid ${c.thickBorder}`, borderRight: i < visibleColumns.length - 1 ? `1px solid ${c.thickBorder}` : 'none', whiteSpace: 'nowrap', userSelect: 'none', overflow: 'hidden', boxSizing: 'border-box', paddingRight: 16, boxShadow: stickyOffsets[col.key] != null ? `1px 0 0 ${c.thickBorder}` : 'none' }}>
                            <div style={{ position: 'relative', display: 'flex', alignItems: 'center', height: '100%' }}>
                              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', flex: 1 }}>{col.label}</span>
                              <ColResizeHandle colKey={col.key} width={col.width} isDark={isDark} onResizeStart={handleResizeStart} />
                            </div>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      <DndContext sensors={rowSensors} collisionDetection={closestCenter} onDragEnd={(e) => handleRowDragEnd(e, scene.id)}>
                        <SortableContext items={shots.map(s => s.id)} strategy={verticalListSortingStrategy}>
                          {shots.map((shot, idx) => (
                            <SortableShotRow
                              key={shot.id}
                              shot={shot}
                              shotIndex={idx}
                              scene={scene}
                              visibleColumns={visibleColumns}
                              c={c}
                              isDark={isDark}
                              handleShotChange={handleShotChange}
                              onDelete={deleteShot}
                              rowHeight={rowHeight}
                              sceneIntOrExt={scene._canonical?.intOrExt || scene.intOrExt}
                              sceneDayNight={scene._canonical?.dayNight || scene.dayNight}
                              stickyOffsets={stickyOffsets}
                            />
                          ))}
                        </SortableContext>
                      </DndContext>
                      <tr className="shotlist-add-row">
                        <td colSpan={visibleColumns.length + 1} style={{ height: 32, padding: 0, borderBottom: `2px solid ${c.thickBorder}` }}>
                          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                            <button onClick={() => setAddShotModalSceneId(scene.id)} style={{ height: '100%', background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, fontFamily: 'monospace', fontWeight: 600, letterSpacing: '0.04em', color: '#7c7468', padding: '0 8px' }}>
                              + Add Shot
                            </button>
                            <button onClick={() => handleAddAllShotsForDay(scene.id)} style={{ height: '100%', background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, fontFamily: 'monospace', fontWeight: 600, letterSpacing: '0.04em', color: '#7c7468', padding: '0 8px' }}>
                              + Add all shots in scene
                            </button>
                          </div>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </section>
            )
          })}
        </div>
      </div>
      )}

      {addShotModalScene && (
        <ShotlistAddShotModal
          scene={addShotModalScene}
          candidates={addExistingCandidates}
          onClose={() => setAddShotModalSceneId(null)}
          onCreateNew={() => {
            handleAddShotForDay(addShotModalScene.id)
            setAddShotModalSceneId(null)
          }}
          onAttachExisting={(shotId) => {
            if (activeDay && shotId) addShotBlock(activeDay.id, shotId)
            setAddShotModalSceneId(null)
          }}
        />
      )}
    </div>
  )
}
