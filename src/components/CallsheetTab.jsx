import React, { useCallback, useMemo, useState } from 'react'
import useStore, { DEFAULT_CALLSHEET_SECTION_CONFIG } from '../store'
import { DayTabBar } from './DayTabBar'
import {
  buildCallsheetWarnings,
  buildDayScheduleRows,
  deriveDayCastRows,
  deriveDayCrewRows,
} from '../utils/callsheetSelectors'

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

function Card({ title, children, tone = 'default' }) {
  const bg = tone === 'alert' ? '#FFF5F5' : '#FFFFFF'
  const border = tone === 'alert' ? '1px solid #FECACA' : '1px solid #E2E8F0'
  return (
    <section style={{ background: bg, border, borderRadius: 10, overflow: 'hidden' }}>
      <header style={{ padding: '9px 12px', borderBottom: '1px solid #EEF2F7', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700, color: '#475569' }}>
        {title}
      </header>
      <div style={{ padding: 12 }}>{children}</div>
    </section>
  )
}

function EditableField({ label, value, onChange, placeholder, multiline = false }) {
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
        <textarea value={value || ''} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} rows={3} style={{ ...common, resize: 'vertical', lineHeight: 1.4 }} />
      ) : (
        <input value={value || ''} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} style={common} />
      )}
    </label>
  )
}

