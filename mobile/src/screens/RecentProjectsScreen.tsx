import type { StoredProjectEntry } from '../types'

interface RecentProjectsScreenProps {
  projects: StoredProjectEntry[]
  onOpenDay: (projectId: string, dayId: string) => void
  onBack: () => void
}

export function RecentProjectsScreen({ projects, onOpenDay, onBack }: RecentProjectsScreenProps) {
  return (
    <section className="screen">
      <header className="subheader">
        <button type="button" className="inline-button" onClick={onBack}>
          ← Back
        </button>
        <h2>Recent Projects</h2>
      </header>

      {projects.length === 0 ? (
        <p className="hint-text">No imported projects yet. Import a package from the Home screen first.</p>
      ) : (
        <div className="project-list">
          {projects.map((project) => {
            const days = Object.values(project.days).sort((a, b) => a.shootDate.localeCompare(b.shootDate))
            return (
              <article key={project.projectId} className="project-card">
                <h3>{project.projectName}</h3>
                <p className="hint-text">{days.length} day package(s)</p>
                <div className="day-list">
                  {days.map((day) => (
                    <button
                      type="button"
                      key={day.dayId}
                      className="touch-button"
                      onClick={() => onOpenDay(project.projectId, day.dayId)}
                    >
                      <span>Day {day.dayId}</span>
                      <small>{day.shootDate}</small>
                    </button>
                  ))}
                </div>
              </article>
            )
          })}
        </div>
      )}
    </section>
  )
}
