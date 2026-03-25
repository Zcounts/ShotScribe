interface EmptyLibraryScreenProps {
  onImport: () => void
}

export function EmptyLibraryScreen({ onImport }: EmptyLibraryScreenProps) {
  return (
    <section className="screen empty-screen">
      <header className="hero-card">
        <p className="eyebrow">ShotScribe Mobile</p>
        <h1>Bring your first project on set</h1>
        <p>Import a ShotScribe mobile package to start working in a field-ready project view.</p>
      </header>

      <button type="button" className="touch-button touch-button-primary" onClick={onImport}>
        Import from File
      </button>

      <p className="hint-text">
        Supports <code>mobile-day-package</code> and <code>mobile-snapshot</code> JSON exports.
      </p>
    </section>
  )
}
