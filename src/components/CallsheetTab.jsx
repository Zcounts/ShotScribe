import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import useStore, { CALLSHEET_COLUMN_DEFINITIONS, DEFAULT_CALLSHEET_SECTION_CONFIG } from '../store'
import SidebarPane from './SidebarPane'
import { DayTabBar } from './DayTabBar'
import {
  buildCallsheetWarnings,
  buildDayScheduleRows,
  deriveDayCastRows,
  deriveDayCrewRows,
} from '../utils/callsheetSelectors'
import { exportSingleDayCallsheetPDF } from './ExportModal'
import { platformService } from '../services/platformService'
import useResponsiveViewport from '../hooks/useResponsiveViewport'

function formatDate(isoDate) {
  if (!isoDate) return 'TBD'
  const [y, m, d] = isoDate.split('-')
  if (!y || !m || !d) return isoDate
  return `${m}/${d}/${y}`
}

function formatTime12(time24) {
  if (!time24) return 'TBD'
  const [h, m] = String(time24).split(':').map(Number)
  if (Number.isNaN(h) || Number.isNaN(m)) return time24
  const ampm = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 || 12
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`
}

function formatMinuteOfDay(totalMins) {
  if (typeof totalMins !== 'number') return '—'
  const safeTotal = ((Math.round(totalMins) % (24 * 60)) + 24 * 60) % (24 * 60)
  const h24 = Math.floor(safeTotal / 60)
  const m = safeTotal % 60
  const h12 = h24 % 12 || 12
  const ampm = h24 < 12 ? 'AM' : 'PM'
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`
}

function formatDayNightDisplay(value) {
  const raw = String(value || '').trim()
  if (!raw) return '—'
  const upper = raw.toUpperCase()
  if (upper === 'NIGHT') return 'NITE'
  return upper.slice(0, 4)
}

function Card({ title, subtitle, actions = null, children, tone = 'default' }) {
  const bg = tone === 'alert' ? '#FFF5F5' : '#FAF8F4'
  const border = tone === 'alert' ? '1px solid #FECACA' : '1px solid #E2E8F0'
  return (
    <section style={{ background: bg, border, borderRadius: 10, overflow: 'hidden', boxShadow: 'var(--app-panel-shadow)' }}>
      <header style={{ padding: '9px 12px', borderBottom: '1px solid #EEF2F7', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <div>
          <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700, color: '#475569' }}>{title}</div>
          {subtitle ? <div style={{ fontSize: 11, color: '#64748B', marginTop: 2 }}>{subtitle}</div> : null}
        </div>
        {actions}
      </header>
      <div style={{ padding: 12 }}>{children}</div>
    </section>
  )
}

function CompactIconButton({ label, onClick, icon = '+', title }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title || label}
      aria-label={label}
      style={{ border: '1px solid #CBD5E1', borderRadius: 6, padding: '3px 7px', background: '#fff', color: '#334155', fontSize: 12, lineHeight: 1.2, cursor: 'pointer' }}
    >
      {icon}
    </button>
  )
}

const CALLSHEET_PRIMARY_COLUMN_BY_SECTION = {
  advancedSchedule: 'sluglineScene',
  castList: 'actor',
  crewList: 'name',
}

function ConfigureButton({ onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{ border: '1px solid #CBD5E1', borderRadius: 6, padding: '3px 8px', background: '#fff', color: '#334155', fontSize: 12, fontWeight: 600, lineHeight: 1.2, cursor: 'pointer' }}
    >
      Configure
    </button>
  )
}

function SectionColumnConfigureControl({ sectionKey, sectionLabel, columnConfig, onToggleColumn, isOpen, onToggleOpen }) {
  const columns = CALLSHEET_COLUMN_DEFINITIONS[sectionKey] || []
  const visibleMap = new Map((columnConfig || []).map(column => [column.key, !!column.visible]))
  const primaryKey = CALLSHEET_PRIMARY_COLUMN_BY_SECTION[sectionKey]
  const triggerRef = useRef(null)
  const [panelPosition, setPanelPosition] = useState({ top: 0, left: 0 })

  useLayoutEffect(() => {
    if (!isOpen) return undefined
    const PANEL_WIDTH = 250
    const EDGE_GAP = 8
    const VERTICAL_GAP = 6

    const updatePosition = () => {
      const triggerNode = triggerRef.current
      if (!triggerNode) return
      const rect = triggerNode.getBoundingClientRect()
      const scrollY = window.scrollY || window.pageYOffset || 0
      const scrollX = window.scrollX || window.pageXOffset || 0

      const documentTop = rect.bottom + scrollY + VERTICAL_GAP
      const documentLeft = rect.right + scrollX - PANEL_WIDTH
      const viewportTop = documentTop - scrollY
      const viewportLeft = Math.min(
        Math.max(EDGE_GAP, documentLeft - scrollX),
        window.innerWidth - PANEL_WIDTH - EDGE_GAP,
      )

      setPanelPosition({
        top: viewportTop,
        left: viewportLeft,
      })
    }

    updatePosition()
    window.addEventListener('resize', updatePosition)
    return () => window.removeEventListener('resize', updatePosition)
  }, [isOpen])

  return (
    <div style={{ position: 'relative' }} data-callsheet-config-popover="true">
      <div ref={triggerRef} style={{ display: 'inline-flex' }} data-callsheet-config-popover="true">
        <ConfigureButton onClick={onToggleOpen} />
      </div>
      {isOpen ? (
        createPortal(
          <div style={{ position: 'fixed', top: panelPosition.top, left: panelPosition.left, width: 250, zIndex: 9999, border: '1px solid #CBD5E1', borderRadius: 8, boxShadow: '0 12px 28px rgba(15,23,42,0.18)', background: '#fff', padding: 8 }} data-callsheet-config-popover="true">
            <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#64748B', fontWeight: 700, marginBottom: 6 }}>{sectionLabel}</div>
            <div style={{ display: 'grid', gap: 5 }}>
              {columns.map(column => {
                const checked = column.key === primaryKey ? true : visibleMap.get(column.key) !== false
                const locked = column.key === primaryKey
                return (
                  <label key={column.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, fontSize: 12, color: '#334155' }}>
                    <span>{column.label}{locked ? ' (required)' : ''}</span>
                    <input type="checkbox" checked={checked} disabled={locked} onChange={(e) => onToggleColumn(sectionKey, column.key, e.target.checked)} />
                  </label>
                )
              })}
            </div>
          </div>
          ,
          document.body,
        )
      ) : null}
    </div>
  )
}

function EditableField({ label, value, onChange, placeholder, multiline = false, rows = 3 }) {
  const common = {
    width: '100%',
    border: '1px solid #CBD5E1',
    borderRadius: 6,
    padding: '7px 9px',
    fontSize: 12,
    background: '#F8FAFC',
    color: '#0F172A',
  }

  return (
    <label style={{ display: 'block' }}>
      <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#64748B', marginBottom: 5, fontWeight: 700 }}>{label}</div>
      {multiline ? (
        <textarea value={value || ''} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} rows={rows} style={{ ...common, resize: 'vertical', lineHeight: 1.4 }} />
      ) : (
        <input value={value || ''} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} style={common} />
      )}
    </label>
  )
}

