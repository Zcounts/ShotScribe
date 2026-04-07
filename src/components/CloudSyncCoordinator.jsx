import { useCallback, useEffect, useRef, useState } from 'react'
import { useAction, useConvex, useConvexAuth, useMutation, useQuery } from 'convex/react'
import useStore from '../store'
import useCloudAccessPolicy from '../features/billing/useCloudAccessPolicy'
import { buildShotImageFromLibraryAsset, uploadStoryboardAssetToCloud } from '../services/assetService'
import { processStoryboardUploadForCloud } from '../utils/storyboardImagePipeline'
import { useConvexQueryDiagnosticsSafe } from '../utils/convexDiagnostics'
import { runtimeConfig } from '../config/runtimeConfig'
import { getOrCreateSignedViewsBatchRequest } from '../utils/assetSignedViewCache'
import { detectUnmigratedLocalAssetsFromProjectData } from '../utils/localAssetPreflight'
import {
  recordCollabSubscriptionSuspended,
  recordDeferredSurfaceSubscription,
  recordPresenceSubscriptionMount,
  recordSnapshotFullRead,
  recordSnapshotHeadRead,
  startSessionMetrics,
  stopSessionMetrics,
} from '../utils/sessionMetrics'

const CLOUD_PROJECT_SESSION_KEY = 'ss_active_cloud_project_id'
const INLINE_IMAGE_PREFIXES = ['data:', 'blob:', 'file:']
const ENSURE_STORYBOARD_LIVE_MODEL_COOLDOWN_MS = 2 * 60 * 1000
const SOLO_LIVE_SYNC_DEBOUNCE_MS = 1800
const COLLABORATOR_MODE_HOLD_MS = 30 * 1000
const LOCAL_TEXT_EDIT_HOT_WINDOW_MS = 900
const ensureStoryboardFailureCache = new Map()
const DIAG_LOCAL_STORAGE_KEY = 'ss_convex_diag'
const DRAFT_COMMIT_MODE = Boolean(runtimeConfig?.sync?.draftCommitModeEnabled)
const DRAFT_COMMIT_CHECKPOINT_MS = Math.max(
  60 * 1000,
  Number(runtimeConfig?.sync?.draftCommitCheckpointMinutes || 5) * 60 * 1000,
)
const DISABLE_POST_ACK_PENDING_REMOTE_APPLY = import.meta.env.DEV
const OVERWRITE_TRACE_BUFFER_KEY = '__SS_OVERWRITE_TRACE__'
const OVERWRITE_TRACE_HEAD_KEY = '__SS_TRACE_LATEST_HEAD__'
const OVERWRITE_REVERT_SEEN_KEY = '__SS_TRACE_REVERT_SEEN__'
const OVERWRITE_TRACE_EVENT_NAME = '__SS_OVERWRITE_TRACE_EVENT__'
const TRACE_EVENT_FILTER = new Set([
  'OVERWRITE_PATH_ENTER',
  'OVERWRITE_PATH_EXIT',
  'LOAD_PROJECT_ENTER',
  'LOAD_PROJECT_EXIT',
  'SHOT_IMAGE_DIFF_BEFORE_APPLY',
  'SHOT_IMAGE_DIFF_AFTER_APPLY',
  'STORYBOARD_RENDER_SOURCE',
  'SHOTCARD_IMG_MOUNT',
  'SHOTCARD_IMG_SRC_CHANGE',
  'SHOTCARD_IMG_LOAD',
  'SHOTCARD_IMG_ERROR',
  'SHOTCARD_IMG_UNMOUNT',
  'SHOTCARD_DUPLICATE_ASSET_ID_VISIBLE',
  'SHOTCARD_DUPLICATE_DISPLAY_SRC_VISIBLE',
  'SHOTCARD_VISIBLE_SNAPSHOT_SYNC_STATUS',
  'STORYBOARD_REVERT_DETECTED',
])

function normalizeEnsureErrorMessage(error) {
  const message = String(error?.message || 'unknown_error')
    .replace(/\s+/g, ' ')
    .trim()
  return message.slice(0, 220)
}

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

function normalizeLiveScenePayload(scene) {
  return {
    sceneLabel: String(scene?.sceneLabel || '').trim() || 'SCENE',
    slugline: scene?.slugline || '',
    location: scene?.location || '',
    intOrExt: scene?.intOrExt || '',
    dayNight: scene?.dayNight || '',
    color: scene?.color || undefined,
    linkedScriptSceneId: scene?.linkedScriptSceneId || undefined,
    pageNotes: Array.isArray(scene?.pageNotes) ? scene.pageNotes.map((entry) => String(entry || '')) : [''],
    pageColors: Array.isArray(scene?.pageColors) ? scene.pageColors.map((entry) => String(entry || '')) : [],
  }
}

function normalizeLiveShotPayload(shot) {
  const customFields = Object.fromEntries(
    Object.entries(shot || {}).filter(([key]) => String(key).startsWith('custom_')),
  )
  return {
    cameraName: shot?.cameraName || 'Camera 1',
    focalLength: shot?.focalLength || '',
    color: shot?.color || undefined,
    image: shot?.image || undefined,
    imageAsset: shot?.imageAsset || undefined,
    specs: shot?.specs || { size: '', type: '', move: '', equip: '' },
    notes: shot?.notes || '',
    subject: shot?.subject || '',
    description: shot?.description || '',
    cast: shot?.cast || '',
    checked: !!shot?.checked,
    intOrExt: shot?.intOrExt || '',
    dayNight: shot?.dayNight || '',
    scriptTime: shot?.scriptTime || '',
    setupTime: shot?.setupTime || '',
    shotAspectRatio: shot?.shotAspectRatio || '',
    predictedTakes: shot?.predictedTakes || '',
    shootTime: shot?.shootTime || '',
    takeNumber: shot?.takeNumber || '',
    sound: shot?.sound || '',
    props: shot?.props || '',
    frameRate: shot?.frameRate || '',
    linkedSceneId: shot?.linkedSceneId || undefined,
    linkedDialogueLine: shot?.linkedDialogueLine || undefined,
    linkedDialogueOffset: Number.isFinite(shot?.linkedDialogueOffset) ? shot.linkedDialogueOffset : undefined,
    linkedScriptRangeStart: Number.isFinite(shot?.linkedScriptRangeStart) ? shot.linkedScriptRangeStart : undefined,
    linkedScriptRangeEnd: Number.isFinite(shot?.linkedScriptRangeEnd) ? shot.linkedScriptRangeEnd : undefined,
    customFields,
  }
}

function stableStringify(value) {
  try {
    return JSON.stringify(value)
  } catch {
    return ''
  }
}

