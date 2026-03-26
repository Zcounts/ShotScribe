import type { MobileScheduleItem } from '@shotscribe/shared'
import type { MobileTabKey, StoredDayEntry, StoredProjectEntry } from '../types'

interface ProjectHubScreenProps {
  projects: StoredProjectEntry[]
  project: StoredProjectEntry
  day: StoredDayEntry
  selectedTab: MobileTabKey
  shotStatusOverrides: Record<string, 'todo' | 'in_progress' | 'done'>
  onSelectTab: (tab: MobileTabKey) => void
  onSelectDay: (dayId: string) => void
  onSelectProject: (projectId: string) => void
  onImport: () => void
  onDeleteProject: (projectId: string) => void
  onToggleShotDone: (shotId: string) => void
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
  overrides: Record<string, 'todo' | 'in_progress' | 'done'>
): 'todo' | 'in_progress' | 'done' {
  if (item.shotId) {
    const key = `${projectId}::${dayId}::${item.shotId}`
    const override = overrides[key]
    if (override) {
      return override
    }
  }

  return item.status ?? 'todo'
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
  overrides: Record<string, 'todo' | 'in_progress' | 'done'>
) {
  const sortedItems = [...day.dayPackage.scheduleItems].sort((a, b) => a.sortOrder - b.sortOrder)

  return (
    <div className="stacked-list">
      {sortedItems.map((item) => {
        const effectiveStatus = getEffectiveStatus(project.projectId, day.dayId, item, overrides)
        return (
          <article key={item.scheduleItemId} className={`timeline-card status-outline-${effectiveStatus}`}>
            <div>
              <p className="timeline-type">{item.type.toUpperCase()}</p>
              <h4>{item.title ?? item.shotId ?? item.scheduleItemId}</h4>
              <p className="hint-text">
                {formatTime(item.actualStartTime || item.plannedStartTime)} –{' '}
                {formatTime(item.actualEndTime || item.plannedEndTime)}
              </p>
              {item.shotId ? <p className="hint-text">Shot {item.shotId}</p> : null}
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
  overrides: Record<string, 'todo' | 'in_progress' | 'done'>,
  onToggleShotDone: (shotId: string) => void
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
        const done = effectiveStatus === 'done'

        return (
          <button
            type="button"
            key={item.scheduleItemId}
            className={`shot-toggle ${done ? 'shot-toggle-done' : 'shot-toggle-open'}`}
            onClick={() => onToggleShotDone(shotId)}
          >
            <div className="shot-main">
              <div className="shot-meta-row">
                <p className="timeline-type">Shot {shotId}</p>
                <span className="shot-scene-tag">{item.sceneId ? `Scene ${item.sceneId}` : 'Scene —'}</span>
              </div>
              <h4>{item.title ?? 'Untitled shot'}</h4>
              <p className="hint-text">{done ? 'Completed • Tap to reopen' : 'Tap to mark complete'}</p>
            </div>
            <strong className={`shot-state ${done ? 'shot-state-done' : 'shot-state-open'}`}>{done ? 'DONE' : 'OPEN'}</strong>
          </button>
        )
      })}
    </div>
  )
}

function renderStoryboard(day: StoredDayEntry) {
  const refs = day.dayPackage.storyboardRefs

  if (refs.length === 0) {
    return <p className="hint-text">No storyboard references in this package.</p>
  }

  return (
    <div className="stacked-list">
      {refs.map((ref) => (
        <details key={`${ref.shotId}-${ref.updatedAt}`} className="storyboard-card">
          <summary>
            <span>Shot {ref.shotId}</span>
            <small>Updated {new Date(ref.updatedAt).toLocaleString()}</small>
          </summary>
          <div className="storyboard-body">
            {ref.thumbnailUrl ? (
              <img
                src={ref.thumbnailUrl}
                alt={`Storyboard for shot ${ref.shotId}`}
                width={ref.thumbnailWidth}
                height={ref.thumbnailHeight}
                loading="lazy"
              />
            ) : (
              <p className="hint-text">No thumbnail URL provided.</p>
            )}
            <p className="hint-text">Related shot: {ref.shotId}</p>
          </div>
        </details>
      ))}
    </div>
  )
}

function renderCallsheet(day: StoredDayEntry) {
  const callsheet = day.dayPackage.callsheet
  if (!callsheet) {
    return <p className="hint-text">No callsheet data available for this day package.</p>
  }

  return (
    <article className="project-card callsheet-card">
      <h3>Callsheet</h3>
      <p>
        <span>Day</span>
        <strong>{getDayDisplayLabel(callsheet.dayId)}</strong>
      </p>
      <p>
        <span>Call Time</span>
        <strong>{formatTime(callsheet.callTime)}</strong>
      </p>
      <p>
        <span>Location</span>
        <strong>{callsheet.shootLocation ?? 'TBD'}</strong>
      </p>
      <p>
        <span>Weather</span>
        <strong>{callsheet.weatherSummary ?? 'TBD'}</strong>
      </p>
      <p>
        <span>Safety Notes</span>
        <strong>{callsheet.safetyNotes ?? '—'}</strong>
      </p>
      <p>
        <span>General Notes</span>
        <strong>{callsheet.generalNotes ?? '—'}</strong>
      </p>
    </article>
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
  onToggleShotDone,
}: ProjectHubScreenProps) {
  const dayList = Object.values(project.days).sort((a, b) => a.shootDate.localeCompare(b.shootDate))
  const selectedDayIndex = dayList.findIndex((entry) => entry.dayId === day.dayId)
  const selectedDayLabel = getDayDisplayLabel(day.dayId, selectedDayIndex > -1 ? selectedDayIndex : undefined)

  const shotItems = day.dayPackage.scheduleItems.filter((item) => item.type === 'shot' && item.shotId)
  const totalShots = shotItems.length
  const doneShots = shotItems.filter((item) => {
    const status = getEffectiveStatus(project.projectId, day.dayId, item, shotStatusOverrides)
    return status === 'done'
  }).length

  return (
    <section className="screen project-hub-screen">
      <header className="project-header hero-card">
        <div className="project-header-top">
          <div className="project-header-copy">
            <p className="eyebrow">ShotScribe project</p>
            <h1>{project.projectName}</h1>
            <div className="header-meta-row">
              <span className="status-chip status-chip-warm">{selectedDayLabel}</span>
              <p className="hint-text">Updated {new Date(project.updatedAt).toLocaleDateString()}</p>
            </div>
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
            <p className="day-picker-date">{formatShootDate(day.shootDate)}</p>
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
      {selectedTab === 'schedule' ? renderSchedule(project, day, shotStatusOverrides) : null}
      {selectedTab === 'shotlist'
        ? renderShotlist(project, day, shotStatusOverrides, onToggleShotDone)
        : null}
      {selectedTab === 'storyboard' ? renderStoryboard(day) : null}
      {selectedTab === 'callsheet' ? renderCallsheet(day) : null}
      {selectedTab === 'project'
        ? renderProjectMore(projects, project, onSelectProject, onDeleteProject, onImport)
        : null}
    </section>
  )
}
