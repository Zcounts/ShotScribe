import { useMemo, useState } from 'react'
import type { StoredLibrary } from './types'
import { importDayPackagesFromFile } from './importers/mobilePackageImport'
import { importDayPackages, loadLibrary, saveLibrary } from './storage/mobileLibrary'
import { DayViewScreen } from './screens/DayViewScreen'
import { HomeScreen } from './screens/HomeScreen'
import { ImportScreen } from './screens/ImportScreen'
import { RecentProjectsScreen } from './screens/RecentProjectsScreen'

type AppRoute =
  | { name: 'home' }
  | { name: 'import' }
  | { name: 'recent' }
  | { name: 'day'; projectId: string; dayId: string }

export function App() {
  const [library, setLibrary] = useState<StoredLibrary>(() => loadLibrary())
  const [route, setRoute] = useState<AppRoute>({ name: 'home' })
  const [busy, setBusy] = useState(false)
  const [importSuccess, setImportSuccess] = useState<string | null>(null)
  const [importError, setImportError] = useState<string | null>(null)

  const projects = useMemo(() => {
    return Object.values(library.projects).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  }, [library])

  const totalDayCount = useMemo(() => {
    return projects.reduce((sum, project) => sum + Object.keys(project.days).length, 0)
  }, [projects])

  async function handleImportFile(file: File) {
    setBusy(true)
    setImportSuccess(null)
    setImportError(null)

    try {
      const dayPackages = await importDayPackagesFromFile(file)
      const importedAt = new Date().toISOString()
      const result = importDayPackages(library, dayPackages, importedAt)
      setLibrary(result.library)
      saveLibrary(result.library)
      setImportSuccess(
        `Imported ${result.summary.importedDayIds.length} day package(s) for ${result.summary.projectName}.`
      )
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not import this file.'
      setImportError(message)
    } finally {
      setBusy(false)
    }
  }

  if (route.name === 'import') {
    return (
      <ImportScreen
        busy={busy}
        successMessage={importSuccess}
        errorMessage={importError}
        onPickFile={handleImportFile}
        onBack={() => setRoute({ name: 'home' })}
      />
    )
  }

  if (route.name === 'recent') {
    return (
      <RecentProjectsScreen
        projects={projects}
        onOpenDay={(projectId, dayId) => setRoute({ name: 'day', projectId, dayId })}
        onBack={() => setRoute({ name: 'home' })}
      />
    )
  }

  if (route.name === 'day') {
    const project = library.projects[route.projectId]
    const day = project?.days[route.dayId]
    if (!project || !day) {
      return (
        <section className="screen">
          <p className="notice error">This day package is no longer available in local storage.</p>
          <button type="button" className="touch-button" onClick={() => setRoute({ name: 'recent' })}>
            Back to Recent Projects
          </button>
        </section>
      )
    }

    return <DayViewScreen project={project} day={day} onBack={() => setRoute({ name: 'recent' })} />
  }

  return (
    <HomeScreen
      projectCount={projects.length}
      dayCount={totalDayCount}
      onImport={() => setRoute({ name: 'import' })}
      onRecentProjects={() => setRoute({ name: 'recent' })}
    />
  )
}