function isConvexDiagEnabled() {
  if (!import.meta.env.DEV || typeof window === 'undefined') return false
  try {
    if (window.__SS_CONVEX_DIAG__ === true) return true
    return window.localStorage?.getItem(DIAG_LOCAL_STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

function isOnlySyncEditedShotExperimentEnabled() {
  if (typeof window === 'undefined') return false
  try {
    const params = new URLSearchParams(window.location?.search || '')
    if (params.get('ssOnlySyncEditedShot') === '1') return true
    return window.localStorage?.getItem('ssOnlySyncEditedShot') === '1'
  } catch {
    return false
  }
}

function summarizeLiveShotImageFields(shot = {}) {
  const image = shot?.image || shot?.payload?.image || null
  const imageAsset = shot?.imageAsset || shot?.payload?.imageAsset || null
  const thumb = imageAsset?.thumb || null
  const assetId = imageAsset?.cloud?.assetId ? String(imageAsset.cloud.assetId) : null
  const updatedAt = shot?.updatedAt ?? shot?.payload?.updatedAt ?? null
  return { image, thumb, assetId, updatedAt }
}

function isCloudDebugEnabled() {
  if (import.meta.env.DEV) return true
  if (typeof window === 'undefined') return false
  try {
    const params = new URLSearchParams(window.location?.search || '')
    if (params.get('ssCloudDebug') === '1') return true
    return window.localStorage?.getItem('ssCloudDebug') === '1'
  } catch {
    return false
  }
}

function emitCoordinatorOverwriteTrace(event, payload = {}) {
  if (!isCloudDebugEnabled()) return
  const entry = {
    event,
    ts: new Date().toISOString(),
    ...payload,
  }
  if (typeof window !== 'undefined') {
    const list = Array.isArray(window[OVERWRITE_TRACE_BUFFER_KEY]) ? window[OVERWRITE_TRACE_BUFFER_KEY] : []
    list.push(entry)
    window[OVERWRITE_TRACE_BUFFER_KEY] = list.slice(-400)
    try {
      window.dispatchEvent(new CustomEvent(OVERWRITE_TRACE_EVENT_NAME, { detail: entry }))
    } catch {}
  }
  // eslint-disable-next-line no-console
  console.info('[OVERWRITE_TRACE]', entry)
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
  const snapshotHydrationState = useStore(s => s.snapshotHydrationState)
  const hydrateProjectSnapshot = useStore(s => s.hydrateProjectSnapshot)
  const updateShotImage = useStore(s => s.updateShotImage)
  const hasUnsavedChanges = useStore(s => s.hasUnsavedChanges)
  const lastStoryboardEditAt = useStore(s => Number(s.lastStoryboardEditAt || 0))
  const lastStoryboardEditedShotId = useStore(s => (s.lastStoryboardEditedShotId ? String(s.lastStoryboardEditedShotId) : null))
  const pendingRemoteSnapshot = useStore(s => s.pendingRemoteSnapshot)
  const applyPendingRemoteSnapshot = useStore(s => s.applyPendingRemoteSnapshot)
  const clearPendingRemoteSnapshot = useStore(s => s.clearPendingRemoteSnapshot)
  const cloudDirtyRevision = useStore(s => s._cloudDirtyRevision)
  const lastAckedSnapshotId = useStore(s => s._lastAckedSnapshotId)
  const acknowledgeCloudSnapshot = useStore(s => s.acknowledgeCloudSnapshot)
  const localAssetBackfillRequestedAt = useStore(s => Number(s.localAssetBackfillRequestedAt || 0))
  const activeTab = useStore(s => s.activeTab)
  const commitDomain = useStore(s => s.commitDomain)
  const convex = useConvex()
  const { isAuthenticated: hasConvexIdentity, isLoading: isConvexAuthLoading } = useConvexAuth()
  const createProject = useMutation('projects:createProject')
  const ensureStoryboardLiveModel = useMutation('projects:ensureStoryboardLiveModel')
  const createSnapshot = useMutation('projectSnapshots:createSnapshot')
  const commitScriptDomain = useMutation('projectSnapshots:commitScriptDomain')
  const upsertLiveScene = useMutation('projectScenesLive:upsertScene')
  const deleteLiveScene = useMutation('projectScenesLive:deleteScene')
  const upsertLiveShot = useMutation('projectShotsLive:upsertShot')
  const deleteLiveShot = useMutation('projectShotsLive:deleteShot')
  const createAssetUploadIntent = useAction('assets:createAssetUploadIntent')
  const finalizeAssetUpload = useMutation('assets:finalizeAssetUpload')
  const assignShotLibraryAsset = useMutation('assets:assignShotLibraryAsset')
  const getAssetSignedViewsBatch = useAction('assets:getAssetSignedViewsBatch')
  const getAssetThumbnailBase64 = useAction('assets:getAssetThumbnailBase64')
  const setCurrentUser = useStore(s => s.setCurrentUser)
  const setEntitlement = useStore(s => s.setEntitlement)
  const setUserDataLoaded = useStore(s => s.setUserDataLoaded)
  const cloudUser = useStore(s => s.currentUser)
  const cloudLineageLastKnownSnapshotId = useStore(s => s.cloudLineage?.lastKnownSnapshotId || null)
  const cloudProjectId = projectRef?.type === 'cloud' ? projectRef.projectId : null
  const cloudProject = useQuery('projects:getProjectById', cloudProjectId ? { projectId: cloudProjectId } : 'skip')
  const [presenceProbeHasCollaborators, setPresenceProbeHasCollaborators] = useState(false)
  const [hasActivatedLiveScenesSubscription, setHasActivatedLiveScenesSubscription] = useState(false)
  const [hasActivatedLiveShotsSubscription, setHasActivatedLiveShotsSubscription] = useState(false)
  const [soloLiveScenesSnapshot, setSoloLiveScenesSnapshot] = useState(null)
  const [soloLiveShotsSnapshot, setSoloLiveShotsSnapshot] = useState(null)
  const shouldSubscribePresence = Boolean(cloudProjectId && presenceProbeHasCollaborators)
  const presenceRows = useQuery(
    'presence:listProjectPresence',
    shouldSubscribePresence ? { projectId: cloudProjectId } : 'skip',
  )
  const shouldActivateLiveScenesNow = Boolean(
    cloudProjectId
    && Number(cloudProject?.liveModelVersion || 0) >= 1
    && ['storyboard', 'shotlist', 'script', 'scenes'].includes(String(activeTab || '')),
  )
  const shouldActivateLiveShotsNow = Boolean(
    cloudProjectId
    && Number(cloudProject?.liveModelVersion || 0) >= 1
    && ['storyboard', 'shotlist', 'script'].includes(String(activeTab || '')),
  )
  const shouldSubscribeLiveScenes = Boolean(
    presenceProbeHasCollaborators
    && (shouldActivateLiveScenesNow || hasActivatedLiveScenesSubscription),
  )
  const shouldSubscribeLiveShots = Boolean(
    presenceProbeHasCollaborators
    && (shouldActivateLiveShotsNow || hasActivatedLiveShotsSubscription),
  )
  const liveScenes = useQuery(
    'projectScenesLive:listScenesByProject',
    shouldSubscribeLiveScenes ? { projectId: cloudProjectId } : 'skip',
  )
  const liveShots = useQuery(
    'projectShotsLive:listShotsByProject',
    shouldSubscribeLiveShots ? { projectId: cloudProjectId } : 'skip',
  )
  const latestSnapshotHead = useQuery(
    'projectSnapshots:getLatestSnapshotHeadForProject',
    cloudProjectId ? { projectId: cloudProjectId } : 'skip',
  )
  useConvexQueryDiagnosticsSafe({
    component: 'CloudSyncCoordinator',
    queryName: 'projects:getProjectById',
    args: cloudProjectId ? { projectId: cloudProjectId } : 'skip',
    result: cloudProject,
    active: Boolean(cloudProjectId),
  })

  useEffect(() => {
    if (!isCloudDebugEnabled() || typeof window === 'undefined') return
    window[OVERWRITE_TRACE_HEAD_KEY] = latestSnapshotHead?.latestSnapshotId
      ? String(latestSnapshotHead.latestSnapshotId)
      : null
  }, [latestSnapshotHead?.latestSnapshotId])
  useConvexQueryDiagnosticsSafe({
    component: 'CloudSyncCoordinator',
    queryName: 'projectSnapshots:getLatestSnapshotHeadForProject',
    args: cloudProjectId ? { projectId: cloudProjectId } : 'skip',
    result: latestSnapshotHead,
    active: Boolean(cloudProjectId),
  })
  useConvexQueryDiagnosticsSafe({
    component: 'CloudSyncCoordinator',
    queryName: 'presence:listProjectPresence',
    args: shouldSubscribePresence ? { projectId: cloudProjectId } : 'skip',
    result: presenceRows,
    active: shouldSubscribePresence,
  })
  // Auth-aware user + entitlement load (one-shot reads).
  // IMPORTANT: this must wait for Convex auth to finish bootstrapping.
  // If we query too early, Convex returns unauthenticated and we would
  // incorrectly cache null currentUser for the entire session.
  useEffect(() => {
    let cancelled = false
    if (isConvexAuthLoading) {
      setUserDataLoaded(false)
      return () => {
        cancelled = true
      }
    }
    if (!hasConvexIdentity) {
      setCurrentUser(null)
      setEntitlement(null)
      setUserDataLoaded(true)
      return () => {
        cancelled = true
      }
    }

    setUserDataLoaded(false)
    Promise.all([
      convex.query('users:currentUser'),
      convex.query('billing:getMyEntitlement'),
    ])
      .then(([userResult, entitlementResult]) => {
        if (cancelled) return
        setCurrentUser(userResult)
        setEntitlement(entitlementResult)
        setUserDataLoaded(true)
      })
      .catch(() => {
        if (cancelled) return
        setCurrentUser(null)
        setEntitlement(null)
        setUserDataLoaded(true)
      })
    return () => {
      cancelled = true
    }
  }, [
    convex,
    hasConvexIdentity,
    isConvexAuthLoading,
    setCurrentUser,
    setEntitlement,
    setUserDataLoaded,
  ])

  // Interval-based entitlement re-fetch (10 min). Billing state can change
  // mid-session if the user upgrades. This is a one-shot imperative call,
  // not a live subscription, so we use convex.query() directly.
  const ENTITLEMENT_REFETCH_INTERVAL_MS = 10 * 60 * 1000
  useEffect(() => {
    const id = window.setInterval(async () => {
      try {
        const fresh = await convex.query('billing:getMyEntitlement')
        if (fresh !== undefined) setEntitlement(fresh)
      } catch {}
    }, ENTITLEMENT_REFETCH_INTERVAL_MS)
    return () => window.clearInterval(id)
  }, [convex, setEntitlement]) // eslint-disable-line react-hooks/exhaustive-deps

  // Reuse role from cloudProject query so this component does not mount a
  // duplicate projects:getProjectById subscription through useCloudAccessPolicy.
  const cloudAccessPolicy = useCloudAccessPolicy({ projectRole: cloudProject?.currentUserRole || null })
  const setLiveModelVersion = useStore(s => s.setLiveModelVersion)
  const applyLiveStoryboardState = useStore(s => s.applyLiveStoryboardState)
  const saveSyncState = useStore(s => s.saveSyncState)

  // Guard so the sessionStorage restore runs at most once per mount, even if
  // the adapter effect re-fires due to dependency changes.
  const hasAttemptedRestoreRef = useRef(false)
  const localImageBackfillInFlightRef = useRef(false)
  const localImageUploadCacheRef = useRef(new Map())
  const liveMigrationRequestedRef = useRef(new Set())
  const liveMigrationFailureRef = useRef(ensureStoryboardFailureCache)
  const fetchedRemoteSnapshotIdsRef = useRef(new Set())
  const inFlightRemoteSnapshotIdsRef = useRef(new Set())
  const liveSceneRowsRef = useRef([])
  const liveShotRowsRef = useRef([])
  const pendingLiveSyncRef = useRef(null)
  const soloLiveSyncTimerRef = useRef(null)
  const liveSyncFlushInFlightRef = useRef(false)
  const soloModeRef = useRef(false)
  const lastCollaboratorSeenAtRef = useRef(0)
  const modeLabelRef = useRef('unknown')
  const deferredLiveApplyRef = useRef(null)
  const deferredLiveApplyTimerRef = useRef(null)
  const loggedCollabSuspendedRef = useRef(false)
  const loggedDeferredScenesRef = useRef(false)
  const loggedDeferredShotsRef = useRef(false)
  const collaboratorSeenInSessionRef = useRef(false)
  const prevSyncStatusRef = useRef(null)
  const preCloudReadySnapshotRef = useRef(null)
  const [cloudDebugTraceOpen, setCloudDebugTraceOpen] = useState(false)
  const [cloudDebugTraceNotice, setCloudDebugTraceNotice] = useState('')
  const [cloudDebugTracePayload, setCloudDebugTracePayload] = useState(null)
  const [copyTraceStatus, setCopyTraceStatus] = useState('')
  const [visibleShotCardSyncSnapshot, setVisibleShotCardSyncSnapshot] = useState(null)

  const captureFocusedOverwriteTrace = useCallback((triggerEntry = null) => {
    if (typeof window === 'undefined') return []
    const rows = Array.isArray(window[OVERWRITE_TRACE_BUFFER_KEY]) ? window[OVERWRITE_TRACE_BUFFER_KEY] : []
    const focused = rows
      .filter((entry) => TRACE_EVENT_FILTER.has(String(entry?.event || '')))
      .slice(-50)
      .map((entry, idx) => ({
        seq: idx + 1,
        ts: entry?.ts || null,
        event: entry?.event || null,
        sourceLabel: entry?.sourceLabel || null,
        functionName: entry?.functionName || null,
        projectId: entry?.projectId || null,
        snapshotId: entry?.snapshotId || entry?.incomingSnapshotId || null,
        cloudDirtyRevision: entry?.cloudDirtyRevision ?? null,
        lastAckedSnapshotId: entry?.lastAckedSnapshotId || null,
        latestSnapshotHeadId: entry?.latestSnapshotHeadId || null,
        pendingRemoteSnapshotId: entry?.pendingRemoteSnapshotId || null,
        imageChangedShotIds: entry?.imageChangedShotIds || [],
        imageAssetChangedShotIds: entry?.imageAssetChangedShotIds || [],
        potentialRegressionShotIds: entry?.potentialRegressionShotIds || [],
        thumbSamples: entry?.thumbSamples || [],
      }))
    const triggerShotIds = new Set([
      ...(triggerEntry?.changedShotIds || []),
      ...(triggerEntry?.potentialRegressionShotIds || []),
    ].map((value) => String(value || '')).filter(Boolean))
    if (!triggerShotIds.size) {
      return {
        focused,
        triggerShotIds: [],
        relatedRenderLifecycleEvents: [],
      }
    }
    const renderLifecycleEvents = new Set([
      'STORYBOARD_RENDER_SOURCE',
      'SHOTCARD_IMG_MOUNT',
      'SHOTCARD_IMG_SRC_CHANGE',
      'SHOTCARD_IMG_LOAD',
      'SHOTCARD_IMG_ERROR',
      'SHOTCARD_IMG_UNMOUNT',
    ])
    const related = rows
      .filter((entry) => renderLifecycleEvents.has(String(entry?.event || '')))
      .filter((entry) => triggerShotIds.has(String(entry?.shotId || '')))
      .slice(-20)
      .map((entry, idx) => ({
        seq: idx + 1,
        ts: entry?.ts || null,
        event: entry?.event || null,
        shotId: entry?.shotId ? String(entry.shotId) : null,
        reactKey: entry?.reactKey || null,
        sceneId: entry?.sceneId || null,
        sourceReason: entry?.sourceReason || null,
        finalDisplaySrc: entry?.finalDisplaySrc || null,
        currentSrc: entry?.currentSrc || entry?.nextCurrentSrc || null,
        imgSrc: entry?.imgSrc || entry?.nextImgSrc || null,
        loadState: entry?.loadState || null,
        prevSourceReason: entry?.prevSourceReason || null,
        nextSourceReason: entry?.nextSourceReason || null,
        prevFinalDisplaySrc: entry?.prevFinalDisplaySrc || null,
        nextFinalDisplaySrc: entry?.nextFinalDisplaySrc || null,
        prevCurrentSrc: entry?.prevCurrentSrc || null,
        nextCurrentSrc: entry?.nextCurrentSrc || null,
        prevImgSrc: entry?.prevImgSrc || null,
        nextImgSrc: entry?.nextImgSrc || null,
        prevAssetId: entry?.prevAssetId || null,
        nextAssetId: entry?.nextAssetId || entry?.assetId || null,
        assetIdChanged: entry?.assetIdChanged ?? null,
        finalDisplaySrcChanged: entry?.finalDisplaySrcChanged ?? null,
        domNodeIdentityChanged: entry?.domNodeIdentityChanged ?? null,
        domNodeId: entry?.domNodeId || entry?.nextDomNodeId || null,
        signedUrlChurnOnly: entry?.signedUrlChurnOnly ?? null,
      }))
    return {
      focused,
      triggerShotIds: Array.from(triggerShotIds),
      relatedRenderLifecycleEvents: related,
    }
  }, [])

  const captureVisibleShotCardsSnapshot = useCallback((label) => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return []
    const nodes = Array.from(document.querySelectorAll('.shot-card[data-entity-type="shot"]'))
    const viewportHeight = window.innerHeight || 0
    const rows = nodes.map((node) => {
      const rect = node.getBoundingClientRect()
      const isVisible = rect.width > 0
        && rect.height > 0
        && rect.bottom >= 0
        && rect.top <= viewportHeight
      if (!isVisible) return null
      const shotId = String(node.getAttribute('data-entity-id') || '')
      const img = node.querySelector('.image-placeholder img')
      return {
        shotId: shotId || null,
        reactKey: node.getAttribute('data-debug-react-key') || null,
        sceneId: node.getAttribute('data-debug-scene-id') || null,
        assetId: node.getAttribute('data-debug-asset-id') || null,
        sourceReason: node.getAttribute('data-debug-source-reason') || null,
        finalDisplaySrc: node.getAttribute('data-debug-final-display-src') || null,
        currentSrc: node.getAttribute('data-debug-current-src') || null,
        loadState: node.getAttribute('data-debug-load-state') || null,
        imgSrc: img?.src || null,
        imageComplete: img ? Boolean(img.complete) : false,
        naturalWidth: img?.naturalWidth ?? null,
        naturalHeight: img?.naturalHeight ?? null,
        rect: { top: Math.round(rect.top), left: Math.round(rect.left), width: Math.round(rect.width), height: Math.round(rect.height) },
      }
    }).filter(Boolean)
    emitCoordinatorOverwriteTrace('SHOTCARD_VISIBLE_SNAPSHOT_SYNC_STATUS', {
      sourceLabel: 'sync_status_transition',
      functionName: 'CloudSyncCoordinator:captureVisibleShotCardsSnapshot',
      snapshotLabel: label,
      syncStatus: saveSyncState?.status || null,
      visibleCards: rows,
    })
    return rows
  }, [saveSyncState?.status])

  const emitVisibleDuplicateWarnings = useCallback((rows = []) => {
    if (!Array.isArray(rows) || rows.length < 2) return
    const byAssetId = new Map()
    const byDisplaySrc = new Map()
    rows.forEach((row) => {
      const shotId = String(row?.shotId || '')
      const assetId = String(row?.assetId || '')
      const finalDisplaySrc = String(row?.finalDisplaySrc || '')
      if (shotId && assetId && assetId !== '—') {
        const list = byAssetId.get(assetId) || []
        list.push(shotId)
        byAssetId.set(assetId, list)
      }
      if (shotId && finalDisplaySrc && finalDisplaySrc !== '—') {
        const list = byDisplaySrc.get(finalDisplaySrc) || []
        list.push(shotId)
        byDisplaySrc.set(finalDisplaySrc, list)
      }
    })
    byAssetId.forEach((shotIds, assetId) => {
      if (shotIds.length < 2) return
      emitCoordinatorOverwriteTrace('SHOTCARD_DUPLICATE_ASSET_ID_VISIBLE', {
        sourceLabel: 'visible_shotcard_scan',
        functionName: 'CloudSyncCoordinator:emitVisibleDuplicateWarnings',
        assetId,
        shotIds,
      })
    })
    byDisplaySrc.forEach((shotIds, finalDisplaySrc) => {
      if (shotIds.length < 2) return
      emitCoordinatorOverwriteTrace('SHOTCARD_DUPLICATE_DISPLAY_SRC_VISIBLE', {
        sourceLabel: 'visible_shotcard_scan',
        functionName: 'CloudSyncCoordinator:emitVisibleDuplicateWarnings',
        finalDisplaySrc,
        shotIds,
      })
    })
  }, [])

  useEffect(() => {
    if (!isCloudDebugEnabled()) return
    const rows = captureVisibleShotCardsSnapshot('periodic_scan')
    emitVisibleDuplicateWarnings(rows)
    const id = window.setInterval(() => {
      const nextRows = captureVisibleShotCardsSnapshot('periodic_scan')
      emitVisibleDuplicateWarnings(nextRows)
    }, 2500)
    return () => window.clearInterval(id)
  }, [captureVisibleShotCardsSnapshot, emitVisibleDuplicateWarnings])

  useEffect(() => {
    if (!isCloudDebugEnabled()) return
    const prevStatus = String(prevSyncStatusRef.current || '')
    const nextStatus = String(saveSyncState?.status || '')
    if (prevStatus !== 'syncing_to_cloud' && nextStatus === 'syncing_to_cloud') {
      preCloudReadySnapshotRef.current = captureVisibleShotCardsSnapshot('before_cloud_backup_ready')
    }
    if (prevStatus === 'syncing_to_cloud' && nextStatus === 'synced_to_cloud') {
      const beforeRows = preCloudReadySnapshotRef.current || captureVisibleShotCardsSnapshot('before_cloud_backup_ready_fallback')
      const afterRows = captureVisibleShotCardsSnapshot('after_cloud_backup_ready')
      emitVisibleDuplicateWarnings(afterRows)
      setVisibleShotCardSyncSnapshot({
        capturedAt: new Date().toISOString(),
        transition: `${prevStatus} -> ${nextStatus}`,
        before: beforeRows,
        after: afterRows,
      })
    }
    prevSyncStatusRef.current = nextStatus
  }, [captureVisibleShotCardsSnapshot, emitVisibleDuplicateWarnings, saveSyncState?.status])

  useEffect(() => {
    if (!isCloudDebugEnabled() || typeof window === 'undefined') return
    const onTrace = (event) => {
      const entry = event?.detail || null
      if (!entry || entry.event !== 'STORYBOARD_REVERT_DETECTED') return
      const focused = captureFocusedOverwriteTrace(entry)
      setCloudDebugTracePayload({
        capturedAt: new Date().toISOString(),
        trigger: entry,
        focusedTrace: focused,
      })
      setCloudDebugTraceNotice('Storyboard revert detected. Debug trace captured.')
      setCloudDebugTraceOpen(true)
    }
    window.addEventListener(OVERWRITE_TRACE_EVENT_NAME, onTrace)
    return () => window.removeEventListener(OVERWRITE_TRACE_EVENT_NAME, onTrace)
  }, [captureFocusedOverwriteTrace])

  useEffect(() => {
    if (!isCloudDebugEnabled() || typeof window === 'undefined') return
    window.__SS_OPEN_CLOUD_DEBUG_TRACE__ = () => {
      setCloudDebugTracePayload((prev) => {
        if (prev) return prev
        return {
          capturedAt: new Date().toISOString(),
          trigger: { event: 'MANUAL_OPEN' },
          focusedTrace: captureFocusedOverwriteTrace(),
        }
      })
      setCloudDebugTraceOpen(true)
    }
    return () => {
      try { delete window.__SS_OPEN_CLOUD_DEBUG_TRACE__ } catch {}
    }
  }, [captureFocusedOverwriteTrace])

  const handleCopyCloudTrace = useCallback(async () => {
    if (!cloudDebugTracePayload) return
    const text = JSON.stringify(cloudDebugTracePayload, null, 2)
    try {
      await navigator.clipboard.writeText(text)
      setCopyTraceStatus('Trace copied.')
    } catch {
      setCopyTraceStatus('Copy failed. Select and copy manually.')
    }
  }, [cloudDebugTracePayload])

  const handleClearCloudTrace = useCallback(() => {
    if (typeof window !== 'undefined') {
      window[OVERWRITE_TRACE_BUFFER_KEY] = []
      window[OVERWRITE_REVERT_SEEN_KEY] = new Set()
    }
    setCloudDebugTracePayload(null)
    setVisibleShotCardSyncSnapshot(null)
    setCloudDebugTraceNotice('Cloud debug trace cleared.')
    setCopyTraceStatus('')
  }, [])
  const getSignedViewWithCache = useCallback(async (projectId, assetId) => {
    if (!projectId || !assetId) return null
    const batch = await getOrCreateSignedViewsBatchRequest({
      projectId,
      assetIds: [assetId],
      fetcher: (missingAssetIds) => getAssetSignedViewsBatch({
        projectId,
        assetIds: missingAssetIds,
      }),
    })
    return batch?.[String(assetId)] || null
  }, [getAssetSignedViewsBatch])

  useEffect(() => {
    fetchedRemoteSnapshotIdsRef.current.clear()
    inFlightRemoteSnapshotIdsRef.current.clear()
    pendingLiveSyncRef.current = null
    deferredLiveApplyRef.current = null
    if (soloLiveSyncTimerRef.current) {
      window.clearTimeout(soloLiveSyncTimerRef.current)
      soloLiveSyncTimerRef.current = null
    }
    if (deferredLiveApplyTimerRef.current) {
      window.clearTimeout(deferredLiveApplyTimerRef.current)
      deferredLiveApplyTimerRef.current = null
    }
    loggedCollabSuspendedRef.current = false
    loggedDeferredScenesRef.current = false
    loggedDeferredShotsRef.current = false
    collaboratorSeenInSessionRef.current = false
    setPresenceProbeHasCollaborators(false)
    setHasActivatedLiveScenesSubscription(false)
    setHasActivatedLiveShotsSubscription(false)
    setSoloLiveScenesSnapshot(null)
    setSoloLiveShotsSnapshot(null)
  }, [cloudProjectId])

  useEffect(() => {
    if (Array.isArray(liveScenes)) {
      liveSceneRowsRef.current = liveScenes
      return
    }
    liveSceneRowsRef.current = Array.isArray(soloLiveScenesSnapshot) ? soloLiveScenesSnapshot : []
  }, [liveScenes, soloLiveScenesSnapshot])

  useEffect(() => {
    if (Array.isArray(liveShots)) {
      liveShotRowsRef.current = liveShots
      return
    }
    liveShotRowsRef.current = Array.isArray(soloLiveShotsSnapshot) ? soloLiveShotsSnapshot : []
  }, [liveShots, soloLiveShotsSnapshot])

  useEffect(() => {
    if (!cloudProjectId) return
    if (Number(cloudProject?.liveModelVersion || 0) < 1) return
    if (shouldSubscribeLiveScenes || shouldSubscribeLiveShots) return
    let cancelled = false
    Promise.all([
      convex.query('projectScenesLive:listScenesByProject', { projectId: cloudProjectId }),
      convex.query('projectShotsLive:listShotsByProject', { projectId: cloudProjectId }),
    ])
      .then(([sceneRows, shotRows]) => {
        if (cancelled) return
        setSoloLiveScenesSnapshot(Array.isArray(sceneRows) ? sceneRows : [])
        setSoloLiveShotsSnapshot(Array.isArray(shotRows) ? shotRows : [])
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [cloudProject?.liveModelVersion, cloudProjectId, convex, shouldSubscribeLiveScenes, shouldSubscribeLiveShots])

  useEffect(() => {
    if (!cloudProjectId) return
    if (shouldActivateLiveScenesNow && !hasActivatedLiveScenesSubscription) {
      setHasActivatedLiveScenesSubscription(true)
    }
  }, [cloudProjectId, hasActivatedLiveScenesSubscription, shouldActivateLiveScenesNow])

  useEffect(() => {
    if (!cloudProjectId) return
    if (shouldActivateLiveShotsNow && !hasActivatedLiveShotsSubscription) {
      setHasActivatedLiveShotsSubscription(true)
    }
  }, [cloudProjectId, hasActivatedLiveShotsSubscription, shouldActivateLiveShotsNow])

  useEffect(() => {
    if (!cloudProjectId) return
    if (hasActivatedLiveScenesSubscription) return
    if (shouldActivateLiveScenesNow) return
    if (loggedDeferredScenesRef.current) return
    loggedDeferredScenesRef.current = true
    recordDeferredSurfaceSubscription()
  }, [cloudProjectId, hasActivatedLiveScenesSubscription, shouldActivateLiveScenesNow])

  useEffect(() => {
    if (!cloudProjectId) return
    if (hasActivatedLiveShotsSubscription) return
    if (shouldActivateLiveShotsNow) return
    if (loggedDeferredShotsRef.current) return
    loggedDeferredShotsRef.current = true
    recordDeferredSurfaceSubscription()
  }, [cloudProjectId, hasActivatedLiveShotsSubscription, shouldActivateLiveShotsNow])

  const currentUserId = cloudUser?.user?._id ? String(cloudUser.user._id) : null
  const otherCollaboratorCount = Array.isArray(presenceRows)
    ? presenceRows.filter((row) => String(row?.userId || '') !== String(currentUserId || '')).length
    : null
  const hasOtherCollaborators = Number(otherCollaboratorCount || 0) > 0
  useEffect(() => {
    if (hasOtherCollaborators) {
      lastCollaboratorSeenAtRef.current = Date.now()
      collaboratorSeenInSessionRef.current = true
      if (!presenceProbeHasCollaborators) setPresenceProbeHasCollaborators(true)
    }
  }, [hasOtherCollaborators, presenceProbeHasCollaborators])
  const heldCollaboratorMode = (Date.now() - Number(lastCollaboratorSeenAtRef.current || 0)) < COLLABORATOR_MODE_HOLD_MS
  const isSoloMode = Boolean(
    cloudProjectId
    && cloudAccessPolicy.canCollaborateOnCloudProject
    && !hasOtherCollaborators
    && !heldCollaboratorMode,
  )
  useEffect(() => {
    soloModeRef.current = isSoloMode
  }, [isSoloMode])
  useEffect(() => {
    if (!cloudProjectId) return
    if (!presenceProbeHasCollaborators && !loggedCollabSuspendedRef.current) {
      recordCollabSubscriptionSuspended()
      loggedCollabSuspendedRef.current = true
    }
    if (presenceProbeHasCollaborators) {
      loggedCollabSuspendedRef.current = false
    }
  }, [cloudProjectId, presenceProbeHasCollaborators])

  useEffect(() => {
    if (!shouldSubscribePresence) return
    recordPresenceSubscriptionMount()
  }, [shouldSubscribePresence])

  useEffect(() => {
    if (!cloudProjectId) return undefined
    if (presenceProbeHasCollaborators) return undefined
    let cancelled = false
    const openedAt = Date.now()
    let timer = null

    const scheduleNext = (delayMs) => {
      if (cancelled) return
      timer = window.setTimeout(pollPresence, Math.max(1000, Number(delayMs) || 1000))
    }

    const pollPresence = () => {
      if (cancelled) return
      const elapsed = Date.now() - openedAt
      if (elapsed < 30000) {
        scheduleNext(30000 - elapsed)
        return
      }
      convex.query('presence:getPresenceProbe', { projectId: cloudProjectId })
        .then((probe) => {
          if (cancelled) return
          const hasOthers = Boolean(probe?.hasCollaborators)
          if (hasOthers) {
            collaboratorSeenInSessionRef.current = true
            setPresenceProbeHasCollaborators(true)
          }
        })
        .catch(() => {})
        .finally(() => {
          if (cancelled || presenceProbeHasCollaborators) return
          const delay = collaboratorSeenInSessionRef.current ? 30000 : 60000
          scheduleNext(delay)
        })
    }
    scheduleNext(30000)
    return () => {
      cancelled = true
      if (timer) window.clearTimeout(timer)
    }
  }, [cloudProjectId, convex, presenceProbeHasCollaborators])

  useEffect(() => {
    if (!presenceProbeHasCollaborators) return
    if (hasOtherCollaborators || heldCollaboratorMode) return
    setPresenceProbeHasCollaborators(false)
  }, [hasOtherCollaborators, heldCollaboratorMode, presenceProbeHasCollaborators])
  useEffect(() => {
    const nextLabel = isSoloMode ? 'solo' : 'collaborative'
    if (modeLabelRef.current === nextLabel) return
    if (isConvexDiagEnabled()) {
      // eslint-disable-next-line no-console
      console.debug('[cloud-sync] live sync mode switched', {
        projectId: String(cloudProjectId || ''),
        mode: nextLabel,
        otherCollaboratorCount: Number(otherCollaboratorCount || 0),
        heldCollaboratorMode,
      })
    }
    modeLabelRef.current = nextLabel
  }, [cloudProjectId, heldCollaboratorMode, isSoloMode, otherCollaboratorCount])

  const getVisibleShotIdsSharingAsset = useCallback((assetId, excludeShotId = null) => {
    if (!assetId || typeof document === 'undefined' || typeof window === 'undefined') return []
    const viewportHeight = window.innerHeight || 0
    return Array.from(document.querySelectorAll('.shot-card[data-entity-type="shot"]'))
      .filter((node) => {
        const rect = node.getBoundingClientRect()
        return rect.width > 0 && rect.height > 0 && rect.bottom >= 0 && rect.top <= viewportHeight
      })
      .filter((node) => String(node.getAttribute('data-debug-asset-id') || '') === String(assetId))
      .map((node) => String(node.getAttribute('data-entity-id') || ''))
      .filter((id) => id && id !== String(excludeShotId || ''))
  }, [])

  const applyLiveStoryboardSync = useCallback(async ({ projectId, scenes, storyboardSceneOrder }) => {
    const existingScenes = Array.isArray(liveSceneRowsRef.current) && liveSceneRowsRef.current.length > 0
      ? liveSceneRowsRef.current
      : await convex.query('projectScenesLive:listScenesByProject', { projectId })
    const existingShots = Array.isArray(liveShotRowsRef.current) && liveShotRowsRef.current.length > 0
      ? liveShotRowsRef.current
      : await convex.query('projectShotsLive:listShotsByProject', { projectId })
    const sceneOrder = Array.isArray(storyboardSceneOrder) && storyboardSceneOrder.length > 0
      ? storyboardSceneOrder
      : (scenes || []).map((scene) => scene.id)
    const orderBySceneId = new Map(sceneOrder.map((id, index) => [String(id), index]))
    const existingScenesById = new Map((existingScenes || []).map((scene) => [String(scene.sceneId), scene]))
    const existingShotsById = new Map((existingShots || []).map((shot) => [String(shot.shotId), shot]))
    const nextSceneIds = new Set()
    const nextShotIds = new Set()
    const ops = {
      upsertScenes: 0,
      skipScenes: 0,
      upsertShots: 0,
      skipShots: 0,
      deleteScenes: 0,
      deleteShots: 0,
    }
    const cycleId = `live-sync-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`
    const onlySyncEditedShotEnabled = isOnlySyncEditedShotExperimentEnabled()
    const isImmediateEditedShotCycle = Boolean(lastStoryboardEditedShotId) && (Date.now() - Number(lastStoryboardEditAt || 0) < 15_000)
    const experimentTargetShotId = onlySyncEditedShotEnabled && isImmediateEditedShotCycle ? String(lastStoryboardEditedShotId) : null

    for (const scene of (scenes || [])) {
      const sceneId = String(scene.id)
      nextSceneIds.add(sceneId)
      const nextOrder = orderBySceneId.has(sceneId) ? orderBySceneId.get(sceneId) : Number.MAX_SAFE_INTEGER
      const nextPayload = normalizeLiveScenePayload(scene)
      const existingScene = existingScenesById.get(sceneId)
      const shouldUpsertScene = !existingScene
        || Number(existingScene.order) !== Number(nextOrder)
        || stableStringify(normalizeLiveScenePayload(existingScene)) !== stableStringify(nextPayload)
      if (shouldUpsertScene) {
        await upsertLiveScene({
          projectId,
          sceneId,
          order: nextOrder,
          payload: scene,
        })
        ops.upsertScenes += 1
      } else {
        ops.skipScenes += 1
      }
      for (const [index, shot] of (scene.shots || []).entries()) {
        const shotId = String(shot.id)
        nextShotIds.add(shotId)
        const nextShotPayload = normalizeLiveShotPayload(shot)
        const existingShot = existingShotsById.get(shotId)
        const oldShotPayload = existingShot ? normalizeLiveShotPayload(existingShot) : null
        const reasonList = []
        if (!existingShot) reasonList.push('new_shot')
        if (existingShot && String(existingShot.sceneId || '') !== sceneId) reasonList.push('scene_changed')
        if (existingShot && Number(existingShot.order) !== Number(index)) reasonList.push('order_changed')
        const payloadChanged = !existingShot || stableStringify(oldShotPayload) !== stableStringify(nextShotPayload)
        if (payloadChanged) reasonList.push('payload_changed')
        const oldImageSummary = summarizeLiveShotImageFields(existingShot || {})
        const newImageSummary = summarizeLiveShotImageFields(shot || nextShotPayload || {})
        const stableAssetIdChanged = oldImageSummary.assetId !== newImageSummary.assetId
        const signedUrlOnlyChanged = !stableAssetIdChanged
          && (oldImageSummary.image !== newImageSummary.image || oldImageSummary.thumb !== newImageSummary.thumb)
        const semanticChanged = reasonList.length > 0
        const isOriginallyEditedShot = Boolean(experimentTargetShotId) && shotId === experimentTargetShotId
        const blockedByExperiment = Boolean(experimentTargetShotId) && !isOriginallyEditedShot
        if (isCloudDebugEnabled()) {
          const willWrite = semanticChanged && !blockedByExperiment
          // eslint-disable-next-line no-console
          console.info('[SHOT_REORDER_AUDIT]', {
            phase: 'persistence_step',
            cycleId,
            shotId,
            sceneId,
            reasonList,
            oldPersistedOrder: existingShot ? Number(existingShot.order) : null,
            newPersistedOrder: Number(index),
            semanticChanged,
            willIssueLiveWrite: willWrite,
          })
        }
        if (isCloudDebugEnabled()) {
          // eslint-disable-next-line no-console
          console.info('[LIVE_SHOT_SYNC_AUDIT]', {
            phase: 'evaluate_shot',
            cycleId,
            ts: new Date().toISOString(),
            sceneId,
            shotId,
            semanticChanged,
            reasonList,
            signedUrlOnlyChanged,
            stableAssetIdChanged,
            isOriginallyEditedShot,
            willUpsertLiveShot: semanticChanged && !blockedByExperiment,
            blockedByExperiment,
            experimentTargetShotId,
            oldImageSummary,
            newImageSummary,
          })
        }
        if (!semanticChanged) {
          ops.skipShots += 1
          continue
        }
        if (blockedByExperiment) {
          ops.skipShots += 1
          if (isCloudDebugEnabled()) {
            // eslint-disable-next-line no-console
            console.info('[LIVE_SHOT_SYNC_AUDIT]', {
              phase: 'skip_by_experiment',
              cycleId,
              ts: new Date().toISOString(),
              sceneId,
              shotId,
              experimentTargetShotId,
            })
          }
          continue
        }
        await upsertLiveShot({
          projectId,
          sceneId,
          shotId,
          order: index,
          payload: shot,
        })
        if (isCloudDebugEnabled()) {
          // eslint-disable-next-line no-console
          console.info('[LIVE_SHOT_SYNC_AUDIT]', {
            phase: 'upsert_live_shot',
            cycleId,
            ts: new Date().toISOString(),
            sceneId,
            shotId,
            stableAssetIdChanged,
            signedUrlOnlyChanged,
            reasonList,
          })
        }
        ops.upsertShots += 1
      }
    }

    await Promise.all(
      (existingScenes || [])
        .filter((scene) => !nextSceneIds.has(String(scene.sceneId)))
        .map((scene) => {
          ops.deleteScenes += 1
          return deleteLiveScene({ projectId, sceneId: String(scene.sceneId) })
        }),
    )
    await Promise.all(
      (existingShots || [])
        .filter((shot) => !nextShotIds.has(String(shot.shotId)))
        .map((shot) => {
          ops.deleteShots += 1
          return deleteLiveShot({ projectId, shotId: String(shot.shotId) })
        }),
    )

    if (isConvexDiagEnabled()) {
      // eslint-disable-next-line no-console
      console.debug('[cloud-sync] live storyboard sync ops', {
        projectId: String(projectId),
        soloMode: soloModeRef.current,
        ...ops,
      })
    }
  }, [convex, deleteLiveScene, deleteLiveShot, lastStoryboardEditAt, lastStoryboardEditedShotId, upsertLiveScene, upsertLiveShot])

  const flushPendingLiveStoryboardSync = useCallback(async ({ force = false } = {}) => {
    if (soloLiveSyncTimerRef.current) {
      window.clearTimeout(soloLiveSyncTimerRef.current)
      soloLiveSyncTimerRef.current = null
    }
    if (liveSyncFlushInFlightRef.current) return
    const pending = pendingLiveSyncRef.current
    if (!pending) return
    if (!force && soloModeRef.current && Date.now() - Number(pending.enqueuedAt || 0) < SOLO_LIVE_SYNC_DEBOUNCE_MS) return
    liveSyncFlushInFlightRef.current = true
    try {
      pendingLiveSyncRef.current = null
      await applyLiveStoryboardSync(pending)
      // In solo mode the Convex live-query subscription is inactive, so
      // soloLiveShotsSnapshot is never automatically refreshed after a write.
      // Re-fetch now so the deferred apply has the authoritative persisted order
      // instead of the stale snapshot from initial load.
      if (soloModeRef.current && cloudProjectId) {
        const [sceneRows, shotRows] = await Promise.all([
          convex.query('projectScenesLive:listScenesByProject', { projectId: cloudProjectId }),
          convex.query('projectShotsLive:listShotsByProject', { projectId: cloudProjectId }),
        ])
        if (Array.isArray(sceneRows)) setSoloLiveScenesSnapshot(sceneRows)
        if (Array.isArray(shotRows)) setSoloLiveShotsSnapshot(shotRows)
      }
    } catch (error) {
      pendingLiveSyncRef.current = pending
      if (isConvexDiagEnabled()) {
        // eslint-disable-next-line no-console
        console.warn('[cloud-sync] solo live sync flush failed', {
          projectId: String(pending?.projectId || ''),
          message: error?.message || 'unknown_error',
        })
      }
    } finally {
      liveSyncFlushInFlightRef.current = false
    }
  }, [applyLiveStoryboardSync, cloudProjectId, convex, setSoloLiveScenesSnapshot, setSoloLiveShotsSnapshot])

  const applyDeferredLiveStoryboardState = useCallback(() => {
    if (!deferredLiveApplyRef.current) return
    const now = Date.now()
    const msSinceLocalStoryboardEdit = now - Number(useStore.getState().lastStoryboardEditAt || 0)
    if (useStore.getState().hasUnsavedChanges || msSinceLocalStoryboardEdit < LOCAL_TEXT_EDIT_HOT_WINDOW_MS) {
      const waitMs = Math.max(120, LOCAL_TEXT_EDIT_HOT_WINDOW_MS - msSinceLocalStoryboardEdit + 40)
      if (deferredLiveApplyTimerRef.current) window.clearTimeout(deferredLiveApplyTimerRef.current)
      deferredLiveApplyTimerRef.current = window.setTimeout(() => {
        applyDeferredLiveStoryboardState()
      }, waitMs)
      return
    }
    const payload = deferredLiveApplyRef.current
    deferredLiveApplyRef.current = null
    if (deferredLiveApplyTimerRef.current) {
      window.clearTimeout(deferredLiveApplyTimerRef.current)
      deferredLiveApplyTimerRef.current = null
    }
    applyLiveStoryboardState(payload, { sourceLabel: 'live_storyboard_deferred_apply' })
    if (isConvexDiagEnabled()) {
      // eslint-disable-next-line no-console
      console.debug('[cloud-sync] replayed deferred live storyboard apply', {
        projectId: String(cloudProjectId || ''),
        sceneCount: Array.isArray(payload?.scenes) ? payload.scenes.length : 0,
        shotCount: Array.isArray(payload?.shots) ? payload.shots.length : 0,
      })
    }
  }, [applyLiveStoryboardState, cloudProjectId])

  const detectUnmigratedLocalAssets = useCallback(() => {
    const state = useStore.getState()
    return detectUnmigratedLocalAssetsFromProjectData({
      scenes: state.scenes || [],
      projectHeroImage: state.projectHeroImage || null,
    })
  }, [])

  useEffect(() => {
    startSessionMetrics()
    return () => stopSessionMetrics()
  }, [])

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

  // Trigger deferred snapshot hydration as soon as the cloud adapter is ready
  // and openCloudProject has set snapshotHydrationState to 'deferred'.
  // This fires in the background immediately after project open — the UI is
  // already responsive from the metadata-only open, and surface data arrives
  // as the snapshot resolves (~200–500ms later).
  useEffect(() => {
    if (snapshotHydrationState?.status !== 'deferred') return
    if (!cloudProjectId) return
    emitCoordinatorOverwriteTrace('OVERWRITE_PATH_ENTER', {
      sourceLabel: 'hydrate_project_snapshot',
      functionName: 'CloudSyncCoordinator:hydrate-trigger',
      projectId: cloudProjectId,
      latestSnapshotHeadId: latestSnapshotHead?.latestSnapshotId ? String(latestSnapshotHead.latestSnapshotId) : null,
    })
    hydrateProjectSnapshot().catch((err) => {
      if (import.meta.env.DEV) {
        // eslint-disable-next-line no-console
        console.warn('[cloud-sync] snapshot hydration failed', {
          projectId: String(cloudProjectId || ''),
          message: err?.message || 'unknown_error',
        })
      }
    })
  }, [cloudProjectId, hydrateProjectSnapshot, latestSnapshotHead?.latestSnapshotId, snapshotHydrationState?.status])

  useEffect(() => {
    const isCloudProject = projectRef?.type === 'cloud'
    setCloudSyncContext({
      canSync: isCloudProject && cloudAccessPolicy.canEditCloudProject,
      cloudWritesEnabled: cloudAccessPolicy.canEditCloudProject,
      runSnapshotMutation: createSnapshot,
      runScriptDomainMutation: commitScriptDomain,
      syncLiveStoryboardState: async ({ projectId, scenes, storyboardSceneOrder }) => {
        const payload = {
          projectId,
          scenes: scenes || [],
          storyboardSceneOrder: storyboardSceneOrder || [],
          enqueuedAt: Date.now(),
        }
        if (!soloModeRef.current) {
          pendingLiveSyncRef.current = null
          await applyLiveStoryboardSync(payload)
          return
        }
        pendingLiveSyncRef.current = payload
        if (soloLiveSyncTimerRef.current) window.clearTimeout(soloLiveSyncTimerRef.current)
        soloLiveSyncTimerRef.current = window.setTimeout(() => {
          flushPendingLiveStoryboardSync({ force: true })
        }, SOLO_LIVE_SYNC_DEBOUNCE_MS)
      },
      flushLiveStoryboardSync: () => flushPendingLiveStoryboardSync({ force: true }),
      currentUserId,
      collaborationMode: isCloudProject && cloudAccessPolicy.canCollaborateOnCloudProject,
      hasActiveCollaborators: hasOtherCollaborators,
    })
  }, [
    applyLiveStoryboardSync,
    cloudAccessPolicy.canCollaborateOnCloudProject,
    cloudAccessPolicy.canEditCloudProject,
    currentUserId,
    commitScriptDomain,
    createSnapshot,
    flushPendingLiveStoryboardSync,
    hasOtherCollaborators,
    projectRef?.type,
    setCloudSyncContext,
  ])

  useEffect(() => {
    if (!cloudProjectId) return
    if (otherCollaboratorCount == null) return
    if (otherCollaboratorCount <= 0) return
    flushPendingLiveStoryboardSync({ force: true })
    if (DRAFT_COMMIT_MODE) {
      commitDomain('storyboard', { reason: 'collaborator_join' })
        .finally(() => flushCloudSync({ reason: 'collaborator_join' }))
    }
  }, [cloudProjectId, commitDomain, flushCloudSync, flushPendingLiveStoryboardSync, otherCollaboratorCount])

  useEffect(() => {
    return () => {
      if (soloLiveSyncTimerRef.current) {
        window.clearTimeout(soloLiveSyncTimerRef.current)
        soloLiveSyncTimerRef.current = null
      }
      pendingLiveSyncRef.current = null
      deferredLiveApplyRef.current = null
      if (deferredLiveApplyTimerRef.current) {
        window.clearTimeout(deferredLiveApplyTimerRef.current)
        deferredLiveApplyTimerRef.current = null
      }
    }
  }, [])

  useEffect(() => {
    if (!cloudProjectId || !cloudProject) return
    const nextVersion = Number(cloudProject.liveModelVersion || 0)
    const canEditCloudProject = Boolean(cloudAccessPolicy.canEditCloudProject)
    const key = String(cloudProjectId)
    const gateSignature = `${nextVersion}:${canEditCloudProject ? 'edit' : 'readonly'}`
    setLiveModelVersion(nextVersion)

    const priorFailure = liveMigrationFailureRef.current.get(key)
    if (priorFailure && priorFailure.gateSignature !== gateSignature) {
      liveMigrationFailureRef.current.delete(key)
    }

    if (nextVersion >= 1) return
    if (!canEditCloudProject) return
    const failure = liveMigrationFailureRef.current.get(key)
    if (failure) {
      const now = Date.now()
      const elapsedMs = now - Number(failure.lastFailureAt || 0)
      if (elapsedMs < ENSURE_STORYBOARD_LIVE_MODEL_COOLDOWN_MS) {
        if (import.meta.env.DEV && now - Number(failure.lastThrottleLogAt || 0) > 30000) {
          // eslint-disable-next-line no-console
          console.info('[cloud-sync] ensureStoryboardLiveModel throttled after failure', {
            projectId: key,
            liveModelVersion: nextVersion,
            canEditCloudProject,
            attemptCount: Number(failure.attemptCount || 0),
            lastErrorSignature: failure.lastErrorSignature || 'unknown_error',
            cooldownRemainingMs: ENSURE_STORYBOARD_LIVE_MODEL_COOLDOWN_MS - elapsedMs,
          })
          liveMigrationFailureRef.current.set(key, {
            ...failure,
            lastThrottleLogAt: now,
          })
        }
        return
      }
    }
    if (liveMigrationRequestedRef.current.has(key)) return
    liveMigrationRequestedRef.current.add(key)
    ensureStoryboardLiveModel({ projectId: cloudProjectId }).then(() => {
      liveMigrationFailureRef.current.delete(key)
    }).catch((error) => {
      const errorName = String(error?.name || 'Error')
      const errorMessage = normalizeEnsureErrorMessage(error)
      const errorCode = error?.code || error?.data?.code || null
      const errorSignature = `${errorName}:${errorMessage}`
      const prior = liveMigrationFailureRef.current.get(key)
      const attemptCount = Number(prior?.attemptCount || 0) + 1
      const repeatFailure = prior?.lastErrorSignature === errorSignature
      liveMigrationFailureRef.current.set(key, {
        lastFailureAt: Date.now(),
        attemptCount,
        lastErrorSignature: errorSignature,
        lastThrottleLogAt: prior?.lastThrottleLogAt || 0,
        gateSignature,
      })
      if (import.meta.env.DEV) {
        // TODO(legacy-live-model): likely next pass is server-side fallback/normalization for legacy snapshots that do not have payload.scenes.
        // eslint-disable-next-line no-console
        console.warn('[cloud-sync] ensureStoryboardLiveModel failed', {
          projectId: key,
          liveModelVersion: nextVersion,
          canEditCloudProject,
          errorName,
          errorCode,
          errorMessage,
          attemptCount,
          repeatFailure,
          cooldownMs: ENSURE_STORYBOARD_LIVE_MODEL_COOLDOWN_MS,
        })
      }
      liveMigrationRequestedRef.current.delete(key)
    })
  }, [cloudAccessPolicy.canEditCloudProject, cloudProject, cloudProjectId, ensureStoryboardLiveModel, setLiveModelVersion])

  useEffect(() => {
    const effectiveLiveScenes = Array.isArray(liveScenes) ? liveScenes : soloLiveScenesSnapshot
    const effectiveLiveShots = Array.isArray(liveShots) ? liveShots : soloLiveShotsSnapshot
    if (!cloudProjectId) return
    if (Number(cloudProject?.liveModelVersion || 0) < 1) return
    if (!Array.isArray(effectiveLiveScenes) || !Array.isArray(effectiveLiveShots)) return
    const now = Date.now()
    const msSinceLocalStoryboardEdit = now - Number(lastStoryboardEditAt || 0)
    const localEditIsHot = msSinceLocalStoryboardEdit < LOCAL_TEXT_EDIT_HOT_WINDOW_MS
    if (hasUnsavedChanges || localEditIsHot) {
      deferredLiveApplyRef.current = { scenes: effectiveLiveScenes, shots: effectiveLiveShots }
      if (isConvexDiagEnabled()) {
        // eslint-disable-next-line no-console
        console.debug('[cloud-sync] deferred live storyboard apply while local edits are pending', {
          projectId: String(cloudProjectId),
          liveSceneCount: effectiveLiveScenes.length,
          liveShotCount: effectiveLiveShots.length,
          hasUnsavedChanges,
          msSinceLocalStoryboardEdit,
        })
      }
      applyDeferredLiveStoryboardState()
      return
    }
    deferredLiveApplyRef.current = null
    if (deferredLiveApplyTimerRef.current) {
      window.clearTimeout(deferredLiveApplyTimerRef.current)
      deferredLiveApplyTimerRef.current = null
    }
    if (isCloudDebugEnabled()) {
      const incomingOrder = (effectiveLiveShots || [])
        .slice()
        .sort((a, b) => {
          const sceneCompare = String(a?.sceneId || '').localeCompare(String(b?.sceneId || ''))
          if (sceneCompare !== 0) return sceneCompare
          return Number(a?.order || 0) - Number(b?.order || 0)
        })
        .map((shot) => ({
          shotId: String(shot?.shotId || ''),
          sceneId: String(shot?.sceneId || ''),
          order: Number(shot?.order || 0),
        }))
      const localOrder = (useStore.getState()?.scenes || []).flatMap((scene) =>
        (scene?.shots || []).map((shot, index) => ({
          shotId: String(shot?.id || ''),
          sceneId: String(scene?.id || ''),
          order: index,
        })),
      )
      // eslint-disable-next-line no-console
      console.info('[SHOT_REORDER_AUDIT]', {
        phase: 'live_apply_step',
        sourceLabel: 'live_storyboard_subscription_apply',
        incomingLiveOrder: incomingOrder,
        currentLocalOrder: localOrder,
        differsFromLocal: stableStringify(incomingOrder) !== stableStringify(localOrder),
      })
    }
    applyLiveStoryboardState(
      { scenes: effectiveLiveScenes, shots: effectiveLiveShots },
      { sourceLabel: 'live_storyboard_subscription_apply' },
    )
  }, [
    applyDeferredLiveStoryboardState,
    applyLiveStoryboardState,
    cloudProject?.liveModelVersion,
    cloudProjectId,
    hasUnsavedChanges,
    lastStoryboardEditAt,
    liveScenes,
    liveShots,
    soloLiveScenesSnapshot,
    soloLiveShotsSnapshot,
  ])

  useEffect(() => {
    if (projectRef?.type !== 'cloud') return undefined
    const flush = () => {
      // Read live state rather than a stale closure so we catch the window
      // between local autosave clearing hasUnsavedChanges (≈2.5 s) and the
      // cloud sync debounce firing (≈8 s).
      const s = useStore.getState()
      const needsSync =
        s.hasUnsavedChanges ||
        (s.saveSyncState?.status === 'saved_locally' &&
          s.saveSyncState?.mode !== 'cloud_blocked')
      if (!needsSync) return
      flushCloudSync({ reason: 'lifecycle' })
      flushPendingLiveStoryboardSync({ force: true })
    }
    window.addEventListener('beforeunload', flush)
    window.addEventListener('pagehide', flush)
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') flushPendingLiveStoryboardSync({ force: true })
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      window.removeEventListener('beforeunload', flush)
      window.removeEventListener('pagehide', flush)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [flushCloudSync, flushPendingLiveStoryboardSync, projectRef?.type])

  useEffect(() => {
    if (!DRAFT_COMMIT_MODE) return undefined
    if (projectRef?.type !== 'cloud') return undefined
    const timer = window.setInterval(() => {
      const state = useStore.getState()
      const dirtyDomains = state?.domainDraftState?.dirty || {}
      const hasDirtyDomains = Boolean(dirtyDomains.storyboard || dirtyDomains.script)
      const lastCommittedAt = Math.max(
        Number(state?.domainDraftState?.lastCommittedAt?.storyboard || 0),
        Number(state?.domainDraftState?.lastCommittedAt?.script || 0),
      )
      const lastSnapshotAt = Date.parse(String(state?.saveSyncState?.lastSyncedAt || ''))
      const hasCommittedSinceLastSnapshot = lastCommittedAt > (Number.isFinite(lastSnapshotAt) ? lastSnapshotAt : 0)
      if (!hasDirtyDomains && !hasCommittedSinceLastSnapshot) return
      flushCloudSync({ reason: 'periodic_checkpoint' })
    }, DRAFT_COMMIT_CHECKPOINT_MS)
    return () => window.clearInterval(timer)
  }, [flushCloudSync, projectRef?.type])

  useEffect(() => {
    const latestSnapshotId = latestSnapshotHead?.latestSnapshotId ? String(latestSnapshotHead.latestSnapshotId) : null
    emitCoordinatorOverwriteTrace('OVERWRITE_PATH_ENTER', {
      sourceLabel: 'head_alignment',
      functionName: 'CloudSyncCoordinator:latestSnapshotHeadEffect',
      projectId: cloudProjectId || null,
      latestSnapshotHeadId: latestSnapshotId,
      localSnapshotId: projectRef?.snapshotId ? String(projectRef.snapshotId) : null,
      cloudDirtyRevision,
      lastAckedSnapshotId: lastAckedSnapshotId || null,
      hasPendingRemoteSnapshot: Boolean(pendingRemoteSnapshot),
      pendingRemoteSnapshotId: pendingRemoteSnapshot?.snapshotId ? String(pendingRemoteSnapshot.snapshotId) : null,
    })
    if (!cloudProjectId || !latestSnapshotId) return
    const localSnapshotId = String(
      projectRef?.snapshotId
      || cloudLineageLastKnownSnapshotId
      || '',
    )
    if (localSnapshotId === latestSnapshotId) {
      emitCoordinatorOverwriteTrace('OVERWRITE_PATH_EXIT', {
        sourceLabel: 'head_alignment',
        functionName: 'CloudSyncCoordinator:latestSnapshotHeadEffect',
        projectId: cloudProjectId,
        latestSnapshotHeadId: latestSnapshotId,
        exitReason: 'head_matches_local_acknowledge',
      })
      acknowledgeCloudSnapshot(latestSnapshotId)
      recordSnapshotHeadRead()
      return
    }
    if (fetchedRemoteSnapshotIdsRef.current.has(latestSnapshotId)) return
    if (inFlightRemoteSnapshotIdsRef.current.has(latestSnapshotId)) return

    let cancelled = false
    inFlightRemoteSnapshotIdsRef.current.add(latestSnapshotId)
    recordSnapshotFullRead()

    convex
      .query('projectSnapshots:getLatestSnapshotForProject', { projectId: cloudProjectId })
      .then((snapshot) => {
        if (cancelled || !snapshot?._id || !snapshot?.payload) return
        const snapshotId = String(snapshot._id)
        fetchedRemoteSnapshotIdsRef.current.add(snapshotId)
        emitCoordinatorOverwriteTrace('OVERWRITE_PATH_ENTER', {
          sourceLabel: 'incoming_cloud_snapshot',
          functionName: 'CloudSyncCoordinator:latestSnapshotHeadEffect:queryThenApply',
          projectId: cloudProjectId,
          snapshotId,
          latestSnapshotHeadId: latestSnapshotId,
          stack: (new Error().stack || '').split('\n').slice(1, 7).map(line => line.trim()).join(' | '),
        })
        applyIncomingCloudSnapshot({
          projectId: cloudProjectId,
          snapshotId,
          payload: snapshot.payload,
        })
      })
      .catch((error) => {
        if (import.meta.env.DEV) {
          // eslint-disable-next-line no-console
          console.warn('[cloud-sync] latest snapshot fetch failed', {
            projectId: cloudProjectId,
            latestSnapshotId,
            message: error?.message || 'unknown_error',
          })
        }
      })
      .finally(() => {
        inFlightRemoteSnapshotIdsRef.current.delete(latestSnapshotId)
        emitCoordinatorOverwriteTrace('OVERWRITE_PATH_EXIT', {
          sourceLabel: 'head_alignment',
          functionName: 'CloudSyncCoordinator:latestSnapshotHeadEffect',
          projectId: cloudProjectId || null,
          latestSnapshotHeadId: latestSnapshotId,
          exitReason: 'fetch_complete',
        })
      })

    return () => {
      cancelled = true
    }
  }, [
    applyIncomingCloudSnapshot,
    acknowledgeCloudSnapshot,
    cloudDirtyRevision,
    cloudLineageLastKnownSnapshotId,
    cloudProjectId,
    convex,
    lastAckedSnapshotId,
    latestSnapshotHead?.latestSnapshotId,
    pendingRemoteSnapshot,
    projectRef?.snapshotId,
  ])

  useEffect(() => {
    emitCoordinatorOverwriteTrace('OVERWRITE_PATH_ENTER', {
      sourceLabel: 'pending_remote_snapshot',
      functionName: 'CloudSyncCoordinator:pendingSnapshotEffect',
      projectId: cloudProjectId || null,
      latestSnapshotHeadId: latestSnapshotHead?.latestSnapshotId ? String(latestSnapshotHead.latestSnapshotId) : null,
      cloudDirtyRevision,
      lastAckedSnapshotId: lastAckedSnapshotId || null,
      hasPendingRemoteSnapshot: Boolean(pendingRemoteSnapshot),
      pendingRemoteSnapshotId: pendingRemoteSnapshot?.snapshotId ? String(pendingRemoteSnapshot.snapshotId) : null,
    })
    if (!cloudProjectId || cloudDirtyRevision !== null) {
      emitCoordinatorOverwriteTrace('OVERWRITE_PATH_EXIT', {
        sourceLabel: 'pending_remote_snapshot',
        functionName: 'CloudSyncCoordinator:pendingSnapshotEffect',
        exitReason: 'cloud_project_missing_or_dirty_not_clear',
      })
      return
    }
    if (!pendingRemoteSnapshot) {
      emitCoordinatorOverwriteTrace('OVERWRITE_PATH_EXIT', {
        sourceLabel: 'pending_remote_snapshot',
        functionName: 'CloudSyncCoordinator:pendingSnapshotEffect',
        exitReason: 'no_pending_snapshot',
      })
      return
    }
    if (pendingRemoteSnapshot.projectId !== cloudProjectId) {
      emitCoordinatorOverwriteTrace('OVERWRITE_PATH_EXIT', {
        sourceLabel: 'pending_remote_snapshot',
        functionName: 'CloudSyncCoordinator:pendingSnapshotEffect',
        exitReason: 'pending_project_mismatch',
      })
      return
    }
    const pendingSnapshotId = String(pendingRemoteSnapshot.snapshotId || '')
    const ackedSnapshotId = String(lastAckedSnapshotId || '')
    const hasDirtyQueueProvenance = pendingRemoteSnapshot.queuedWhileDirtyRevision !== undefined
    const queuedWhileDirty = pendingRemoteSnapshot.queuedWhileDirtyRevision !== null
      && pendingRemoteSnapshot.queuedWhileDirtyRevision !== undefined
    // DEV-ONLY experiment: skip post-ack pending replay to validate whether this
    // branch is the source of storyboard media reverts after sync completion.
    if (
      DISABLE_POST_ACK_PENDING_REMOTE_APPLY
      && ackedSnapshotId
      && (!hasDirtyQueueProvenance || queuedWhileDirty)
    ) {
      // eslint-disable-next-line no-console
      console.info('[cloud-sync:experiment] skipped pending remote snapshot apply after local ack', {
        pendingSnapshotId,
        ackedSnapshotId,
        queuedWhileDirtyRevision: pendingRemoteSnapshot.queuedWhileDirtyRevision ?? null,
      })
      clearPendingRemoteSnapshot()
      emitCoordinatorOverwriteTrace('OVERWRITE_PATH_EXIT', {
        sourceLabel: 'pending_remote_snapshot',
        functionName: 'CloudSyncCoordinator:pendingSnapshotEffect',
        exitReason: 'dev_experiment_skipped_apply',
      })
      return
    }
    const latestHeadSnapshotId = String(latestSnapshotHead?.latestSnapshotId || '')
    if (pendingSnapshotId && ackedSnapshotId && pendingSnapshotId === ackedSnapshotId) {
      clearPendingRemoteSnapshot()
      emitCoordinatorOverwriteTrace('OVERWRITE_PATH_EXIT', {
        sourceLabel: 'pending_remote_snapshot',
        functionName: 'CloudSyncCoordinator:pendingSnapshotEffect',
        exitReason: 'pending_equals_acked',
      })
      return
    }
    if (pendingSnapshotId && latestHeadSnapshotId && pendingSnapshotId !== latestHeadSnapshotId) {
      clearPendingRemoteSnapshot()
      emitCoordinatorOverwriteTrace('OVERWRITE_PATH_EXIT', {
        sourceLabel: 'pending_remote_snapshot',
        functionName: 'CloudSyncCoordinator:pendingSnapshotEffect',
        exitReason: 'pending_not_latest_head',
      })
      return
    }
    emitCoordinatorOverwriteTrace('OVERWRITE_PATH_ENTER', {
      sourceLabel: 'pending_remote_snapshot',
      functionName: 'CloudSyncCoordinator:pendingSnapshotEffect:applyPendingRemoteSnapshot',
      projectId: cloudProjectId,
      snapshotId: pendingSnapshotId || null,
      latestSnapshotHeadId: latestSnapshotHead?.latestSnapshotId ? String(latestSnapshotHead.latestSnapshotId) : null,
      stack: (new Error().stack || '').split('\n').slice(1, 7).map(line => line.trim()).join(' | '),
    })
    applyPendingRemoteSnapshot()
    emitCoordinatorOverwriteTrace('OVERWRITE_PATH_EXIT', {
      sourceLabel: 'pending_remote_snapshot',
      functionName: 'CloudSyncCoordinator:pendingSnapshotEffect',
      exitReason: 'apply_pending_called',
    })
  }, [
    applyPendingRemoteSnapshot,
    clearPendingRemoteSnapshot,
    cloudDirtyRevision,
    cloudProjectId,
    lastAckedSnapshotId,
    latestSnapshotHead?.latestSnapshotId,
    pendingRemoteSnapshot,
  ])

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
        const signedView = await getSignedViewWithCache(projectId, assetId)
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
    getSignedViewWithCache,
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
    if (cloudDirtyRevision !== null) return
    if (localImageBackfillInFlightRef.current) return

    const preflight = detectUnmigratedLocalAssets()
    if (preflight.pendingShotCount === 0) return
    const state = useStore.getState()
    const shotsToBackfill = []
    for (const scene of (state.scenes || [])) {
      for (const shot of (scene?.shots || [])) {
        if (!preflight.pendingShotIds.includes(String(shot?.id || ''))) continue
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
              const signedView = await getSignedViewWithCache(cloudProjectId, assetId)
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
    cloudDirtyRevision,
    cloudProjectId,
    createAssetUploadIntent,
    detectUnmigratedLocalAssets,
    finalizeAssetUpload,
    getSignedViewWithCache,
    localAssetBackfillRequestedAt,
    projectRef?.type,
    updateShotImage,
  ])

  if (!isCloudDebugEnabled()) return null

  return (
    <>
      {cloudDebugTraceNotice ? (
        <div
          style={{
            position: 'fixed',
            right: 12,
            bottom: 12,
            zIndex: 10000,
            background: 'rgba(20, 20, 30, 0.92)',
            color: '#fff',
            border: '1px solid rgba(255,255,255,0.2)',
            borderRadius: 8,
            padding: '8px 10px',
            fontSize: 12,
            maxWidth: 420,
          }}
        >
          {cloudDebugTraceNotice}
        </div>
      ) : null}
      {cloudDebugTraceOpen ? (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 10001,
            background: 'rgba(0,0,0,0.45)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
          }}
        >
          <div
            style={{
              width: 'min(980px, 100%)',
              maxHeight: '85vh',
              overflow: 'auto',
              background: '#10131a',
              color: '#fff',
              borderRadius: 10,
              border: '1px solid rgba(255,255,255,0.18)',
              padding: 16,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <strong>Cloud Debug Trace</strong>
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" onClick={handleCopyCloudTrace}>Copy Trace</button>
                <button type="button" onClick={handleClearCloudTrace}>Clear Trace</button>
                <button type="button" onClick={() => setCloudDebugTraceOpen(false)}>Close</button>
              </div>
            </div>
            {copyTraceStatus ? <div style={{ marginBottom: 8, fontSize: 12 }}>{copyTraceStatus}</div> : null}
            {visibleShotCardSyncSnapshot ? (
              <div
                style={{
                  marginBottom: 12,
                  border: '1px solid rgba(255,255,255,0.12)',
                  borderRadius: 8,
                  padding: 10,
                  background: '#0d1118',
                }}
              >
                <div style={{ fontWeight: 600, marginBottom: 6 }}>Visible ShotCard Snapshot Around Sync Transition</div>
                <div style={{ fontSize: 12, opacity: 0.9, marginBottom: 8 }}>
                  {visibleShotCardSyncSnapshot.transition} @ {visibleShotCardSyncSnapshot.capturedAt}
                </div>
                <div style={{ display: 'grid', gap: 8 }}>
                  <div>
                    <div style={{ fontSize: 12, marginBottom: 4 }}>Before</div>
                    <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: 11, lineHeight: 1.35 }}>
                      {JSON.stringify(visibleShotCardSyncSnapshot.before || [], null, 2)}
                    </pre>
                  </div>
                  <div>
                    <div style={{ fontSize: 12, marginBottom: 4 }}>After</div>
                    <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: 11, lineHeight: 1.35 }}>
                      {JSON.stringify(visibleShotCardSyncSnapshot.after || [], null, 2)}
                    </pre>
                  </div>
                </div>
              </div>
            ) : null}
            {Array.isArray(cloudDebugTracePayload?.focusedTrace?.relatedRenderLifecycleEvents)
              && cloudDebugTracePayload.focusedTrace.relatedRenderLifecycleEvents.length ? (
                <div
                  style={{
                    marginBottom: 12,
                    border: '1px solid rgba(255,255,255,0.12)',
                    borderRadius: 8,
                    padding: 10,
                    background: '#0d1118',
                  }}
                >
                  <div style={{ fontWeight: 600, marginBottom: 6 }}>Last 20 Render Events (Affected ShotIds)</div>
                  <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: 11, lineHeight: 1.35 }}>
                    {JSON.stringify(cloudDebugTracePayload.focusedTrace.relatedRenderLifecycleEvents, null, 2)}
                  </pre>
                </div>
              ) : null}
            <pre
              style={{
                margin: 0,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                fontSize: 12,
                lineHeight: 1.4,
                background: '#0a0d13',
                borderRadius: 8,
                border: '1px solid rgba(255,255,255,0.12)',
                padding: 12,
              }}
            >
              {JSON.stringify(cloudDebugTracePayload || { message: 'No trace captured yet.' }, null, 2)}
            </pre>
          </div>
        </div>
      ) : null}
    </>
  )
}
