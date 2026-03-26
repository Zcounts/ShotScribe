import { useMemo, useState } from 'react'
import type { MobileScheduleItem, MobileStoryboardReference } from '@shotscribe/shared'
import type { MobileTabKey, StoredDayEntry, StoredProjectEntry } from '../types'

interface ProjectHubScreenProps {
  projects: StoredProjectEntry[]
  project: StoredProjectEntry
  day: StoredDayEntry
  selectedTab: MobileTabKey
  shotStatusOverrides: Record<string, ShotStatus>
  onSelectTab: (tab: MobileTabKey) => void
  onSelectDay: (dayId: string) => void
  onSelectProject: (projectId: string) => void
  onImport: () => void
  onDeleteProject: (projectId: string) => void
  onCycleShotStatus: (shotId: string) => void
}

type ShotStatus = 'todo' | 'in_progress' | 'done' | 'skipped'

interface MobileShotDetail {
  shotId: string
  displayName: string
  cameraName: string
  focalLength: string
  shotSize: string
  shotType: string
  shotMove: string
  shotEquipment: string
  notes: string
  sceneTag?: string
  color?: string
  imageUrl?: string
}

const TAB_ITEMS: Array<{ key: MobileTabKey; label: string }> = [
  { key: 'overview', label: 'Overview' },
  { key: 'schedule', label: 'Schedule' },
  { key: 'shotlist', label: 'Shotlist' },
  { key: 'storyboard', label: 'Storyboard' },
  { key: 'callsheet', label: 'Callsheet' },
  { key: 'project', label: 'Project / More' },
]

function getDayDisplayLabel(dayId: string, fallbackIndex?: number): string {
  const trailingMatch = dayId.match(/(\d+)(?!.*\d)/)
  if (trailingMatch) {
    return `DAY ${Number(trailingMatch[1])}`
  }
  if (typeof fallbackIndex === 'number') {
    return `DAY ${fallbackIndex + 1}`
  }
  return 'DAY'
}

