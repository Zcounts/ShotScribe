import type { MobileScheduleItem } from '@shotscribe/shared'
import type { StoredDayEntry, StoredProjectEntry } from '../types'

interface DayViewScreenProps {
  project: StoredProjectEntry
  day: StoredDayEntry
  onBack: () => void
}

const STATUS_LABEL: Record<string, string> = {
  todo: 'To do',
  in_progress: 'In progress',
  done: 'Done',
}

function formatItemTime(item: MobileScheduleItem): string {
  if (item.actualStartTime) {
    return `Actual ${new Date(item.actualStartTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
  }
  if (item.plannedStartTime) {
    return `Planned ${new Date(item.plannedStartTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
  }
  return 'Time TBD'
}

export function DayViewScreen({ project, day, onBack }: DayViewScreenProps) {
  const sortedItems = [...day.dayPackage.scheduleItems].sort((a, b) => a.sortOrder - b.sortOrder)

  return (
    <section className="screen">
      <header className="subheader">
        <button type="button" className="inline-button" onClick={onBack}>
          ← Back
        </button>
        <h2>{project.projectName}</h2>
      </header>

      <article className="hero-card">
        <p className="day-label">Day {day.dayId}</p>
        <h3>{day.shootDate}</h3>
        <p className="hint-text">Package v{day.packageVersion}</p>
      </article>

      {day.dayPackage.callsheet ? (
        <article className="project-card">
          <h3>Callsheet</h3>
          <p className="hint-text">Location: {day.dayPackage.callsheet.shootLocation ?? 'TBD'}</p>
          <p className="hint-text">Weather: {day.dayPackage.callsheet.weatherSummary ?? 'TBD'}</p>
        </article>
      ) : null}

      <div className="timeline-list">
        {sortedItems.map((item) => (
          <article key={item.scheduleItemId} className="timeline-card">
            <div>
              <p className="timeline-type">{item.type.toUpperCase()}</p>
              <h4>{item.title ?? item.shotId ?? item.scheduleItemId}</h4>
              <p className="hint-text">{formatItemTime(item)}</p>
            </div>
            <span className={`status-chip status-${item.status ?? 'todo'}`}>
              {STATUS_LABEL[item.status ?? 'todo']}
            </span>
          </article>
        ))}
      </div>
    </section>
  )
}
