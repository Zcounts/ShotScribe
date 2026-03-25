import { SHARED_SCHEMA_VERSION } from '@shotscribe/shared'

export function App() {
  return (
    <main className="app-shell">
      <h1>ShotScribe Mobile (Scaffold)</h1>
      <p>Separate PWA companion app for offline, field-first updates.</p>
      <p>Shared schema version: {SHARED_SCHEMA_VERSION}</p>
    </main>
  )
}