function HeroEditablePill({ label, value, onChange, type = 'text', placeholder, emphasize = false }) {
  const sharedInputStyle = {
    width: '100%',
    border: '1px solid rgba(148, 163, 184, 0.4)',
    borderRadius: 8,
    background: 'rgba(15, 23, 42, 0.35)',
    color: '#F8FAFC',
    fontWeight: emphasize ? 800 : 600,
    fontSize: emphasize ? 20 : 14,
    lineHeight: 1.3,
    marginTop: emphasize ? 2 : 4,
    padding: emphasize ? '5px 9px' : '6px 9px',
    outline: 'none',
    transition: 'border-color 120ms ease, box-shadow 120ms ease, background 120ms ease',
  }

  return (
    <div style={{ padding: '10px 12px', border: '1px solid rgba(148, 163, 184, 0.35)', borderRadius: 8, background: emphasize ? 'rgba(59, 130, 246, 0.20)' : 'rgba(15, 23, 42, 0.18)' }}>
      <div style={{ fontSize: 10, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.07em', fontWeight: 700 }}>{label}</div>
      {type === 'date' ? (
        <input
          type="date"
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          style={sharedInputStyle}
        />
      ) : (
        <input
          type={type}
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          style={sharedInputStyle}
        />
      )}
    </div>
  )
}

function updateRowValue(rows = [], rosterId, id, updates) {
  const idx = rows.findIndex(row => (rosterId && row.rosterId === rosterId) || row.id === id)
  if (idx >= 0) {
    const next = [...rows]
    next[idx] = { ...next[idx], ...updates }
    return next
  }
  return [...rows, { id: id || `${Date.now()}`, rosterId: rosterId || null, ...updates }]
}

const WARNING_TARGETS = {
  'Primary shoot location is missing.': { targetKey: 'primaryLocation', sectionKey: null },
  'General call time is missing.': { targetKey: 'generalCall', sectionKey: null },
  'Weather summary is missing.': { targetKey: 'weather', sectionKey: 'generalInfo' },
  'Sunrise and/or sunset time is missing.': { targetKey: 'sunriseSunset', sectionKey: 'generalInfo' },
  'Nearest hospital details are missing.': { targetKey: 'nearestHospital', sectionKey: 'generalInfo' },
  'Emergency contacts are missing.': { targetKey: 'emergencyContacts', sectionKey: 'generalInfo' },
  'Key production contacts are missing.': { targetKey: 'keyContacts', sectionKey: 'generalInfo' },
  'Parking / arrival notes are missing.': { targetKey: 'parkingNotes', sectionKey: 'generalInfo' },
  'Directions or map link is missing.': { targetKey: 'directions', sectionKey: 'generalInfo' },
  'Safety / special notes are missing.': { targetKey: 'safetyNotes', sectionKey: 'generalInfo' },
  'No scenes are scheduled for this day.': { targetKey: 'advancedSchedule', sectionKey: 'advancedSchedule' },
  'Cast list is empty for this day.': { targetKey: 'castList', sectionKey: 'castList' },
  'Crew list is empty for this day.': { targetKey: 'crewList', sectionKey: 'crewList' },
}

function buildCallsheetReadiness({ warningCount, recipientCount }) {
  if (warningCount > 3) return 'Draft'
  if (warningCount > 0) return 'Almost Ready'
  if (recipientCount > 0) return 'Ready to Email'
  return 'Ready to Export'
}

function SidebarCard({ title, meta, tone = 'default', collapsed = false, onToggle, children }) {
  const bg = tone === 'alert' ? '#FFF5F5' : '#FAF8F4'
  const border = tone === 'alert' ? '1px solid #FECACA' : '1px solid #E2E8F0'
  return (
    <section style={{ background: bg, border, borderRadius: 10, overflow: 'hidden', boxShadow: 'var(--app-panel-shadow)' }}>
      <button
        type="button"
        onClick={onToggle}
        style={{ width: '100%', border: 'none', background: 'transparent', cursor: 'pointer', padding: '9px 12px', borderBottom: collapsed ? 'none' : '1px solid #EEF2F7', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}
      >
        <span style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700, color: '#475569', textAlign: 'left' }}>
          {title}
          {meta ? <span style={{ marginLeft: 6, color: '#64748B' }}>{meta}</span> : null}
        </span>
        <span style={{ color: '#64748B', fontSize: 12 }}>{collapsed ? '▸' : '▾'}</span>
      </button>
      {!collapsed ? <div style={{ padding: 12 }}>{children}</div> : null}
    </section>
  )
}

function CallsheetSidebar({
  warnings,
  collapseState,
  setCollapseState,
  onWarningJump,
  onOpenExportHub,
  onOpenEmailPreflight,
  recipientsReadyCount,
  missingEmailCount,
  readinessLabel,
  statusMessage,
}) {
  return (
    <SidebarPane
            title="Callsheet"
    >
      <div style={{ padding: 10, display: 'grid', gap: 10 }}>
        <SidebarCard title="Actions" collapsed={collapseState.actions} onToggle={() => setCollapseState(prev => ({ ...prev, actions: !prev.actions }))}>
          <div style={{ display: 'grid', gap: 8 }}>
            <div style={{ fontSize: 11, color: '#475569', display: 'grid', gap: 2 }}>
              <span><strong>{recipientsReadyCount}</strong> recipients ready</span>
              <span>{missingEmailCount} missing emails</span>
              <span style={{ color: '#0F172A' }}>Status: <strong>{readinessLabel}</strong></span>
            </div>
            <button type="button" onClick={onOpenExportHub} style={{ border: '1px solid #CBD5E1', borderRadius: 7, padding: '8px 10px', background: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', textAlign: 'left' }}>
              Open Export Hub
            </button>
            <button type="button" onClick={onOpenEmailPreflight} style={{ border: '1px solid #1D4ED8', borderRadius: 7, padding: '8px 10px', background: '#EFF6FF', color: '#1E3A8A', fontSize: 12, fontWeight: 700, cursor: 'pointer', textAlign: 'left' }}>
              Email Callsheet
            </button>
            {statusMessage ? <div style={{ fontSize: 11, color: '#334155', lineHeight: 1.4 }}>{statusMessage}</div> : null}
          </div>
        </SidebarCard>



        <SidebarCard title="Missing critical info" meta={`(${warnings.length})`} tone="alert" collapsed={collapseState.missingInfo} onToggle={() => setCollapseState(prev => ({ ...prev, missingInfo: !prev.missingInfo }))}>
          {warnings.length > 0 ? (
            <ul style={{ margin: 0, paddingLeft: 18, color: '#991B1B', fontSize: 12, lineHeight: 1.5 }}>
              {warnings.map(item => (
                <li key={item}>
                  <button type="button" onClick={() => onWarningJump(item)} style={{ background: 'transparent', border: 'none', padding: 0, color: 'inherit', textDecoration: 'underline', cursor: 'pointer', textAlign: 'left' }}>{item}</button>
                </li>
              ))}
            </ul>
          ) : (
            <div style={{ color: '#166534', fontSize: 12, fontWeight: 600 }}>No critical omissions detected for this shoot day.</div>
          )}
        </SidebarCard>
      </div>
    </SidebarPane>
  )
}

function CallsheetEmptyState({ title, message, actionLabel, onAction }) {
  return (
    <div className="canvas-texture" style={{ height: '100%', display: 'grid', placeItems: 'center', padding: 24 }}>
      <div style={{ width: 'min(540px, 100%)', border: '1px solid #CBD5E1', borderRadius: 12, background: '#FAF8F4', boxShadow: 'var(--app-panel-shadow)', padding: 18, display: 'grid', gap: 10 }}>
        <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#64748B', fontWeight: 700 }}>Callsheet</div>
        <div style={{ fontSize: 22, fontWeight: 800, color: '#0F172A' }}>{title}</div>
        <div style={{ fontSize: 13, color: '#475569' }}>{message}</div>
        {onAction ? (
          <div>
            <button type="button" onClick={onAction} style={{ border: '1px solid #CBD5E1', background: '#fff', borderRadius: 7, padding: '8px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
              {actionLabel}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  )
}

export default function CallsheetTab({ configureOpen = true, onOpenExportHub = null }) {
  const schedule = useStore(s => s.schedule)
  const projectName = useStore(s => s.projectName)
  const callsheetSectionConfig = useStore(s => s.callsheetSectionConfig)
  const callsheetColumnConfig = useStore(s => s.callsheetColumnConfig)
  const getCallsheet = useStore(s => s.getCallsheet)
  const updateCallsheet = useStore(s => s.updateCallsheet)
  const updateShootingDay = useStore(s => s.updateShootingDay)
  const setCallsheetSectionConfig = useStore(s => s.setCallsheetSectionConfig)
  const setCallsheetColumnConfig = useStore(s => s.setCallsheetColumnConfig)
  const getScheduleWithShots = useStore(s => s.getScheduleWithShots)
  const scriptScenes = useStore(s => s.scriptScenes)
  const castRoster = useStore(s => s.castRoster)
  const crewRoster = useStore(s => s.crewRoster)
  const openPersonDialog = useStore(s => s.openPersonDialog)
  const callsheetViewState = useStore(s => s.tabViewState?.callsheet || {})
  const setTabViewState = useStore(s => s.setTabViewState)
  const { isDesktopDown, isPhone } = useResponsiveViewport()

  const [selectedDayId, setSelectedDayId] = useState(callsheetViewState.selectedDayId || null)
  const [emailPreflightOpen, setEmailPreflightOpen] = useState(false)
  const [statusMessage, setStatusMessage] = useState('')
  const [highlightTargetKey, setHighlightTargetKey] = useState('')
  const [showCastPicker, setShowCastPicker] = useState(false)
  const [showCrewPicker, setShowCrewPicker] = useState(false)
  const [showKeyContactPicker, setShowKeyContactPicker] = useState(false)
  const [openColumnSectionKey, setOpenColumnSectionKey] = useState(null)
  const collapseState = callsheetViewState.sidebarCollapseState || { actions: false, visibleSections: false, missingInfo: false }
  const setCollapseState = useCallback((nextValue) => {
    const next = typeof nextValue === 'function' ? nextValue(collapseState) : nextValue
    setTabViewState('callsheet', { sidebarCollapseState: next })
  }, [collapseState, setTabViewState])

  const availableDays = useMemo(() => (
    Array.isArray(schedule)
      ? schedule.filter(day => day?.id)
      : []
  ), [schedule])

  const resolvedSelectedDayId = useMemo(() => {
    const selectedIsAvailable = Boolean(selectedDayId) && availableDays.some(day => day.id === selectedDayId)
    if (selectedIsAvailable) return selectedDayId
    return availableDays[0]?.id || null
  }, [availableDays, selectedDayId])

  const activeDay = useMemo(() => {
    if (!resolvedSelectedDayId) return null
    return availableDays.find(day => day.id === resolvedSelectedDayId) || null
  }, [availableDays, resolvedSelectedDayId])

  const hasScriptUploaded = Array.isArray(scriptScenes) && scriptScenes.length > 0
  const hasScheduleDays = availableDays.length > 0

  useEffect(() => {
    setTabViewState('callsheet', {
      selectedDayId: activeDay?.id || null,
      sidebarExpanded: configureOpen,
    })
  }, [activeDay?.id, configureOpen, setTabViewState])

  useEffect(() => {
    if (!resolvedSelectedDayId) {
      if (selectedDayId !== null) setSelectedDayId(null)
      return
    }
    if (selectedDayId !== resolvedSelectedDayId) {
      setSelectedDayId(resolvedSelectedDayId)
    }
  }, [resolvedSelectedDayId, selectedDayId])

  const activeDayIdx = useMemo(
    () => (activeDay ? Math.max(0, availableDays.findIndex(day => day.id === activeDay.id)) : 0),
    [activeDay, availableDays]
  )

  const callsheet = activeDay ? getCallsheet(activeDay.id) : {}
  const scheduleWithShots = getScheduleWithShots()

  const scheduleRows = useMemo(() => (
    activeDay ? buildDayScheduleRows(activeDay, scheduleWithShots, scriptScenes) : { scenes: [], events: [], scheduledSceneIds: new Set() }
  ), [activeDay, scheduleWithShots, scriptScenes])

  const castRows = useMemo(() => (
    activeDay ? deriveDayCastRows({ dayId: activeDay.id, callsheet, castRoster, scriptScenes, scheduledSceneIds: scheduleRows.scheduledSceneIds }) : []
  ), [activeDay, callsheet, castRoster, scriptScenes, scheduleRows.scheduledSceneIds])

  const crewRows = useMemo(() => (
    activeDay ? deriveDayCrewRows({ callsheet, crewRoster, day: activeDay }) : []
  ), [activeDay, callsheet, crewRoster])

  const keyContactCrewIds = useMemo(() => (
    Array.isArray(callsheet?.keyContactCrewIds) ? callsheet.keyContactCrewIds.filter(Boolean) : []
  ), [callsheet?.keyContactCrewIds])

  const keyContactRows = useMemo(() => {
    const rosterById = new Map((crewRoster || []).map(entry => [entry.id, entry]))
    const linkedRows = keyContactCrewIds
      .map(id => rosterById.get(id))
      .filter(Boolean)
      .map(entry => ({
        id: entry.id,
        name: entry.name || '',
        role: entry.role || '',
        department: entry.department || '',
        phone: entry.phone || '',
        email: entry.email || '',
      }))
    const hasLegacyText = !linkedRows.length && String(callsheet?.keyContacts || '').trim()
    return { linkedRows, hasLegacyText }
  }, [callsheet?.keyContacts, crewRoster, keyContactCrewIds])

  const warnings = useMemo(() => (
    activeDay ? buildCallsheetWarnings({ day: activeDay, callsheet, scheduleRows, castRows, crewRows }) : []
  ), [activeDay, callsheet, scheduleRows, castRows, crewRows])

  const recipientSummary = useMemo(() => {
    const seenEmails = new Set()
    const everyone = [
      ...(castRoster || []).map(person => ({ ...person, type: 'cast' })),
      ...(crewRoster || []).map(person => ({ ...person, type: 'crew' })),
    ].filter(person => person.name?.trim())
    const ready = everyone.filter(person => {
      const email = person.email?.trim()
      if (!email) return false
      const key = email.toLowerCase()
      if (seenEmails.has(key)) return false
      seenEmails.add(key)
      return true
    })
    const missing = everyone.filter(person => !person.email?.trim())
    return { ready, missing }
  }, [castRoster, crewRoster])

  const readinessLabel = useMemo(() => buildCallsheetReadiness({
    warningCount: warnings.length,
    recipientCount: recipientSummary.ready.length,
  }), [warnings.length, recipientSummary.ready.length])

  const visibleSections = (callsheetSectionConfig || DEFAULT_CALLSHEET_SECTION_CONFIG)
    .filter(section => section.visible)
    .map(section => section.key)

  const isColumnVisible = useCallback((sectionKey, columnKey) => {
    const primaryKey = CALLSHEET_PRIMARY_COLUMN_BY_SECTION[sectionKey]
    if (columnKey === primaryKey) return true
    const rows = Array.isArray(callsheetColumnConfig?.[sectionKey]) ? callsheetColumnConfig[sectionKey] : []
    const match = rows.find(row => row.key === columnKey)
    return match ? !!match.visible : true
  }, [callsheetColumnConfig])

  const visibleCounts = useMemo(() => ({
    advancedSchedule: (CALLSHEET_COLUMN_DEFINITIONS.advancedSchedule || []).filter(column => isColumnVisible('advancedSchedule', column.key)).length,
    castList: (CALLSHEET_COLUMN_DEFINITIONS.castList || []).filter(column => isColumnVisible('castList', column.key)).length + 1,
    crewList: (CALLSHEET_COLUMN_DEFINITIONS.crewList || []).filter(column => isColumnVisible('crewList', column.key)).length + 1,
  }), [isColumnVisible])

  const handleToggleColumn = useCallback((sectionKey, columnKey, checked) => {
    const primaryKey = CALLSHEET_PRIMARY_COLUMN_BY_SECTION[sectionKey]
    if (columnKey === primaryKey) return
    const currentRows = Array.isArray(callsheetColumnConfig?.[sectionKey]) ? callsheetColumnConfig[sectionKey] : []
    const normalizedRows = (CALLSHEET_COLUMN_DEFINITIONS[sectionKey] || []).map(column => {
      const existing = currentRows.find(row => row.key === column.key)
      return {
        key: column.key,
        visible: column.key === primaryKey ? true : (existing ? !!existing.visible : true),
      }
    })
    const updatedRows = normalizedRows.map(row => row.key === columnKey ? { ...row, visible: checked } : row)
    setCallsheetColumnConfig({
      ...(callsheetColumnConfig || {}),
      [sectionKey]: updatedRows,
    })
  }, [callsheetColumnConfig, setCallsheetColumnConfig])

  const onDayUpdate = useCallback((updates) => {
    if (!activeDay) return
    updateCallsheet(activeDay.id, updates)
  }, [activeDay, updateCallsheet])

  const onScheduleDayUpdate = useCallback((updates) => {
    if (!activeDay) return
    updateShootingDay(activeDay.id, updates)
  }, [activeDay, updateShootingDay])

  const addCastToDay = useCallback((castId) => {
    const selected = (castRoster || []).find(entry => entry.id === castId)
    if (!selected) return
    const nextCast = updateRowValue(callsheet?.cast, selected.id, null, {
      name: selected.name || '',
      character: selected.character || selected.characterIds?.[0] || '',
    })
    const existingExcluded = new Set(Array.isArray(callsheet?.castExcludedRosterIds) ? callsheet.castExcludedRosterIds : [])
    existingExcluded.delete(selected.id)
    onDayUpdate({ cast: nextCast, castExcludedRosterIds: Array.from(existingExcluded) })
    setShowCastPicker(false)
  }, [callsheet?.cast, callsheet?.castExcludedRosterIds, castRoster, onDayUpdate])

  const addCrewToDay = useCallback((crewId) => {
    const selected = (crewRoster || []).find(entry => entry.id === crewId)
    if (!selected) return
    const nextCrew = updateRowValue(callsheet?.crew, selected.id, null, {
      name: selected.name || '',
      role: selected.role || selected.department || '',
    })
    const existingExcluded = new Set(Array.isArray(callsheet?.crewExcludedRosterIds) ? callsheet.crewExcludedRosterIds : [])
    existingExcluded.delete(selected.id)
    onDayUpdate({ crew: nextCrew, crewExcludedRosterIds: Array.from(existingExcluded) })
    setShowCrewPicker(false)
  }, [callsheet?.crew, callsheet?.crewExcludedRosterIds, crewRoster, onDayUpdate])

  const removeCastFromDay = useCallback((row) => {
    if (!row?.rosterId) return
    const hidden = new Set(Array.isArray(callsheet?.castExcludedRosterIds) ? callsheet.castExcludedRosterIds : [])
    hidden.add(row.rosterId)
    onDayUpdate({ castExcludedRosterIds: Array.from(hidden) })
  }, [callsheet?.castExcludedRosterIds, onDayUpdate])

  const removeCrewFromDay = useCallback((row) => {
    if (!row?.rosterId) return
    const hidden = new Set(Array.isArray(callsheet?.crewExcludedRosterIds) ? callsheet.crewExcludedRosterIds : [])
    hidden.add(row.rosterId)
    onDayUpdate({ crewExcludedRosterIds: Array.from(hidden) })
  }, [callsheet?.crewExcludedRosterIds, onDayUpdate])

  const addKeyContactCrew = useCallback((crewId) => {
    if (!crewId) return
    const next = Array.from(new Set([...(callsheet?.keyContactCrewIds || []), crewId]))
    onDayUpdate({ keyContactCrewIds: next })
    setShowKeyContactPicker(false)
  }, [callsheet?.keyContactCrewIds, onDayUpdate])

  const removeKeyContactCrew = useCallback((crewId) => {
    onDayUpdate({ keyContactCrewIds: (callsheet?.keyContactCrewIds || []).filter(id => id !== crewId) })
  }, [callsheet?.keyContactCrewIds, onDayUpdate])

  const availableKeyContacts = useMemo(() => {
    const selected = new Set(keyContactCrewIds)
    return (crewRoster || []).filter(entry => entry.name?.trim() && !selected.has(entry.id))
  }, [crewRoster, keyContactCrewIds])

  const exportFileName = useMemo(() => {
    const dateLabel = activeDay?.date || 'TBD'
    return `${projectName || 'Untitled Project'} - Callsheet - Day ${activeDayIdx + 1} - ${dateLabel}.pdf`
  }, [activeDay?.date, activeDayIdx, projectName])

  const exportCurrentDayPDF = useCallback(async () => {
    if (!activeDay) return null
    try {
      const result = await exportSingleDayCallsheetPDF({
        dayIdx: activeDayIdx,
        projectName,
        dayNumber: activeDayIdx + 1,
        shootDate: activeDay.date || 'TBD',
        explicitFileName: exportFileName,
      })
      setStatusMessage(`PDF exported: ${result.fileName}${result.filePath ? ` (${result.filePath})` : ''}`)
      return result
    } catch (err) {
      setStatusMessage(`Callsheet PDF export failed: ${err?.message || 'Unknown error'}`)
      return null
    }
  }, [activeDay, activeDay?.date, activeDayIdx, exportFileName, projectName])

  const handleWarningJump = useCallback((warningText) => {
    const target = WARNING_TARGETS[warningText]
    if (!target) return
    if (target.sectionKey && !visibleSections.includes(target.sectionKey)) {
      setCallsheetSectionConfig((callsheetSectionConfig || DEFAULT_CALLSHEET_SECTION_CONFIG).map(item => (
        item.key === target.sectionKey ? { ...item, visible: true } : item
      )))
    }
    requestAnimationFrame(() => {
      const node = document.querySelector(`[data-callsheet-target="${target.targetKey}"]`)
      if (!node) return
      node.scrollIntoView({ behavior: 'smooth', block: 'center' })
      setHighlightTargetKey(target.targetKey)
      window.setTimeout(() => setHighlightTargetKey(''), 1500)
    })
  }, [callsheetSectionConfig, setCallsheetSectionConfig, visibleSections])

  const continueEmailFlow = useCallback(async () => {
    if (!activeDay) return
    const recipients = recipientSummary.ready.map(person => person.email.trim()).join(',')
    if (!recipients) {
      setStatusMessage('No cast/crew emails found. Exported PDF is still available via Export Callsheet PDF.')
      setEmailPreflightOpen(false)
      return
    }

    const exportResult = await exportCurrentDayPDF()
    if (!exportResult) return

    const subject = `${projectName || 'Untitled Project'} Callsheet - Day ${activeDayIdx + 1} - ${activeDay?.date || 'TBD'}`
    const body = [
      `Attached is the callsheet for Day ${activeDayIdx + 1} on ${activeDay?.date || 'TBD'}.`,
      'Please review your call time, location, and notes.',
      '',
      'Reminder: attach the exported PDF manually before sending.',
    ].join('\n')

    const mailtoUrl = `mailto:?bcc=${encodeURIComponent(recipients)}&subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
    try {
      await platformService.openExternal(mailtoUrl)
    } catch (err) {
      console.warn('Unable to open mail client:', err)
    }

    if (exportResult.filePath && platformService.isDesktop()) {
      await platformService.revealFile(exportResult.filePath)
      await platformService.copyText(exportResult.filePath)
    }
    setStatusMessage('Draft opened and PDF revealed in folder for attachment.')
    setEmailPreflightOpen(false)
  }, [activeDay, activeDay?.date, activeDayIdx, exportCurrentDayPDF, projectName, recipientSummary.ready])

  useEffect(() => {
    if (!openColumnSectionKey) return undefined
    const onPointerDown = (event) => {
      const trigger = event.target.closest?.('[data-callsheet-config-popover]')
      if (trigger) return
      setOpenColumnSectionKey(null)
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [openColumnSectionKey])

  if (!hasScriptUploaded) {
    return (
      <CallsheetEmptyState
        title="No script uploaded yet."
        message="Upload a script first, then create a shoot day in Schedule to generate a callsheet."
      />
    )
  }

  if (!hasScheduleDays) {
    return (
      <CallsheetEmptyState
        title="No shoot days available."
        message="Add a shoot day in Schedule to generate a callsheet."
      />
    )
  }

  if (!activeDay) {
    return (
      <CallsheetEmptyState
        title="No shoot day selected."
        message="Select a day in Schedule to generate a callsheet."
        actionLabel="Select Day 1"
        onAction={() => setSelectedDayId(availableDays[0]?.id || null)}
      />
    )
  }

  const dayTabs = availableDays.map((day, idx) => ({ id: day.id, label: `Day ${idx + 1}${day.date ? ` — ${formatDate(day.date)}` : ''}` }))
  const contentPadding = isPhone ? '10px 8px 14px' : (isDesktopDown ? '12px 12px 16px' : '16px 20px')
  const heroGridTemplate = isPhone ? '1fr' : (isDesktopDown ? 'repeat(2, minmax(150px, 1fr))' : 'repeat(4, minmax(180px, 1fr))')
  const twoColumnTemplate = isDesktopDown ? '1fr' : 'repeat(2, minmax(0, 1fr))'
  const callsheetTableStyle = { width: 'max-content', minWidth: '100%', borderCollapse: 'collapse', fontSize: 12 }

  return (
    <div className="canvas-texture" style={{ height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <DayTabBar days={dayTabs} activeDay={activeDay.id} onSelect={setSelectedDayId} />

      <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
        <CallsheetSidebar
          warnings={warnings}
          collapseState={collapseState}
          setCollapseState={setCollapseState}
          onWarningJump={handleWarningJump}
          onOpenExportHub={() => onOpenExportHub?.('callsheet')}
          onOpenEmailPreflight={() => setEmailPreflightOpen(true)}
          recipientsReadyCount={recipientSummary.ready.length}
          missingEmailCount={recipientSummary.missing.length}
          readinessLabel={readinessLabel}
          statusMessage={statusMessage}
        />

        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ flex: 1, overflowY: 'auto', padding: contentPadding }}>
          <div style={{ maxWidth: 1280, margin: '0 auto', display: 'grid', gap: 14 }}>
            <header style={{ background: callsheet.headerBgColor || '#0B1220', color: '#F8FAFC', borderRadius: 10, padding: 16, display: 'grid', gap: 14, boxShadow: 'var(--app-panel-shadow)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 8 }}>
                <div>
                  <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#94A3B8', fontWeight: 700 }}>Production Callsheet</div>
                  <div style={{ fontSize: 24, fontWeight: 800, marginTop: 2 }}>{callsheet.productionTitle || projectName || 'Untitled Production'}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 12, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Shoot Day</div>
                  <div style={{ fontSize: 30, fontWeight: 900 }}>Day {activeDayIdx + 1}</div>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: heroGridTemplate, gap: 10 }}>
                <HeroEditablePill label="Date" value={activeDay.date || ''} onChange={(value) => onScheduleDayUpdate({ date: value })} type="date" emphasize />
                <div data-callsheet-target="generalCall" style={{ borderRadius: 8, background: highlightTargetKey === 'generalCall' ? '#DBEAFE' : 'transparent' }}>
                  <HeroEditablePill label="General Call" value={activeDay.startTime || ''} onChange={(value) => onScheduleDayUpdate({ startTime: value })} type="time" emphasize />
                </div>
                <div data-callsheet-target="primaryLocation" style={{ borderRadius: 8, background: highlightTargetKey === 'primaryLocation' ? '#DBEAFE' : 'transparent' }}>
                  <HeroEditablePill label="Primary Location" value={activeDay.primaryLocation || callsheet.shootLocation || ''} onChange={(value) => onScheduleDayUpdate({ primaryLocation: value })} placeholder="Set location" />
                </div>
                <HeroEditablePill label="Unit / Basecamp" value={activeDay.basecamp || ''} onChange={(value) => onScheduleDayUpdate({ basecamp: value })} placeholder="Basecamp" />
              </div>
            </header>

            {visibleSections.includes('generalInfo') && (
              <div data-callsheet-target="generalInfo" style={{ borderRadius: 10, outline: highlightTargetKey === 'generalInfo' ? '2px solid #2563EB' : 'none', outlineOffset: 2 }}>
              <Card title="Day logistics and emergency" subtitle="Linked profile contacts update globally; notes below are day-specific.">
                <div style={{ display: 'grid', gridTemplateColumns: twoColumnTemplate, gap: 10 }}>
                  <div style={{ display: 'grid', gap: 7, alignContent: 'start' }}>
                    <div data-callsheet-target="keyContacts" style={{ borderRadius: 8, background: highlightTargetKey === 'keyContacts' ? '#DBEAFE' : 'transparent' }}>
                      <div style={{ border: '1px solid #CBD5E1', borderRadius: 6, padding: 8, background: '#F8FAFC', display: 'grid', gap: 7 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                          <div>
                            <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#64748B', fontWeight: 700 }}>Key production contacts</div>
                            <div style={{ fontSize: 11, color: '#64748B' }}>Linked crew profiles · live phone/email</div>
                          </div>
                          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                            <CompactIconButton label="Add existing crew contact" icon="+ Crew" onClick={() => setShowKeyContactPicker(prev => !prev)} />
                            <CompactIconButton label="Create crew profile" icon="＋New" onClick={() => openPersonDialog('crew', null)} />
                          </div>
                        </div>

                        {showKeyContactPicker ? (
                          <div style={{ display: 'flex', gap: 6 }}>
                            <select defaultValue="" onChange={(e) => addKeyContactCrew(e.target.value)} style={{ flex: 1, border: '1px solid #CBD5E1', borderRadius: 5, padding: '4px 6px', fontSize: 12, background: '#fff' }}>
                              <option value="">Select existing crew…</option>
                              {availableKeyContacts.map(entry => (
                                <option key={entry.id} value={entry.id}>{entry.name}{entry.role ? ` — ${entry.role}` : ''}</option>
                              ))}
                            </select>
                            <button type="button" onClick={() => setShowKeyContactPicker(false)} style={{ border: '1px solid #CBD5E1', borderRadius: 5, background: '#fff', fontSize: 11, padding: '0 8px', cursor: 'pointer' }}>Close</button>
                          </div>
                        ) : null}

                        {keyContactRows.linkedRows.length > 0 ? (
                          <div style={{ display: 'grid', gap: 6 }}>
                            {keyContactRows.linkedRows.map(entry => (
                              <div key={entry.id} style={{ border: '1px solid #E2E8F0', borderRadius: 6, background: '#fff', padding: '6px 8px', display: 'grid', gridTemplateColumns: isDesktopDown ? '1fr' : 'minmax(160px, 1fr) minmax(120px, 1fr) auto', gap: 8, alignItems: 'center' }}>
                                <div data-person-type="crew" data-person-id={entry.id} style={{ fontSize: 12, fontWeight: 700, color: '#0F172A' }}>{entry.name || 'Unnamed crew'}</div>
                                <div style={{ fontSize: 12, color: '#334155' }}>{[entry.department, entry.role].filter(Boolean).join(' · ') || '—'}</div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                  <div style={{ fontSize: 12, color: '#475569', textAlign: 'right' }}>{[entry.phone, entry.email].filter(Boolean).join(' · ') || '—'}</div>
                                  <CompactIconButton label={`Remove ${entry.name || 'crew'} from key contacts`} icon="✕" onClick={() => removeKeyContactCrew(entry.id)} />
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div style={{ fontSize: 12, color: '#64748B' }}>
                            {keyContactRows.hasLegacyText ? 'Legacy text exists but this section now uses linked crew entries. Add crew contacts above to keep profile sync.' : 'No linked key contacts yet.'}
                          </div>
                        )}
                      </div>
                    </div>
                    <div data-callsheet-target="emergencyContacts" style={{ borderRadius: 8, background: highlightTargetKey === 'emergencyContacts' ? '#DBEAFE' : 'transparent' }}><EditableField label="Emergency contacts" value={callsheet.emergencyContacts} onChange={(value) => onDayUpdate({ emergencyContacts: value })} placeholder="Police, fire, medic, on-site safety" multiline rows={1} /></div>
                    <div data-callsheet-target="parkingNotes" style={{ borderRadius: 8, background: highlightTargetKey === 'parkingNotes' ? '#DBEAFE' : 'transparent' }}><EditableField label="Parking / arrival notes" value={callsheet.parkingNotes} onChange={(value) => onDayUpdate({ parkingNotes: value })} placeholder="Gate access, lot notes, load-in route" multiline rows={1} /></div>
                    <div data-callsheet-target="directions" style={{ borderRadius: 8, background: highlightTargetKey === 'directions' ? '#DBEAFE' : 'transparent' }}><EditableField label="Directions / access notes" value={callsheet.directions} onChange={(value) => onDayUpdate({ directions: value })} placeholder="Nearest cross street, gate entry, elevator/floor details" multiline rows={1} /></div>
                  </div>
                  <div style={{ display: 'grid', gap: 7, alignContent: 'start' }}>
                    <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, background: '#fff', padding: 8, display: 'grid', gap: 5 }}>
                      <div data-callsheet-target="weather" style={{ borderRadius: 8, background: highlightTargetKey === 'weather' ? '#DBEAFE' : 'transparent' }}><EditableField label="Weather" value={callsheet.weather} onChange={(value) => onDayUpdate({ weather: value })} placeholder="Cloudy, 62°F" /></div>
                      <div data-callsheet-target="sunriseSunset" style={{ display: 'grid', gridTemplateColumns: isPhone ? '1fr' : '1fr 1fr', gap: 6, borderRadius: 8, background: highlightTargetKey === 'sunriseSunset' ? '#DBEAFE' : 'transparent' }}>
                        <EditableField label="Sunrise" value={callsheet.sunrise} onChange={(value) => onDayUpdate({ sunrise: value })} placeholder="6:42 AM" />
                        <EditableField label="Sunset" value={callsheet.sunset} onChange={(value) => onDayUpdate({ sunset: value })} placeholder="7:31 PM" />
                      </div>
                    </div>
                    <div data-callsheet-target="nearestHospital" style={{ borderRadius: 8, background: highlightTargetKey === 'nearestHospital' ? '#DBEAFE' : 'transparent' }}><EditableField label="Nearest hospital" value={callsheet.nearestHospital} onChange={(value) => onDayUpdate({ nearestHospital: value })} placeholder="Hospital name, address, phone" multiline rows={1} /></div>
                    <div data-callsheet-target="safetyNotes" style={{ borderRadius: 8, background: highlightTargetKey === 'safetyNotes' ? '#DBEAFE' : 'transparent' }}><EditableField label="Safety / hazards" value={callsheet.safetyNotes} onChange={(value) => onDayUpdate({ safetyNotes: value })} placeholder="Stunts, weather hazards, roadway control, PPE reminders" multiline rows={1} /></div>
                  </div>
                </div>
              </Card>
              </div>
            )}

            {visibleSections.includes('advancedSchedule') && (
              <div data-callsheet-target="advancedSchedule" style={{ borderRadius: 10, outline: highlightTargetKey === 'advancedSchedule' ? '2px solid #2563EB' : 'none', outlineOffset: 2 }}>
              <Card
                title="Today’s shooting schedule"
                actions={(
                  <SectionColumnConfigureControl
                    sectionKey="advancedSchedule"
                    sectionLabel="Today’s Shooting Schedule"
                    columnConfig={callsheetColumnConfig?.advancedSchedule}
                    onToggleColumn={handleToggleColumn}
                    isOpen={openColumnSectionKey === 'advancedSchedule'}
                    onToggleOpen={() => setOpenColumnSectionKey(prev => (prev === 'advancedSchedule' ? null : 'advancedSchedule'))}
                  />
                )}
              >
                <div className="callsheet-table-scroll">
                <table style={callsheetTableStyle}>
                  <thead>
                    <tr style={{ background: '#F8FAFC' }}>
                      {isColumnVisible('advancedSchedule', 'sceneNumber') ? <th style={{ textAlign: 'left', padding: '7px 6px', borderBottom: '1px solid #E2E8F0', color: '#475569', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Scene #</th> : null}
                      {isColumnVisible('advancedSchedule', 'sluglineScene') ? <th style={{ textAlign: 'left', padding: '7px 6px', borderBottom: '1px solid #E2E8F0', color: '#475569', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Slugline / Scene</th> : null}
                      {isColumnVisible('advancedSchedule', 'location') ? <th style={{ textAlign: 'left', padding: '7px 6px', borderBottom: '1px solid #E2E8F0', color: '#475569', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Location</th> : null}
                      {isColumnVisible('advancedSchedule', 'intExt') ? <th style={{ textAlign: 'left', padding: '7px 6px', borderBottom: '1px solid #E2E8F0', color: '#475569', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em' }}>I/E</th> : null}
                      {isColumnVisible('advancedSchedule', 'dayNight') ? <th style={{ textAlign: 'center', padding: '7px 6px', borderBottom: '1px solid #E2E8F0', color: '#475569', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', width: 60, minWidth: 60, maxWidth: 60 }}>D/N</th> : null}
                      {isColumnVisible('advancedSchedule', 'start') ? <th style={{ textAlign: 'left', padding: '7px 6px', borderBottom: '1px solid #E2E8F0', color: '#475569', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Start</th> : null}
                      {isColumnVisible('advancedSchedule', 'end') ? <th style={{ textAlign: 'left', padding: '7px 6px', borderBottom: '1px solid #E2E8F0', color: '#475569', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em' }}>End</th> : null}
                      {isColumnVisible('advancedSchedule', 'pages') ? <th style={{ textAlign: 'left', padding: '7px 6px', borderBottom: '1px solid #E2E8F0', color: '#475569', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Pages</th> : null}
                      {isColumnVisible('advancedSchedule', 'shots') ? <th style={{ textAlign: 'left', padding: '7px 6px', borderBottom: '1px solid #E2E8F0', color: '#475569', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Shots</th> : null}
                      {isColumnVisible('advancedSchedule', 'notes') ? <th style={{ textAlign: 'left', padding: '7px 6px', borderBottom: '1px solid #E2E8F0', color: '#475569', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Notes</th> : null}
                    </tr>
                  </thead>
                  <tbody>
                    {scheduleRows.scenes.length === 0 && (
                      <tr><td colSpan={visibleCounts.advancedSchedule} style={{ padding: 10, color: '#64748B', fontStyle: 'italic' }}>No scenes scheduled for this day.</td></tr>
                    )}
                    {scheduleRows.scenes.map((scene, idx) => (
                      <tr
                        key={scene.id}
                        data-entity-type={scene.linkedSceneId ? 'scene' : undefined}
                        data-entity-id={scene.linkedSceneId || undefined}
                        style={{ background: idx % 2 === 0 ? '#FFFFFF' : '#F8FAFC' }}
                      >
                        {isColumnVisible('advancedSchedule', 'sceneNumber') ? <td style={{ padding: '8px 6px', borderBottom: '1px solid #E2E8F0', fontWeight: 700 }}>{scene.sceneNumber || '—'}</td> : null}
                        {isColumnVisible('advancedSchedule', 'sluglineScene') ? <td style={{ padding: '8px 6px', borderBottom: '1px solid #E2E8F0' }}>{scene.slugline || '—'}</td> : null}
                        {isColumnVisible('advancedSchedule', 'location') ? <td style={{ padding: '8px 6px', borderBottom: '1px solid #E2E8F0' }}>{scene.location || '—'}</td> : null}
                        {isColumnVisible('advancedSchedule', 'intExt') ? <td style={{ padding: '8px 6px', borderBottom: '1px solid #E2E8F0' }}>{scene.intExt || '—'}</td> : null}
                        {isColumnVisible('advancedSchedule', 'dayNight') ? <td style={{ padding: '8px 6px', borderBottom: '1px solid #E2E8F0', textAlign: 'center', width: 60, minWidth: 60, maxWidth: 60, fontWeight: 600 }}>{formatDayNightDisplay(scene.dayNight)}</td> : null}
                        {isColumnVisible('advancedSchedule', 'start') ? <td style={{ padding: '8px 6px', borderBottom: '1px solid #E2E8F0' }}>{formatMinuteOfDay(scene.start)}</td> : null}
                        {isColumnVisible('advancedSchedule', 'end') ? <td style={{ padding: '8px 6px', borderBottom: '1px solid #E2E8F0' }}>{formatMinuteOfDay(scene.end)}</td> : null}
                        {isColumnVisible('advancedSchedule', 'pages') ? <td style={{ padding: '8px 6px', borderBottom: '1px solid #E2E8F0' }}>{Number(scene.pageCount || 0).toFixed(2)}</td> : null}
                        {isColumnVisible('advancedSchedule', 'shots') ? <td style={{ padding: '8px 6px', borderBottom: '1px solid #E2E8F0' }}>{scene.shotCount}</td> : null}
                        {isColumnVisible('advancedSchedule', 'notes') ? <td style={{ padding: '8px 6px', borderBottom: '1px solid #E2E8F0' }}>{scene.notes || '—'}</td> : null}
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
                {scheduleRows.events.length > 0 && (
                  <div style={{ marginTop: 10, borderTop: '1px dashed #CBD5E1', paddingTop: 10 }}>
                    <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#64748B', fontWeight: 700, marginBottom: 6 }}>Major day events</div>
                    <ul style={{ margin: 0, paddingLeft: 18, color: '#334155', fontSize: 12, lineHeight: 1.5 }}>
                      {scheduleRows.events.map(event => (
                        <li key={event.id}>{formatMinuteOfDay(event.projected?.start)} — {event.label}{event.location ? ` (${event.location})` : ''}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </Card>
              </div>
            )}

            {visibleSections.includes('castList') && (
              <div data-callsheet-target="castList" style={{ borderRadius: 10, outline: highlightTargetKey === 'castList' ? '2px solid #2563EB' : 'none', outlineOffset: 2 }}>
              <Card
                title="Cast list (day-derived)"
                subtitle="Profile-linked columns: Actor, Character, Contact. Day-only columns: Pickup, Makeup, Set."
                actions={
                  <div style={{ display: 'flex', gap: 6 }}>
                    <SectionColumnConfigureControl
                      sectionKey="castList"
                      sectionLabel="Cast List (Day-Derived)"
                      columnConfig={callsheetColumnConfig?.castList}
                      onToggleColumn={handleToggleColumn}
                      isOpen={openColumnSectionKey === 'castList'}
                      onToggleOpen={() => setOpenColumnSectionKey(prev => (prev === 'castList' ? null : 'castList'))}
                    />
                    <CompactIconButton label="Add cast from roster" icon="+ Cast" onClick={() => setShowCastPicker(prev => !prev)} />
                    <CompactIconButton label="Create cast profile" icon="＋New" onClick={() => openPersonDialog('cast', null)} />
                  </div>
                }
              >
                {showCastPicker ? (
                  <div style={{ marginBottom: 8, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <select defaultValue="" onChange={(e) => addCastToDay(e.target.value)} style={{ width: 320, maxWidth: '100%', border: '1px solid #CBD5E1', borderRadius: 5, padding: '5px 6px', fontSize: 12, background: '#fff' }}>
                      <option value="">Select existing cast…</option>
                      {castRoster.filter(entry => entry.name?.trim()).map(entry => (
                        <option key={entry.id} value={entry.id}>{entry.name}{entry.character ? ` — ${entry.character}` : ''}</option>
                      ))}
                    </select>
                    <button type="button" onClick={() => setShowCastPicker(false)} style={{ border: '1px solid #CBD5E1', borderRadius: 5, background: '#fff', fontSize: 11, padding: '0 8px', cursor: 'pointer' }}>Close</button>
                  </div>
                ) : null}
                <div className="callsheet-table-scroll">
                <table style={callsheetTableStyle}>
                  <thead>
                    <tr style={{ background: '#F8FAFC' }}>
                      {isColumnVisible('castList', 'actor') ? <th style={{ textAlign: 'left', padding: '7px 6px', borderBottom: '1px solid #E2E8F0', color: '#475569', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Actor ↗</th> : null}
                      {isColumnVisible('castList', 'character') ? <th style={{ textAlign: 'left', padding: '7px 6px', borderBottom: '1px solid #E2E8F0', color: '#475569', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Character ↗</th> : null}
                      {isColumnVisible('castList', 'sceneCount') ? <th style={{ textAlign: 'left', padding: '7px 6px', borderBottom: '1px solid #E2E8F0', color: '#475569', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em' }}>SC(DAY) scenes</th> : null}
                      {isColumnVisible('castList', 'pageCount') ? <th style={{ textAlign: 'left', padding: '7px 6px', borderBottom: '1px solid #E2E8F0', color: '#475569', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em' }}>PG(DAY) pages</th> : null}
                      {isColumnVisible('castList', 'pickupTime') ? <th style={{ textAlign: 'left', padding: '7px 6px', borderBottom: '1px solid #E2E8F0', color: '#475569', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Pickup • day</th> : null}
                      {isColumnVisible('castList', 'makeupCall') ? <th style={{ textAlign: 'left', padding: '7px 6px', borderBottom: '1px solid #E2E8F0', color: '#475569', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Makeup • day</th> : null}
                      {isColumnVisible('castList', 'setCall') ? <th style={{ textAlign: 'left', padding: '7px 6px', borderBottom: '1px solid #E2E8F0', color: '#475569', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Set • day</th> : null}
                      {isColumnVisible('castList', 'contact') ? <th style={{ textAlign: 'left', padding: '7px 6px', borderBottom: '1px solid #E2E8F0', color: '#475569', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Contact ↗</th> : null}
                      <th style={{ textAlign: 'left', padding: '7px 6px', borderBottom: '1px solid #E2E8F0', color: '#475569', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em' }}>⋯</th>
                    </tr>
                  </thead>
                  <tbody>
                    {castRows.length === 0 && <tr><td colSpan={visibleCounts.castList} style={{ padding: 10, color: '#64748B', fontStyle: 'italic' }}>No cast mapped to scheduled scenes.</td></tr>}
                    {castRows.map((row, idx) => (
                      <tr key={row.id} style={{ background: idx % 2 === 0 ? '#FFFFFF' : '#F8FAFC' }}>
                        {isColumnVisible('castList', 'actor') ? <td
                          style={{ padding: '8px 6px', borderBottom: '1px solid #E2E8F0', fontWeight: 700 }}
                          data-person-type={row.rosterId ? 'cast' : undefined}
                          data-person-id={row.rosterId || undefined}
                        >
                          {row.name}
                        </td> : null}
                        {isColumnVisible('castList', 'character') ? <td style={{ padding: '8px 6px', borderBottom: '1px solid #E2E8F0' }}>{row.character || '—'}</td> : null}
                        {isColumnVisible('castList', 'sceneCount') ? <td style={{ padding: '8px 6px', borderBottom: '1px solid #E2E8F0' }}>{row.sceneCount}</td> : null}
                        {isColumnVisible('castList', 'pageCount') ? <td style={{ padding: '8px 6px', borderBottom: '1px solid #E2E8F0' }}>{Number(row.pageCount || 0).toFixed(2)}</td> : null}
                        {isColumnVisible('castList', 'pickupTime') ? <td style={{ padding: '8px 6px', borderBottom: '1px solid #E2E8F0' }}><input value={row.pickupTime} onChange={(e) => onDayUpdate({ cast: updateRowValue(callsheet.cast, row.rosterId, row.id, { name: row.name, character: row.character, pickupTime: e.target.value }) })} style={{ width: 88, border: '1px solid #CBD5E1', borderRadius: 4, padding: '4px 6px' }} /></td> : null}
                        {isColumnVisible('castList', 'makeupCall') ? <td style={{ padding: '8px 6px', borderBottom: '1px solid #E2E8F0' }}><input value={row.makeupCall} onChange={(e) => onDayUpdate({ cast: updateRowValue(callsheet.cast, row.rosterId, row.id, { name: row.name, character: row.character, makeupCall: e.target.value }) })} style={{ width: 88, border: '1px solid #CBD5E1', borderRadius: 4, padding: '4px 6px' }} /></td> : null}
                        {isColumnVisible('castList', 'setCall') ? <td style={{ padding: '8px 6px', borderBottom: '1px solid #E2E8F0' }}><input value={row.setCall} onChange={(e) => onDayUpdate({ cast: updateRowValue(callsheet.cast, row.rosterId, row.id, { name: row.name, character: row.character, setCall: e.target.value }) })} style={{ width: 88, border: '1px solid #CBD5E1', borderRadius: 4, padding: '4px 6px' }} /></td> : null}
                        {isColumnVisible('castList', 'contact') ? <td style={{ padding: '8px 6px', borderBottom: '1px solid #E2E8F0' }}>{row.contact || '—'}</td> : null}
                        <td style={{ padding: '8px 6px', borderBottom: '1px solid #E2E8F0', width: 74 }}>
                          <div style={{ display: 'flex', gap: 4 }}>
                            {row.rosterId ? <CompactIconButton label={`Edit ${row.name || 'cast'} profile`} icon="✎" onClick={() => openPersonDialog('cast', row.rosterId)} /> : null}
                            {row.rosterId ? <CompactIconButton label={`Remove ${row.name || 'cast'} from this day`} icon="–" onClick={() => removeCastFromDay(row)} /> : null}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
              </Card>
              </div>
            )}

            {visibleSections.includes('crewList') && (
              <div data-callsheet-target="crewList" style={{ borderRadius: 10, outline: highlightTargetKey === 'crewList' ? '2px solid #2563EB' : 'none', outlineOffset: 2 }}>
              <Card
                title="Crew list"
                subtitle="Profile-linked columns: Name, Department/Role, Contact. Day-only columns: Call time, Notes."
                actions={
                  <div style={{ display: 'flex', gap: 6 }}>
                    <SectionColumnConfigureControl
                      sectionKey="crewList"
                      sectionLabel="Crew List"
                      columnConfig={callsheetColumnConfig?.crewList}
                      onToggleColumn={handleToggleColumn}
                      isOpen={openColumnSectionKey === 'crewList'}
                      onToggleOpen={() => setOpenColumnSectionKey(prev => (prev === 'crewList' ? null : 'crewList'))}
                    />
                    <CompactIconButton label="Add crew from roster" icon="+ Crew" onClick={() => setShowCrewPicker(prev => !prev)} />
                    <CompactIconButton label="Create crew profile" icon="＋New" onClick={() => openPersonDialog('crew', null)} />
                  </div>
                }
              >
                {showCrewPicker ? (
                  <div style={{ marginBottom: 8, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <select defaultValue="" onChange={(e) => addCrewToDay(e.target.value)} style={{ width: 320, maxWidth: '100%', border: '1px solid #CBD5E1', borderRadius: 5, padding: '5px 6px', fontSize: 12, background: '#fff' }}>
                      <option value="">Select existing crew…</option>
                      {crewRoster.filter(entry => entry.name?.trim()).map(entry => (
                        <option key={entry.id} value={entry.id}>{entry.name}{entry.role ? ` — ${entry.role}` : ''}</option>
                      ))}
                    </select>
                    <button type="button" onClick={() => setShowCrewPicker(false)} style={{ border: '1px solid #CBD5E1', borderRadius: 5, background: '#fff', fontSize: 11, padding: '0 8px', cursor: 'pointer' }}>Close</button>
                  </div>
                ) : null}
                <div className="callsheet-table-scroll">
                <table style={callsheetTableStyle}>
                  <thead>
                    <tr style={{ background: '#F8FAFC' }}>
                      {isColumnVisible('crewList', 'name') ? <th style={{ textAlign: 'left', padding: '7px 6px', borderBottom: '1px solid #E2E8F0', color: '#475569', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Name ↗</th> : null}
                      {isColumnVisible('crewList', 'role') ? <th style={{ textAlign: 'left', padding: '7px 6px', borderBottom: '1px solid #E2E8F0', color: '#475569', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Department / Role ↗</th> : null}
                      {isColumnVisible('crewList', 'callTime') ? <th style={{ textAlign: 'left', padding: '7px 6px', borderBottom: '1px solid #E2E8F0', color: '#475569', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Call time • day</th> : null}
                      {isColumnVisible('crewList', 'notes') ? <th style={{ textAlign: 'left', padding: '7px 6px', borderBottom: '1px solid #E2E8F0', color: '#475569', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Notes • day</th> : null}
                      {isColumnVisible('crewList', 'contact') ? <th style={{ textAlign: 'left', padding: '7px 6px', borderBottom: '1px solid #E2E8F0', color: '#475569', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Contact ↗</th> : null}
                      <th style={{ textAlign: 'left', padding: '7px 6px', borderBottom: '1px solid #E2E8F0', color: '#475569', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em' }}>⋯</th>
                    </tr>
                  </thead>
                  <tbody>
                    {crewRows.length === 0 && <tr><td colSpan={visibleCounts.crewList} style={{ padding: 10, color: '#64748B', fontStyle: 'italic' }}>No crew in Cast/Crew roster. Add crew there to populate this list.</td></tr>}
                    {crewRows.map((row, idx) => (
                      <tr key={row.id} style={{ background: idx % 2 === 0 ? '#FFFFFF' : '#F8FAFC' }}>
                        {isColumnVisible('crewList', 'name') ? <td
                          style={{ padding: '8px 6px', borderBottom: '1px solid #E2E8F0', fontWeight: 700 }}
                          data-person-type={row.rosterId ? 'crew' : undefined}
                          data-person-id={row.rosterId || undefined}
                        >
                          {row.name}
                        </td> : null}
                        {isColumnVisible('crewList', 'role') ? <td style={{ padding: '8px 6px', borderBottom: '1px solid #E2E8F0' }}>{row.role || row.department || '—'}</td> : null}
                        {isColumnVisible('crewList', 'callTime') ? <td style={{ padding: '8px 6px', borderBottom: '1px solid #E2E8F0' }}>
                          <input value={row.callTime} onChange={(e) => onDayUpdate({ crew: updateRowValue(callsheet.crew, row.rosterId, row.id, { name: row.name, role: row.role, callTime: e.target.value }) })} placeholder={formatTime12(row.defaultCall)} style={{ width: 100, border: '1px solid #CBD5E1', borderRadius: 4, padding: '4px 6px' }} />
                        </td> : null}
                        {isColumnVisible('crewList', 'notes') ? <td style={{ padding: '8px 6px', borderBottom: '1px solid #E2E8F0' }}>
                          <input value={row.notes} onChange={(e) => onDayUpdate({ crew: updateRowValue(callsheet.crew, row.rosterId, row.id, { name: row.name, role: row.role, notes: e.target.value }) })} style={{ width: '100%', border: '1px solid #CBD5E1', borderRadius: 4, padding: '4px 6px' }} />
                        </td> : null}
                        {isColumnVisible('crewList', 'contact') ? <td style={{ padding: '8px 6px', borderBottom: '1px solid #E2E8F0' }}>{row.contact || '—'}</td> : null}
                        <td style={{ padding: '8px 6px', borderBottom: '1px solid #E2E8F0', width: 74 }}>
                          <div style={{ display: 'flex', gap: 4 }}>
                            {row.rosterId ? <CompactIconButton label={`Edit ${row.name || 'crew'} profile`} icon="✎" onClick={() => openPersonDialog('crew', row.rosterId)} /> : null}
                            {row.rosterId ? <CompactIconButton label={`Remove ${row.name || 'crew'} from this day`} icon="–" onClick={() => removeCrewFromDay(row)} /> : null}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
              </Card>
              </div>
            )}

            {visibleSections.includes('locationDetails') && (
              <Card title="Location details">
                <div style={{ display: 'grid', gridTemplateColumns: isPhone ? '1fr' : '1fr 1fr', gap: 10 }}>
                  <EditableField label="Location address" value={callsheet.locationAddress} onChange={(value) => onDayUpdate({ locationAddress: value })} placeholder="Full address for unit parking or set" multiline />
                </div>
              </Card>
            )}

            {visibleSections.includes('additionalNotes') && (
              <Card title="Special instructions">
                <EditableField label="Additional notes" value={callsheet.additionalNotes} onChange={(value) => onDayUpdate({ additionalNotes: value })} placeholder="Anything the crew must know before call" multiline />
              </Card>
            )}

            {visibleSections.includes('nextDayAdvance') && (
              <Card title="Next-day advance notes">
                <EditableField label="Advance notes" value={callsheet.nextDayNotes} onChange={(value) => onDayUpdate({ nextDayNotes: value })} placeholder="Tomorrow's company move, call, weather watch, parking changes" multiline />
              </Card>
            )}
          </div>
          </div>
        </div>
      </div>

      {emailPreflightOpen ? (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', display: 'grid', placeItems: 'center', zIndex: 80 }}>
          <div style={{ width: 'min(560px, calc(100vw - 32px))', background: '#FAF8F4', borderRadius: 10, border: '1px solid #CBD5E1', boxShadow: '0 18px 48px rgba(0,0,0,0.28)', padding: 14, display: 'grid', gap: 10 }}>
            <div>
              <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#64748B', fontWeight: 700 }}>Email Callsheet Preflight</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: '#0F172A' }}>Review before opening draft</div>
            </div>
            <div style={{ fontSize: 12, color: '#334155', display: 'grid', gap: 4 }}>
              <div><strong>{recipientSummary.ready.length}</strong> recipients ready · {recipientSummary.missing.length} missing emails.</div>
              <div>File: {exportFileName}</div>
              <div>Subject: {(projectName || 'Untitled Project')} Callsheet - Day {activeDayIdx + 1} - {activeDay?.date || 'TBD'}</div>
            </div>
            <div style={{ maxHeight: 150, overflowY: 'auto', border: '1px solid #E2E8F0', borderRadius: 8, background: '#fff', padding: 8, fontSize: 12 }}>
              {recipientSummary.ready.length > 0 ? recipientSummary.ready.map(person => (
                <div key={`${person.type}-${person.id}`} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '4px 0', borderBottom: '1px dashed #E2E8F0' }}>
                  <span>{person.name}</span>
                  <span style={{ color: '#475569' }}>{person.email}</span>
                </div>
              )) : (
                <div style={{ color: '#991B1B', fontWeight: 600 }}>No cast or crew emails found. Add emails in Cast/Crew profiles first.</div>
              )}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button type="button" onClick={() => setEmailPreflightOpen(false)} style={{ border: '1px solid #CBD5E1', background: '#fff', borderRadius: 7, padding: '7px 10px', fontSize: 12, cursor: 'pointer' }}>Cancel</button>
              <button type="button" disabled={recipientSummary.ready.length === 0} onClick={continueEmailFlow} style={{ border: '1px solid #1D4ED8', background: recipientSummary.ready.length === 0 ? '#DBEAFE' : '#1D4ED8', color: recipientSummary.ready.length === 0 ? '#1E3A8A' : '#fff', borderRadius: 7, padding: '7px 10px', fontSize: 12, fontWeight: 700, cursor: recipientSummary.ready.length === 0 ? 'not-allowed' : 'pointer' }}>
                Continue to Email Draft
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
