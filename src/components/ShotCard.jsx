import React, { useState, useRef, useCallback, useMemo, useEffect } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useAction, useMutation, useQuery } from 'convex/react'
import useStore from '../store'
import ColorPicker from './ColorPicker'
import SpecsTable from './SpecsTable'
import NotesArea from './NotesArea'
import CustomDropdown from './CustomDropdown'
import { normalizeStoryboardDisplayConfig } from '../storyboardDisplayConfig'
import { processStoryboardUpload, processStoryboardUploadForCloud } from '../utils/storyboardImagePipeline'
import { buildShotImageFromLibraryAsset, uploadStoryboardAssetToCloud } from '../services/assetService'
import { devPerfLog, useDevRenderCounter } from '../utils/devPerf'
import useCloudAccessPolicy from '../features/billing/useCloudAccessPolicy'
import useResponsiveViewport from '../hooks/useResponsiveViewport'

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

function sanitizeNumericInput(value) {
  if (value == null) return ''
  const cleaned = String(value).replace(/[^0-9.]/g, '')
  const firstDot = cleaned.indexOf('.')
  if (firstDot === -1) return cleaned
  const integerPart = cleaned.slice(0, firstDot + 1)
  const decimalPart = cleaned.slice(firstDot + 1).replace(/\./g, '')
  return `${integerPart}${decimalPart}`
}

