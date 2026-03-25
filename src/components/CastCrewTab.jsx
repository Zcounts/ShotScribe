import React, { useMemo, useState } from 'react'
import useStore from '../store'
import { SubTabNav } from './SubTabNav'

function splitPeople(value) {
  return String(value || '')
    .split(/[,&/]/)
    .map(name => name.trim())
    .filter(Boolean)
}

function formatDayHeader(day) {
  const location = (day.blocks.find(b => b.shotData?.location)?.shotData?.location || 'SET')
    .toUpperCase()
    .split(/\s+/)
    .slice(0, 2)
    .join(' ')
  const date = day.date
    ? new Date(`${day.date}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }).toUpperCase()
    : 'TBD'
  return `${location} / ${date}`
}

function isNightShot(shotData) {
  const dayNight = String(shotData?.dayNight || '').toUpperCase()
  return dayNight.includes('NIGHT')
}

function Circle({ status }) {
  const styles = {
    full: 'bg-[#2D6A4F] border-[#2D6A4F]',
    brief: 'bg-[#74C69D]/40 border-[#2D6A4F]',
    night: 'bg-[#1B3A2D] border-[#1B3A2D]',
    none: 'bg-transparent border-slate/25',
  }
  return <div className={`w-5 h-5 rounded-full border-2 mx-auto ${styles[status]}`} />
}

function SectionShell({ title, subtitle, children }) {
  return (
    <section className="border border-slate/15 rounded-md overflow-hidden bg-paper">
      <div className="px-4 py-2 border-b border-slate/10 bg-canvas-dark/40">
        <h3 className="text-xs font-semibold tracking-[0.1em] uppercase text-ink">{title}</h3>
        {subtitle ? <p className="text-xs text-slate mt-0.5">{subtitle}</p> : null}
      </div>
      {children}
    </section>
  )
}

export default function CastCrewTab() {
  const scenes = useStore(s => s.scenes)
  const castRoster = useStore(s => s.castRoster)
  const crewRoster = useStore(s => s.crewRoster)
  const getScheduleWithShots = useStore(s => s.getScheduleWithShots)
  const callsheets = useStore(s => s.callsheets)
  const castCrewNotes = useStore(s => s.castCrewNotes)
  const setCastCrewNotes = useStore(s => s.setCastCrewNotes)
  const [activeSubTab, setActiveSubTab] = useState('Quick Reference')

  const scheduleDays = getScheduleWithShots()

  const castNames = useMemo(() => {
    const names = new Set(castRoster.map(entry => entry.name).filter(Boolean))
    scenes.forEach(scene => {
      scene.shots.forEach(shot => splitPeople(shot.cast).forEach(name => names.add(name)))
    })
    return Array.from(names).sort((a, b) => a.localeCompare(b))
  }, [scenes, castRoster])

  const crewNames = useMemo(() => {
    const names = new Set(crewRoster.map(entry => entry.name).filter(Boolean))
    ;['Director', '1st AD', 'DP', 'Gaffer', 'Sound Mixer'].forEach(name => names.add(name))
    return Array.from(names).sort((a, b) => a.localeCompare(b))
  }, [crewRoster])

  const castMatrix = useMemo(() => {
    return castNames.map(actor => {
      const perDay = scheduleDays.map(day => {
        const actorShots = day.blocks
          .filter(block => block.shotData)
          .filter(block => splitPeople(block.shotData.cast).includes(actor))

        if (actorShots.length === 0) return 'none'
        const uniqueScenes = new Set(actorShots.map(block => block.shotData.sceneLabel || block.shotData.location || ''))
        const nightOnly = actorShots.every(block => isNightShot(block.shotData))
        if (nightOnly) return 'night'
        if (actorShots.length >= 2 || uniqueScenes.size > 1) return 'full'
        return 'brief'
      })
      return { actor, perDay }
    })
  }, [castNames, scheduleDays])

  const castListRows = useMemo(() => {
    return castNames.map(name => {
      const rosterEntry = castRoster.find(entry => entry.name?.toLowerCase() === name.toLowerCase())
      const scenesUsed = new Set()
      let shotCount = 0
      scenes.forEach(scene => {
        scene.shots.forEach(shot => {
          if (splitPeople(shot.cast).some(person => person.toLowerCase() === name.toLowerCase())) {
            shotCount += 1
            scenesUsed.add(scene.sceneLabel || scene.location || 'Unlabeled')
          }
        })
      })
      return {
        name,
        character: rosterEntry?.character || '—',
        scenesCount: scenesUsed.size,
        shotCount,
      }
    })
  }, [castNames, castRoster, scenes])

  const crewListRows = useMemo(() => {
    return crewNames.map(name => {
      const rosterEntry = crewRoster.find(entry => entry.name?.toLowerCase() === name.toLowerCase())
      const callsheetAppearances = Object.values(callsheets || {}).reduce((count, callsheet) => {
        const hasMember = (callsheet?.crew || []).some(member => member.name?.toLowerCase() === name.toLowerCase())
        return count + (hasMember ? 1 : 0)
      }, 0)
      return {
        name,
        role: rosterEntry?.role || '—',
        department: rosterEntry?.department || 'Production',
        daysBooked: callsheetAppearances,
      }
    })
  }, [crewNames, crewRoster, callsheets])

  return (
    <div className="h-full bg-canvas px-6 py-5 overflow-auto space-y-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <SubTabNav
          tabs={['Quick Reference', 'List']}
          active={activeSubTab}
          onChange={setActiveSubTab}
        />
        <p className="text-xs uppercase tracking-[0.12em] text-slate-light">
          Cast & Crew Planning
        </p>
      </div>

      {activeSubTab === 'Quick Reference' ? (
        <>
          <SectionShell title="Cast" subtitle="Fast day-by-day availability matrix for on-set lookup.">
            <div className="overflow-auto max-h-[50vh]">
              <table className="min-w-full border-collapse">
                <thead className="sticky top-0 z-20">
                  <tr>
                    <th className="sticky left-0 z-30 min-w-[140px] bg-canvas-dark text-left text-xs text-ink font-semibold px-3 py-2 border-r border-slate/10">Actor</th>
                    {scheduleDays.map(day => (
                      <th key={day.id} className="bg-[#2D5A3D] text-white font-semibold text-xs text-center px-3 py-2 border-r border-slate/10 whitespace-nowrap">
                        {formatDayHeader(day)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {castMatrix.map((row, rowIndex) => (
                    <tr key={row.actor} className={rowIndex % 2 === 0 ? 'bg-canvas' : 'bg-canvas-dark/40'}>
                      <td className="sticky left-0 z-10 min-w-[140px] px-3 py-2 text-ink font-medium border-b border-r border-slate/10 bg-inherit">{row.actor}</td>
                      {row.perDay.map((status, i) => (
                        <td key={`${row.actor}-${scheduleDays[i]?.id || i}`} className="px-3 py-2 border-b border-r border-slate/10">
                          <Circle status={status} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </SectionShell>

          <SectionShell title="Crew" subtitle="Core departments snapshot for quick daily briefing.">
            <div className="p-3 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
              {crewListRows.map(member => (
                <div key={member.name} className="border border-slate/15 rounded p-2 bg-canvas/50">
                  <div className="text-sm font-semibold text-ink">{member.name}</div>
                  <div className="text-xs text-slate">{member.department} · {member.role}</div>
                  <div className="text-[11px] text-slate-light mt-1">Callsheet days: {member.daysBooked}</div>
                </div>
              ))}
            </div>
          </SectionShell>
        </>
      ) : (
        <>
          <SectionShell title="Cast" subtitle="Detailed cast roster with character and script coverage.">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="text-xs uppercase tracking-[0.08em] text-slate border-b border-slate/15">
                  <th className="text-left p-2">Name</th>
                  <th className="text-left p-2">Character</th>
                  <th className="text-right p-2">Scenes</th>
                  <th className="text-right p-2">Shots</th>
                </tr>
              </thead>
              <tbody>
                {castListRows.map(row => (
                  <tr key={row.name} className="border-b border-slate/10">
                    <td className="p-2 font-medium text-ink">{row.name}</td>
                    <td className="p-2 text-slate">{row.character}</td>
                    <td className="p-2 text-right text-slate">{row.scenesCount}</td>
                    <td className="p-2 text-right text-slate">{row.shotCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </SectionShell>

          <SectionShell title="Crew" subtitle="Detailed crew roster with department and callsheet usage.">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="text-xs uppercase tracking-[0.08em] text-slate border-b border-slate/15">
                  <th className="text-left p-2">Name</th>
                  <th className="text-left p-2">Department</th>
                  <th className="text-left p-2">Role</th>
                  <th className="text-right p-2">Days</th>
                </tr>
              </thead>
              <tbody>
                {crewListRows.map(row => (
                  <tr key={row.name} className="border-b border-slate/10">
                    <td className="p-2 font-medium text-ink">{row.name}</td>
                    <td className="p-2 text-slate">{row.department}</td>
                    <td className="p-2 text-slate">{row.role}</td>
                    <td className="p-2 text-right text-slate">{row.daysBooked}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </SectionShell>
        </>
      )}

      <div className="flex items-center gap-6 text-xs text-slate mt-1">
        <span>● Full day</span>
        <span>◎ Brief (≤2 hrs)</span>
        <span>⬤ Night block only</span>
        <span>○ Not needed</span>
      </div>

      <textarea
        value={castCrewNotes}
        onChange={(e) => setCastCrewNotes(e.target.value)}
        placeholder="Add production notes about cast and crew availability..."
        className="w-full min-h-[110px] bg-paper border border-slate/20 rounded-md p-3 text-sm text-slate outline-none"
      />
    </div>
  )
}
