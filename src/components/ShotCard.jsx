import React, { useState, useRef, useCallback, useMemo } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useMutation, useQuery } from 'convex/react'
import useStore from '../store'
import ColorPicker from './ColorPicker'
import SpecsTable from './SpecsTable'
import NotesArea from './NotesArea'
import CustomDropdown from './CustomDropdown'
import { normalizeStoryboardDisplayConfig } from '../storyboardDisplayConfig'
import { processStoryboardUpload, processStoryboardUploadForCloud } from '../utils/storyboardImagePipeline'
import { uploadStoryboardAssetToCloud } from '../services/assetService'
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

function ShotCard({ shot, displayId, useDropdowns, sceneId, storyboardDisplayConfig }) {
  const updateShotImage = useStore(s => s.updateShotImage)
  const updateShot = useStore(s => s.updateShot)
  const projectRef = useStore(s => s.projectRef)
  const createAssetUploadUrl = useMutation('assets:createAssetUploadUrl')
  const completeAssetUpload = useMutation('assets:completeAssetUpload')
  const cloudAccessPolicy = useCloudAccessPolicy()
  const cloudAssetBlocked = projectRef?.type === 'cloud' && !cloudAccessPolicy.canAccessCloudAssets
  const cloudAssetView = useQuery(
    'assets:getAssetView',
    (projectRef?.type === 'cloud' && shot?.imageAsset?.cloud?.assetId && !cloudAssetBlocked)
      ? { projectId: projectRef.projectId, assetId: shot.imageAsset.cloud.assetId }
      : 'skip'
  )
  const customDropdownOptions = useStore(s => s.customDropdownOptions)
  const addCustomDropdownOption = useStore(s => s.addCustomDropdownOption)
  const deleteShot = useStore(s => s.deleteShot)
  const [showColorPicker, setShowColorPicker] = useState(false)
  const [hovered, setHovered] = useState(false)
  const { isDesktopDown, isPhone } = useResponsiveViewport()
  const fileInputRef = useRef(null)
  const displayConfig = normalizeStoryboardDisplayConfig(storyboardDisplayConfig)
  const visibleInfo = displayConfig.visibleInfo
  useDevRenderCounter('ShotCard', shot.id)
  const visibleSpecKeys = useMemo(
    () => ['size', 'type', 'move', 'equip'].filter(key => visibleInfo[key] !== false),
    [visibleInfo]
  )

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

  const handleImageClick = () => fileInputRef.current?.click()

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
          shotId: shot.id,
          processed,
          createAssetUploadUrl,
          completeAssetUpload,
        })
        updateShotImage(shot.id, uploaded)
      } else {
        const processed = await processStoryboardUpload(file, {
          thumbnailWidth: 480,
          fullLongEdge: 1600,
          quality: 0.84,
        })
        updateShotImage(shot.id, processed)
      }
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
  }, [shot.id, updateShotImage, projectRef, createAssetUploadUrl, completeAssetUpload, cloudAccessPolicy.canEditCloudProject, cloudAssetBlocked])

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
    : (cloudAssetView?.thumbUrl || shot.imageAsset?.thumb || shot.image || null)

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
