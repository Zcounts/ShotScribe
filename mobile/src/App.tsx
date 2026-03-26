import { useMemo, useState } from 'react'
import type { MobileTabKey, StoredLastOpened, StoredLibrary, StoredSession } from './types'
import { importDayPackagesFromFile } from './importers/mobilePackageImport'
import {
  getPreferredDayId,
  importDayPackages,
  loadLibrary,
  loadSession,
  removeProject,
  resolveLastOpened,
  saveLibrary,
  saveSession,
  setShotStatusOverride,
} from './storage/mobileLibrary'
import { EmptyLibraryScreen } from './screens/EmptyLibraryScreen'
import { ImportScreen } from './screens/ImportScreen'
import { ProjectHubScreen } from './screens/ProjectHubScreen'

type AppRoute =
  | { name: 'empty' }
  | { name: 'import'; returnTo: StoredLastOpened | null }
  | { name: 'project'; projectId: string; dayId: string; tab: MobileTabKey }

function resolveInitialRoute(library: StoredLibrary, session: StoredSession): AppRoute {
  const lastOpened = resolveLastOpened(library, session)
  if (!lastOpened) {
    return { name: 'empty' }
  }

  return {
    name: 'project',
    projectId: lastOpened.projectId,
    dayId: lastOpened.dayId,
    tab: lastOpened.tab,
  }
}

export function App() {
  const [library, setLibrary] = useState<StoredLibrary>(() => loadLibrary())
  const [session, setSession] = useState<StoredSession>(() => loadSession())
  const [route, setRoute] = useState<AppRoute>(() => resolveInitialRoute(loadLibrary(), loadSession()))
  const [busy, setBusy] = useState(false)
  const [importSuccess, setImportSuccess] = useState<string | null>(null)
  const [importError, setImportError] = useState<string | null>(null)

  const projects = useMemo(() => {
    return Object.values(library.projects).sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''))
  }, [library])

  function persistLastOpened(next: StoredLastOpened) {
    const nextSession: StoredSession = {
      version: 1,
      lastOpened: next,
    }

    setSession(nextSession)
    saveSession(nextSession)
  }

  function goToProject(projectId: string, dayId: string, tab: MobileTabKey) {
    const next = { projectId, dayId, tab }
    persistLastOpened(next)
    setRoute({ name: 'project', ...next })
  }

  function navigateToProject(projectId: string, preferredDayId?: string, preferredTab?: MobileTabKey) {
    const project = library.projects[projectId]
    if (!project) {
      return
    }

    const dayId = getPreferredDayId(project, preferredDayId)
    if (!dayId) {
      return
    }

    goToProject(projectId, dayId, preferredTab ?? 'overview')
  }

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

      const importedProject = result.library.projects[result.summary.projectId]
      const openedDayId = getPreferredDayId(importedProject, result.summary.importedDayIds[0])

      setImportSuccess(
        `Imported ${result.summary.importedDayIds.length} day package(s) for ${result.summary.projectName}.`
      )

      if (openedDayId) {
        goToProject(result.summary.projectId, openedDayId, 'overview')
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not import this file.'
      setImportError(message)
    } finally {
      setBusy(false)
    }
  }

  function handleDeleteProject(projectId: string) {
    const nextLibrary = removeProject(library, projectId)
    setLibrary(nextLibrary)
    saveLibrary(nextLibrary)

    const fallback = resolveLastOpened(nextLibrary, session)
    if (!fallback) {
      const nextSession: StoredSession = { version: 1, lastOpened: null }
      setSession(nextSession)
      saveSession(nextSession)
      setRoute({ name: 'empty' })
      return
    }

    goToProject(fallback.projectId, fallback.dayId, fallback.tab)
  }

  if (route.name === 'import') {
    return (
      <ImportScreen
        busy={busy}
        successMessage={importSuccess}
        errorMessage={importError}
        onPickFile={handleImportFile}
        onBack={() => {
          if (!route.returnTo) {
            setRoute({ name: 'empty' })
            return
          }
          setRoute({ name: 'project', ...route.returnTo })
        }}
      />
    )
  }

  if (route.name === 'empty') {
    return <EmptyLibraryScreen onImport={() => setRoute({ name: 'import', returnTo: null })} />
  }

  const activeProject = library.projects[route.projectId]
  const activeDay = activeProject?.days[route.dayId]

  if (!activeProject || !activeDay) {
    const fallback = resolveLastOpened(library, session)
    if (!fallback) {
      return <EmptyLibraryScreen onImport={() => setRoute({ name: 'import', returnTo: null })} />
    }

    return (
      <section className="screen">
        <p className="notice error">The last opened project could not be found. Reopen your project.</p>
        <button
          type="button"
          className="touch-button"
          onClick={() => goToProject(fallback.projectId, fallback.dayId, fallback.tab)}
        >
          Open project
        </button>
      </section>
    )
  }

  return (
    <ProjectHubScreen
      projects={projects}
      project={activeProject}
      day={activeDay}
      selectedTab={route.tab}
      shotStatusOverrides={library.shotStatusOverrides}
      onSelectTab={(tab) => goToProject(activeProject.projectId, activeDay.dayId, tab)}
      onSelectDay={(dayId) => goToProject(activeProject.projectId, dayId, route.tab)}
      onSelectProject={(projectId) => navigateToProject(projectId, undefined, route.tab)}
      onDeleteProject={handleDeleteProject}
      onImport={() =>
        setRoute({
          name: 'import',
          returnTo: {
            projectId: activeProject.projectId,
            dayId: activeDay.dayId,
            tab: route.tab,
          },
        })
      }
      onToggleShotDone={(shotId) => {
        const key = `${activeProject.projectId}::${activeDay.dayId}::${shotId}`
        const current = library.shotStatusOverrides[key] ?? 'todo'
        const nextStatus = current === 'done' ? 'todo' : 'done'
        const nextLibrary = setShotStatusOverride(
          library,
          activeProject.projectId,
          activeDay.dayId,
          shotId,
          nextStatus
        )
        setLibrary(nextLibrary)
        saveLibrary(nextLibrary)
      }}
    />
  )
}
