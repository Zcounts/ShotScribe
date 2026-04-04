import React, { useMemo, useState, useEffect, useRef } from 'react'
import useStore from '../store'
import { SubTabNav } from './SubTabNav'
import SidebarPane from './SidebarPane'
import visualIcon from '../../assets/script icons/visual.svg'
import listIcon from '../../assets/script icons/list.svg'
import useResponsiveViewport from '../hooks/useResponsiveViewport'

function isNightShot(shotData) {
  const dayNight = String(shotData?.dayNight || '').toUpperCase()
  return dayNight.includes('NIGHT')
}

function Circle({ status, colors }) {
  const styles = {
    full: { background: colors.fullDayColor, borderColor: colors.fullDayColor },
    brief: { background: colors.briefColor, borderColor: colors.fullDayColor },
    night: { background: colors.nightOnlyColor, borderColor: colors.nightOnlyColor },
    none: { background: 'transparent', borderColor: colors.notNeededColor },
  }
  return <div className="w-5 h-5 rounded-full border-2 mx-auto" style={styles[status]} />
}

function SectionShell({ title, subtitle, children }) {
  return (
    <section className="app-surface-card rounded-md overflow-hidden">
      <div className="px-4 py-2 border-b border-slate/10 bg-canvas-dark/40">
        <h3 className="text-xs font-semibold tracking-[0.1em] uppercase text-ink">{title}</h3>
        {subtitle ? <p className="text-xs text-slate mt-0.5">{subtitle}</p> : null}
      </div>
      {children}
    </section>
  )
}

