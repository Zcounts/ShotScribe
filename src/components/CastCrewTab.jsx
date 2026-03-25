import React, { useMemo } from 'react'
import useStore from '../store'

function splitCastNames(castValue) {
  return String(castValue || '')
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
  const intExt = String(shotData?.intOrExt || '').toUpperCase()
  const dayNight = String(shotData?.dayNight || '').toUpperCase()
  return dayNight.includes('NIGHT') || (intExt.includes('EXT') && dayNight.includes('NIGHT'))
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

export default function CastCrewTab() {
  const scenes = useStore(s => s.scenes)
  const getScheduleWithShots = useStore(s => s.getScheduleWithShots)
  const castCrewNotes = useStore(s => s.castCrewNotes)
  const setCastCrewNotes = useStore(s => s.setCastCrewNotes)

  const actors = useMemo(() => {
    const names = new Set()
    scenes.forEach(scene => {
      scene.shots.forEach(shot => splitCastNames(shot.cast).forEach(name => names.add(name)))
    })
    return Array.from(names).sort((a, b) => a.localeCompare(b))
  }, [scenes])

  const scheduleDays = getScheduleWithShots()

  const matrix = useMemo(() => {
    return actors.map(actor => {
      const perDay = scheduleDays.map(day => {
        const actorShots = day.blocks
          .filter(block => block.shotData)
          .filter(block => splitCastNames(block.shotData.cast).includes(actor))

        if (actorShots.length === 0) return 'none'

        const uniqueScenes = new Set(actorShots.map(block => block.shotData.sceneLabel || block.shotData.location || ''))
        const nightOnly = actorShots.every(block => isNightShot(block.shotData))
        if (nightOnly) return 'night'
        if (actorShots.length >= 2 || uniqueScenes.size > 1) return 'full'
        return 'brief'
      })
      return { actor, perDay }
    })
  }, [actors, scheduleDays])

  return (
    <div className="h-full bg-canvas px-6 py-5 overflow-auto">
      <p className="text-xs uppercase tracking-[0.14em] text-slate-light mb-4">
        Quick Reference — Who&apos;s Needed Which Day
      </p>

      <div className="border border-slate/15 rounded-md overflow-auto max-h-[60vh]">
        <table className="min-w-full border-collapse">
          <thead className="sticky top-0 z-20">
            <tr>
              <th className="sticky left-0 z-30 min-w-[140px] bg-canvas-dark text-left text-xs text-ink font-semibold px-3 py-2 border-r border-slate/10">
                Actor
              </th>
              {scheduleDays.map(day => (
                <th key={day.id} className="bg-[#2D5A3D] text-white font-semibold text-xs text-center px-3 py-2 border-r border-slate/10 whitespace-nowrap">
                  {formatDayHeader(day)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {matrix.map((row, rowIndex) => (
              <tr key={row.actor} className={rowIndex % 2 === 0 ? 'bg-canvas' : 'bg-canvas-dark/40'}>
                <td className="sticky left-0 z-10 min-w-[140px] px-3 py-2 text-ink font-medium border-b border-r border-slate/10 border-slate/10 bg-inherit">
                  {row.actor}
                </td>
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

      <div className="flex items-center gap-6 text-xs text-slate mt-4">
        <span>● Full day</span>
        <span>◎ Brief (≤2 hrs)</span>
        <span>⬤ Night block only</span>
        <span>○ Not needed</span>
      </div>

      <textarea
        value={castCrewNotes}
        onChange={(e) => setCastCrewNotes(e.target.value)}
        placeholder="Add production notes about cast availability..."
        className="mt-4 w-full min-h-[110px] bg-paper border border-slate/20 rounded-md p-3 text-sm text-slate outline-none"
      />
    </div>
  )
}
