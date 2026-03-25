interface HomeScreenProps {
  projectCount: number
  dayCount: number
  onImport: () => void
  onRecentProjects: () => void
}

export function HomeScreen({ projectCount, dayCount, onImport, onRecentProjects }: HomeScreenProps) {
  return (
    <section className="screen">
      <header className="hero-card">
        <h1>ShotScribe Mobile</h1>
        <p>Import your day packages, then quickly open a project while you are on set.</p>
      </header>

      <div className="stats-grid" aria-label="Library stats">
        <article className="stat-card">
          <span className="stat-label">Projects</span>
          <strong className="stat-value">{projectCount}</strong>
        </article>
        <article className="stat-card">
          <span className="stat-label">Day packages</span>
          <strong className="stat-value">{dayCount}</strong>
        </article>
      </div>

      <nav className="action-list" aria-label="Main actions">
        <button type="button" className="touch-button touch-button-primary" onClick={onImport}>
          Import from File
        </button>
        <button type="button" className="touch-button" onClick={onRecentProjects}>
          Recent Projects
        </button>
      </nav>
    </section>
  )
}
