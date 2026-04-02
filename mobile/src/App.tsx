import { useEffect, useMemo, useState } from 'react'
import { SignedIn, SignedOut } from '@clerk/clerk-react'
import { useMutation, useQuery } from 'convex/react'
import { createMobileSnapshotFromCloudPayload } from './cloudPayloadToMobileSnapshot'
import type { MobileTabKey, ShotStatus, StoredLastOpened, StoredLibrary, StoredSession } from './types'
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
  upsertShotEdit,
} from './storage/mobileLibrary'
import { EmptyLibraryScreen } from './screens/EmptyLibraryScreen'
import { ImportScreen } from './screens/ImportScreen'
import { ProjectHubScreen } from './screens/ProjectHubScreen'
import { CloudAuthPanel, mobileRuntime } from './auth'
import { applyEditsToCloudPayload, exportProjectAsSnapshot } from './mobileEdits'

type MobileMode = 'local' | 'cloud'

type AppRoute =
  | { name: 'empty' }
  | { name: 'import'; returnTo: StoredLastOpened | null }
  | { name: 'project'; mode: MobileMode; projectId: string; dayId: string; tab: MobileTabKey }

function resolveInitialRoute(library: StoredLibrary, session: StoredSession): AppRoute {
  const lastOpened = resolveLastOpened(library, session)
  if (!lastOpened) return { name: 'empty' }
  return { name: 'project', mode: lastOpened.mode, projectId: lastOpened.projectId, dayId: lastOpened.dayId, tab: lastOpened.tab }
}

