import { useEffect, useMemo, useRef, useState } from 'react'
import { SignedIn, SignedOut } from '@clerk/clerk-react'
import { useConvex, useMutation, useQuery } from 'convex/react'
import { createMobileSnapshotFromCloudPayload } from './cloudPayloadToMobileSnapshot'
import type {
  MobileTabKey,
  ShotFieldEdit,
  ShotStatus,
  StoredCloudCache,
  StoredLastOpened,
  StoredLibrary,
  StoredProjectEntry,
  StoredSession,
} from './types'
import { importDayPackagesFromFile } from './importers/mobilePackageImport'
import {
  getPreferredDayId,
  importDayPackages,
  loadCloudCache,
  loadLibrary,
  loadSession,
  removeProject,
  resolveLastOpened,
  saveCloudCache,
  saveLibrary,
  saveSession,
  upsertCloudCacheEntry,
  upsertShotEdit,
} from './storage/mobileLibrary'
import { EmptyLibraryScreen } from './screens/EmptyLibraryScreen'
import { ImportScreen } from './screens/ImportScreen'
import { ProjectHubScreen } from './screens/ProjectHubScreen'
import { CloudAuthPanel, mobileRuntime } from './auth'
import { applyEditsToCloudPayload, exportProjectAsSnapshot } from './mobileEdits'
import {
  getCachedAssetViewUrl,
  loadAssetViewCache,
  saveAssetViewCache,
  upsertAssetViewUrl,
  type StoredAssetViewCache,
} from './storage/mobileAssetViews'

type MobileMode = 'local' | 'cloud'

type MobileSyncState =
  | { status: 'idle' }
  | { status: 'unsaved_changes' }
  | { status: 'syncing' }
  | { status: 'synced'; at: string }
  | { status: 'sync_failed'; error: string }

type CloudSnapshotHead = {
  latestSnapshotId?: string
  latestSnapshotVersionToken?: string
}

type CloudProjectStatus = {
  isStale: boolean
  latestSnapshotId: string | null
  checkedAt: string
}

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

