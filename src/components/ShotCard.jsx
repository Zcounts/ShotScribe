import React, { useState, useRef, useCallback, useMemo, useEffect } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useAction, useMutation } from 'convex/react'
import useStore from '../store'
import ColorPicker from './ColorPicker'
import SpecsTable from './SpecsTable'
import NotesArea from './NotesArea'
import CustomDropdown from './CustomDropdown'
import { normalizeStoryboardDisplayConfig } from '../storyboardDisplayConfig'
import { processStoryboardUpload, processStoryboardUploadForCloud } from '../utils/storyboardImagePipeline'
import { buildShotImageFromLibraryAsset, uploadStoryboardAssetToCloud } from '../services/assetService'
import { devPerfLog, useDevRenderCounter } from '../utils/devPerf'
import useResponsiveViewport from '../hooks/useResponsiveViewport'
import {
  getCachedSignedView as getCachedSignedViewFromCache,
  getOrCreateSignedViewsBatchRequest,
} from '../utils/assetSignedViewCache'

function parseAspectRatioValue(value) {
  if (value === '2.39:1') return '239 / 100'
  const [left, right] = String(value || '16:9').split(':')
  const leftNum = Number(left)
  const rightNum = Number(right)
  if (!leftNum || !rightNum) return '16 / 9'
  return `${leftNum} / ${rightNum}`
}

const SHOT_ASPECT_RATIO_PRESETS = ['1:1', '4:3', '16:9', '3:2', '2.39:1']
const CLOUD_IMAGE_MAX_SOURCE_BYTES = 15 * 1024 * 1024
const CLOUD_IMAGE_ALLOWED_SOURCE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp']

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

function isStableAssetSourceExperimentEnabled() {
  if (typeof window === 'undefined') return false
  try {
    const params = new URLSearchParams(window.location?.search || '')
    if (params.get('ssStableAssetSrcOnly') === '1') return true
    return window.localStorage?.getItem('ssStableAssetSrcOnly') === '1'
  } catch {
    return false
  }
}

function pushCloudDebugTrace(entry = {}) {
  if (typeof window === 'undefined') return
  const payload = {
    ts: new Date().toISOString(),
    ...entry,
  }
  const key = '__SS_OVERWRITE_TRACE__'
  const rows = Array.isArray(window[key]) ? window[key] : []
  rows.push(payload)
  window[key] = rows.slice(-800)
  try {
    window.dispatchEvent(new CustomEvent('__SS_OVERWRITE_TRACE_EVENT__', { detail: payload }))
  } catch {}
}

function truncateDebugValue(value, max = 90) {
  const text = String(value || '')
  if (!text) return '—'
  return text.length > max ? `${text.slice(0, max)}…` : text
}

const IMAGE_NODE_ID_KEY = '__SS_IMAGE_NODE_IDS__'
const IMAGE_NODE_ID_SEQ_KEY = '__SS_IMAGE_NODE_ID_SEQ__'

function getImageNodeDebugId(node) {
  if (!node || typeof window === 'undefined') return null
  const existingMap = window[IMAGE_NODE_ID_KEY] instanceof WeakMap ? window[IMAGE_NODE_ID_KEY] : new WeakMap()
  if (!window[IMAGE_NODE_ID_KEY]) window[IMAGE_NODE_ID_KEY] = existingMap
  if (existingMap.has(node)) return existingMap.get(node)
  const nextSeq = Number(window[IMAGE_NODE_ID_SEQ_KEY] || 0) + 1
  window[IMAGE_NODE_ID_SEQ_KEY] = nextSeq
  const id = `img-node-${nextSeq}`
  existingMap.set(node, id)
  return id
}

function readShotAssetIdFromState(shotId) {
  try {
    const state = useStore.getState()
    for (const scene of (state?.scenes || [])) {
      for (const shot of (scene?.shots || [])) {
        if (String(shot?.id || '') !== String(shotId || '')) continue
        return shot?.imageAsset?.cloud?.assetId ? String(shot.imageAsset.cloud.assetId) : null
      }
    }
  } catch {}
  return null
}

function readVisibleShotAssetMap() {
  if (typeof document === 'undefined' || typeof window === 'undefined') return {}
  const viewportHeight = window.innerHeight || 0
  const rows = {}
  const cards = document.querySelectorAll('.shot-card[data-entity-type="shot"]')
  cards.forEach((node) => {
    const rect = node.getBoundingClientRect()
    const isVisible = rect.width > 0 && rect.height > 0 && rect.bottom >= 0 && rect.top <= viewportHeight
    if (!isVisible) return
    const shotId = String(node.getAttribute('data-entity-id') || '')
    if (!shotId) return
    rows[shotId] = node.getAttribute('data-debug-asset-id') || null
  })
  return rows
}

function logShotImageAssignAudit(payload = {}) {
  if (!isCloudDebugEnabled()) return
  // eslint-disable-next-line no-console
  console.info('[SHOT_IMAGE_ASSIGN_AUDIT]', payload)
}

function resolveCanonicalStoryboardSource({
  cloudAssetBlocked,
  isCloudProject,
  hasStableAssetId,
  prefetchedCloudThumb,
  fetchedCloudThumb,
  imageAssetThumb,
  image,
}) {
  if (cloudAssetBlocked) return { src: null, reason: 'cloud_asset_blocked' }
  if (isCloudProject && hasStableAssetId) {
    if (prefetchedCloudThumb) return { src: prefetchedCloudThumb, reason: 'prefetched_cloud_thumb' }
    if (fetchedCloudThumb) return { src: fetchedCloudThumb, reason: 'fetched_cloud_thumb' }
    if (imageAssetThumb) return { src: imageAssetThumb, reason: 'shot_imageAsset_thumb' }
    return { src: image || null, reason: image ? 'shot_image' : 'none' }
  }
  if (prefetchedCloudThumb) return { src: prefetchedCloudThumb, reason: 'prefetched_cloud_thumb' }
  if (fetchedCloudThumb) return { src: fetchedCloudThumb, reason: 'fetched_cloud_thumb' }
  if (imageAssetThumb) return { src: imageAssetThumb, reason: 'shot_imageAsset_thumb' }
  return { src: image || null, reason: image ? 'shot_image' : 'none' }
}

function sanitizeNumericInput(value) {
  if (value == null) return ''
  const cleaned = String(value).replace(/[^0-9.]/g, '')
  const firstDot = cleaned.indexOf('.')
  if (firstDot === -1) return cleaned
  const integerPart = cleaned.slice(0, firstDot + 1)
  const decimalPart = cleaned.slice(firstDot + 1).replace(/\./g, '')
  return `${integerPart}${decimalPart}`
}