function downloadJson(filename: string, payload: string) {
  const blob = new Blob([payload], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

export function App() {
  const [mode, setMode] = useState<MobileMode>('local')
  const [library, setLibrary] = useState<StoredLibrary>(() => loadLibrary())
  const [session, setSession] = useState<StoredSession>(() => loadSession())
  const [route, setRoute] = useState<AppRoute>(() => resolveInitialRoute(loadLibrary(), loadSession()))
  const [busy, setBusy] = useState(false)
  const [importSuccess, setImportSuccess] = useState<string | null>(null)
  const [importError, setImportError] = useState<string | null>(null)
  const [saveState, setSaveState] = useState<string | null>(null)

  const projects = useMemo(() => Object.values(library.projects).sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? '')), [library])

  const cloudEntitlement = useQuery('billing:getMyEntitlement' as any, mode === 'cloud' ? {} : 'skip') as any
  const cloudProjects = useQuery('projects:listProjectsForCurrentUser' as any, mode === 'cloud' ? {} : 'skip') as any[] | undefined
  const latestSnapshot = useQuery('projectSnapshots:getLatestSnapshotForProject' as any, route.name === 'project' && route.mode === 'cloud' ? { projectId: route.projectId } : 'skip') as any
  const createSnapshot = useMutation('projectSnapshots:createSnapshot' as any)

  const cloudProjectLibrary = useMemo(() => {
    if (route.name !== 'project' || route.mode !== 'cloud' || !latestSnapshot?.payload) return null
    try {
      const mobileSnapshot = createMobileSnapshotFromCloudPayload(latestSnapshot.payload, {
        projectId: route.projectId,
        projectName: typeof latestSnapshot?.projectName === 'string' ? latestSnapshot.projectName : undefined,
      })
      const importedAt = new Date().toISOString()
      return importDayPackages({ version: 1, projects: {}, shotEdits: {} }, mobileSnapshot.dayPackages, importedAt).library
    } catch {
      return null
    }
  }, [latestSnapshot, route])

  function persistLastOpened(next: StoredLastOpened) {
    const nextSession: StoredSession = { version: 1, lastOpened: next }
    setSession(nextSession)
    saveSession(nextSession)
  }

  function goToProject(nextMode: MobileMode, projectId: string, dayId: string, tab: MobileTabKey) {
    const next = { mode: nextMode, projectId, dayId, tab }
    persistLastOpened(next)
    setRoute({ name: 'project', ...next })
  }

  function navigateToProject(projectId: string, preferredDayId?: string, preferredTab?: MobileTabKey) {
    const source = route.name === 'project' && route.mode === 'cloud' ? cloudProjectLibrary : library
    const project = source?.projects[projectId]
    if (!project) return
    const dayId = getPreferredDayId(project, preferredDayId)
    if (!dayId) return
    goToProject(mode, projectId, dayId, preferredTab ?? 'overview')
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
      setImportSuccess(`Imported ${result.summary.importedDayIds.length} day package(s) for ${result.summary.projectName}.`)
      if (openedDayId) goToProject('local', result.summary.projectId, openedDayId, 'overview')
    } catch (error) {
      setImportError(error instanceof Error ? error.message : 'Could not import this file.')
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
    goToProject('local', fallback.projectId, fallback.dayId, fallback.tab)
  }

  async function handleCloudSave() {
    if (route.name !== 'project' || route.mode !== 'cloud' || !latestSnapshot?.payload) return
    try {
      const payload = applyEditsToCloudPayload(latestSnapshot.payload, route.projectId, library.shotEdits)
      await createSnapshot({
        projectId: route.projectId,
        createdByUserId: latestSnapshot.createdByUserId,
        source: 'manual_save',
        payload,
        conflictStrategy: 'last_write_wins',
      })
      setSaveState('Cloud sync complete.')
    } catch {
      setSaveState('Cloud sync failed. Try again.')
    }
  }

  function handleUpdateShotFields(projectId: string, dayId: string, shotId: string, patch: any) {
    const nextLibrary = upsertShotEdit(library, projectId, dayId, shotId, patch)
    setLibrary(nextLibrary)
    saveLibrary(nextLibrary)
    if (mode === 'cloud') {
      void handleCloudSave()
    }
  }

  const sourceLibrary = route.name === 'project' && route.mode === 'cloud' ? cloudProjectLibrary : library

  useEffect(() => {
    if (route.name !== 'project') return
    if (route.mode !== 'cloud') return
    if (!sourceLibrary) return
    const currentProject = sourceLibrary.projects[route.projectId]
    if (!currentProject) return
    if (currentProject.days[route.dayId]) return
    const fallbackDayId = getPreferredDayId(currentProject)
    if (!fallbackDayId) return
    goToProject('cloud', currentProject.projectId, fallbackDayId, route.tab)
  }, [route, sourceLibrary])

  if (route.name === 'import') {
    return <ImportScreen busy={busy} successMessage={importSuccess} errorMessage={importError} onPickFile={handleImportFile} onBack={() => setRoute({ name: 'empty' })} />
  }

  const activeProject = route.name === 'project' ? sourceLibrary?.projects[route.projectId] : null
  const activeDay = activeProject && route.name === 'project' ? activeProject.days[route.dayId] : null

  return (
    <section className="screen">
      <article className="hero-card">
        <h1>ShotScribe Mobile</h1>
        <p>Use Local File Mode for offline package imports, or Cloud Project Mode for paid cloud sync + collaboration.</p>
        <div className="mobile-shot-actions">
          <button type="button" className={`touch-button ${mode === 'local' ? 'touch-button-primary' : ''}`} onClick={() => setMode('local')}>Local File Mode</button>
          <button type="button" className={`touch-button ${mode === 'cloud' ? 'touch-button-primary' : ''}`} onClick={() => setMode('cloud')}>Cloud Project Mode</button>
        </div>
      </article>

      {mode === 'cloud' && mobileRuntime.clerkPublishableKey ? <CloudAuthPanel /> : null}
      {saveState ? <p className="notice success">{saveState}</p> : null}

      {mode === 'local' ? (
        route.name === 'empty' || !activeProject || !activeDay ? (
          <EmptyLibraryScreen onImport={() => setRoute({ name: 'import', returnTo: null })} />
        ) : (
          <ProjectHubScreen
            mode="local"
            projects={projects}
            project={activeProject}
            day={activeDay}
            selectedTab={route.tab}
            shotEdits={library.shotEdits}
            onSelectTab={(tab) => goToProject('local', activeProject.projectId, activeDay.dayId, tab)}
            onSelectDay={(dayId) => goToProject('local', activeProject.projectId, dayId, route.tab)}
            onSelectProject={(projectId) => navigateToProject(projectId, undefined, route.tab)}
            onDeleteProject={handleDeleteProject}
            onImport={() => setRoute({ name: 'import', returnTo: null })}
            onCycleShotStatus={(shotId) => {
              const key = `${activeProject.projectId}::${activeDay.dayId}::${shotId}`
              const current = library.shotEdits[key]?.status ?? 'todo'
              const nextStatus: ShotStatus = current === 'done' ? 'skipped' : current === 'skipped' ? 'todo' : 'done'
              handleUpdateShotFields(activeProject.projectId, activeDay.dayId, shotId, { status: nextStatus })
            }}
            onUpdateShotFields={(shotId, patch) => handleUpdateShotFields(activeProject.projectId, activeDay.dayId, shotId, patch)}
            onExportCurrentProject={() => {
              const json = exportProjectAsSnapshot(activeProject, library.shotEdits)
              downloadJson(`${activeProject.projectName.replace(/\s+/g, '-').toLowerCase()}.mobile-updated.snapshot.json`, json)
            }}
          />
        )
      ) : (
        <>
          {!mobileRuntime.cloudEnabled ? <p className="notice error">Cloud mode is disabled in this environment.</p> : null}
          {cloudEntitlement && !cloudEntitlement.canUseCloudFeatures ? <p className="notice error">Cloud mode requires a paid cloud membership.</p> : null}
          {mobileRuntime.clerkPublishableKey ? (
            <SignedIn>
              {route.name !== 'project' || route.mode !== 'cloud' || !activeProject || !activeDay ? (
                <article className="project-card">
                  <h3>Cloud projects</h3>
                  {(cloudProjects ?? []).map((project: any) => (
                    <button key={project._id} type="button" className="touch-button" onClick={() => goToProject('cloud', String(project._id), 'pending', 'overview')}>
                      <span>{project.name}</span>
                      <small>{project.currentUserRole}</small>
                    </button>
                  ))}
                </article>
              ) : (
                <ProjectHubScreen
                  mode="cloud"
                  projects={Object.values(sourceLibrary?.projects ?? {})}
                  project={activeProject}
                  day={activeDay}
                  selectedTab={route.tab}
                  shotEdits={library.shotEdits}
                  onSelectTab={(tab) => goToProject('cloud', activeProject.projectId, activeDay.dayId, tab)}
                  onSelectDay={(dayId) => goToProject('cloud', activeProject.projectId, dayId, route.tab)}
                  onSelectProject={(projectId) => navigateToProject(projectId, undefined, route.tab)}
                  onDeleteProject={() => {}}
                  onImport={() => {}}
                  onCycleShotStatus={(shotId) => {
                    const key = `${activeProject.projectId}::${activeDay.dayId}::${shotId}`
                    const current = library.shotEdits[key]?.status ?? 'todo'
                    const nextStatus: ShotStatus = current === 'done' ? 'skipped' : current === 'skipped' ? 'todo' : 'done'
                    handleUpdateShotFields(activeProject.projectId, activeDay.dayId, shotId, { status: nextStatus })
                  }}
                  onUpdateShotFields={(shotId, patch) => handleUpdateShotFields(activeProject.projectId, activeDay.dayId, shotId, patch)}
                />
              )}
            </SignedIn>
          ) : (
            <p className="hint-text">Cloud auth is not configured for this mobile build.</p>
          )}
        </>
      )}


      {mode === 'cloud' && mobileRuntime.clerkPublishableKey ? <SignedOut><p className="hint-text">Sign in to browse cloud projects.</p></SignedOut> : null}
    </section>
  )
}