function ShotCard({ shot, displayId, useDropdowns, sceneId, storyboardDisplayConfig, prefetchedCloudAssetView = null }) {
  const updateShotImage = useStore(s => s.updateShotImage)
  const updateShot = useStore(s => s.updateShot)
  const projectRef = useStore(s => s.projectRef)
  const createAssetUploadIntent = useAction('assets:createAssetUploadIntent')
  const finalizeAssetUpload = useMutation('assets:finalizeAssetUpload')
  const getAssetSignedView = useAction('assets:getAssetSignedView')
  const assignShotLibraryAsset = useMutation('assets:assignShotLibraryAsset')
  const unassignShotLibraryAsset = useMutation('assets:unassignShotLibraryAsset')
  const softDeleteLibraryAsset = useMutation('assets:softDeleteLibraryAsset')
  const undoSoftDeleteLibraryAsset = useMutation('assets:undoSoftDeleteLibraryAsset')
  const cloudAccessPolicy = useCloudAccessPolicy()
  const cloudAssetBlocked = projectRef?.type === 'cloud' && !cloudAccessPolicy.canAccessCloudAssets
  const libraryAssets = useQuery(
    'assets:listProjectLibraryAssets',
    (projectRef?.type === 'cloud' && !cloudAssetBlocked)
      ? { projectId: projectRef.projectId, kind: 'storyboard_image', limit: 120 }
      : 'skip'
  )
  const recentlyDeletedAssets = useQuery(
    'assets:getRecentlyDeletedLibraryAssets',
    (projectRef?.type === 'cloud' && !cloudAssetBlocked)
      ? { projectId: projectRef.projectId, limit: 10 }
      : 'skip'
  )
  const customDropdownOptions = useStore(s => s.customDropdownOptions)
  const addCustomDropdownOption = useStore(s => s.addCustomDropdownOption)
  const deleteShot = useStore(s => s.deleteShot)
  const [showColorPicker, setShowColorPicker] = useState(false)
  const [hovered, setHovered] = useState(false)
  const [cloudAssetView, setCloudAssetView] = useState(null)
  const [imagePickerStep, setImagePickerStep] = useState(null)
  const [isAssigningFromLibrary, setIsAssigningFromLibrary] = useState(false)
  const [isDeletingLibraryAsset, setIsDeletingLibraryAsset] = useState(false)
  const { isDesktopDown, isPhone } = useResponsiveViewport()
  const fileInputRef = useRef(null)
  const displayConfig = normalizeStoryboardDisplayConfig(storyboardDisplayConfig)
  const visibleInfo = displayConfig.visibleInfo
  useDevRenderCounter('ShotCard', shot.id)
  const visibleSpecKeys = useMemo(
    () => ['size', 'type', 'move', 'equip'].filter(key => visibleInfo[key] !== false),
    [visibleInfo]
  )

  useEffect(() => {
    let cancelled = false
    async function loadAssetView() {
      if (projectRef?.type !== 'cloud' || cloudAssetBlocked || !shot?.imageAsset?.cloud?.assetId) {
        setCloudAssetView(null)
        return
      }
      try {
        const view = await getAssetSignedView({
          projectId: projectRef.projectId,
          assetId: shot.imageAsset.cloud.assetId,
        })
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
  }, [cloudAssetBlocked, getAssetSignedView, projectRef, shot?.imageAsset?.cloud?.assetId])

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

  const clearShotImage = useCallback(async () => {
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
    updateShotImage(shot.id, {
      image: null,
      imageAsset: {
        version: 1,
        mime: 'image/webp',
        thumb: null,
        full: null,
        meta: null,
        cloud: null,
      },
    })
  }, [cloudAccessPolicy.canEditCloudProject, cloudAssetBlocked, projectRef, shot.id, unassignShotLibraryAsset, updateShotImage])

  const assignLibraryAssetToShot = useCallback(async (assetId) => {
    if (projectRef?.type !== 'cloud' || cloudAssetBlocked) return
    setIsAssigningFromLibrary(true)
    try {
      await assignShotLibraryAsset({
        projectId: projectRef.projectId,
        shotId: shot.id,
        assetId,
      })
      const signedView = await getAssetSignedView({
        projectId: projectRef.projectId,
        assetId,
      })
      const payload = buildShotImageFromLibraryAsset(signedView)
      if (!payload) throw new Error('Could not resolve selected library asset')
      updateShotImage(shot.id, payload)
      setImagePickerStep(null)
    } finally {
      setIsAssigningFromLibrary(false)
    }
  }, [assignShotLibraryAsset, cloudAssetBlocked, getAssetSignedView, projectRef, shot.id, updateShotImage])

  const handleImageClick = () => {
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
          await assignShotLibraryAsset({
            projectId: projectRef.projectId,
            shotId: shot.id,
            assetId: uploadedAssetId,
          })
          const signedView = await getAssetSignedView({
            projectId: projectRef.projectId,
            assetId: uploadedAssetId,
          })
          const libraryPayload = buildShotImageFromLibraryAsset(signedView)
          updateShotImage(shot.id, libraryPayload || uploaded)
        } else {
          updateShotImage(shot.id, uploaded)
        }
      } else {
        const processed = await processStoryboardUpload(file, {
          thumbnailWidth: 480,
          fullLongEdge: 1600,
          quality: 0.84,
        })
        updateShotImage(shot.id, processed)
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
  }, [shot.id, updateShotImage, projectRef, createAssetUploadIntent, finalizeAssetUpload, cloudAccessPolicy.canEditCloudProject, cloudAssetBlocked, assignShotLibraryAsset, getAssetSignedView])

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

  const storyboardImageSrc = cloudAssetBlocked
    ? null
    : (prefetchedCloudAssetView?.thumbUrl || cloudAssetView?.thumbUrl || shot.imageAsset?.thumb || shot.image || null)

  return (
    <div
      ref={setNodeRef}
      style={style}
      id={`storyboard-shot-${shot.id}`}
      data-entity-type="shot"
      data-entity-id={shot.id}
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
        className="image-placeholder"
        onClick={handleImageClick}
        style={{ border: `2px solid ${shot.color}`, aspectRatio: parseAspectRatioValue(displayConfig.aspectRatio) }}
      >
        {storyboardImageSrc ? (
          <img src={storyboardImageSrc} alt="Shot frame" loading="lazy" decoding="async" />
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
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleImageChange}
        />
      </div>
      {projectRef?.type === 'cloud' && (
        <div className="mt-1 flex justify-end">
          <button
            type="button"
            className="rounded border border-gray-300 bg-white px-2 py-1 text-[11px] text-gray-700 hover:bg-gray-50"
            onClick={(e) => {
              e.stopPropagation()
              setImagePickerStep('options')
            }}
          >
            Add Image
          </button>
        </div>
      )}
      {imagePickerStep === 'options' && projectRef?.type === 'cloud' && (
        <div className="mt-1 rounded border border-gray-700 bg-gray-900 p-2 text-xs text-gray-100">
          <div className="mb-1 font-medium">Add Image to Shot</div>
          <div className="flex flex-col gap-1">
            <button
              type="button"
              className="rounded border border-gray-700 bg-gray-800 px-2 py-1 text-left hover:bg-gray-700"
              onClick={(e) => {
                e.stopPropagation()
                setImagePickerStep('library')
              }}
            >
              Choose from Library
            </button>
            <button
              type="button"
              className="rounded border border-gray-700 bg-gray-800 px-2 py-1 text-left hover:bg-gray-700"
              onClick={(e) => {
                e.stopPropagation()
                fileInputRef.current?.click()
              }}
            >
              Upload New
            </button>
            {storyboardImageSrc ? (
              <button
                type="button"
                className="rounded border border-red-700 bg-red-950 px-2 py-1 text-left text-red-200 hover:bg-red-900"
                onClick={(e) => {
                  e.stopPropagation()
                  clearShotImage()
                  setImagePickerStep(null)
                }}
              >
                Remove from Shot
              </button>
            ) : null}
            <button
              type="button"
              className="rounded border border-gray-700 bg-gray-800 px-2 py-1 text-left hover:bg-gray-700"
              onClick={(e) => {
                e.stopPropagation()
                setImagePickerStep(null)
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
      {imagePickerStep === 'library' && projectRef?.type === 'cloud' && (
        <div className="mt-2 rounded border border-gray-700 bg-gray-900 p-2 text-xs text-gray-100">
          <div className="mb-2 flex items-center justify-between">
            <div className="font-medium">Project Media Library</div>
            <button
              type="button"
              className="rounded border border-gray-700 bg-gray-800 px-2 py-1 hover:bg-gray-700"
              onClick={() => setImagePickerStep('options')}
            >
              Back
            </button>
          </div>
          <div className="max-h-40 overflow-auto pr-1">
            {(libraryAssets || []).length === 0 ? (
              <div className="text-gray-400">No library images yet. Upload a new image first.</div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {(libraryAssets || []).map((asset) => (
                  <div
                    key={String(asset.assetId)}
                    className="rounded border border-gray-700 bg-gray-800 p-2"
                  >
                    <button
                      type="button"
                      disabled={isAssigningFromLibrary}
                      className="w-full text-left hover:opacity-90 disabled:opacity-60"
                      onClick={() => assignLibraryAssetToShot(asset.assetId)}
                    >
                      <div className="truncate text-[11px] font-medium">{asset.sourceName || `Asset ${String(asset.assetId).slice(-6)}`}</div>
                      <div className="text-[10px] text-gray-400">{new Date(asset.createdAt).toLocaleDateString()}</div>
                    </button>
                    <button
                      type="button"
                      disabled={isDeletingLibraryAsset}
                      className="mt-1 rounded border border-red-700 bg-red-950 px-2 py-1 text-[10px] text-red-200 hover:bg-red-900 disabled:opacity-60"
                      onClick={() => handleSoftDeleteLibraryAsset(asset.assetId)}
                    >
                      Delete from Library
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
          {(recentlyDeletedAssets || []).length > 0 ? (
            <div className="mt-2 border-t border-gray-700 pt-2">
              <div className="mb-1 text-[10px] uppercase tracking-wide text-gray-400">Recently deleted</div>
              <div className="space-y-1">
                {(recentlyDeletedAssets || []).slice(0, 3).map((asset) => (
                  <div key={`deleted-${String(asset.assetId)}`} className="flex items-center justify-between rounded border border-gray-700 bg-gray-800 px-2 py-1">
                    <div className="truncate pr-2 text-[10px] text-gray-300">{asset.sourceName || `Asset ${String(asset.assetId).slice(-6)}`}</div>
                    <button
                      type="button"
                      className="rounded border border-gray-600 bg-gray-700 px-2 py-0.5 text-[10px] text-white hover:bg-gray-600"
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

      {/* Notes Area */}
      {visibleInfo.notes !== false && (
        <div className="border-t border-gray-200">
          <NotesArea shotId={shot.id} value={shot.notes} />
        </div>
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