export function App() {
  const convex = useConvex()
  const createSnapshot = useMutation('projectSnapshots:createSnapshot' as any)

  const [mode, setMode] = useState<MobileMode>('local')
  const [library, setLibrary] = useState<StoredLibrary>(() => loadLibrary())
  const [session, setSession] = useState<StoredSession>(() => loadSession())
  const [route, setRoute] = useState<AppRoute>(() => resolveInitialRoute(loadLibrary(), loadSession()))
  const [cloudCache, setCloudCache] = useState<StoredCloudCache>(() => loadCloudCache())
  const [busy, setBusy] = useState(false)
  const [importSuccess, setImportSuccess] = useState<string | null>(null)
  const [importError, setImportError] = useState<string | null>(null)
  const [cloudMessage, setCloudMessage] = useState<string | null>(null)
  const [syncState, setSyncState] = useState<MobileSyncState>({ status: 'idle' })
  const [cloudCurrentUserId, setCloudCurrentUserId] = useState<string | null>(null)
  const [assetViewCache, setAssetViewCache] = useState<StoredAssetViewCache>(() => loadAssetViewCache())
  const [cloudProjectStatus, setCloudProjectStatus] = useState<Record<string, CloudProjectStatus>>({})
  const cloudSyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const cloudProjectsResult = useQuery('projects:listProjectsForCurrentUserLite' as any, mode === 'cloud' ? {} : 'skip') as { projects: any[] } | undefined
  const cloudProjects = cloudProjectsResult?.projects ?? []

  const hasCloudProviders = Boolean(
    mobileRuntime.cloudEnabled && mobileRuntime.clerkPublishableKey && mobileRuntime.convexUrl,
  )

  const projects = useMemo(
    () => Object.values(library.projects).sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? '')),
    [library],
  )

  const localActiveProject = route.name === 'project' && route.mode === 'local' ? library.projects[route.projectId] : null
  const localActiveDay = localActiveProject && route.name === 'project' ? localActiveProject.days[route.dayId] : null

  const cloudActiveProject = route.name === 'project' && route.mode === 'cloud' ? library.projects[route.projectId] : null
  const cloudActiveDay = cloudActiveProject && route.name === 'project' ? cloudActiveProject.days[route.dayId] : null

  useEffect(() => {
    if (mode !== 'cloud') return
    let cancelled = false
    convex.query('users:currentUser' as any)
      .then((user) => {
        if (!cancelled && user?._id) {
          setCloudCurrentUserId(String(user._id))
        }
      })
      .catch(() => {
        if (!cancelled) setCloudCurrentUserId(null)
      })
    return () => {
      cancelled = true
    }
  }, [convex, mode])

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

  function persistCloudCache(nextCache: StoredCloudCache) {
    setCloudCache(nextCache)
    saveCloudCache(nextCache)
  }

  function persistAssetViewCache(nextCache: StoredAssetViewCache) {
    setAssetViewCache(nextCache)
    saveAssetViewCache(nextCache)
  }

  function setProjectStaleState(projectId: string, latestSnapshotId: string | null, isStale: boolean) {
    setCloudProjectStatus((prev) => ({
      ...prev,
      [projectId]: {
        isStale,
        latestSnapshotId,
        checkedAt: new Date().toISOString(),
      },
    }))
  }

  function importCloudSnapshotIntoLibrary(projectId: string, payload: Record<string, any>): { nextLibrary: StoredLibrary; dayId: string | null } {
    const nowIso = new Date().toISOString()
    const snapshot = createMobileSnapshotFromCloudPayload(payload, {
      projectId,
      projectName: typeof payload.projectName === 'string' ? payload.projectName : undefined,
    })
    const result = importDayPackages(library, snapshot.dayPackages, nowIso)
    const nextLibrary = result.library
    const importedProject = nextLibrary.projects[projectId]
    const dayId = importedProject ? getPreferredDayId(importedProject, result.summary.importedDayIds[0]) : null
    setLibrary(nextLibrary)
    saveLibrary(nextLibrary)
    return { nextLibrary, dayId }
  }

  async function openCloudProject(projectId: string, { forceRefresh = false }: { forceRefresh?: boolean } = {}) {
    setBusy(true)
    setCloudMessage(null)
    try {
      const head = await convex.query('projectSnapshots:getLatestSnapshotHeadForProject' as any, { projectId }) as CloudSnapshotHead | null
      const cached = cloudCache.entries[projectId]
      const hasMatchingCache = Boolean(
        !forceRefresh
        && cached
        && head?.latestSnapshotId
        && String(head.latestSnapshotId) === String(cached.snapshotId)
        && library.projects[projectId],
      )
      setProjectStaleState(
        projectId,
        head?.latestSnapshotId ? String(head.latestSnapshotId) : null,
        Boolean(cached?.snapshotId && head?.latestSnapshotId && String(cached.snapshotId) !== String(head.latestSnapshotId)),
      )

      if (hasMatchingCache) {
        const dayId = getPreferredDayId(library.projects[projectId])
        if (dayId) goToProject('cloud', projectId, dayId, 'overview')
        setCloudMessage('Opened cached cloud project.')
        return
      }

      const latestSnapshot = await convex.query('projectSnapshots:getLatestSnapshotForProject' as any, { projectId }) as any
      if (!latestSnapshot?.payload) {
        throw new Error('No cloud snapshot payload was found for this project.')
      }

      const { dayId } = importCloudSnapshotIntoLibrary(projectId, latestSnapshot.payload)
      const nextCache = upsertCloudCacheEntry(cloudCache, {
        projectId,
        snapshotId: String(latestSnapshot._id),
        snapshotVersionToken: head?.latestSnapshotVersionToken ? String(head.latestSnapshotVersionToken) : undefined,
        createdByUserId: String(latestSnapshot.createdByUserId || ''),
        cachedAt: new Date().toISOString(),
        payload: latestSnapshot.payload,
      })
      persistCloudCache(nextCache)
      setProjectStaleState(projectId, String(latestSnapshot._id), false)

      if (dayId) goToProject('cloud', projectId, dayId, 'overview')
      setCloudMessage(forceRefresh ? 'Cloud project refreshed.' : 'Cloud project downloaded and cached on this device.')
    } catch (error) {
      setCloudMessage(error instanceof Error ? error.message : 'Could not open cloud project.')
    } finally {
      setBusy(false)
    }
  }

  async function checkCloudProjectFreshness(projectId: string) {
    const cached = cloudCache.entries[projectId]
    if (!cached) return
    try {
      const head = await convex.query('projectSnapshots:getLatestSnapshotHeadForProject' as any, { projectId }) as CloudSnapshotHead | null
      const latestSnapshotId = head?.latestSnapshotId ? String(head.latestSnapshotId) : null
      const stale = Boolean(latestSnapshotId && latestSnapshotId !== String(cached.snapshotId))
      setProjectStaleState(projectId, latestSnapshotId, stale)
    } catch {}
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
    if (route.name !== 'project' || route.mode !== 'cloud') return
    const cacheEntry = cloudCache.entries[route.projectId]
    if (!cacheEntry?.payload) return

    setSyncState({ status: 'syncing' })
    try {
      const payload = applyEditsToCloudPayload(cacheEntry.payload, route.projectId, library.shotEdits)
      const createdByUserId = cloudCurrentUserId || cacheEntry.createdByUserId
      if (!createdByUserId) {
        throw new Error('Cloud user identity unavailable. Please sign in again.')
      }
      const result = await createSnapshot({
        projectId: route.projectId,
        createdByUserId,
        source: 'autosave',
        payload,
        expectedLatestSnapshotId: cacheEntry.snapshotId,
        conflictStrategy: 'last_write_wins',
      }) as any

      const nextCache = upsertCloudCacheEntry(cloudCache, {
        ...cacheEntry,
        snapshotId: result?.snapshotId ? String(result.snapshotId) : cacheEntry.snapshotId,
        cachedAt: new Date().toISOString(),
        payload,
      })
      persistCloudCache(nextCache)
      setProjectStaleState(
        route.projectId,
        result?.snapshotId ? String(result.snapshotId) : String(cacheEntry.snapshotId),
        false,
      )
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

  useEffect(() => {
    return () => {
      if (cloudSyncTimerRef.current) clearTimeout(cloudSyncTimerRef.current)
    }
  }, [])

  useEffect(() => {
    if (mode !== 'cloud') return
    if (route.name !== 'project' || route.mode !== 'cloud') return
    void checkCloudProjectFreshness(route.projectId)
  }, [mode, route])

  async function resolveStoryboardImage(assetId?: string, fallbackUrl?: string, forceRefresh = false): Promise<string | null> {
    if (mode !== 'cloud' || route.name !== 'project' || route.mode !== 'cloud' || !assetId) return fallbackUrl || null
    const projectId = route.projectId
    if (!forceRefresh) {
      const cachedUrl = getCachedAssetViewUrl(assetViewCache, projectId, assetId)
      if (cachedUrl) return cachedUrl
    }
    try {
      const result = await convex.action('assets:getAssetSignedViewsBatch' as any, {
        projectId,
        assetIds: [assetId],
      }) as Record<string, any>
      const view = result?.[assetId]
      const nextUrl = view?.thumbUrl || view?.fullUrl || fallbackUrl || null
      if (nextUrl) {
        const expiresAtRaw = Number(view?.thumbExpiresAt || view?.fullExpiresAt || 0)
        const nextCache = upsertAssetViewUrl(assetViewCache, {
          projectId,
          assetId,
          url: nextUrl,
          expiresAt: Number.isFinite(expiresAtRaw) && expiresAtRaw > 0 ? expiresAtRaw : undefined,
          cachedAt: Date.now(),
        })
        persistAssetViewCache(nextCache)
      }
      return nextUrl
    } catch {
      return fallbackUrl || null
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

  return (
    <section className="screen">
      <article className="hero-card">
        <h1>ShotScribe Mobile</h1>
        <p>
          Use Local File Mode for offline package imports, or Cloud Project Mode for paid cloud sync +
          collaboration.
        </p>
        <div className="mobile-shot-actions mode-toggle-row">
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
      {mode === 'cloud' && cloudMessage ? <p className="notice">{cloudMessage}</p> : null}
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
            resolveStoryboardImage={undefined}
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
        <>
          <SignedOut>
            <article className="project-card">
              <p className="hint-text">Sign in to access cloud projects.</p>
            </article>
          </SignedOut>

          <SignedIn>
            {route.name !== 'project' || route.mode !== 'cloud' || !cloudActiveProject || !cloudActiveDay ? (
              <article className="project-card">
                <h3>Cloud projects</h3>
                {cloudProjectsResult === undefined ? <p className="hint-text">Loading cloud projects…</p> : null}
                {cloudProjectsResult !== undefined && cloudProjects.length === 0 ? <p className="hint-text">No cloud projects found yet.</p> : null}
                {cloudProjects.map((project: any) => (
                  <button
                    key={project._id}
                    type="button"
                    className="touch-button"
                    disabled={busy}
                    onClick={() => {
                      void openCloudProject(String(project._id))
                    }}
                  >
                    <span>{project.name}</span>
                    <small>{project.currentUserRole}</small>
                  </button>
                ))}
              </article>
            ) : (
              <>
                <article className="project-card">
                  <div className="section-heading">
                    <h3>Cloud project cache</h3>
                    <button
                      type="button"
                      className="touch-button"
                      disabled={busy}
                      onClick={() => {
                        void openCloudProject(cloudActiveProject.projectId, { forceRefresh: true })
                      }}
                    >
                      {busy ? 'Refreshing…' : 'Refresh from cloud'}
                    </button>
                  </div>
                  <p className="hint-text">Opened from cloud and cached on this device for low-chatter mobile editing.</p>
                  <p className="hint-text">
                    Last refreshed: {cloudCache.entries[cloudActiveProject.projectId]?.cachedAt ? new Date(cloudCache.entries[cloudActiveProject.projectId].cachedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}
                  </p>
                  <p className={`hint-text ${cloudProjectStatus[cloudActiveProject.projectId]?.isStale ? 'notice error' : ''}`}>
                    {cloudProjectStatus[cloudActiveProject.projectId]?.isStale
                      ? 'Cloud has newer changes. Refresh recommended.'
                      : 'Cached copy is up to date.'}
                  </p>
                  <button
                    type="button"
                    className="touch-button"
                    disabled={busy}
                    onClick={() => {
                      void checkCloudProjectFreshness(cloudActiveProject.projectId)
                    }}
                  >
                    Check cloud status
                  </button>
                </article>
                <ProjectHubScreen
                  mode="cloud"
                  projects={projects}
                  project={cloudActiveProject}
                  day={cloudActiveDay}
                  selectedTab={route.tab}
                  shotEdits={library.shotEdits}
                  onSelectTab={(tab) => goToProject('cloud', cloudActiveProject.projectId, cloudActiveDay.dayId, tab)}
                  onSelectDay={(dayId) => goToProject('cloud', cloudActiveProject.projectId, dayId, route.tab)}
                  onSelectProject={(projectId) => {
                    const selected = library.projects[projectId]
                    const dayId = selected ? getPreferredDayId(selected) : null
                    if (selected && dayId) goToProject('cloud', selected.projectId, dayId, route.tab)
                    else void openCloudProject(projectId)
                  }}
                  onDeleteProject={() => {}}
                  onImport={() => {}}
                  onCycleShotStatus={(shotId) => {
                    const key = `${cloudActiveProject.projectId}::${cloudActiveDay.dayId}::${shotId}`
                    const current = library.shotEdits[key]?.status ?? 'todo'
                    const nextStatus: ShotStatus = current === 'done' ? 'skipped' : current === 'skipped' ? 'todo' : 'done'
                    applyShotEdit(cloudActiveProject.projectId, cloudActiveDay.dayId, shotId, { status: nextStatus })
                    scheduleCloudSave()
                  }}
                  onUpdateShotFields={(shotId, patch) => {
                    applyShotEdit(cloudActiveProject.projectId, cloudActiveDay.dayId, shotId, patch)
                    scheduleCloudSave()
                  }}
                  resolveStoryboardImage={resolveStoryboardImage}
                />
              </>
            )}
          </SignedIn>
        </>
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
