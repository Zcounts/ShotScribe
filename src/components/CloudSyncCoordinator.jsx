import { useEffect, useRef } from 'react'
import { useAction, useConvex, useMutation, useQuery } from 'convex/react'
import useStore from '../store'
import useCloudAccessPolicy from '../features/billing/useCloudAccessPolicy'
import { buildShotImageFromLibraryAsset, uploadStoryboardAssetToCloud } from '../services/assetService'
import { processStoryboardUploadForCloud } from '../utils/storyboardImagePipeline'

const CLOUD_PROJECT_SESSION_KEY = 'ss_active_cloud_project_id'
const INLINE_IMAGE_PREFIXES = ['data:', 'blob:', 'file:']

function isInlineImageRef(value) {
  if (typeof value !== 'string') return false
  const trimmed = value.trim().toLowerCase()
  if (!trimmed) return false
  return INLINE_IMAGE_PREFIXES.some(prefix => trimmed.startsWith(prefix))
}

async function resolveInlineImageBlob(source) {
  const response = await fetch(source)
  if (!response.ok) {
    throw new Error(`Failed to load local image payload (${response.status})`)
  }
  return response.blob()
}

export default function CloudSyncCoordinator() {
  const projectRef = useStore(s => s.projectRef)
  const setCloudSyncContext = useStore(s => s.setCloudSyncContext)
  const setCloudRepositoryAdapter = useStore(s => s.setCloudRepositoryAdapter)
  const setCloudImageUploader = useStore(s => s.setCloudImageUploader)
  const setCloudImageResolver = useStore(s => s.setCloudImageResolver)
  const flushCloudSync = useStore(s => s.flushCloudSync)
  const applyIncomingCloudSnapshot = useStore(s => s.applyIncomingCloudSnapshot)
  const openCloudProject = useStore(s => s.openCloudProject)
  const updateShotImage = useStore(s => s.updateShotImage)
  const hasUnsavedChanges = useStore(s => s.hasUnsavedChanges)
  const pendingRemoteSnapshot = useStore(s => s.pendingRemoteSnapshot)
  const applyPendingRemoteSnapshot = useStore(s => s.applyPendingRemoteSnapshot)
  const convex = useConvex()
  const createProject = useMutation('projects:createProject')
  const ensureStoryboardLiveModel = useMutation('projects:ensureStoryboardLiveModel')
  const createSnapshot = useMutation('projectSnapshots:createSnapshot')
  const upsertLiveScene = useMutation('projectScenesLive:upsertScene')
  const deleteLiveScene = useMutation('projectScenesLive:deleteScene')
  const upsertLiveShot = useMutation('projectShotsLive:upsertShot')
  const deleteLiveShot = useMutation('projectShotsLive:deleteShot')
  const createAssetUploadIntent = useAction('assets:createAssetUploadIntent')
  const finalizeAssetUpload = useMutation('assets:finalizeAssetUpload')
  const assignShotLibraryAsset = useMutation('assets:assignShotLibraryAsset')
  const getAssetSignedView = useAction('assets:getAssetSignedView')
  const getAssetThumbnailBase64 = useAction('assets:getAssetThumbnailBase64')
  const cloudUser = useQuery('users:currentUser')
  const cloudProjectId = projectRef?.type === 'cloud' ? projectRef.projectId : null
  const cloudProject = useQuery('projects:getProjectById', cloudProjectId ? { projectId: cloudProjectId } : 'skip')
  const liveScenes = useQuery(
    'projectScenesLive:listScenesByProject',
    cloudProjectId && Number(cloudProject?.liveModelVersion || 0) >= 1 ? { projectId: cloudProjectId } : 'skip',
  )
  const liveShots = useQuery(
    'projectShotsLive:listShotsByProject',
    cloudProjectId && Number(cloudProject?.liveModelVersion || 0) >= 1 ? { projectId: cloudProjectId } : 'skip',
  )
  const latestSnapshot = useQuery(
    'projectSnapshots:getLatestSnapshotForProject',
    cloudProjectId ? { projectId: cloudProjectId } : 'skip',
  )
  const cloudAccessPolicy = useCloudAccessPolicy()
  const setLiveModelVersion = useStore(s => s.setLiveModelVersion)
  const applyLiveStoryboardState = useStore(s => s.applyLiveStoryboardState)

  // Guard so the sessionStorage restore runs at most once per mount, even if
  // the adapter effect re-fires due to dependency changes.
  const hasAttemptedRestoreRef = useRef(false)
  const localImageBackfillInFlightRef = useRef(false)
  const localImageUploadCacheRef = useRef(new Map())
  const liveMigrationRequestedRef = useRef(new Set())

  useEffect(() => {
    setCloudRepositoryAdapter({
      runMutation: async (name, args) => {
        if (name === 'projects:createProject') return createProject(args)
        if (name === 'projectSnapshots:createSnapshot') return createSnapshot(args)
        throw new Error(`Unsupported mutation: ${name}`)
      },
      runQuery: async (name, args) => convex.query(name, args || {}),
    })

    // After the cloud repository adapter is ready, check whether a cloud
    // project was open in the previous session (stored in sessionStorage by
    // openCloudProject). If yes, and the store is still in local mode, reopen
    // the project automatically — this makes a browser refresh return the user
    // to their cloud project rather than landing on a blank local state.
    if (!hasAttemptedRestoreRef.current) {
      hasAttemptedRestoreRef.current = true
      try {
        const savedId = sessionStorage.getItem(CLOUD_PROJECT_SESSION_KEY)
        if (savedId && useStore.getState().projectRef?.type !== 'cloud') {
          openCloudProject({ projectId: savedId }).catch(() => {
            // If the project no longer exists or access was revoked, wipe the
            // saved ID so we don't keep attempting a broken restore.
            try { sessionStorage.removeItem(CLOUD_PROJECT_SESSION_KEY) } catch {}
          })
        }
      } catch {}
    }
  }, [convex, createProject, createSnapshot, openCloudProject, setCloudRepositoryAdapter])

  useEffect(() => {
    const isCloudProject = projectRef?.type === 'cloud'
    setCloudSyncContext({
      canSync: isCloudProject && cloudAccessPolicy.canEditCloudProject,
      cloudWritesEnabled: cloudAccessPolicy.canEditCloudProject,
      runSnapshotMutation: createSnapshot,
      syncLiveStoryboardState: async ({ projectId, scenes, storyboardSceneOrder }) => {
        const existingScenes = await convex.query('projectScenesLive:listScenesByProject', { projectId })
        const existingShots = await convex.query('projectShotsLive:listShotsByProject', { projectId })
        const sceneOrder = Array.isArray(storyboardSceneOrder) && storyboardSceneOrder.length > 0
          ? storyboardSceneOrder
          : (scenes || []).map((scene) => scene.id)
        const orderBySceneId = new Map(sceneOrder.map((id, index) => [String(id), index]))

        for (const scene of (scenes || [])) {
          const sceneId = String(scene.id)
          await upsertLiveScene({
            projectId,
            sceneId,
            order: orderBySceneId.has(sceneId) ? orderBySceneId.get(sceneId) : Number.MAX_SAFE_INTEGER,
            payload: scene,
          })
          for (const [index, shot] of (scene.shots || []).entries()) {
            await upsertLiveShot({
              projectId,
              sceneId,
              shotId: String(shot.id),
              order: index,
              payload: shot,
            })
          }
        }

        const nextSceneIds = new Set((scenes || []).map((scene) => String(scene.id)))
        await Promise.all(
          (existingScenes || [])
            .filter((scene) => !nextSceneIds.has(String(scene.sceneId)))
            .map((scene) => deleteLiveScene({ projectId, sceneId: String(scene.sceneId) })),
        )

        const nextShotIds = new Set((scenes || []).flatMap((scene) => (scene.shots || []).map((shot) => String(shot.id))))
        await Promise.all(
          (existingShots || [])
            .filter((shot) => !nextShotIds.has(String(shot.shotId)))
            .map((shot) => deleteLiveShot({ projectId, shotId: String(shot.shotId) })),
        )
      },
      currentUserId: cloudUser?.user?._id ? String(cloudUser.user._id) : null,
      collaborationMode: isCloudProject && cloudAccessPolicy.canCollaborateOnCloudProject,
    })
  }, [
    cloudAccessPolicy.canCollaborateOnCloudProject,
    cloudAccessPolicy.canEditCloudProject,
    cloudUser?.user?._id,
    convex,
    createSnapshot,
    deleteLiveScene,
    deleteLiveShot,
    projectRef?.type,
    setCloudSyncContext,
    upsertLiveScene,
    upsertLiveShot,
  ])

  useEffect(() => {
    if (!cloudProjectId || !cloudProject) return
    const nextVersion = Number(cloudProject.liveModelVersion || 0)
    setLiveModelVersion(nextVersion)
    if (nextVersion >= 1) return
    if (!cloudAccessPolicy.canEditCloudProject) return
    const key = String(cloudProjectId)
    if (liveMigrationRequestedRef.current.has(key)) return
    liveMigrationRequestedRef.current.add(key)
    ensureStoryboardLiveModel({ projectId: cloudProjectId }).catch(() => {
      liveMigrationRequestedRef.current.delete(key)
    })
  }, [cloudAccessPolicy.canEditCloudProject, cloudProject, cloudProjectId, ensureStoryboardLiveModel, setLiveModelVersion])

  useEffect(() => {
    if (!cloudProjectId) return
    if (Number(cloudProject?.liveModelVersion || 0) < 1) return
    if (!Array.isArray(liveScenes) || !Array.isArray(liveShots)) return
    applyLiveStoryboardState({ scenes: liveScenes, shots: liveShots })
  }, [applyLiveStoryboardState, cloudProject?.liveModelVersion, cloudProjectId, liveScenes, liveShots])

  useEffect(() => {
    if (projectRef?.type !== 'cloud') return undefined
    const flush = () => {
      if (!hasUnsavedChanges) return
      flushCloudSync({ reason: 'manual' })
    }
    window.addEventListener('beforeunload', flush)
    window.addEventListener('pagehide', flush)
    return () => {
      window.removeEventListener('beforeunload', flush)
      window.removeEventListener('pagehide', flush)
    }
  }, [flushCloudSync, hasUnsavedChanges, projectRef?.type])

  useEffect(() => {
    if (!cloudProjectId || !latestSnapshot?._id || !latestSnapshot?.payload) return
    applyIncomingCloudSnapshot({
      projectId: cloudProjectId,
      snapshotId: String(latestSnapshot._id),
      payload: latestSnapshot.payload,
    })
  }, [applyIncomingCloudSnapshot, cloudProjectId, latestSnapshot?._id, latestSnapshot?.payload])

  useEffect(() => {
    if (!cloudProjectId || hasUnsavedChanges) return
    if (!pendingRemoteSnapshot) return
    if (pendingRemoteSnapshot.projectId !== cloudProjectId) return
    applyPendingRemoteSnapshot()
  }, [applyPendingRemoteSnapshot, cloudProjectId, hasUnsavedChanges, pendingRemoteSnapshot])

  // ── Cloud image uploader ───────────────────────────────────────────────
  // Registers a function that the store can call during createCloudProjectFromLocal
  // to upload a single local inline image to cloud storage BEFORE the first
  // snapshot is committed.  This makes the local→cloud conversion transactional:
  // the initial snapshot already contains valid cloud asset IDs.
  useEffect(() => {
    async function uploadSingleShot(projectId, { shotId, sourceRef, meta }) {
      const blob = await resolveInlineImageBlob(sourceRef)
      const file = new File([blob], meta?.sourceName || `migrated-${shotId}.webp`, { type: blob.type || 'image/webp' })
      const processed = await processStoryboardUploadForCloud(file)
      const uploaded = await uploadStoryboardAssetToCloud({
        projectId,
        processed,
        createAssetUploadIntent,
        finalizeAssetUpload,
      })
      const assetId = uploaded?.imageAsset?.cloud?.assetId
      if (assetId) {
        await assignShotLibraryAsset({ projectId, shotId, assetId })
        const signedView = await getAssetSignedView({ projectId, assetId })
        return buildShotImageFromLibraryAsset(signedView) || uploaded
      }
      return uploaded
    }

    setCloudImageUploader(uploadSingleShot)
    return () => setCloudImageUploader(null)
  }, [
    assignShotLibraryAsset,
    createAssetUploadIntent,
    finalizeAssetUpload,
    getAssetSignedView,
    setCloudImageUploader,
  ])

  // ── Cloud image resolver ───────────────────────────────────────────────
  // Registers a function that saveProject / saveProjectAs call to fetch a
  // cloud asset as a base64 data URL so the local file is self-contained.
  // Only active while a cloud project is open so signed-view fetches are scoped.
  useEffect(() => {
    if (!cloudProjectId) {
      setCloudImageResolver(null)
      return
    }
    async function resolveCloudAssetDataUrl(projectId, assetId) {
      return getAssetThumbnailBase64({ projectId, assetId })
    }
    setCloudImageResolver(resolveCloudAssetDataUrl)
    return () => setCloudImageResolver(null)
  }, [cloudProjectId, getAssetThumbnailBase64, setCloudImageResolver])

  // ── Reactive local-image backfill (safety net) ─────────────────────────
  // Catches any inline images that were not uploaded during createCloudProjectFromLocal
  // (e.g. partial failure, page refresh mid-conversion, or projects converted
  // before this fix was deployed).  Idempotent: exits immediately when all shots
  // already have cloud asset IDs.
  useEffect(() => {
    if (projectRef?.type !== 'cloud' || !cloudProjectId) return
    if (!cloudAccessPolicy.canEditCloudProject || !cloudAccessPolicy.canAccessCloudAssets) return
    if (localImageBackfillInFlightRef.current) return

    const state = useStore.getState()
    const shotsToBackfill = []
    for (const scene of (state.scenes || [])) {
      for (const shot of (scene?.shots || [])) {
        const hasCloudAsset = typeof shot?.imageAsset?.cloud?.assetId === 'string' && shot.imageAsset.cloud.assetId.trim().length > 0
        if (hasCloudAsset) continue
        const sourceRef = shot?.imageAsset?.thumb || shot?.image || null
        if (!isInlineImageRef(sourceRef)) continue
        shotsToBackfill.push({ shotId: shot.id, sourceRef, meta: shot?.imageAsset?.meta || null })
      }
    }
    if (shotsToBackfill.length === 0) return

    let cancelled = false
    localImageBackfillInFlightRef.current = true

    async function backfillLocalStoryboardImages() {
      let migratedCount = 0
      for (const shot of shotsToBackfill) {
        if (cancelled) break
        try {
          let payload = localImageUploadCacheRef.current.get(shot.sourceRef) || null
          if (!payload) {
            const blob = await resolveInlineImageBlob(shot.sourceRef)
            const file = new File([blob], shot?.meta?.sourceName || `migrated-${shot.shotId}.webp`, { type: blob.type || 'image/webp' })
            const processed = await processStoryboardUploadForCloud(file)
            const uploaded = await uploadStoryboardAssetToCloud({
              projectId: cloudProjectId,
              processed,
              createAssetUploadIntent,
              finalizeAssetUpload,
            })
            const assetId = uploaded?.imageAsset?.cloud?.assetId
            if (assetId) {
              const signedView = await getAssetSignedView({
                projectId: cloudProjectId,
                assetId,
              })
              payload = buildShotImageFromLibraryAsset(signedView) || uploaded
            } else {
              payload = uploaded
            }
            localImageUploadCacheRef.current.set(shot.sourceRef, payload)
          }

          const assetId = payload?.imageAsset?.cloud?.assetId
          if (assetId) {
            await assignShotLibraryAsset({
              projectId: cloudProjectId,
              shotId: shot.shotId,
              assetId,
            })
          }
          updateShotImage(shot.shotId, payload)
          migratedCount += 1
        } catch (error) {
          if (import.meta.env.DEV) {
            // eslint-disable-next-line no-console
            console.warn('[cloud-backup] local storyboard image backfill failed', {
              shotId: shot.shotId,
              message: error?.message || 'unknown_error',
            })
          }
        }
      }
      if (migratedCount > 0 && !cancelled) {
        await useStore.getState().flushCloudSync({ reason: 'local_asset_backfill' })
      }
    }

    backfillLocalStoryboardImages().finally(() => {
      if (!cancelled) {
        localImageBackfillInFlightRef.current = false
      }
    })

    return () => {
      cancelled = true
    }
  }, [
    assignShotLibraryAsset,
    cloudAccessPolicy.canAccessCloudAssets,
    cloudAccessPolicy.canEditCloudProject,
    cloudProjectId,
    createAssetUploadIntent,
    finalizeAssetUpload,
    getAssetSignedView,
    projectRef?.type,
    updateShotImage,
  ])

  return null
}