function ShotCard({
  shot,
  displayId,
  useDropdowns,
  sceneId,
  storyboardDisplayConfig,
  prefetchedCloudAssetView = null,
  cloudAccessPolicy = { canAccessCloudAssets: true, canEditCloudProject: true },
  libraryAssets = null,
  recentlyDeletedAssets = null,
}) {
  const updateShotImage = useStore(s => s.updateShotImage)
  const updateShot = useStore(s => s.updateShot)
  const projectRef = useStore(s => s.projectRef)
  const createAssetUploadIntent = useAction('assets:createAssetUploadIntent')
  const finalizeAssetUpload = useMutation('assets:finalizeAssetUpload')
  const getAssetSignedViewsBatch = useAction('assets:getAssetSignedViewsBatch')
  const assignShotLibraryAsset = useMutation('assets:assignShotLibraryAsset')
  const unassignShotLibraryAsset = useMutation('assets:unassignShotLibraryAsset')
  const softDeleteLibraryAsset = useMutation('assets:softDeleteLibraryAsset')
  const undoSoftDeleteLibraryAsset = useMutation('assets:undoSoftDeleteLibraryAsset')
  const cloudAssetBlocked = projectRef?.type === 'cloud' && !cloudAccessPolicy.canAccessCloudAssets
  const cloudProjectId = projectRef?.type === 'cloud' ? projectRef.projectId : null
  const customDropdownOptions = useStore(s => s.customDropdownOptions)
  const addCustomDropdownOption = useStore(s => s.addCustomDropdownOption)
  const deleteShot = useStore(s => s.deleteShot)
  const [showColorPicker, setShowColorPicker] = useState(false)
  const [hovered, setHovered] = useState(false)
  const [cloudAssetView, setCloudAssetView] = useState(null)
  const [imagePickerStep, setImagePickerStep] = useState(null)
  const [libraryAssetViews, setLibraryAssetViews] = useState({})
  const [isLoadingLibraryViews, setIsLoadingLibraryViews] = useState(false)
  const [isAssigningFromLibrary, setIsAssigningFromLibrary] = useState(false)
  const [isDeletingLibraryAsset, setIsDeletingLibraryAsset] = useState(false)
  const { isDesktopDown, isPhone } = useResponsiveViewport()
  const fileInputRef = useRef(null)
  const imageElementRef = useRef(null)
  const previousSourceRef = useRef({
    sourceReason: null,
    finalDisplaySrc: null,
    currentSrc: null,
    elementSrc: null,
    assetId: null,
    domNodeId: null,
  })
  const previousAssetIdRef = useRef(null)
  const preloadTokenRef = useRef(0)
  const [imageLoadState, setImageLoadState] = useState('idle')
  const [imgCurrentSrc, setImgCurrentSrc] = useState(null)
  const [lastSourceChangeAt, setLastSourceChangeAt] = useState(null)
  const [displayedSrc, setDisplayedSrc] = useState(null)
  const shotTargetAuditRef = useRef({
    actionId: null,
    actionLabel: null,
    initiatingShotId: null,
    initiatingSceneId: null,
  })
  const reactCardKey = `scene:${String(sceneId || 'none')}:shot:${String(shot?.id || 'unknown')}`
  const displayConfig = normalizeStoryboardDisplayConfig(storyboardDisplayConfig)
  const visibleInfo = displayConfig.visibleInfo
  useDevRenderCounter('ShotCard', shot.id)
  const visibleSpecKeys = useMemo(
    () => ['size', 'type', 'move', 'equip'].filter(key => visibleInfo[key] !== false),
    [visibleInfo]
  )
  const getSignedViewWithCache = useCallback(async (assetId) => {
    const key = String(assetId || '')
    if (!key || !cloudProjectId) return null
    const views = await getOrCreateSignedViewsBatchRequest({
      projectId: cloudProjectId,
      assetIds: [key],
      fetcher: (missingAssetIds) => getAssetSignedViewsBatch({
        projectId: cloudProjectId,
        assetIds: missingAssetIds,
      }),
    })
    return views?.[key] || null
  }, [cloudProjectId, getAssetSignedViewsBatch])

  useEffect(() => {
    let cancelled = false
    async function loadAssetView() {
      if (!cloudProjectId || cloudAssetBlocked || !shot?.imageAsset?.cloud?.assetId) {
        setCloudAssetView(null)
        return
      }
      if (prefetchedCloudAssetView) {
        setCloudAssetView(prefetchedCloudAssetView)
        return
      }
      const assetId = String(shot.imageAsset.cloud.assetId)
      const cached = getCachedSignedViewFromCache(assetId)
      if (cached) {
        setCloudAssetView(cached)
        return
      }
      try {
        const view = await getSignedViewWithCache(assetId)
        if (!cancelled) setCloudAssetView(view || null)
      } catch (err) {
        console.warn('Failed to load signed asset view', err)
        if (!cancelled) setCloudAssetView(null)
      }
    }
    loadAssetView()
    return () => {
      cancelled = true
    }
  }, [cloudAssetBlocked, cloudProjectId, getSignedViewWithCache, prefetchedCloudAssetView, shot?.imageAsset?.cloud?.assetId])

  useEffect(() => {
    let cancelled = false
    async function loadLibraryViews() {
      if (
        imagePickerStep !== 'library'
        || !cloudProjectId
        || cloudAssetBlocked
        || !Array.isArray(libraryAssets)
        || libraryAssets.length === 0
      ) return
      setIsLoadingLibraryViews(true)
      try {
        const views = await getOrCreateSignedViewsBatchRequest({
          projectId: cloudProjectId,
          assetIds: libraryAssets.map(asset => asset.assetId),
          fetcher: (missingAssetIds) => getAssetSignedViewsBatch({
            projectId: cloudProjectId,
            assetIds: missingAssetIds,
          }),
        })
        if (!cancelled) setLibraryAssetViews({ ...cachedViews, ...(views || {}) })
      } catch (err) {
        console.warn('Failed to load library image previews', err)
      } finally {
        if (!cancelled) setIsLoadingLibraryViews(false)
      }
    }
    loadLibraryViews()
    return () => {
      cancelled = true
    }
  }, [cloudAssetBlocked, cloudProjectId, getAssetSignedViewsBatch, imagePickerStep, libraryAssets])

  useEffect(() => {
    if (!isCloudDebugEnabled()) return
    if (!imagePickerStep) return
    const flow = shotTargetAuditRef.current || {}
    // eslint-disable-next-line no-console
    console.info('[SHOT_TARGET_AUDIT]', {
      phase: 'picker_open',
      sourceComponent: 'ShotCard',
      actionId: flow?.actionId || null,
      actionLabel: flow?.actionLabel || null,
      modalStep: imagePickerStep,
      targetShotId: String(shot.id),
      targetSceneId: sceneId ? String(sceneId) : null,
      initiatingShotId: flow?.initiatingShotId || null,
      initiatingSceneId: flow?.initiatingSceneId || null,
    })
  }, [imagePickerStep, sceneId, shot.id])

  useEffect(() => {
    if (!isCloudDebugEnabled()) return
    // eslint-disable-next-line no-console
    console.info('[SHOTCARD_DEBUG_MOUNT]', { shotId: String(shot.id), sceneId: sceneId ? String(sceneId) : null })
    return () => {
      // eslint-disable-next-line no-console
      console.info('[SHOTCARD_DEBUG_UNMOUNT]', { shotId: String(shot.id), sceneId: sceneId ? String(sceneId) : null })
    }
  }, [sceneId, shot.id])

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: shot.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    '--card-color': shot.color,
    opacity: isDragging ? 0.4 : 1,
  }

  const startShotTargetAudit = useCallback((actionLabel) => {
    const token = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`
    shotTargetAuditRef.current = {
      actionId: token,
      actionLabel,
      initiatingShotId: String(shot.id),
      initiatingSceneId: sceneId ? String(sceneId) : null,
    }
    if (isCloudDebugEnabled()) {
      // eslint-disable-next-line no-console
      console.info('[SHOT_TARGET_AUDIT]', {
        phase: 'open_add_image',
        sourceComponent: 'ShotCard',
        actionLabel,
        actionId: token,
        clickedShotId: String(shot.id),
        sceneId: sceneId ? String(sceneId) : null,
      })
    }
    return token
  }, [sceneId, shot.id])

  const writeShotImageWithTargetAudit = useCallback(({ functionName, payload, assetId = null }) => {
    const flow = shotTargetAuditRef.current || {}
    const targetShotId = String(shot.id)
    const originShotId = flow?.initiatingShotId ? String(flow.initiatingShotId) : targetShotId
    const mismatch = originShotId !== targetShotId
    if (isCloudDebugEnabled()) {
      // eslint-disable-next-line no-console
      console.info('[SHOT_TARGET_AUDIT]', {
        phase: 'before_updateShotImage',
        functionName,
        actionId: flow?.actionId || null,
        actionLabel: flow?.actionLabel || null,
        shotIdBeingWritten: targetShotId,
        assetIdBeingWritten: assetId ? String(assetId) : null,
        originatingUiShotId: originShotId,
        targetChangedSinceStart: mismatch,
      })
      if (mismatch) {
        // eslint-disable-next-line no-console
        console.warn('[SHOT_TARGET_MISMATCH]', {
          functionName,
          actionId: flow?.actionId || null,
          actionLabel: flow?.actionLabel || null,
          originatingUiShotId: originShotId,
          finalWriteShotId: targetShotId,
          originatingSceneId: flow?.initiatingSceneId || null,
          finalSceneId: sceneId ? String(sceneId) : null,
        })
      }
    }
    updateShotImage(shot.id, payload)
  }, [sceneId, shot.id, updateShotImage])

  const auditShotImageAssignment = useCallback(({
    functionName,
    writeMode,
    beforeAssetId,
    nextAssetId,
    previousVisibleMap,
  }) => {
    const visibleMapBefore = previousVisibleMap || readVisibleShotAssetMap()
    const otherVisibleWithSameAssetBefore = Object.entries(visibleMapBefore)
      .filter(([id, assetId]) => id !== String(shot.id) && assetId && assetId === nextAssetId)
      .map(([id]) => id)
    logShotImageAssignAudit({
      phase: 'before_write',
      functionName,
      writeMode,
      sceneId: sceneId ? String(sceneId) : null,
      editedShotId: String(shot.id),
      oldAssetId: beforeAssetId || null,
      newAssetId: nextAssetId || null,
      otherVisibleShotIdsWithSameAssetId: otherVisibleWithSameAssetBefore,
    })
    window.setTimeout(() => {
      const visibleMapAfter = readVisibleShotAssetMap()
      const finalEditedAssetId = readShotAssetIdFromState(shot.id)
      const changedVisibleShotIds = Object.keys(visibleMapAfter).filter(
        (id) => String(visibleMapBefore[id] || '') !== String(visibleMapAfter[id] || ''),
      )
      const siblingChanges = changedVisibleShotIds
        .filter((id) => id !== String(shot.id))
        .map((id) => ({
          shotId: id,
          assetIdBefore: visibleMapBefore[id] || null,
          assetIdAfter: visibleMapAfter[id] || null,
          finalAssetIdInStore: readShotAssetIdFromState(id),
        }))
      logShotImageAssignAudit({
        phase: 'after_write_settled',
        functionName,
        writeMode,
        sceneId: sceneId ? String(sceneId) : null,
        editedShotId: String(shot.id),
        finalEditedAssetId,
        changedVisibleShotIds,
        siblingChanges,
      })
    }, 0)
  }, [sceneId, shot.id])

  const clearShotImage = useCallback(async () => {
    const beforeAssetId = shot?.imageAsset?.cloud?.assetId ? String(shot.imageAsset.cloud.assetId) : null
    const visibleBefore = readVisibleShotAssetMap()
    if (projectRef?.type === 'cloud' && cloudAccessPolicy.canEditCloudProject && !cloudAssetBlocked) {
      try {
        await unassignShotLibraryAsset({
          projectId: projectRef.projectId,
          shotId: shot.id,
        })
      } catch (err) {
        console.warn('Failed to unassign shot library asset', err)
      }
    }
    writeShotImageWithTargetAudit({
      functionName: 'ShotCard:clearShotImage',
      payload: {
      image: null,
      imageAsset: {
        version: 1,
        mime: 'image/webp',
        thumb: null,
        full: null,
        meta: null,
        cloud: null,
      },
      },
      assetId: null,
    })
    auditShotImageAssignment({
      functionName: 'ShotCard:clearShotImage',
      writeMode: projectRef?.type === 'cloud' ? 'cloud-backed' : 'local-only',
      beforeAssetId,
      nextAssetId: null,
      previousVisibleMap: visibleBefore,
    })
  }, [auditShotImageAssignment, cloudAccessPolicy.canEditCloudProject, cloudAssetBlocked, projectRef, shot.id, shot?.imageAsset?.cloud?.assetId, unassignShotLibraryAsset, writeShotImageWithTargetAudit])

  const assignLibraryAssetToShot = useCallback(async (assetId) => {
    if (projectRef?.type !== 'cloud' || cloudAssetBlocked) return
    const beforeAssetId = shot?.imageAsset?.cloud?.assetId ? String(shot.imageAsset.cloud.assetId) : null
    const visibleBefore = readVisibleShotAssetMap()
    setIsAssigningFromLibrary(true)
    try {
      await assignShotLibraryAsset({
        projectId: projectRef.projectId,
        shotId: shot.id,
        assetId,
      })
      const signedView = await getSignedViewWithCache(assetId)
      const payload = buildShotImageFromLibraryAsset(signedView)
      if (!payload) throw new Error('Could not resolve selected library asset')
      if (isCloudDebugEnabled()) {
        const flow = shotTargetAuditRef.current || {}
        // eslint-disable-next-line no-console
        console.info('[SHOT_TARGET_AUDIT]', {
          phase: 'asset_selected',
          sourceComponent: 'ShotCard',
          functionName: 'ShotCard:assignLibraryAssetToShot',
          actionId: flow?.actionId || null,
          targetShotIdAtCallback: String(shot.id),
          originalInitiatingShotId: flow?.initiatingShotId || null,
          targetShotChangedSinceStart: flow?.initiatingShotId
            ? String(flow.initiatingShotId) !== String(shot.id)
            : false,
          assetIdSelected: String(assetId),
        })
      }
      writeShotImageWithTargetAudit({
        functionName: 'ShotCard:assignLibraryAssetToShot',
        payload,
        assetId,
      })
      const nextAssetId = payload?.imageAsset?.cloud?.assetId ? String(payload.imageAsset.cloud.assetId) : null
      auditShotImageAssignment({
        functionName: 'ShotCard:assignLibraryAssetToShot',
        writeMode: 'cloud-backed',
        beforeAssetId,
        nextAssetId,
        previousVisibleMap: visibleBefore,
      })
      setImagePickerStep(null)
    } finally {
      setIsAssigningFromLibrary(false)
    }
  }, [assignShotLibraryAsset, auditShotImageAssignment, cloudAssetBlocked, getSignedViewWithCache, projectRef, shot.id, shot?.imageAsset?.cloud?.assetId, writeShotImageWithTargetAudit])

  const handleImageClick = () => {
    startShotTargetAudit(projectRef?.type === 'cloud' ? 'open_cloud_image_picker' : 'open_local_upload_picker')
    if (projectRef?.type === 'cloud') {
      setImagePickerStep('options')
      return
    }
    fileInputRef.current?.click()
  }

  const handleSoftDeleteLibraryAsset = useCallback(async (assetId) => {
    if (projectRef?.type !== 'cloud' || cloudAssetBlocked) return
    setIsDeletingLibraryAsset(true)
    try {
      const result = await softDeleteLibraryAsset({
        projectId: projectRef.projectId,
        assetId,
      })
      if (!result?.ok && result?.reason === 'blocked_referenced') {
        alert('This image is still referenced by a shot and cannot be deleted from the library yet.')
      }
    } finally {
      setIsDeletingLibraryAsset(false)
    }
  }, [cloudAssetBlocked, projectRef, softDeleteLibraryAsset])

  const handleUndoDelete = useCallback(async (assetId) => {
    if (projectRef?.type !== 'cloud' || cloudAssetBlocked) return
    await undoSoftDeleteLibraryAsset({
      projectId: projectRef.projectId,
      assetId,
    })
  }, [cloudAssetBlocked, projectRef, undoSoftDeleteLibraryAsset])

  const handleImageChange = useCallback(async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.match(/^image\//)) {
      alert('Please select an image file (JPG, PNG, WEBP)')
      e.target.value = ''
      return
    }
    try {
      const beforeAssetId = shot?.imageAsset?.cloud?.assetId ? String(shot.imageAsset.cloud.assetId) : null
      const visibleBefore = readVisibleShotAssetMap()
      const isCloudProject = projectRef?.type === 'cloud'
      if (isCloudProject) {
        if (cloudAssetBlocked || !cloudAccessPolicy.canEditCloudProject) {
          alert('Cloud image uploads are blocked while billing is inactive. You can continue local-only workflows.')
          e.target.value = ''
          return
        }
        if (!CLOUD_IMAGE_ALLOWED_SOURCE_MIME_TYPES.includes(file.type)) {
          alert('Cloud uploads support JPG, PNG, or WEBP files for beta.')
          e.target.value = ''
          return
        }
        if (file.size > CLOUD_IMAGE_MAX_SOURCE_BYTES) {
          alert('Cloud uploads are limited to 15MB source files for beta.')
          e.target.value = ''
          return
        }
        const processed = await processStoryboardUploadForCloud(file, {
          outputWidth: 640,
          outputHeight: 360,
          quality: 0.84,
        })
        const uploaded = await uploadStoryboardAssetToCloud({
          projectId: projectRef.projectId,
          processed,
          createAssetUploadIntent,
          finalizeAssetUpload,
        })
        const uploadedAssetId = uploaded?.imageAsset?.cloud?.assetId
        if (uploadedAssetId) {
          if (isCloudDebugEnabled()) {
            const flow = shotTargetAuditRef.current || {}
            // eslint-disable-next-line no-console
            console.info('[SHOT_TARGET_AUDIT]', {
              phase: 'upload_complete',
              sourceComponent: 'ShotCard',
              functionName: 'ShotCard:handleImageChange(cloud-upload)',
              actionId: flow?.actionId || null,
              targetShotIdAtCallback: String(shot.id),
              originalInitiatingShotId: flow?.initiatingShotId || null,
              targetShotChangedSinceStart: flow?.initiatingShotId
                ? String(flow.initiatingShotId) !== String(shot.id)
                : false,
              assetIdSelected: String(uploadedAssetId),
            })
          }
          await assignShotLibraryAsset({
            projectId: projectRef.projectId,
            shotId: shot.id,
            assetId: uploadedAssetId,
          })
          const signedView = await getSignedViewWithCache(uploadedAssetId)
          const libraryPayload = buildShotImageFromLibraryAsset(signedView)
          writeShotImageWithTargetAudit({
            functionName: 'ShotCard:handleImageChange(cloud-upload+assign)',
            payload: libraryPayload || uploaded,
            assetId: uploadedAssetId,
          })
          const nextAssetId = libraryPayload?.imageAsset?.cloud?.assetId
            ? String(libraryPayload.imageAsset.cloud.assetId)
            : (uploaded?.imageAsset?.cloud?.assetId ? String(uploaded.imageAsset.cloud.assetId) : null)
          auditShotImageAssignment({
            functionName: 'ShotCard:handleImageChange(cloud-upload+assign)',
            writeMode: 'cloud-backed',
            beforeAssetId,
            nextAssetId,
            previousVisibleMap: visibleBefore,
          })
        } else {
          if (isCloudDebugEnabled()) {
            const flow = shotTargetAuditRef.current || {}
            // eslint-disable-next-line no-console
            console.info('[SHOT_TARGET_AUDIT]', {
              phase: 'upload_complete',
              sourceComponent: 'ShotCard',
              functionName: 'ShotCard:handleImageChange(cloud-upload-fallback)',
              actionId: flow?.actionId || null,
              targetShotIdAtCallback: String(shot.id),
              originalInitiatingShotId: flow?.initiatingShotId || null,
              targetShotChangedSinceStart: flow?.initiatingShotId
                ? String(flow.initiatingShotId) !== String(shot.id)
                : false,
              assetIdSelected: null,
            })
          }
          writeShotImageWithTargetAudit({
            functionName: 'ShotCard:handleImageChange(cloud-upload-fallback)',
            payload: uploaded,
            assetId: uploaded?.imageAsset?.cloud?.assetId || null,
          })
          const nextAssetId = uploaded?.imageAsset?.cloud?.assetId ? String(uploaded.imageAsset.cloud.assetId) : null
          auditShotImageAssignment({
            functionName: 'ShotCard:handleImageChange(cloud-upload-fallback)',
            writeMode: 'cloud-backed',
            beforeAssetId,
            nextAssetId,
            previousVisibleMap: visibleBefore,
          })
        }
      } else {
        const processed = await processStoryboardUpload(file, {
          thumbnailWidth: 480,
          fullLongEdge: 1600,
          quality: 0.84,
        })
        if (isCloudDebugEnabled()) {
          const flow = shotTargetAuditRef.current || {}
          // eslint-disable-next-line no-console
          console.info('[SHOT_TARGET_AUDIT]', {
            phase: 'upload_complete',
            sourceComponent: 'ShotCard',
            functionName: 'ShotCard:handleImageChange(local-upload)',
            actionId: flow?.actionId || null,
            targetShotIdAtCallback: String(shot.id),
            originalInitiatingShotId: flow?.initiatingShotId || null,
            targetShotChangedSinceStart: flow?.initiatingShotId
              ? String(flow.initiatingShotId) !== String(shot.id)
              : false,
            assetIdSelected: null,
          })
        }
        writeShotImageWithTargetAudit({
          functionName: 'ShotCard:handleImageChange(local-upload)',
          payload: processed,
          assetId: null,
        })
        auditShotImageAssignment({
          functionName: 'ShotCard:handleImageChange(local-upload)',
          writeMode: 'local-only',
          beforeAssetId,
          nextAssetId: null,
          previousVisibleMap: visibleBefore,
        })
      }
      setImagePickerStep(null)
      devPerfLog('storyboard:image-upload', {
        shotId: shot.id,
        sourceBytes: file.size,
        cloudProject: isCloudProject,
      })
    } catch (err) {
      console.error('Image processing failed', err)
      alert('Could not process this image. Please try a different file.')
    } finally {
      e.target.value = ''
    }
  }, [shot.id, shot?.imageAsset?.cloud?.assetId, projectRef, createAssetUploadIntent, finalizeAssetUpload, cloudAccessPolicy.canEditCloudProject, cloudAssetBlocked, assignShotLibraryAsset, getSignedViewWithCache, auditShotImageAssignment, writeShotImageWithTargetAudit])

  const handleFocalLengthChange = useCallback((e) => {
    updateShot(shot.id, { focalLength: e.target.value })
  }, [shot.id, updateShot])

  const handleCameraNameChange = useCallback((e) => {
    updateShot(shot.id, { cameraName: e.target.value })
  }, [shot.id, updateShot])

  const handleSetupTimeChange = useCallback((e) => {
    updateShot(shot.id, { setupTime: sanitizeNumericInput(e.target.value) })
  }, [shot.id, updateShot])

  const handleShotTimeChange = useCallback((e) => {
    updateShot(shot.id, { shootTime: sanitizeNumericInput(e.target.value) })
  }, [shot.id, updateShot])

  const handleShotAspectRatioChange = useCallback((value) => {
    updateShot(shot.id, { shotAspectRatio: value })
  }, [shot.id, updateShot])

  const shotAspectRatioOptions = useMemo(
    () => [...new Set([...SHOT_ASPECT_RATIO_PRESETS, ...(customDropdownOptions?.shotAspectRatio || [])])],
    [customDropdownOptions?.shotAspectRatio]
  )

  const timeMetadataColumns = useMemo(
    () => [
      visibleInfo.shotAspectRatio !== false ? { key: 'shotAspectRatio', label: 'ASPECT RATIO' } : null,
      visibleInfo.setupTime !== false ? { key: 'setupTime', label: 'SETUP TIME' } : null,
      visibleInfo.shotTime !== false ? { key: 'shotTime', label: 'SHOT TIME' } : null,
    ].filter(Boolean),
    [visibleInfo.shotAspectRatio, visibleInfo.setupTime, visibleInfo.shotTime]
  )

  const stableAssetId = shot?.imageAsset?.cloud?.assetId ? String(shot.imageAsset.cloud.assetId) : null
  const canonicalSource = resolveCanonicalStoryboardSource({
    cloudAssetBlocked,
    isCloudProject: projectRef?.type === 'cloud',
    hasStableAssetId: Boolean(stableAssetId),
    prefetchedCloudThumb: prefetchedCloudAssetView?.thumbUrl || null,
    fetchedCloudThumb: cloudAssetView?.thumbUrl || null,
    imageAssetThumb: shot?.imageAsset?.thumb || null,
    image: shot?.image || null,
  })
  const storyboardImageSrc = canonicalSource.src
  const storyboardImageSourceReason = canonicalSource.reason
  const stableAssetSourceExperiment = isStableAssetSourceExperimentEnabled()
  const storyboardImageSrcFinal = (projectRef?.type === 'cloud' && stableAssetId && stableAssetSourceExperiment)
    ? (prefetchedCloudAssetView?.thumbUrl || cloudAssetView?.thumbUrl || shot.imageAsset?.thumb || null)
    : storyboardImageSrc
  const storyboardImageSourceReasonFinal = (projectRef?.type === 'cloud' && stableAssetId && stableAssetSourceExperiment)
    ? 'stable_asset_source_experiment'
    : storyboardImageSourceReason

  useEffect(() => {
    const previousAssetId = previousAssetIdRef.current
    const nextAssetId = stableAssetId || null
    const assetChanged = previousAssetId !== nextAssetId
    previousAssetIdRef.current = nextAssetId
    const nextSource = storyboardImageSrcFinal || null

    if (assetChanged || !nextAssetId) {
      preloadTokenRef.current += 1
      setDisplayedSrc(nextSource)
      return
    }

    if (!displayedSrc && nextSource) {
      setDisplayedSrc(nextSource)
      return
    }

    if (!nextSource || nextSource === displayedSrc) return

    // Keep current frame visible across same-asset URL churn; only swap after preload succeeds.
    const token = preloadTokenRef.current + 1
    preloadTokenRef.current = token
    const probe = new Image()
    probe.onload = () => {
      if (preloadTokenRef.current !== token) return
      setDisplayedSrc(nextSource)
    }
    probe.onerror = () => {
      if (preloadTokenRef.current !== token) return
      // keep existing displayedSrc on preload failure
    }
    probe.src = nextSource
  }, [displayedSrc, stableAssetId, storyboardImageSrcFinal])

  const syncCurrentSrcSnapshot = useCallback(() => {
    const node = imageElementRef.current || null
    const nextCurrentSrc = node?.currentSrc || null
    const elementSrc = node?.src || null
    const domNodeId = getImageNodeDebugId(node)
    setImgCurrentSrc(nextCurrentSrc)
    return {
      currentSrc: nextCurrentSrc,
      elementSrc,
      domNodeId,
    }
  }, [])

  const emitShotCardTraceEvent = useCallback((eventName, details = {}) => {
    if (!isCloudDebugEnabled()) return
    const snapshot = syncCurrentSrcSnapshot()
    pushCloudDebugTrace({
      event: eventName,
      sourceLabel: 'shot_card_image',
      shotId: shot?.id ? String(shot.id) : null,
      reactKey: reactCardKey,
      sceneId: sceneId ? String(sceneId) : null,
      assetId: stableAssetId,
      sourceReason: storyboardImageSourceReasonFinal,
      finalDisplaySrc: displayedSrc || storyboardImageSrcFinal || null,
      currentSrc: snapshot.currentSrc,
      imgSrc: snapshot.elementSrc,
      loadState: imageLoadState,
      domNodeId: snapshot.domNodeId,
      assetIdChanged: details.assetIdChanged ?? null,
      finalDisplaySrcChanged: details.finalDisplaySrcChanged ?? null,
      domNodeIdentityChanged: details.domNodeIdentityChanged ?? null,
      ...details,
    })
  }, [
    imageLoadState,
    reactCardKey,
    sceneId,
    shot?.id,
    stableAssetId,
    storyboardImageSourceReasonFinal,
    storyboardImageSrcFinal,
    displayedSrc,
    syncCurrentSrcSnapshot,
  ])

  useEffect(() => {
    const snapshot = syncCurrentSrcSnapshot()
    emitShotCardTraceEvent('STORYBOARD_RENDER_SOURCE', {
      event: 'STORYBOARD_RENDER_SOURCE',
      sourceLabel: 'shot_card_render',
      functionName: 'ShotCard:storyboardImageSrc',
      image: shot?.image || null,
      imageAsset: shot?.imageAsset || null,
      imageAssetThumb: shot?.imageAsset?.thumb || null,
      updatedAt: shot?.updatedAt ?? null,
      currentSrc: snapshot.currentSrc,
      imgSrc: snapshot.elementSrc,
      domNodeId: snapshot.domNodeId,
    })
  }, [
    emitShotCardTraceEvent,
    shot?.id,
    shot?.image,
    shot?.imageAsset,
    shot?.updatedAt,
    syncCurrentSrcSnapshot,
  ])

  useEffect(() => {
    emitShotCardTraceEvent('SHOTCARD_IMG_MOUNT')
    return () => {
      emitShotCardTraceEvent('SHOTCARD_IMG_UNMOUNT')
    }
  }, [emitShotCardTraceEvent])

  useEffect(() => {
    const previous = previousSourceRef.current
    const nextSnapshot = syncCurrentSrcSnapshot()
    const nowIso = new Date().toISOString()
    setImageLoadState(storyboardImageSrcFinal ? 'loading' : 'idle')
    setLastSourceChangeAt(nowIso)
    emitShotCardTraceEvent('SHOTCARD_IMG_SRC_CHANGE', {
      prevSourceReason: previous.sourceReason,
      nextSourceReason: storyboardImageSourceReasonFinal,
      prevFinalDisplaySrc: previous.finalDisplaySrc,
      nextFinalDisplaySrc: storyboardImageSrcFinal || null,
      prevCurrentSrc: previous.currentSrc,
      nextCurrentSrc: nextSnapshot.currentSrc,
      prevImgSrc: previous.elementSrc,
      nextImgSrc: nextSnapshot.elementSrc,
      prevAssetId: previous.assetId,
      nextAssetId: stableAssetId,
      assetIdChanged: previous.assetId !== stableAssetId,
      finalDisplaySrcChanged: previous.finalDisplaySrc !== (storyboardImageSrcFinal || null),
      domNodeIdentityChanged: previous.domNodeId !== nextSnapshot.domNodeId,
      prevDomNodeId: previous.domNodeId,
      nextDomNodeId: nextSnapshot.domNodeId,
      signedUrlChurnOnly: Boolean(
        previous.assetId
        && stableAssetId
        && previous.assetId === stableAssetId
        && previous.finalDisplaySrc !== (storyboardImageSrcFinal || null)
      ),
      sourceChangedAt: nowIso,
    })
    previousSourceRef.current = {
      sourceReason: storyboardImageSourceReasonFinal,
      finalDisplaySrc: storyboardImageSrcFinal || null,
      currentSrc: nextSnapshot.currentSrc,
      elementSrc: nextSnapshot.elementSrc,
      assetId: stableAssetId,
      domNodeId: nextSnapshot.domNodeId,
    }
  }, [emitShotCardTraceEvent, stableAssetId, storyboardImageSourceReasonFinal, storyboardImageSrcFinal, syncCurrentSrcSnapshot])

  const handleStoryboardImageLoad = useCallback(() => {
    const snapshot = syncCurrentSrcSnapshot()
    setImageLoadState('loaded')
    emitShotCardTraceEvent('SHOTCARD_IMG_LOAD', {
      currentSrc: snapshot.currentSrc,
      imgSrc: snapshot.elementSrc,
      domNodeId: snapshot.domNodeId,
    })
  }, [emitShotCardTraceEvent, syncCurrentSrcSnapshot])

  const handleStoryboardImageError = useCallback(() => {
    const snapshot = syncCurrentSrcSnapshot()
    setImageLoadState('error')
    emitShotCardTraceEvent('SHOTCARD_IMG_ERROR', {
      currentSrc: snapshot.currentSrc,
      imgSrc: snapshot.elementSrc,
      domNodeId: snapshot.domNodeId,
    })
  }, [emitShotCardTraceEvent, syncCurrentSrcSnapshot])

  return (
    <div
      ref={setNodeRef}
      style={style}
      id={`storyboard-shot-${shot.id}`}
      data-entity-type="shot"
      data-entity-id={shot.id}
      data-debug-react-key={reactCardKey}
      data-debug-scene-id={String(sceneId || '')}
      data-debug-asset-id={String(stableAssetId || '')}
      data-debug-source-reason={String(storyboardImageSourceReasonFinal || '')}
      data-debug-final-display-src={String(displayedSrc || storyboardImageSrcFinal || '')}
      data-debug-load-state={String(imageLoadState || '')}
      data-debug-current-src={String(imgCurrentSrc || '')}
      className={`shot-card ${isDragging ? 'is-dragging' : ''} ${isDesktopDown ? 'is-compact' : ''} ${isPhone ? 'is-phone' : ''}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Card Header Row — entire row is the drag handle */}
      <div
        {...attributes}
        {...listeners}
        className="shot-card-header flex items-center gap-1 px-2 py-1 cursor-grab active:cursor-grabbing select-none"
        style={{ paddingLeft: 8, display: 'flex', alignItems: 'center' }}
        title="Drag to reorder"
      >
        {/* Color indicator */}
        <div className="relative flex-shrink-0" style={{ display: 'flex', alignItems: 'center', alignSelf: 'center' }}>
          <div
            className="color-swatch"
            style={{ backgroundColor: shot.color, width: 12, height: 12, display: 'block', alignSelf: 'center', flexShrink: 0 }}
            onClick={(e) => { e.stopPropagation(); setShowColorPicker(!showColorPicker) }}
            title="Click to change color"
          />
          {showColorPicker && (
            <ColorPicker
              shotId={shot.id}
              currentColor={shot.color}
              onClose={() => setShowColorPicker(false)}
            />
          )}
        </div>

        {/* Shot ID + Camera name */}
        <div className="shot-card-title flex-1 flex items-center gap-1 min-w-0" style={{ alignItems: 'center' }}>
          <span className="font-bold text-xs whitespace-nowrap" style={{ verticalAlign: 'middle', lineHeight: 1 }}>{displayId} -</span>
          {visibleInfo.camera !== false && (
            <input
              type="text"
              value={shot.cameraName}
              onChange={handleCameraNameChange}
              onPointerDown={e => e.stopPropagation()}
              className="shot-card-camera-input text-xs bg-transparent border-none outline-none p-0 min-w-0 flex-1"
              style={{ maxWidth: isDesktopDown ? 120 : 80 }}
              placeholder="Camera 1"
            />
          )}
        </div>

        {/* Focal length — right-aligned, never covered */}
        {visibleInfo.lens !== false && (
          <input
            type="text"
            value={shot.focalLength}
            onChange={handleFocalLengthChange}
            onPointerDown={e => e.stopPropagation()}
            className="shot-card-lens-input text-xs bg-transparent border-none outline-none text-right p-0 flex-shrink-0"
            style={{ width: isDesktopDown ? 64 : 46 }}
            placeholder="85mm"
          />
        )}

      </div>

      {/* Image Area */}
      <div
        className={`image-placeholder ${imagePickerStep === 'options' && projectRef?.type === 'cloud' ? 'image-placeholder-active' : ''}`}
        onClick={handleImageClick}
        style={{ border: `2px solid ${shot.color}`, aspectRatio: parseAspectRatioValue(displayConfig.aspectRatio) }}
      >
        {isCloudDebugEnabled() ? (
          <div
            style={{
              position: 'absolute',
              top: 6,
              left: 6,
              zIndex: 6,
              padding: '3px 6px',
              borderRadius: 4,
              background: 'rgba(220, 38, 38, 0.88)',
              color: '#fff',
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: 0.2,
              pointerEvents: 'none',
            }}
          >
            SHOTCARD DEBUG ACTIVE · {String(shot.id)}
          </div>
        ) : null}
        {displayedSrc ? (
          <img
            key={`${shot.id}:${stableAssetId || 'no-asset'}:${displayedSrc || 'no-src'}`}
            ref={imageElementRef}
            src={displayedSrc}
            alt="Shot frame"
            loading="lazy"
            decoding="async"
            onLoad={handleStoryboardImageLoad}
            onError={handleStoryboardImageError}
          />
        ) : cloudAssetBlocked ? (
          <div className="flex flex-col items-center gap-1 text-amber-300">
            <span className="text-xs font-medium">Cloud image unavailable</span>
            <span className="text-[10px] text-gray-400">Billing inactive: cloud assets are blocked.</span>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-1 text-gray-500">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <polyline points="21 15 16 10 5 21" />
            </svg>
            <span className="text-xs font-medium">Click to add image</span>
          </div>
        )}
        {isCloudDebugEnabled() ? (
          <div
            style={{
              position: 'absolute',
              left: 6,
              right: 6,
              bottom: 6,
              zIndex: 4,
              padding: '6px 8px',
              borderRadius: 6,
              background: 'rgba(0, 0, 0, 0.76)',
              color: '#d1f7ff',
              fontSize: 10,
              lineHeight: 1.35,
              textAlign: 'left',
              pointerEvents: 'none',
            }}
          >
            <div><strong>shotId:</strong> {String(shot?.id || '—')}</div>
            <div><strong>reactKey:</strong> {reactCardKey}</div>
            <div><strong>sceneId:</strong> {String(sceneId || '—')}</div>
            <div><strong>assetId:</strong> {stableAssetId || '—'}</div>
            <div><strong>sourceReason:</strong> {storyboardImageSourceReasonFinal}</div>
            <div><strong>finalDisplaySrc:</strong> {truncateDebugValue(displayedSrc || storyboardImageSrcFinal)}</div>
            <div><strong>shot.image:</strong> {truncateDebugValue(shot?.image)}</div>
            <div><strong>imageAsset.thumb:</strong> {truncateDebugValue(shot?.imageAsset?.thumb)}</div>
            <div><strong>img.currentSrc:</strong> {truncateDebugValue(imgCurrentSrc)}</div>
            <div><strong>img.src:</strong> {truncateDebugValue(imageElementRef.current?.src || null)}</div>
            <div><strong>imgState:</strong> {imageLoadState}</div>
            <div><strong>lastSrcChange:</strong> {lastSourceChangeAt || '—'}</div>
          </div>
        ) : null}
        {imagePickerStep === 'options' && projectRef?.type === 'cloud' ? (
          <div className="shot-image-picker-overlay" onClick={(e) => e.stopPropagation()}>
            <div className="shot-image-picker-title">Add Image to Shot</div>
            <div className="shot-image-picker-actions">
              <button type="button" className="shot-image-picker-button" onClick={() => setImagePickerStep('library')}>
                Choose from Project Library
              </button>
              <button type="button" className="shot-image-picker-button" onClick={() => fileInputRef.current?.click()}>
                Upload New
              </button>
              {displayedSrc ? (
                <button
                  type="button"
                  className="shot-image-picker-button shot-image-picker-button-danger"
                  onClick={() => {
                    clearShotImage()
                    setImagePickerStep(null)
                  }}
                >
                  Remove from Shot
                </button>
              ) : null}
              <button type="button" className="shot-image-picker-button" onClick={() => setImagePickerStep(null)}>
                Cancel
              </button>
            </div>
          </div>
        ) : null}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleImageChange}
        />
      </div>
      {imagePickerStep === 'library' && projectRef?.type === 'cloud' && (
        <div className="modal-overlay" style={{ zIndex: 760 }} onClick={() => setImagePickerStep('options')}>
          <div className="modal app-dialog shot-library-picker-modal" onClick={(e) => e.stopPropagation()}>
            <div className="shot-library-picker-header">
              <h3 className="dialog-title">Project Media Library</h3>
              <button type="button" className="dialog-button-secondary" onClick={() => setImagePickerStep('options')}>Back</button>
            </div>
            <p className="dialog-description">Select an image to assign to this storyboard shot.</p>
            <div className="shot-library-picker-grid">
              {(libraryAssets || []).length === 0 ? (
                <div className="text-gray-500">No library images yet. Upload a new image first.</div>
              ) : (
                (libraryAssets || []).map((asset) => {
                  const assetView = libraryAssetViews?.[String(asset.assetId)] || null
                  const previewSrc = assetView?.thumbUrl || assetView?.fullUrl || null
                  return (
                    <div key={String(asset.assetId)} className="shot-library-picker-card">
                      <button
                        type="button"
                        disabled={isAssigningFromLibrary}
                        className="shot-library-picker-select"
                        onClick={() => assignLibraryAssetToShot(asset.assetId)}
                      >
                        <div className="shot-library-picker-thumb">
                          {previewSrc ? (
                            <img src={previewSrc} alt={asset.sourceName || 'Library image preview'} loading="lazy" decoding="async" />
                          ) : (
                            <div className="shot-library-picker-thumb-fallback">
                              {isLoadingLibraryViews ? 'Loading preview…' : 'No preview'}
                            </div>
                          )}
                        </div>
                        <div className="truncate text-xs font-semibold">{asset.sourceName || `Asset ${String(asset.assetId).slice(-6)}`}</div>
                        <div className="text-[11px] text-gray-500">{new Date(asset.createdAt).toLocaleDateString()}</div>
                      </button>
                      <button
                        type="button"
                        disabled={isDeletingLibraryAsset}
                        className="shot-library-picker-delete"
                        onClick={() => handleSoftDeleteLibraryAsset(asset.assetId)}
                      >
                        Delete from Library
                      </button>
                    </div>
                  )
                })
              )}
            </div>
            {(recentlyDeletedAssets || []).length > 0 ? (
              <div className="mt-3 border-t border-slate-200 pt-3">
                <div className="mb-2 text-[11px] uppercase tracking-wide text-gray-500">Recently deleted</div>
                <div className="space-y-2">
                  {(recentlyDeletedAssets || []).slice(0, 3).map((asset) => (
                    <div key={`deleted-${String(asset.assetId)}`} className="flex items-center justify-between rounded border border-slate-200 bg-slate-50 px-2 py-1.5">
                      <div className="truncate pr-2 text-[11px] text-gray-700">{asset.sourceName || `Asset ${String(asset.assetId).slice(-6)}`}</div>
                      <button
                        type="button"
                        className="rounded border border-slate-300 bg-white px-2 py-0.5 text-[10px] text-gray-700 hover:bg-slate-100"
                        onClick={() => handleUndoDelete(asset.assetId)}
                      >
                        Undo
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}

      {/* Specs Table */}
      {visibleSpecKeys.length > 0 && (
        <SpecsTable
          shotId={shot.id}
          specs={shot.specs}
          useDropdowns={useDropdowns}
          visibleSpecKeys={visibleSpecKeys}
        />
      )}

      {timeMetadataColumns.length > 0 && (
        <div className="shot-time-fields-wrapper">
          <table className="shot-time-fields">
            <caption>Shot timing and aspect ratio metadata</caption>
            <thead>
              <tr>
                {timeMetadataColumns.map(column => (
                  <th key={column.key}>{column.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                {timeMetadataColumns.map(column => (
                  <td key={column.key} className="shot-time-field-cell">
                    {column.key === 'setupTime' ? (
                      <input
                        className="shot-time-number"
                        type="text"
                        inputMode="decimal"
                        value={sanitizeNumericInput(shot.setupTime || '')}
                        onChange={handleSetupTimeChange}
                        placeholder="15"
                      />
                    ) : null}
                    {column.key === 'shotTime' ? (
                      <input
                        className="shot-time-number"
                        type="text"
                        inputMode="decimal"
                        value={sanitizeNumericInput(shot.shootTime || '')}
                        onChange={handleShotTimeChange}
                        placeholder="10"
                      />
                    ) : null}
                    {column.key === 'shotAspectRatio' ? (
                      <div className="shot-time-aspect-dropdown">
                        <CustomDropdown
                          value={shot.shotAspectRatio || ''}
                          options={shotAspectRatioOptions}
                          onChange={handleShotAspectRatioChange}
                          onAddCustomOption={(option) => addCustomDropdownOption('shotAspectRatio', option)}
                          inputStyle={{
                            width: '100%',
                            border: 'none',
                            background: 'transparent',
                            textAlign: 'center',
                            fontSize: 10,
                            padding: 0,
                            outline: 'none',
                            fontFamily: 'inherit',
                            cursor: 'pointer',
                            boxSizing: 'border-box',
                          }}
                          placeholder="—"
                        />
                      </div>
                    ) : null}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* Notes Area */}
      {visibleInfo.notes !== false && (
        <div className="border-t border-gray-200">
          <NotesArea shotId={shot.id} value={shot.notes} />
        </div>
      )}

      {/* Delete button — bottom-right corner, avoids focal length field */}
      {hovered && (
        <button
          className="delete-btn absolute bottom-0 right-0 w-5 h-5 flex items-center justify-center bg-red-500 text-white hover:bg-red-600 transition-colors z-20"
          style={{ fontSize: 14, lineHeight: 1 }}
          onClick={(e) => { e.stopPropagation(); deleteShot(shot.id) }}
          title="Delete shot"
        >
          ×
        </button>
      )}
    </div>
  )
}

export default React.memo(ShotCard)
