import { useEffect, useMemo, useState } from 'react'
import { SignedIn, SignedOut } from '@clerk/clerk-react'
import { useMutation, useQuery } from 'convex/react'
import { createMobileSnapshotFromCloudPayload } from './cloudPayloadToMobileSnapshot'
import type {
  MobileTabKey,
  ShotFieldEdit,
  ShotStatus,
  StoredLastOpened,
  StoredLibrary,
  StoredProjectEntry,
  StoredSession,
} from './types'
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
  return {
    name: 'project',
    mode: lastOpened.mode,
    projectId: lastOpened.projectId,
    dayId: lastOpened.dayId,
    tab: lastOpened.tab,
  }
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

function CloudModePane({
  route,
  library,
  onNavigateProject,
  onSelectCloudProject,
  onApplyShotEdit,
}: {
  route: AppRoute
  library: StoredLibrary
  onNavigateProject: (projectId: string, dayId: string, tab: MobileTabKey) => void
  onSelectCloudProject: (projectId: string) => void
  onApplyShotEdit: (projectId: string, dayId: string, shotId: string, patch: Partial<Omit<ShotFieldEdit, 'updatedAt'>>) => StoredLibrary
}) {
  const cloudEntitlement = useQuery('billing:getMyEntitlement' as any, {}) as any
  const cloudProjects = useQuery('projects:listProjectsForCurrentUser' as any, {}) as any[] | undefined
  const projectId = route.name === 'project' && route.mode === 'cloud' ? route.projectId : 'skip'
  const latestSnapshot = useQuery('projectSnapshots:getLatestSnapshotForProject' as any, projectId === 'skip' ? 'skip' : { projectId }) as any
  const createSnapshot = useMutation('projectSnapshots:createSnapshot' as any)
  const [syncMessage, setSyncMessage] = useState<string | null>(null)

  const cloudProjectLibrary = useMemo(() => {
    if (!latestSnapshot?.payload || projectId === 'skip') return null
    try {
      const snapshot = createMobileSnapshotFromCloudPayload(latestSnapshot.payload, { projectId })
      return importDayPackages({ version: 1, projects: {}, shotEdits: {} }, snapshot.dayPackages, new Date().toISOString()).library
    } catch {
      return null
    }
  }, [latestSnapshot, projectId])

  const activeProject = route.name === 'project' && route.mode === 'cloud' ? cloudProjectLibrary?.projects[route.projectId] : null
  const activeDay = activeProject && route.name === 'project' ? activeProject.days[route.dayId] : null

  useEffect(() => {
    if (route.name !== 'project' || route.mode !== 'cloud') return
    if (!activeProject) return
    if (activeProject.days[route.dayId]) return
    const fallbackDay = getPreferredDayId(activeProject)
    if (!fallbackDay) return
    onNavigateProject(activeProject.projectId, fallbackDay, route.tab)
  }, [activeProject, onNavigateProject, route])

  async function persistCloudEdits(projectRef: StoredProjectEntry, dayId: string, shotId: string, patch: Partial<Omit<ShotFieldEdit, 'updatedAt'>>) {
    if (!latestSnapshot?.payload || !route || route.name !== 'project') return
    const nextLibrary = onApplyShotEdit(projectRef.projectId, dayId, shotId, patch)
    try {
      const payload = applyEditsToCloudPayload(latestSnapshot.payload, projectRef.projectId, nextLibrary.shotEdits)
      await createSnapshot({
        projectId: projectRef.projectId,
        createdByUserId: latestSnapshot.createdByUserId,
        source: 'manual_save',
        payload,
        conflictStrategy: 'last_write_wins',
      })
      setSyncMessage('Cloud sync complete.')
    } catch {
      setSyncMessage('Cloud sync failed. Check connection and retry.')
    }
  }

  return (
    <>
      <CloudAuthPanel />
      {syncMessage ? <p className="notice success">{syncMessage}</p> : null}
      {cloudEntitlement && !cloudEntitlement.canUseCloudFeatures ? (
        <p className="notice error">Cloud mode requires an active paid cloud membership.</p>
      ) : null}

      <SignedOut>
        <article className="project-card">
          <p className="hint-text">Sign in to access cloud projects.</p>
        </article>
      </SignedOut>

      <SignedIn>
        {route.name !== 'project' || route.mode !== 'cloud' || !activeProject || !activeDay ? (
          <article className="project-card">
            <h3>Cloud projects</h3>
            {cloudProjects === undefined ? <p className="hint-text">Loading cloud projects…</p> : null}
            {cloudProjects !== undefined && (cloudProjects ?? []).length === 0 ? <p className="hint-text">No cloud projects found yet.</p> : null}
            {(cloudProjects ?? []).map((project: any) => (
              <button
                key={project._id}
                type="button"
                className="touch-button"
                onClick={() => onSelectCloudProject(String(project._id))}
              >
                <span>{project.name}</span>
                <small>{project.currentUserRole}</small>
              </button>
            ))}
          </article>
        ) : (
          <ProjectHubScreen
            mode="cloud"
            projects={Object.values(cloudProjectLibrary?.projects ?? {})}
            project={activeProject}
            day={activeDay}
            selectedTab={route.tab}
            shotEdits={library.shotEdits}
            onSelectTab={(tab) => onNavigateProject(activeProject.projectId, activeDay.dayId, tab)}
            onSelectDay={(dayId) => onNavigateProject(activeProject.projectId, dayId, route.tab)}
            onSelectProject={onSelectCloudProject}
            onDeleteProject={() => {}}
            onImport={() => {}}
            onCycleShotStatus={(shotId) => {
              const key = `${activeProject.projectId}::${activeDay.dayId}::${shotId}`
              const current = library.shotEdits[key]?.status ?? 'todo'
              const nextStatus: ShotStatus = current === 'done' ? 'skipped' : current === 'skipped' ? 'todo' : 'done'
              void persistCloudEdits(activeProject, activeDay.dayId, shotId, { status: nextStatus })
            }}
            onUpdateShotFields={(shotId, patch) => {
              void persistCloudEdits(activeProject, activeDay.dayId, shotId, patch)
            }}
          />
        )}
      </SignedIn>
    </>
  )
}

