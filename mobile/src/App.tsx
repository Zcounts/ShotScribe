import { useEffect, useMemo, useRef, useState } from 'react'
import { SignedIn, SignedOut } from '@clerk/clerk-react'
import { useConvex, useMutation, useQuery } from 'convex/react'
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

type MobileSyncState =
  | { status: 'idle' }
  | { status: 'unsaved_changes' }
  | { status: 'syncing' }
  | { status: 'synced'; at: string }
  | { status: 'sync_failed'; error: string }

const MOBILE_CLOUD_SYNC_DEBOUNCE_MS = 6000

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
  const convex = useConvex()
  const [cloudEntitlement, setCloudEntitlement] = useState<any>(null)
  const cloudProjectsResult = useQuery('projects:listProjectsForCurrentUserLite' as any, {}) as { projects: any[], hasMore: boolean, total: number } | undefined
  const cloudProjects = cloudProjectsResult?.projects
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

  const cloudActiveProject = route.name === 'project' && route.mode === 'cloud' ? cloudProjectLibrary?.projects[route.projectId] : null
  const cloudActiveDay = cloudActiveProject && route.name === 'project' ? cloudActiveProject.days[route.dayId] : null

  useEffect(() => {
    let cancelled = false
    convex.query('billing:getMyEntitlement' as any)
      .then((result) => {
        if (!cancelled) setCloudEntitlement(result ?? null)
      })
      .catch(() => {
        if (!cancelled) setCloudEntitlement(null)
      })
    return () => {
      cancelled = true
    }
  }, [convex])

  useEffect(() => {
    if (route.name !== 'project' || route.mode !== 'cloud') return
    if (!cloudActiveProject) return
    if (cloudActiveProject.days[route.dayId]) return
    const fallbackDay = getPreferredDayId(cloudActiveProject)
    if (!fallbackDay) return
    onNavigateProject(cloudActiveProject.projectId, fallbackDay, route.tab)
  }, [cloudActiveProject, onNavigateProject, route])

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
        {route.name !== 'project' || route.mode !== 'cloud' || !cloudActiveProject || !cloudActiveDay ? (
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
            project={localActiveProject}
            day={localActiveDay}
            selectedTab={route.tab}
            shotEdits={library.shotEdits}
            onSelectTab={(tab) => onNavigateProject(cloudActiveProject.projectId, cloudActiveDay.dayId, tab)}
            onSelectDay={(dayId) => onNavigateProject(cloudActiveProject.projectId, dayId, route.tab)}
            onSelectProject={onSelectCloudProject}
            onDeleteProject={() => {}}
            onImport={() => {}}
            onCycleShotStatus={(shotId) => {
              const key = `${localActiveProject.projectId}::${localActiveDay.dayId}::${shotId}`
              const current = library.shotEdits[key]?.status ?? 'todo'
              const nextStatus: ShotStatus = current === 'done' ? 'skipped' : current === 'skipped' ? 'todo' : 'done'
              void persistCloudEdits(cloudActiveProject, cloudActiveDay.dayId, shotId, { status: nextStatus })
            }}
            onUpdateShotFields={(shotId, patch) => {
              void persistCloudEdits(cloudActiveProject, cloudActiveDay.dayId, shotId, patch)
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
  const [syncState, setSyncState] = useState<MobileSyncState>({ status: 'idle' })
  const cloudSyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

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
    goToProject(fallback.mode, fallback.projectId, fallback.dayId, fallback.tab)
  }

  async function flushCloudSave() {
    if (route.name !== 'project' || route.mode !== 'cloud' || !latestSnapshot?.payload) return
    setSyncState({ status: 'syncing' })
    try {
      const payload = applyEditsToCloudPayload(latestSnapshot.payload, route.projectId, library.shotEdits)
      await createSnapshot({
        projectId: route.projectId,
        createdByUserId: latestSnapshot.createdByUserId,
        source: 'autosave',
        payload,
        expectedLatestSnapshotId: latestSnapshot._id,
        conflictStrategy: 'last_write_wins',
      })
      setSyncState({ status: 'synced', at: new Date().toISOString() })
    } catch (err) {
      setSyncState({ status: 'sync_failed', error: err instanceof Error ? err.message : 'Upload failed' })
    }
  }

  function scheduleCloudSave() {
    setSyncState({ status: 'unsaved_changes' })
    if (cloudSyncTimerRef.current) clearTimeout(cloudSyncTimerRef.current)
    cloudSyncTimerRef.current = setTimeout(() => {
      void flushCloudSave()
    }, MOBILE_CLOUD_SYNC_DEBOUNCE_MS)
  }

  // Clear any pending cloud sync timer on unmount
  useEffect(() => {
    return () => {
      if (cloudSyncTimerRef.current) clearTimeout(cloudSyncTimerRef.current)
    }
  }, [])

  function handleUpdateShotFields(projectId: string, dayId: string, shotId: string, patch: any) {
    const nextLibrary = upsertShotEdit(library, projectId, dayId, shotId, patch)
    setLibrary(nextLibrary)
    saveLibrary(nextLibrary)
    if (mode === 'cloud') {
      scheduleCloudSave()
    }
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

  const localActiveProject = route.name === 'project' && route.mode === 'local' ? library.projects[route.projectId] : null
  const localActiveDay = localActiveProject && route.name === 'project' ? localActiveProject.days[route.dayId] : null

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

      {mode === 'cloud' && mobileRuntime.clerkPublishableKey ? <CloudAuthPanel /> : null}
      {mode === 'cloud' && syncState.status !== 'idle' && (
        <p className={`notice ${syncState.status === 'sync_failed' ? 'error' : syncState.status === 'synced' ? 'success' : ''}`}>
          {syncState.status === 'unsaved_changes' && 'Shot changes saved on device · uploading soon…'}
          {syncState.status === 'syncing' && 'Uploading to cloud…'}
          {syncState.status === 'synced' && `Backed up to cloud · ${new Date(syncState.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}
          {syncState.status === 'sync_failed' && 'Saved on device · cloud backup failed. Changes will upload on next edit.'}
        </p>
      )}

      {mode === 'local' ? (
        route.name === 'empty' || !localActiveProject || !localActiveDay ? (
          <EmptyLibraryScreen onImport={() => setRoute({ name: 'import', returnTo: null })} />
        ) : (
          <ProjectHubScreen
            mode="local"
            projects={projects}
            project={localActiveProject}
            day={localActiveDay}
            selectedTab={route.tab}
            shotEdits={library.shotEdits}
            onSelectTab={(tab) => goToProject('local', localActiveProject.projectId, localActiveDay.dayId, tab)}
            onSelectDay={(dayId) => goToProject('local', localActiveProject.projectId, dayId, route.tab)}
            onSelectProject={(projectId) => {
              const selected = library.projects[projectId]
              const dayId = selected ? getPreferredDayId(selected) : null
              if (selected && dayId) goToProject('local', selected.projectId, dayId, route.tab)
            }}
            onDeleteProject={handleDeleteProject}
            onImport={() => setRoute({ name: 'import', returnTo: null })}
            onCycleShotStatus={(shotId) => {
              const key = `${localActiveProject.projectId}::${localActiveDay.dayId}::${shotId}`
              const current = library.shotEdits[key]?.status ?? 'todo'
              const nextStatus: ShotStatus =
                current === 'done' ? 'skipped' : current === 'skipped' ? 'todo' : 'done'
              applyShotEdit(localActiveProject.projectId, localActiveDay.dayId, shotId, { status: nextStatus })
            }}
            onUpdateShotFields={(shotId, patch) => {
              applyShotEdit(localActiveProject.projectId, localActiveDay.dayId, shotId, patch)
            }}
            onExportCurrentProject={() => {
              const json = exportProjectAsSnapshot(localActiveProject, library.shotEdits)
              downloadJson(
                `${localActiveProject.projectName.replace(/\s+/g, '-').toLowerCase()}.mobile-updated.snapshot.json`,
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