function formatShootDate(date: string): string {
  const parsedDate = new Date(date)
  if (Number.isNaN(parsedDate.getTime())) {
    return date
  }
  return parsedDate.toLocaleDateString([], {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function formatTime(iso?: string): string {
  if (!iso) {
    return '—'
  }
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function getEffectiveStatus(
  projectId: string,
  dayId: string,
  item: MobileScheduleItem,
  overrides: Record<string, ShotStatus>
): ShotStatus {
  if (item.shotId) {
    const key = `${projectId}::${dayId}::${item.shotId}`
    const override = overrides[key]
    if (override) {
      return override
    }
  }

  return item.status ?? 'todo'
}

function toHumanShotName(raw?: string, fallbackNumber = 1, cameraName = 'Camera 1'): string {
  if (raw && !raw.toLowerCase().startsWith('shot_')) {
    return raw
  }
  return `${fallbackNumber} - ${cameraName}`
}

function toSceneTag(sceneId?: string): string | undefined {
  if (!sceneId) return undefined
  const value = sceneId.trim()
  if (!value) return undefined

  if (/^scene[_-]/i.test(value)) {
    const pieces = value.match(/\d+[A-Za-z]?/g)
    if (!pieces || pieces.length === 0) {
      return undefined
    }
    return `Scene ${pieces.join('.')}`
  }

  return `Scene ${value}`
}

function getShotActionState(status: ShotStatus): { label: string; tone: 'neutral' | 'done' | 'skipped' } {
  if (status === 'done') {
    return { label: 'Done', tone: 'done' }
  }
  if (status === 'skipped') {
    return { label: 'Skipped', tone: 'skipped' }
  }
  return { label: 'Mark Done', tone: 'neutral' }
}

function buildShotDetails(day: StoredDayEntry): Map<string, MobileShotDetail> {
  const shotMap = new Map<string, MobileShotDetail>()
  const orderedShotItems = day.dayPackage.scheduleItems
    .filter((item) => item.type === 'shot' && item.shotId)
    .sort((a, b) => a.sortOrder - b.sortOrder)

  orderedShotItems.forEach((item, index) => {
    if (!item.shotId) return
    const cameraName = item.shotCameraName ?? 'Camera 1'
    const displayName = toHumanShotName(item.shotDisplayName, index + 1, cameraName)
    shotMap.set(item.shotId, {
      shotId: item.shotId,
      displayName,
      cameraName,
      focalLength: item.focalLength ?? '—',
      shotSize: item.shotSize ?? '—',
      shotType: item.shotType ?? '—',
      shotMove: item.shotMove ?? '—',
      shotEquipment: item.shotEquipment ?? '—',
      notes: item.shotNotes ?? '',
      sceneTag: toSceneTag(item.sceneId),
      color: item.shotColor,
      imageUrl: item.shotImageUrl,
    })
  })

  day.dayPackage.storyboardRefs.forEach((ref, index) => {
    const existing = shotMap.get(ref.shotId)
    const displayName = toHumanShotName(ref.shotDisplayName, index + 1, ref.shotCameraName ?? 'Camera 1')
    shotMap.set(ref.shotId, {
      shotId: ref.shotId,
      displayName,
      cameraName: ref.shotCameraName ?? existing?.cameraName ?? 'Camera 1',
      focalLength: ref.focalLength ?? existing?.focalLength ?? '—',
      shotSize: ref.shotSize ?? existing?.shotSize ?? '—',
      shotType: ref.shotType ?? existing?.shotType ?? '—',
      shotMove: ref.shotMove ?? existing?.shotMove ?? '—',
      shotEquipment: ref.shotEquipment ?? existing?.shotEquipment ?? '—',
      notes: ref.shotNotes ?? existing?.notes ?? '',
      sceneTag: existing?.sceneTag,
      color: ref.shotColor ?? existing?.color,
      imageUrl: ref.thumbnailUrl ?? existing?.imageUrl,
    })
  })

  return shotMap
}

function ShotDetailCard({ shot }: { shot: MobileShotDetail }) {
  return (
    <article className="mobile-shot-detail">
      <header className="mobile-shot-detail-header">
        <h3>{shot.displayName}</h3>
        <strong className="focal-pill">{shot.focalLength}</strong>
      </header>
      {shot.imageUrl ? <img src={shot.imageUrl} alt={`Storyboard frame for ${shot.displayName}`} loading="lazy" /> : null}

      <div className="shot-spec-grid">
        <p>
          <span>Size</span>
          <strong>{shot.shotSize}</strong>
        </p>
        <p>
          <span>Type</span>
          <strong>{shot.shotType}</strong>
        </p>
        <p>
          <span>Move</span>
          <strong>{shot.shotMove}</strong>
        </p>
        <p>
          <span>Equip</span>
          <strong>{shot.shotEquipment}</strong>
        </p>
      </div>

      {shot.notes ? (
        <p className="shot-notes">
          <span>Notes</span>
          <strong>{shot.notes}</strong>
        </p>
      ) : null}
    </article>
  )
}

function renderOverview(day: StoredDayEntry, doneShots: number, totalShots: number) {
  const totalBlocks = day.dayPackage.scheduleItems.length
  const completionPct = totalShots > 0 ? Math.round((doneShots / totalShots) * 100) : 0

  return (
    <div className="stacked-list">
      <article className="project-card overview-card">
        <div className="section-heading">
          <h3>Day at a glance</h3>
          <span className="status-chip status-chip-quiet">{completionPct}% complete</span>
        </div>
        <div className="stats-grid">
          <p className="stat-tile stat-tile-slate">
            <span>Schedule blocks</span>
            <strong>{totalBlocks}</strong>
          </p>
          <p className="stat-tile stat-tile-blue">
            <span>Shots done</span>
            <strong>
              {doneShots}/{totalShots}
            </strong>
          </p>
          <p className="stat-tile stat-tile-red stat-tile-wide">
            <span>Completion</span>
            <strong>{completionPct}%</strong>
          </p>
        </div>
      </article>

      {day.dayPackage.callsheet ? (
        <article className="project-card quicksheet-card">
          <div className="section-heading">
            <h3>Callsheet quick view</h3>
            <span className="status-chip status-chip-warm">{getDayDisplayLabel(day.dayPackage.callsheet.dayId)}</span>
          </div>
          <div className="quicksheet-grid">
            <p>
              <span>Call time</span>
              <strong>{formatTime(day.dayPackage.callsheet.callTime)}</strong>
            </p>
            <p>
              <span>Location</span>
              <strong>{day.dayPackage.callsheet.shootLocation ?? 'TBD'}</strong>
            </p>
            <p>
              <span>Weather</span>
              <strong>{day.dayPackage.callsheet.weatherSummary ?? 'TBD'}</strong>
            </p>
          </div>
        </article>
      ) : null}
    </div>
  )
}

function renderSchedule(
  project: StoredProjectEntry,
  day: StoredDayEntry,
  overrides: Record<string, ShotStatus>,
  shotLookup: Map<string, MobileShotDetail>,
  onOpenDetails: (shotId: string) => void
) {
  const sortedItems = [...day.dayPackage.scheduleItems].sort((a, b) => a.sortOrder - b.sortOrder)

  return (
    <div className="stacked-list">
      {sortedItems.map((item) => {
        const effectiveStatus = getEffectiveStatus(project.projectId, day.dayId, item, overrides)

        if (item.type === 'shot' && item.shotId) {
          const shot = shotLookup.get(item.shotId)
          return (
            <article
              key={item.scheduleItemId}
              className={`mobile-shot-card status-outline-${effectiveStatus}`}
              onDoubleClick={() => onOpenDetails(item.shotId as string)}
            >
              <div className="mobile-shot-row">
                <h4>{shot?.displayName ?? 'Shot'}</h4>
                <strong className="focal-pill">{shot?.focalLength ?? '—'}</strong>
              </div>
              <div className="mobile-shot-subrow">
                {shot?.sceneTag ? <span className="shot-scene-tag">{shot.sceneTag}</span> : <span className="shot-scene-spacer" aria-hidden="true" />}
                <span className={`status-chip status-${effectiveStatus}`}>{effectiveStatus.replace('_', ' ')}</span>
              </div>
              <div className="mobile-shot-actions">
                <button type="button" className="inline-button" onClick={() => onOpenDetails(item.shotId as string)}>
                  Details
                </button>
                <p className="hint-text">{formatTime(item.actualStartTime || item.plannedStartTime)} – {formatTime(item.actualEndTime || item.plannedEndTime)}</p>
              </div>
            </article>
          )
        }

        return (
          <article key={item.scheduleItemId} className={`timeline-card status-outline-${effectiveStatus}`}>
            <div>
              <p className="timeline-type">{item.type.toUpperCase()}</p>
              <h4>{item.title ?? item.scheduleItemId}</h4>
              <p className="hint-text">
                {formatTime(item.actualStartTime || item.plannedStartTime)} – {formatTime(item.actualEndTime || item.plannedEndTime)}
              </p>
            </div>
            <span className={`status-chip status-${effectiveStatus}`}>{effectiveStatus.replace('_', ' ')}</span>
          </article>
        )
      })}
    </div>
  )
}

function renderShotlist(
  project: StoredProjectEntry,
  day: StoredDayEntry,
  overrides: Record<string, ShotStatus>,
  onCycleShotStatus: (shotId: string) => void,
  shotLookup: Map<string, MobileShotDetail>,
  onOpenDetails: (shotId: string) => void
) {
  const shotItems = day.dayPackage.scheduleItems
    .filter((item) => item.type === 'shot' && item.shotId)
    .sort((a, b) => a.sortOrder - b.sortOrder)

  if (shotItems.length === 0) {
    return <p className="hint-text">No shots found in this day package.</p>
  }

  return (
    <div className="stacked-list">
      {shotItems.map((item) => {
        const shotId = item.shotId as string
        const effectiveStatus = getEffectiveStatus(project.projectId, day.dayId, item, overrides)
        const actionState = getShotActionState(effectiveStatus)
        const shot = shotLookup.get(shotId)

        return (
          <article
            key={item.scheduleItemId}
            className={`mobile-shot-card shot-toggle-${actionState.tone}`}
            onDoubleClick={() => onOpenDetails(shotId)}
          >
            <div className="mobile-shot-row">
              <h4>{shot?.displayName ?? 'Shot'}</h4>
              <strong className="focal-pill">{shot?.focalLength ?? '—'}</strong>
            </div>
            <div className="mobile-shot-subrow">
              {shot?.sceneTag ? <span className="shot-scene-tag">{shot.sceneTag}</span> : <span className="shot-scene-spacer" aria-hidden="true" />}
              <strong className={`shot-state shot-state-${actionState.tone}`}>{actionState.label.toUpperCase()}</strong>
            </div>
            <div className="mobile-shot-actions">
              <button type="button" className="shot-action-button shot-action-button-neutral" onClick={() => onOpenDetails(shotId)}>
                Details
              </button>
              <button
                type="button"
                className={`shot-action-button shot-action-button-${actionState.tone}`}
                onClick={() => onCycleShotStatus(shotId)}
              >
                {actionState.label}
              </button>
            </div>
          </article>
        )
      })}
    </div>
  )
}

function renderStoryboard(
  refs: MobileStoryboardReference[],
  shotLookup: Map<string, MobileShotDetail>,
  expandedShotId: string | null,
  onToggleExpanded: (shotId: string) => void
) {
  if (refs.length === 0) {
    return <p className="hint-text">No storyboard references in this package.</p>
  }

  return (
    <div className="stacked-list">
      {refs.map((ref) => {
        const shot = shotLookup.get(ref.shotId)
        const isExpanded = expandedShotId === ref.shotId
        return (
          <article key={`${ref.shotId}-${ref.updatedAt}`} className="mobile-shot-card storyboard-card">
            <button type="button" className="storyboard-collapse-button" onClick={() => onToggleExpanded(ref.shotId)}>
              <span className="mobile-shot-row">
                <strong>{shot?.displayName ?? 'Shot'}</strong>
                <strong className="focal-pill">{shot?.focalLength ?? '—'}</strong>
              </span>
              <span className="mobile-shot-subrow">
                {shot?.sceneTag ? <span className="shot-scene-tag">{shot.sceneTag}</span> : <span className="shot-scene-spacer" aria-hidden="true" />}
                <span className="chevron-indicator">{isExpanded ? '▾' : '▸'}</span>
              </span>
            </button>
            {isExpanded && shot ? <ShotDetailCard shot={shot} /> : null}
          </article>
        )
      })}
    </div>
  )
}

function renderCallsheet(day: StoredDayEntry) {
  const callsheet = day.dayPackage.callsheet
  if (!callsheet) {
    return <p className="hint-text">No callsheet data available for this day package.</p>
  }

  return (
    <div className="stacked-list">
      <article className="project-card callsheet-card">
        <div className="section-heading">
          <h3>General info</h3>
          <span className="status-chip status-chip-warm">{getDayDisplayLabel(callsheet.dayId)}</span>
        </div>
        <div className="quicksheet-grid">
          <p>
            <span>Call time</span>
            <strong>{formatTime(callsheet.callTime)}</strong>
          </p>
          <p>
            <span>Location</span>
            <strong>{callsheet.shootLocation || 'TBD'}</strong>
          </p>
          <p>
            <span>Weather</span>
            <strong>{callsheet.weatherSummary || 'TBD'}</strong>
          </p>
          <p>
            <span>Nearest hospital</span>
            <strong>{callsheet.nearestHospital || 'TBD'}</strong>
          </p>
        </div>
      </article>

      <article className="project-card callsheet-card">
        <h3>Location details</h3>
        <div className="quicksheet-grid">
          <p>
            <span>Address</span>
            <strong>{callsheet.locationAddress || '—'}</strong>
          </p>
          <p>
            <span>Parking</span>
            <strong>{callsheet.parkingNotes || '—'}</strong>
          </p>
          <p>
            <span>Directions</span>
            <strong>{callsheet.directions || '—'}</strong>
          </p>
          <p>
            <span>Maps link</span>
            <strong>{callsheet.mapsLink || '—'}</strong>
          </p>
        </div>
      </article>

      {(callsheet.cast?.length || callsheet.crew?.length) ? (
        <article className="project-card callsheet-card">
          <h3>Cast & crew</h3>
          <div className="callsheet-roster-grid">
            {(callsheet.cast ?? []).map((person) => (
              <p key={`cast-${person.name}`}>
                <span>{person.character ? `${person.name} — ${person.character}` : person.name}</span>
                <strong>{person.phone || person.email || person.role || 'Cast'}</strong>
              </p>
            ))}
            {(callsheet.crew ?? []).map((person) => (
              <p key={`crew-${person.name}`}>
                <span>{person.name}</span>
                <strong>{person.role || person.department || person.phone || 'Crew'}</strong>
              </p>
            ))}
          </div>
        </article>
      ) : null}

      {(callsheet.scheduleHighlights?.length ?? 0) > 0 ? (
        <article className="project-card callsheet-card">
          <h3>Schedule highlights</h3>
          <div className="callsheet-roster-grid">
            {callsheet.scheduleHighlights?.map((item) => (
              <p key={item.itemId}>
                <span>{item.type.toUpperCase()}</span>
                <strong>{item.label}</strong>
              </p>
            ))}
          </div>
        </article>
      ) : null}

      <article className="project-card callsheet-card">
        <h3>Safety + notes</h3>
        <p>
          <span>Safety</span>
          <strong>{callsheet.safetyNotes || '—'}</strong>
        </p>
        <p>
          <span>General</span>
          <strong>{callsheet.generalNotes || '—'}</strong>
        </p>
      </article>
    </div>
  )
}

function renderProjectMore(
  projects: StoredProjectEntry[],
  project: StoredProjectEntry,
  onSelectProject: (projectId: string) => void,
  onDeleteProject: (projectId: string) => void,
  onImport: () => void
) {
  return (
    <div className="stacked-list">
      <article className="project-card">
        <h3>Switch project</h3>
        <div className="project-switch-list">
          {projects.map((entry) => (
            <button
              type="button"
              key={entry.projectId}
              className={`touch-button ${entry.projectId === project.projectId ? 'is-selected' : ''}`}
              onClick={() => onSelectProject(entry.projectId)}
            >
              <span>{entry.projectName}</span>
              <small>{Object.keys(entry.days).length} day(s)</small>
            </button>
          ))}
        </div>
      </article>

      <article className="project-card">
        <h3>Library actions</h3>
        <button type="button" className="touch-button" onClick={onImport}>
          Import another file
        </button>
        <button type="button" className="touch-button touch-button-danger" onClick={() => onDeleteProject(project.projectId)}>
          Delete this project from device
        </button>
      </article>
    </div>
  )
}

export function ProjectHubScreen({
  projects,
  project,
  day,
  selectedTab,
  shotStatusOverrides,
  onSelectTab,
  onSelectDay,
  onSelectProject,
  onImport,
  onDeleteProject,
  onCycleShotStatus,
}: ProjectHubScreenProps) {
  const dayList = Object.values(project.days).sort((a, b) => a.shootDate.localeCompare(b.shootDate))
  const selectedDayIndex = dayList.findIndex((entry) => entry.dayId === day.dayId)
  const selectedDayLabel = getDayDisplayLabel(day.dayId, selectedDayIndex > -1 ? selectedDayIndex : undefined)
  const [expandedStoryboardShotId, setExpandedStoryboardShotId] = useState<string | null>(null)
  const [focusedShotId, setFocusedShotId] = useState<string | null>(null)

  const shotLookup = useMemo(() => buildShotDetails(day), [day])

  const shotItems = day.dayPackage.scheduleItems.filter((item) => item.type === 'shot' && item.shotId)
  const totalShots = shotItems.length
  const doneShots = shotItems.filter((item) => {
    const status = getEffectiveStatus(project.projectId, day.dayId, item, shotStatusOverrides)
    return status === 'done'
  }).length

  const focusedShot = focusedShotId ? shotLookup.get(focusedShotId) : undefined

  return (
    <section className="screen project-hub-screen">
      <header className="project-header hero-card">
        <div className="project-header-top">
          <div className="project-header-copy">
            <h1>{project.projectName}</h1>
          </div>
          <div className="day-picker-wrap">
            <label className="day-picker-label" htmlFor="day-select">
              Shooting day
            </label>
            <select
              id="day-select"
              className="day-select"
              value={day.dayId}
              onChange={(event) => onSelectDay(event.target.value)}
              aria-label="Select shooting day"
            >
              {dayList.map((entry, index) => (
                <option key={entry.dayId} value={entry.dayId}>
                  {getDayDisplayLabel(entry.dayId, index)} — {formatShootDate(entry.shootDate)}
                </option>
              ))}
            </select>
            <p className="day-picker-date">{selectedDayLabel} • {formatShootDate(day.shootDate)}</p>
          </div>
        </div>
      </header>

      <nav className="tab-strip" aria-label="Project sections">
        {TAB_ITEMS.map((tab) => (
          <button
            type="button"
            key={tab.key}
            className={`tab-button ${selectedTab === tab.key ? 'tab-button-active' : ''}`}
            onClick={() => onSelectTab(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {selectedTab === 'overview' ? renderOverview(day, doneShots, totalShots) : null}
      {selectedTab === 'schedule'
        ? renderSchedule(project, day, shotStatusOverrides, shotLookup, setFocusedShotId)
        : null}
      {selectedTab === 'shotlist'
        ? renderShotlist(project, day, shotStatusOverrides, onCycleShotStatus, shotLookup, setFocusedShotId)
        : null}
      {selectedTab === 'storyboard'
        ? renderStoryboard(day.dayPackage.storyboardRefs, shotLookup, expandedStoryboardShotId, (shotId) => {
          setExpandedStoryboardShotId((current) => (current === shotId ? null : shotId))
        })
        : null}
      {selectedTab === 'callsheet' ? renderCallsheet(day) : null}
      {selectedTab === 'project'
        ? renderProjectMore(projects, project, onSelectProject, onDeleteProject, onImport)
        : null}

      {focusedShot ? (
        <div className="mobile-shot-modal-backdrop" role="presentation" onClick={() => setFocusedShotId(null)}>
          <div className="mobile-shot-modal" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <div className="mobile-shot-modal-top">
              <h3>Shot details</h3>
              <button type="button" className="inline-button" onClick={() => setFocusedShotId(null)}>
                Close
              </button>
            </div>
            <div className="mobile-shot-modal-body">
              <ShotDetailCard shot={focusedShot} />
            </div>
          </div>
        </div>
      ) : null}
    </section>
  )
}