export default function CastCrewTab() {
  const castRoster = useStore(s => s.castRoster)
  const crewRoster = useStore(s => s.crewRoster)
  const getScheduleWithShots = useStore(s => s.getScheduleWithShots)
  const getCastSceneMetrics = useStore(s => s.getCastSceneMetrics)
  const getDayCastRosterEntries = useStore(s => s.getDayCastRosterEntries)
  const callsheets = useStore(s => s.callsheets)
  const castCrewNotes = useStore(s => s.castCrewNotes)
  const setCastCrewNotes = useStore(s => s.setCastCrewNotes)
  const castCrewDisplayConfig = useStore(s => s.castCrewDisplayConfig)
  const castCrewViewState = useStore(s => s.tabViewState?.castcrew || {})
  const setTabViewState = useStore(s => s.setTabViewState)
  const openPersonDialog = useStore(s => s.openPersonDialog)
  const [activeSubTab, setActiveSubTab] = useState(castCrewViewState.activeSubTab || 'Visual')
  const { isDesktopDown, isPhone } = useResponsiveViewport()
  const scrollRef = useRef(null)

  const openProfile = (type, id) => openPersonDialog(type, id || null)

  const scheduleDays = getScheduleWithShots()

  const crewRows = useMemo(() => {
    return crewRoster
      .filter(member => member.name?.trim())
      .map(member => {
        const callsheetAppearances = Object.values(callsheets || {}).reduce((count, callsheet) => {
          const hasMember = (callsheet?.crew || []).some(row => row.name?.toLowerCase() === member.name?.toLowerCase())
          return count + (hasMember ? 1 : 0)
        }, 0)
        return {
          ...member,
          daysBooked: callsheetAppearances,
        }
      })
  }, [crewRoster, callsheets])

  const castMatrix = useMemo(() => {
    return castRoster.filter(entry => entry.name?.trim()).map(entry => {
      const perDay = scheduleDays.map(day => {
        const dayCast = getDayCastRosterEntries(day.id)
        const includesCast = dayCast.some(member => member.id === entry.id)

        if (!includesCast) return 'none'
        const actorShots = day.blocks
          .filter(block => block.shotData)
          .filter(block => (block.shotData.castRosterEntries || []).some(member => member.id === entry.id))
        const uniqueScenes = new Set(actorShots.map(block => block.shotData?.linkedSceneId || block.shotData.sceneLabel || block.shotData.location || ''))
        const nightOnly = actorShots.length > 0 && actorShots.every(block => isNightShot(block.shotData))
        if (nightOnly) return 'night'
        if (actorShots.length >= 2 || uniqueScenes.size > 1) return 'full'
        return 'brief'
      })
      return { actor: entry.name.trim(), castId: entry.id, perDay }
    })
  }, [castRoster, scheduleDays, getDayCastRosterEntries])

  const castListRows = useMemo(() => {
    return castRoster
      .filter(entry => entry.name?.trim())
      .map(entry => {
        const totalMetrics = getCastSceneMetrics(entry.id)
        return {
          ...entry,
          characterDisplay: (entry.characterIds && entry.characterIds.length > 0) ? entry.characterIds.join(', ') : (entry.character || '—'),
          shotCount: totalMetrics.sceneIds.length,
          scriptSceneCount: totalMetrics.sceneCount,
          scriptPageCount: totalMetrics.pageCount,
        }
      })
  }, [castRoster, getCastSceneMetrics])

  useEffect(() => {
    setTabViewState('castcrew', { activeSubTab })
  }, [activeSubTab, setTabViewState])

  useEffect(() => {
    const node = scrollRef.current
    if (!node) return
    const savedTop = castCrewViewState.scrollTop
    if (typeof savedTop === 'number') {
      requestAnimationFrame(() => {
        node.scrollTop = savedTop
      })
    }
  }, [castCrewViewState.scrollTop])

  return (
    <div
      ref={scrollRef}
      className="h-full canvas-texture overflow-auto"
      onScroll={(e) => setTabViewState('castcrew', { scrollTop: e.currentTarget.scrollTop })}
    >
      <div style={{ display: 'flex', alignItems: 'stretch', minHeight: 520, minWidth: 0, height: '100%' }}>
        <SidebarPane
          title="Cast/Crew"
          responsiveLabel="Open Cast/Crew panel"
          controls={(
            <div style={{ display: 'grid', gap: 8 }}>
              <SubTabNav
                tabs={[
                  { value: 'Visual', label: 'Visual', icon: visualIcon },
                  { value: 'List', label: 'List', icon: listIcon },
                ]}
                active={activeSubTab}
                onChange={setActiveSubTab}
                fullWidth
                minButtonWidth={0}
                buttonClassName="script-view-btn"
                buttonStyle={{ borderRadius: 999, padding: '5px 10px', fontSize: 12, minWidth: 56 }}
              />
              <button className="px-3 py-1.5 text-xs font-semibold rounded border border-[#8299FF]/70 text-[#EAF0FF] bg-[#5265E0]/32 hover:bg-[#5265E0]/42" onClick={() => openProfile('cast', null)}>
                + Add Cast
              </button>
              <button className="px-3 py-1.5 text-xs font-semibold rounded border border-slate/45 text-[#D8E1F0] bg-white/10 hover:bg-white/16" onClick={() => openProfile('crew', null)}>
                + Add Crew
              </button>
            </div>
          )}
        />
        <div style={{ flex: 1, minWidth: 0, padding: isPhone ? '10px 10px 16px 8px' : (isDesktopDown ? '12px 12px 18px 8px' : '16px 18px 20px 10px') }} className="space-y-4">
          {activeSubTab === 'Visual' ? (
            <>
              <SectionShell title="Cast" subtitle="Fast day-by-day availability matrix for on-set lookup.">
                <div className="overflow-x-auto">
                  <table className="min-w-full border-collapse">
                    <thead className="sticky top-0 z-20">
                      <tr>
                        <th className="sticky left-0 z-30 min-w-[160px] bg-canvas-dark text-left text-xs text-ink font-semibold px-3 py-2 border-r border-slate/10">Actor</th>
                        {scheduleDays.map((day, dayIndex) => (
                          <th key={day.id} className="text-white font-semibold text-xs text-center px-3 py-2 border-r border-slate/10 whitespace-nowrap" style={{ background: castCrewDisplayConfig.dayHeaderBgColor }}>
                            DAY {dayIndex + 1}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {castMatrix.map((row, rowIndex) => (
                        <tr key={row.castId} className={rowIndex % 2 === 0 ? 'bg-canvas' : 'bg-canvas-dark/40'}>
                          <td className="sticky left-0 z-10 min-w-[160px] px-3 py-2 text-ink font-medium border-b border-r border-slate/10 bg-inherit" data-person-type="cast" data-person-id={row.castId}>{row.actor}</td>
                          {row.perDay.map((status, i) => (
                            <td key={`${row.castId}-${scheduleDays[i]?.id || i}`} className="px-3 py-2 border-b border-r border-slate/10">
                              <Circle status={status} colors={castCrewDisplayConfig} />
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </SectionShell>

              <SectionShell title="Crew" subtitle="Assigned crew only.">
                <div className="p-3 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                  {crewRows.map(member => (
                    <div key={member.id} className="border border-slate/15 rounded p-2 bg-canvas/50">
                      <div className="text-sm font-semibold text-ink" data-person-type="crew" data-person-id={member.id}>{member.name}</div>
                      <div className="text-xs text-slate">{member.department} · {member.role || '—'}</div>
                      <div className="text-[11px] text-slate-light mt-1">Callsheet days: {member.daysBooked}</div>
                    </div>
                  ))}
                </div>
              </SectionShell>
            </>
          ) : (
            <>
              <SectionShell title="Cast" subtitle="Actual performer profiles linked to characters.">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm border-collapse min-w-[640px]">
                    <thead>
                      <tr className="text-xs uppercase tracking-[0.08em] text-slate border-b border-slate/15">
                        <th className="text-left p-2">Name</th>
                        <th className="text-left p-2">Character Played</th>
                        <th className="text-right p-2">Scenes</th>
                        <th className="text-right p-2">Pages</th>
                        <th className="text-right p-2">Shots</th>
                      </tr>
                    </thead>
                    <tbody>
                      {castListRows.map(row => (
                        <tr key={row.id} className="border-b border-slate/10 cursor-pointer">
                          <td className="p-2 font-medium text-ink" data-person-type="cast" data-person-id={row.id}>{row.name}</td>
                          <td className="p-2 text-slate">{row.characterDisplay}</td>
                          <td className="p-2 text-right text-slate">{row.scriptSceneCount}</td>
                          <td className="p-2 text-right text-slate">{row.scriptPageCount.toFixed(2)}</td>
                          <td className="p-2 text-right text-slate">{row.shotCount}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </SectionShell>

              <SectionShell title="Crew" subtitle="Only real assigned crew profiles.">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm border-collapse min-w-[560px]">
                    <thead>
                      <tr className="text-xs uppercase tracking-[0.08em] text-slate border-b border-slate/15">
                        <th className="text-left p-2">Name</th>
                        <th className="text-left p-2">Department</th>
                        <th className="text-left p-2">Role</th>
                        <th className="text-right p-2">Days</th>
                      </tr>
                    </thead>
                    <tbody>
                      {crewRows.map(row => (
                        <tr key={row.id} className="border-b border-slate/10 cursor-pointer">
                          <td className="p-2 font-medium text-ink" data-person-type="crew" data-person-id={row.id}>{row.name}</td>
                          <td className="p-2 text-slate">{row.department || '—'}</td>
                          <td className="p-2 text-slate">{row.role || '—'}</td>
                          <td className="p-2 text-right text-slate">{row.daysBooked}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </SectionShell>
            </>
          )}

          <div className="flex items-center gap-6 text-xs text-slate mt-1">
            <span className="inline-flex items-center gap-1"><span style={{ color: castCrewDisplayConfig.fullDayColor }}>●</span> Full day</span>
            <span className="inline-flex items-center gap-1"><span style={{ color: castCrewDisplayConfig.briefColor }}>◎</span> Brief (≤2 hrs)</span>
            <span className="inline-flex items-center gap-1"><span style={{ color: castCrewDisplayConfig.nightOnlyColor }}>⬤</span> Night block only</span>
            <span><span style={{ color: castCrewDisplayConfig.notNeededColor }}>○</span> Not needed</span>
          </div>

          <textarea
            value={castCrewNotes}
            onChange={(e) => setCastCrewNotes(e.target.value)}
            placeholder="Add production notes about cast and crew availability..."
            className="w-full min-h-[110px] bg-paper border border-slate/20 rounded-md p-3 text-sm text-slate outline-none"
          />
        </div>
      </div>
    </div>
  )
}
