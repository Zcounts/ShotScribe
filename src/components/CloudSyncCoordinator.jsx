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
  const createSnapshot = useMutation('projectSnapshots:createSnapshot')
  const createAssetUploadIntent = useAction('assets:createAssetUploadIntent')
  const finalizeAssetUpload = useMutation('assets:finalizeAssetUpload')
  const assignShotLibraryAsset = useMutation('assets:assignShotLibraryAsset')
  const getAssetSignedView = useAction('assets:getAssetSignedView')
  const getAssetThumbnailBase64 = useAction('assets:getAssetThumbnailBase64')
  const cloudUser = useQuery('users:currentUser')
  const cloudProjectId = projectRef?.type === 'cloud' ? projectRef.projectId : null
  const latestSnapshot = useQuery(
    'projectSnapshots:getLatestSnapshotForProject',
    cloudProjectId ? { projectId: cloudProjectId } : 'skip',
  )
  const cloudAccessPolicy = useCloudAccessPolicy()

  // Guard so the sessionStorage restore runs at most once per mount, even if
  // the adapter effect re-fires due to dependency changes.
  const hasAttemptedRestoreRef = useRef(false)
  const localImageBackfillInFlightRef = useRef(false)
  const localImageUploadCacheRef = useRef(new Map())

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
      currentUserId: cloudUser?.user?._id ? String(cloudUser.user._id) : null,
      collaborationMode: isCloudProject && cloudAccessPolicy.canCollaborateOnCloudProject,
    })
  }, [
    cloudAccessPolicy.canCollaborateOnCloudProject,
    cloudAccessPolicy.canEditCloudProject,
    cloudUser?.user?._id,
    createSnapshot,
    projectRef?.type,
    setCloudSyncContext,
  ])

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