export function App() {
  const [mode, setMode] = useState<MobileMode>('local')
  const [library, setLibrary] = useState<StoredLibrary>(() => loadLibrary())
  const [session, setSession] = useState<StoredSession>(() => loadSession())
  const [route, setRoute] = useState<AppRoute>(() => resolveInitialRoute(loadLibrary(), loadSession()))
  const [busy, setBusy] = useState(false)
  const [importSuccess, setImportSuccess] = useState<string | null>(null)
  const [importError, setImportError] = useState<string | null>(null)

  const hasCloudProviders = Boolean(
    mobileRuntime.cloudEnabled && mobileRuntime.clerkPublishableKey && mobileRuntime.convexUrl,
  )

  const projects = useMemo(
    () => Object.values(library.projects).sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? '')),
    [library],
  )

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

  function applyShotEdit(
    projectId: string,
    dayId: string,
    shotId: string,
    patch: Partial<Omit<ShotFieldEdit, 'updatedAt'>>,
  ): StoredLibrary {
    const next = upsertShotEdit(library, projectId, dayId, shotId, patch)
    setLibrary(next)
    saveLibrary(next)
    return next
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
        `Imported ${result.summary.importedDayIds.length} day package(s) for ${result.summary.projectName}.`,
      )
      if (openedDayId) {
        goToProject('local', result.summary.projectId, openedDayId, 'overview')
      }
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

  if (route.name === 'import') {
    return (
      <ImportScreen
        busy={busy}
        successMessage={importSuccess}
        errorMessage={importError}
        onPickFile={handleImportFile}
        onBack={() => setRoute({ name: 'empty' })}
      />
    )
  }

  const activeProject = route.name === 'project' && route.mode === 'local' ? library.projects[route.projectId] : null
  const activeDay = activeProject && route.name === 'project' ? activeProject.days[route.dayId] : null

  return (
    <section className="screen">
      <article className="hero-card">
        <h1>ShotScribe Mobile</h1>
        <p>
          Use Local File Mode for offline package imports, or Cloud Project Mode for paid cloud sync +
          collaboration.
        </p>
        <div className="mobile-shot-actions">
          <button
            type="button"
            className={`touch-button ${mode === 'local' ? 'touch-button-primary' : ''}`}
            onClick={() => setMode('local')}
          >
            Local File Mode
          </button>
          <button
            type="button"
            className={`touch-button ${mode === 'cloud' ? 'touch-button-primary' : ''}`}
            onClick={() => setMode('cloud')}
          >
            Cloud Project Mode
          </button>
        </div>
      </article>

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
            onSelectProject={(projectId) => {
              const selected = library.projects[projectId]
              const dayId = selected ? getPreferredDayId(selected) : null
              if (selected && dayId) goToProject('local', selected.projectId, dayId, route.tab)
            }}
            onDeleteProject={handleDeleteProject}
            onImport={() => setRoute({ name: 'import', returnTo: null })}
            onCycleShotStatus={(shotId) => {
              const key = `${activeProject.projectId}::${activeDay.dayId}::${shotId}`
              const current = library.shotEdits[key]?.status ?? 'todo'
              const nextStatus: ShotStatus =
                current === 'done' ? 'skipped' : current === 'skipped' ? 'todo' : 'done'
              applyShotEdit(activeProject.projectId, activeDay.dayId, shotId, { status: nextStatus })
            }}
            onUpdateShotFields={(shotId, patch) => {
              applyShotEdit(activeProject.projectId, activeDay.dayId, shotId, patch)
            }}
            onExportCurrentProject={() => {
              const json = exportProjectAsSnapshot(activeProject, library.shotEdits)
              downloadJson(
                `${activeProject.projectName.replace(/\s+/g, '-').toLowerCase()}.mobile-updated.snapshot.json`,
                json,
              )
            }}
          />
        )
      ) : hasCloudProviders ? (
        <CloudModePane
          route={route}
          library={library}
          onNavigateProject={(projectId, dayId, tab) => goToProject('cloud', projectId, dayId, tab)}
          onSelectCloudProject={(projectId) => goToProject('cloud', projectId, 'pending', 'overview')}
          onApplyShotEdit={applyShotEdit}
        />
      ) : (
        <article className="project-card">
          <h3>Cloud mode unavailable</h3>
          <p className="hint-text">
            Cloud providers are not fully configured in this build. Local File Mode is available now.
          </p>
          <p className="hint-text">Required env: VITE_ENABLE_CLOUD_FEATURES, VITE_CLERK_PUBLISHABLE_KEY, VITE_CONVEX_URL.</p>
        </article>
      )}
    </section>
  )
}
