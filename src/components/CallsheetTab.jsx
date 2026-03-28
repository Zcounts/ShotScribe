import React, { useCallback, useEffect, useMemo, useState } from 'react'
import useStore, { DEFAULT_CALLSHEET_SECTION_CONFIG } from '../store'
import SidebarPane from './SidebarPane'
import { DayTabBar } from './DayTabBar'
import {
  buildCallsheetWarnings,
  buildDayScheduleRows,
  deriveDayCastRows,
  deriveDayCrewRows,
} from '../utils/callsheetSelectors'
import { exportSingleDayCallsheetPDF } from './ExportModal'

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

function Card({ title, children, tone = 'default' }) {
  const bg = tone === 'alert' ? '#FFF5F5' : '#FAF8F4'
  const border = tone === 'alert' ? '1px solid #FECACA' : '1px solid #E2E8F0'
  return (
    <section style={{ background: bg, border, borderRadius: 10, overflow: 'hidden', boxShadow: 'var(--app-panel-shadow)' }}>
      <header style={{ padding: '9px 12px', borderBottom: '1px solid #EEF2F7', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700, color: '#475569' }}>
        {title}
      </header>
      <div style={{ padding: 12 }}>{children}</div>
    </section>
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
  callsheetSectionConfig,
  setCallsheetSectionConfig,
  collapseState,
  setCollapseState,
  onWarningJump,
  onExportPdf,
  onOpenEmailPreflight,
  recipientsReadyCount,
  missingEmailCount,
  readinessLabel,
  statusMessage,
}) {
  const visibleCount = (callsheetSectionConfig || DEFAULT_CALLSHEET_SECTION_CONFIG).filter(section => section.visible).length
  return (
    <SidebarPane
      width={286}
      title="Callsheet"
      controls={<div style={{ fontSize: 11, color: '#64748B' }}>Missing info and section visibility</div>}
    >
      <div style={{ padding: 10, display: 'grid', gap: 10 }}>
        <SidebarCard title="Actions" collapsed={collapseState.actions} onToggle={() => setCollapseState(prev => ({ ...prev, actions: !prev.actions }))}>
          <div style={{ display: 'grid', gap: 8 }}>
            <div style={{ fontSize: 11, color: '#475569', display: 'grid', gap: 2 }}>
              <span><strong>{recipientsReadyCount}</strong> recipients ready</span>
              <span>{missingEmailCount} missing emails</span>
              <span style={{ color: '#0F172A' }}>Status: <strong>{readinessLabel}</strong></span>
            </div>
            <button type="button" onClick={onExportPdf} style={{ border: '1px solid #CBD5E1', borderRadius: 7, padding: '8px 10px', background: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', textAlign: 'left' }}>
              Export Callsheet PDF
            </button>
            <button type="button" onClick={onOpenEmailPreflight} style={{ border: '1px solid #1D4ED8', borderRadius: 7, padding: '8px 10px', background: '#EFF6FF', color: '#1E3A8A', fontSize: 12, fontWeight: 700, cursor: 'pointer', textAlign: 'left' }}>
              Email Callsheet
            </button>
            {statusMessage ? <div style={{ fontSize: 11, color: '#334155', lineHeight: 1.4 }}>{statusMessage}</div> : null}
          </div>
        </SidebarCard>

        <SidebarCard title="Visible sections" meta={`(${visibleCount})`} collapsed={collapseState.visibleSections} onToggle={() => setCollapseState(prev => ({ ...prev, visibleSections: !prev.visibleSections }))}>
          <div style={{ display: 'grid', gap: 7 }}>
            {(callsheetSectionConfig || DEFAULT_CALLSHEET_SECTION_CONFIG).map(section => (
              <label key={section.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '8px 9px', border: '1px solid #CBD5E1', borderRadius: 7, fontSize: 12, background: '#fff' }}>
                <span>{section.label}</span>
                <input
                  type="checkbox"
                  checked={section.visible}
                  onChange={(e) => setCallsheetSectionConfig((callsheetSectionConfig || DEFAULT_CALLSHEET_SECTION_CONFIG).map(item => item.key === section.key ? { ...item, visible: e.target.checked } : item))}
                />
              </label>
            ))}
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

export default function CallsheetTab({ configureOpen = true }) {
  const schedule = useStore(s => s.schedule)
  const projectName = useStore(s => s.projectName)
  const callsheetSectionConfig = useStore(s => s.callsheetSectionConfig)
  const getCallsheet = useStore(s => s.getCallsheet)
  const updateCallsheet = useStore(s => s.updateCallsheet)
  const updateShootingDay = useStore(s => s.updateShootingDay)
  const setCallsheetSectionConfig = useStore(s => s.setCallsheetSectionConfig)
  const getScheduleWithShots = useStore(s => s.getScheduleWithShots)
  const scriptScenes = useStore(s => s.scriptScenes)
  const castRoster = useStore(s => s.castRoster)
  const crewRoster = useStore(s => s.crewRoster)
  const callsheetViewState = useStore(s => s.tabViewState?.callsheet || {})
  const setTabViewState = useStore(s => s.setTabViewState)

  const [selectedDayId, setSelectedDayId] = useState(callsheetViewState.selectedDayId || schedule[0]?.id || null)
  const [emailPreflightOpen, setEmailPreflightOpen] = useState(false)
  const [statusMessage, setStatusMessage] = useState('')
  const [highlightTargetKey, setHighlightTargetKey] = useState('')
  const collapseState = callsheetViewState.sidebarCollapseState || { actions: false, visibleSections: false, missingInfo: false }
  const setCollapseState = useCallback((nextValue) => {
    const next = typeof nextValue === 'function' ? nextValue(collapseState) : nextValue
    setTabViewState('callsheet', { sidebarCollapseState: next })
  }, [collapseState, setTabViewState])

  const activeDay = useMemo(() => {
    if (!schedule.length) return null
    return schedule.find(day => day.id === selectedDayId) || schedule[0]
  }, [schedule, selectedDayId])

  useEffect(() => {
    setTabViewState('callsheet', {
      selectedDayId: activeDay?.id || null,
      sidebarExpanded: configureOpen,
    })
  }, [activeDay?.id, configureOpen, setTabViewState])

  const activeDayIdx = useMemo(
    () => (activeDay ? Math.max(0, schedule.findIndex(day => day.id === activeDay.id)) : 0),
    [activeDay, schedule]
  )

  const callsheet = activeDay ? getCallsheet(activeDay.id) : null
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

  const onDayUpdate = useCallback((updates) => {
    if (!activeDay) return
    updateCallsheet(activeDay.id, updates)
  }, [activeDay, updateCallsheet])

  const onScheduleDayUpdate = useCallback((updates) => {
    if (!activeDay) return
    updateShootingDay(activeDay.id, updates)
  }, [activeDay, updateShootingDay])

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
      if (window.electronAPI?.openExternal) {
        await window.electronAPI.openExternal(mailtoUrl)
      } else {
        window.open(mailtoUrl, '_self')
      }
    } catch (err) {
      console.warn('Unable to open mail client:', err)
    }

    if (exportResult.filePath && window.electronAPI?.revealFile) {
      await window.electronAPI.revealFile(exportResult.filePath)
      if (window.electronAPI?.copyText) {
        await window.electronAPI.copyText(exportResult.filePath)
      }
    }
    setStatusMessage('Draft opened and PDF revealed in folder for attachment.')
    setEmailPreflightOpen(false)
  }, [activeDay, activeDay?.date, activeDayIdx, exportCurrentDayPDF, projectName, recipientSummary.ready])

  if (!schedule.length) {
    return <div style={{ display: 'grid', placeItems: 'center', height: '100%', color: '#64748B', fontSize: 13 }}>Add a shoot day in Schedule to generate a callsheet.</div>
  }

  const dayTabs = schedule.map((day, idx) => ({ id: day.id, label: `Day ${idx + 1}${day.date ? ` — ${formatDate(day.date)}` : ''}` }))

  return (
    <div className="canvas-texture" style={{ height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <DayTabBar days={dayTabs} activeDay={activeDay.id} onSelect={setSelectedDayId} />

      <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
        {configureOpen ? (
          <CallsheetSidebar
            warnings={warnings}
            callsheetSectionConfig={callsheetSectionConfig}
            setCallsheetSectionConfig={setCallsheetSectionConfig}
            collapseState={collapseState}
            setCollapseState={setCollapseState}
            onWarningJump={handleWarningJump}
            onExportPdf={exportCurrentDayPDF}
            onOpenEmailPreflight={() => setEmailPreflightOpen(true)}
            recipientsReadyCount={recipientSummary.ready.length}
            missingEmailCount={recipientSummary.missing.length}
            readinessLabel={readinessLabel}
            statusMessage={statusMessage}
          />
        ) : null}

        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
          <div style={{ maxWidth: 1280, margin: '0 auto', display: 'grid', gap: 14 }}>
            <header style={{ background: '#0B1220', color: '#F8FAFC', borderRadius: 10, padding: 16, display: 'grid', gap: 14, boxShadow: 'var(--app-panel-shadow)' }}>
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
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(180px, 1fr))', gap: 10 }}>
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
              <Card title="Day logistics and emergency">
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
                  <div style={{ display: 'grid', gap: 7, alignContent: 'start' }}>
                    <div data-callsheet-target="keyContacts" style={{ borderRadius: 8, background: highlightTargetKey === 'keyContacts' ? '#DBEAFE' : 'transparent' }}><EditableField label="Key production contacts" value={callsheet.keyContacts} onChange={(value) => onDayUpdate({ keyContacts: value })} placeholder="1st AD — phone, PM — phone, transport captain — phone" multiline rows={1} /></div>
                    <div data-callsheet-target="emergencyContacts" style={{ borderRadius: 8, background: highlightTargetKey === 'emergencyContacts' ? '#DBEAFE' : 'transparent' }}><EditableField label="Emergency contacts" value={callsheet.emergencyContacts} onChange={(value) => onDayUpdate({ emergencyContacts: value })} placeholder="Police, fire, medic, on-site safety" multiline rows={1} /></div>
                    <div data-callsheet-target="parkingNotes" style={{ borderRadius: 8, background: highlightTargetKey === 'parkingNotes' ? '#DBEAFE' : 'transparent' }}><EditableField label="Parking / arrival notes" value={callsheet.parkingNotes} onChange={(value) => onDayUpdate({ parkingNotes: value })} placeholder="Gate access, lot notes, load-in route" multiline rows={1} /></div>
                    <div data-callsheet-target="directions" style={{ borderRadius: 8, background: highlightTargetKey === 'directions' ? '#DBEAFE' : 'transparent' }}><EditableField label="Directions / access notes" value={callsheet.directions} onChange={(value) => onDayUpdate({ directions: value })} placeholder="Nearest cross street, gate entry, elevator/floor details" multiline rows={1} /></div>
                  </div>
                  <div style={{ display: 'grid', gap: 7, alignContent: 'start' }}>
                    <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, background: '#fff', padding: 8, display: 'grid', gap: 5 }}>
                      <div data-callsheet-target="weather" style={{ borderRadius: 8, background: highlightTargetKey === 'weather' ? '#DBEAFE' : 'transparent' }}><EditableField label="Weather" value={callsheet.weather} onChange={(value) => onDayUpdate({ weather: value })} placeholder="Cloudy, 62°F" /></div>
                      <div data-callsheet-target="sunriseSunset" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, borderRadius: 8, background: highlightTargetKey === 'sunriseSunset' ? '#DBEAFE' : 'transparent' }}>
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
              <Card title="Today’s shooting schedule">
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: '#F8FAFC' }}>
                      {['Scene #', 'Slugline / Scene', 'Location', 'I/E', 'D/N', 'Start', 'End', 'Pages', 'Shots', 'Cast Involved', 'Notes'].map(label => (
                        <th
                          key={label}
                          style={{
                            textAlign: label === 'D/N' ? 'center' : 'left',
                            padding: '7px 6px',
                            borderBottom: '1px solid #E2E8F0',
                            color: '#475569',
                            fontSize: 10,
                            textTransform: 'uppercase',
                            letterSpacing: '0.08em',
                            width: label === 'D/N' ? 60 : undefined,
                            minWidth: label === 'D/N' ? 60 : undefined,
                            maxWidth: label === 'D/N' ? 60 : undefined,
                          }}
                        >
                          {label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {scheduleRows.scenes.length === 0 && (
                      <tr><td colSpan={11} style={{ padding: 10, color: '#64748B', fontStyle: 'italic' }}>No scenes scheduled for this day.</td></tr>
                    )}
                    {scheduleRows.scenes.map((scene, idx) => (
                      <tr
                        key={scene.id}
                        data-entity-type={scene.linkedSceneId ? 'scene' : undefined}
                        data-entity-id={scene.linkedSceneId || undefined}
                        style={{ background: idx % 2 === 0 ? '#FFFFFF' : '#F8FAFC' }}
                      >
                        <td style={{ padding: '8px 6px', borderBottom: '1px solid #E2E8F0', fontWeight: 700 }}>{scene.sceneNumber || '—'}</td>
                        <td style={{ padding: '8px 6px', borderBottom: '1px solid #E2E8F0' }}>{scene.slugline || '—'}</td>
                        <td style={{ padding: '8px 6px', borderBottom: '1px solid #E2E8F0' }}>{scene.location || '—'}</td>
                        <td style={{ padding: '8px 6px', borderBottom: '1px solid #E2E8F0' }}>{scene.intExt || '—'}</td>
                        <td style={{ padding: '8px 6px', borderBottom: '1px solid #E2E8F0', textAlign: 'center', width: 60, minWidth: 60, maxWidth: 60, fontWeight: 600 }}>{formatDayNightDisplay(scene.dayNight)}</td>
                        <td style={{ padding: '8px 6px', borderBottom: '1px solid #E2E8F0' }}>{formatMinuteOfDay(scene.start)}</td>
                        <td style={{ padding: '8px 6px', borderBottom: '1px solid #E2E8F0' }}>{formatMinuteOfDay(scene.end)}</td>
                        <td style={{ padding: '8px 6px', borderBottom: '1px solid #E2E8F0' }}>{Number(scene.pageCount || 0).toFixed(2)}</td>
                        <td style={{ padding: '8px 6px', borderBottom: '1px solid #E2E8F0' }}>{scene.shotCount}</td>
                        <td style={{ padding: '8px 6px', borderBottom: '1px solid #E2E8F0' }}>{scene.castInvolved || '—'}</td>
                        <td style={{ padding: '8px 6px', borderBottom: '1px solid #E2E8F0' }}>{scene.notes || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
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
              <Card title="Cast list (day-derived)">
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: '#F8FAFC' }}>
                      {['Actor', 'Character', 'SC(DAY) scenes', 'PG(DAY) pages', 'Pickup', 'Makeup', 'Set', 'Contact'].map(label => (
                        <th key={label} style={{ textAlign: 'left', padding: '7px 6px', borderBottom: '1px solid #E2E8F0', color: '#475569', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {castRows.length === 0 && <tr><td colSpan={8} style={{ padding: 10, color: '#64748B', fontStyle: 'italic' }}>No cast mapped to scheduled scenes.</td></tr>}
                    {castRows.map((row, idx) => (
                      <tr key={row.id} style={{ background: idx % 2 === 0 ? '#FFFFFF' : '#F8FAFC' }}>
                        <td
                          style={{ padding: '8px 6px', borderBottom: '1px solid #E2E8F0', fontWeight: 700 }}
                          data-person-type={row.rosterId ? 'cast' : undefined}
                          data-person-id={row.rosterId || undefined}
                        >
                          {row.name}
                        </td>
                        <td style={{ padding: '8px 6px', borderBottom: '1px solid #E2E8F0' }}>{row.character || '—'}</td>
                        <td style={{ padding: '8px 6px', borderBottom: '1px solid #E2E8F0' }}>{row.sceneCount}</td>
                        <td style={{ padding: '8px 6px', borderBottom: '1px solid #E2E8F0' }}>{Number(row.pageCount || 0).toFixed(2)}</td>
                        <td style={{ padding: '8px 6px', borderBottom: '1px solid #E2E8F0' }}><input value={row.pickupTime} onChange={(e) => onDayUpdate({ cast: updateRowValue(callsheet.cast, row.rosterId, row.id, { name: row.name, character: row.character, pickupTime: e.target.value }) })} style={{ width: 88, border: '1px solid #CBD5E1', borderRadius: 4, padding: '4px 6px' }} /></td>
                        <td style={{ padding: '8px 6px', borderBottom: '1px solid #E2E8F0' }}><input value={row.makeupCall} onChange={(e) => onDayUpdate({ cast: updateRowValue(callsheet.cast, row.rosterId, row.id, { name: row.name, character: row.character, makeupCall: e.target.value }) })} style={{ width: 88, border: '1px solid #CBD5E1', borderRadius: 4, padding: '4px 6px' }} /></td>
                        <td style={{ padding: '8px 6px', borderBottom: '1px solid #E2E8F0' }}><input value={row.setCall} onChange={(e) => onDayUpdate({ cast: updateRowValue(callsheet.cast, row.rosterId, row.id, { name: row.name, character: row.character, setCall: e.target.value }) })} style={{ width: 88, border: '1px solid #CBD5E1', borderRadius: 4, padding: '4px 6px' }} /></td>
                        <td style={{ padding: '8px 6px', borderBottom: '1px solid #E2E8F0' }}>{row.contact || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
              </div>
            )}

            {visibleSections.includes('crewList') && (
              <div data-callsheet-target="crewList" style={{ borderRadius: 10, outline: highlightTargetKey === 'crewList' ? '2px solid #2563EB' : 'none', outlineOffset: 2 }}>
              <Card title="Crew list">
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: '#F8FAFC' }}>
                      {['Name', 'Department / Role', 'Call time', 'Notes', 'Contact'].map(label => (
                        <th key={label} style={{ textAlign: 'left', padding: '7px 6px', borderBottom: '1px solid #E2E8F0', color: '#475569', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {crewRows.length === 0 && <tr><td colSpan={5} style={{ padding: 10, color: '#64748B', fontStyle: 'italic' }}>No crew in Cast/Crew roster. Add crew there to populate this list.</td></tr>}
                    {crewRows.map((row, idx) => (
                      <tr key={row.id} style={{ background: idx % 2 === 0 ? '#FFFFFF' : '#F8FAFC' }}>
                        <td
                          style={{ padding: '8px 6px', borderBottom: '1px solid #E2E8F0', fontWeight: 700 }}
                          data-person-type={row.rosterId ? 'crew' : undefined}
                          data-person-id={row.rosterId || undefined}
                        >
                          {row.name}
                        </td>
                        <td style={{ padding: '8px 6px', borderBottom: '1px solid #E2E8F0' }}>{row.role || row.department || '—'}</td>
                        <td style={{ padding: '8px 6px', borderBottom: '1px solid #E2E8F0' }}>
                          <input value={row.callTime} onChange={(e) => onDayUpdate({ crew: updateRowValue(callsheet.crew, row.rosterId, row.id, { name: row.name, role: row.role, callTime: e.target.value }) })} placeholder={formatTime12(row.defaultCall)} style={{ width: 100, border: '1px solid #CBD5E1', borderRadius: 4, padding: '4px 6px' }} />
                        </td>
                        <td style={{ padding: '8px 6px', borderBottom: '1px solid #E2E8F0' }}>
                          <input value={row.notes} onChange={(e) => onDayUpdate({ crew: updateRowValue(callsheet.crew, row.rosterId, row.id, { name: row.name, role: row.role, notes: e.target.value }) })} style={{ width: '100%', border: '1px solid #CBD5E1', borderRadius: 4, padding: '4px 6px' }} />
                        </td>
                        <td style={{ padding: '8px 6px', borderBottom: '1px solid #E2E8F0' }}>{row.contact || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
              </div>
            )}

            {visibleSections.includes('locationDetails') && (
              <Card title="Location details">
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
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