function InfoPill({ label, value, emphasize = false }) {
  return (
    <div style={{ padding: '10px 12px', border: '1px solid #E2E8F0', borderRadius: 8, background: emphasize ? '#EEF2FF' : '#F8FAFC' }}>
      <div style={{ fontSize: 10, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.07em', fontWeight: 700 }}>{label}</div>
      <div style={{ fontSize: emphasize ? 20 : 14, color: '#0F172A', fontWeight: emphasize ? 800 : 600, marginTop: emphasize ? 2 : 4 }}>{value || 'TBD'}</div>
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

export default function CallsheetTab() {
  const schedule = useStore(s => s.schedule)
  const projectName = useStore(s => s.projectName)
  const callsheetSectionConfig = useStore(s => s.callsheetSectionConfig)
  const getCallsheet = useStore(s => s.getCallsheet)
  const updateCallsheet = useStore(s => s.updateCallsheet)
  const getScheduleWithShots = useStore(s => s.getScheduleWithShots)
  const scriptScenes = useStore(s => s.scriptScenes)
  const castRoster = useStore(s => s.castRoster)
  const crewRoster = useStore(s => s.crewRoster)

  const [selectedDayId, setSelectedDayId] = useState(schedule[0]?.id || null)
  const [showConfig, setShowConfig] = useState(false)

  const activeDay = useMemo(() => {
    if (!schedule.length) return null
    return schedule.find(day => day.id === selectedDayId) || schedule[0]
  }, [schedule, selectedDayId])

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

  const visibleSections = (callsheetSectionConfig || DEFAULT_CALLSHEET_SECTION_CONFIG)
    .filter(section => section.visible)
    .map(section => section.key)

  const onDayUpdate = useCallback((updates) => {
    if (!activeDay) return
    updateCallsheet(activeDay.id, updates)
  }, [activeDay, updateCallsheet])

  if (!schedule.length) {
    return <div style={{ display: 'grid', placeItems: 'center', height: '100%', color: '#64748B', fontSize: 13 }}>Add a shoot day in Schedule to generate a callsheet.</div>
  }

  const dayTabs = schedule.map((day, idx) => ({ id: day.id, label: `Day ${idx + 1}${day.date ? ` — ${formatDate(day.date)}` : ''}` }))

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: '#E2E8F0' }}>
      <DayTabBar days={dayTabs} activeDay={activeDay.id} onSelect={setSelectedDayId} />
      <div style={{ borderBottom: '1px solid #CBD5E1', background: '#0F172A', padding: '6px 14px', display: 'flex', justifyContent: 'space-between' }}>
        <span style={{ color: '#94A3B8', fontSize: 11 }}>Callsheet syncs from Schedule, Script/Scenes, Shotlist, and Cast/Crew.</span>
        <button onClick={() => setShowConfig(value => !value)} style={{ border: '1px solid #334155', background: '#1E293B', color: '#E2E8F0', borderRadius: 5, fontSize: 11, padding: '4px 8px', cursor: 'pointer' }}>Sections</button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
        <div style={{ maxWidth: 1280, margin: '0 auto', display: 'grid', gap: 14 }}>
          {showConfig && (
            <Card title="Visible Sections">
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {(callsheetSectionConfig || DEFAULT_CALLSHEET_SECTION_CONFIG).map(section => (
                  <label key={section.key} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 8px', border: '1px solid #CBD5E1', borderRadius: 6, fontSize: 12 }}>
                    <input
                      type="checkbox"
                      checked={section.visible}
                      onChange={(e) => useStore.getState().setCallsheetSectionConfig((callsheetSectionConfig || DEFAULT_CALLSHEET_SECTION_CONFIG).map(item => item.key === section.key ? { ...item, visible: e.target.checked } : item))}
                    />
                    {section.label}
                  </label>
                ))}
              </div>
            </Card>
          )}

          <header style={{ background: '#0B1220', color: '#F8FAFC', borderRadius: 10, padding: 16, display: 'grid', gap: 14 }}>
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
              <InfoPill label="Date" value={formatDate(activeDay.date)} emphasize />
              <InfoPill label="General Call" value={formatTime12(activeDay.startTime)} emphasize />
              <InfoPill label="Primary Location" value={callsheet.shootLocation || activeDay.basecamp || ''} />
              <InfoPill label="Unit / Basecamp" value={activeDay.basecamp || ''} />
            </div>
          </header>

          {warnings.length > 0 && (
            <Card title="Missing critical info" tone="alert">
              <ul style={{ margin: 0, paddingLeft: 18, color: '#991B1B', fontSize: 12, lineHeight: 1.5 }}>
                {warnings.map(item => <li key={item}>{item}</li>)}
              </ul>
            </Card>
          )}

          {visibleSections.includes('generalInfo') && (
            <Card title="Day logistics and emergency">
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12 }}>
                <div style={{ display: 'grid', gap: 10 }}>
                  <EditableField label="Key production contacts" value={callsheet.keyContacts} onChange={(value) => onDayUpdate({ keyContacts: value })} placeholder="1st AD — phone, PM — phone, transport captain — phone" multiline />
                  <EditableField label="Emergency contacts" value={callsheet.emergencyContacts} onChange={(value) => onDayUpdate({ emergencyContacts: value })} placeholder="Police, fire, medic, on-site safety" multiline />
                  <EditableField label="Parking / arrival notes" value={callsheet.parkingNotes} onChange={(value) => onDayUpdate({ parkingNotes: value })} placeholder="Gate access, lot notes, load-in route" multiline />
                  <EditableField label="Directions / map link" value={callsheet.directions} onChange={(value) => onDayUpdate({ directions: value })} placeholder="Directions notes" multiline />
                  <EditableField label="Map URL" value={callsheet.mapsLink} onChange={(value) => onDayUpdate({ mapsLink: value })} placeholder="https://maps.google.com/..." />
                </div>
                <div style={{ display: 'grid', gap: 10, alignContent: 'start' }}>
                  <EditableField label="Weather" value={callsheet.weather} onChange={(value) => onDayUpdate({ weather: value })} placeholder="Cloudy, 62°F" />
                  <EditableField label="Sunrise" value={callsheet.sunrise} onChange={(value) => onDayUpdate({ sunrise: value })} placeholder="6:42 AM" />
                  <EditableField label="Sunset" value={callsheet.sunset} onChange={(value) => onDayUpdate({ sunset: value })} placeholder="7:31 PM" />
                  <EditableField label="Nearest hospital" value={callsheet.nearestHospital} onChange={(value) => onDayUpdate({ nearestHospital: value })} placeholder="Hospital name, address, phone" multiline />
                  <EditableField label="Safety / hazards" value={callsheet.safetyNotes} onChange={(value) => onDayUpdate({ safetyNotes: value })} placeholder="Stunts, weather hazard, roadway control, PPE reminders" multiline />
                </div>
              </div>
            </Card>
          )}

          {visibleSections.includes('advancedSchedule') && (
            <Card title="Today’s shooting schedule">
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ background: '#F8FAFC' }}>
                    {['Scene #', 'Slugline / Scene', 'Location', 'I/E', 'D/N', 'Start', 'End', 'Pages', 'Shots', 'Cast Involved', 'Notes'].map(label => (
                      <th key={label} style={{ textAlign: 'left', padding: '7px 6px', borderBottom: '1px solid #E2E8F0', color: '#475569', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {scheduleRows.scenes.length === 0 && (
                    <tr><td colSpan={11} style={{ padding: 10, color: '#64748B', fontStyle: 'italic' }}>No scenes scheduled for this day.</td></tr>
                  )}
                  {scheduleRows.scenes.map((scene, idx) => (
                    <tr key={scene.id} style={{ background: idx % 2 === 0 ? '#FFFFFF' : '#F8FAFC' }}>
                      <td style={{ padding: '8px 6px', borderBottom: '1px solid #E2E8F0', fontWeight: 700 }}>{scene.sceneNumber || '—'}</td>
                      <td style={{ padding: '8px 6px', borderBottom: '1px solid #E2E8F0' }}>{scene.slugline || '—'}</td>
                      <td style={{ padding: '8px 6px', borderBottom: '1px solid #E2E8F0' }}>{scene.location || '—'}</td>
                      <td style={{ padding: '8px 6px', borderBottom: '1px solid #E2E8F0' }}>{scene.intExt || '—'}</td>
                      <td style={{ padding: '8px 6px', borderBottom: '1px solid #E2E8F0' }}>{scene.dayNight || '—'}</td>
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
          )}

          {visibleSections.includes('castList') && (
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
                      <td style={{ padding: '8px 6px', borderBottom: '1px solid #E2E8F0', fontWeight: 700 }}>{row.name}</td>
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
          )}

          {visibleSections.includes('crewList') && (
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
                      <td style={{ padding: '8px 6px', borderBottom: '1px solid #E2E8F0', fontWeight: 700 }}>{row.name}</td>
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
          )}

          {visibleSections.includes('locationDetails') && (
            <Card title="Location details">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <EditableField label="Location address" value={callsheet.locationAddress} onChange={(value) => onDayUpdate({ locationAddress: value })} placeholder="Full address for unit parking or set" multiline />
                <EditableField label="Next-day advance notes" value={callsheet.nextDayNotes} onChange={(value) => onDayUpdate({ nextDayNotes: value })} placeholder="Tomorrow's company move, call, weather watch, parking changes" multiline />
              </div>
            </Card>
          )}

          {visibleSections.includes('additionalNotes') && (
            <Card title="Special instructions">
              <EditableField label="Additional notes" value={callsheet.additionalNotes} onChange={(value) => onDayUpdate({ additionalNotes: value })} placeholder="Anything the crew must know before call" multiline />
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
