import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAction, useMutation, useQuery } from 'convex/react'
import useStore from '../store'
import { processStoryboardUpload, processStoryboardUploadForCloud } from '../utils/storyboardImagePipeline'
import { buildShotImageFromLibraryAsset, uploadStoryboardAssetToCloud } from '../services/assetService'
import useCloudAccessPolicy from '../features/billing/useCloudAccessPolicy'
import { useConvexQueryDiagnostics } from '../utils/convexDiagnostics'
import { getOrCreateSignedViewRequest } from '../utils/assetSignedViewCache'

const useConvexQueryDiagnosticsSafe = typeof useConvexQueryDiagnostics === 'function'
  ? useConvexQueryDiagnostics
  : () => {}

const EMOJI_CHOICES = ['🎬', '🎥', '🎞️', '📋', '🗓️', '🎭', '🎤', '🎯']
const CLOUD_IMAGE_MAX_SOURCE_BYTES = 15 * 1024 * 1024
const CLOUD_IMAGE_ALLOWED_SOURCE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp']

function hasHeroImageValue(value) {
  if (!value || typeof value !== 'object') return false
  if (typeof value.image === 'string' && value.image.trim()) return true
  if (typeof value?.imageAsset?.thumb === 'string' && value.imageAsset.thumb.trim()) return true
  if (typeof value?.imageAsset?.cloud?.assetId === 'string' && value.imageAsset.cloud.assetId.trim()) return true
  return false
}

export default function ProjectPropertiesDialog({ open, onClose, onSaveIdentity }) {
  const projectRef = useStore(s => s.projectRef)
  const projectName = useStore(s => s.projectName)
  const projectEmoji = useStore(s => s.projectEmoji)
  const projectLogline = useStore(s => s.projectLogline)
  const projectHeroImage = useStore(s => s.projectHeroImage)
  const projectHeroOverlayColor = useStore(s => s.projectHeroOverlayColor)
  const setProjectName = useStore(s => s.setProjectName)
  const setProjectEmoji = useStore(s => s.setProjectEmoji)
  const setProjectLogline = useStore(s => s.setProjectLogline)
  const setProjectHeroImage = useStore(s => s.setProjectHeroImage)
  const clearProjectHeroImage = useStore(s => s.clearProjectHeroImage)
  const setProjectHeroOverlayColor = useStore(s => s.setProjectHeroOverlayColor)
  const createAssetUploadIntent = useAction('assets:createAssetUploadIntent')
  const finalizeAssetUpload = useMutation('assets:finalizeAssetUpload')
  const getAssetSignedView = useAction('assets:getAssetSignedView')
  const cloudAccessPolicy = useCloudAccessPolicy()
  const cloudAssetBlocked = projectRef?.type === 'cloud' && !cloudAccessPolicy.canAccessCloudAssets
  const libraryAssetsArgs = (open && projectRef?.type === 'cloud' && !cloudAssetBlocked)
    ? { projectId: projectRef.projectId, kind: 'storyboard_image', limit: 120 }
    : 'skip'
  const libraryAssets = useQuery('assets:listProjectLibraryAssets', libraryAssetsArgs)
  useConvexQueryDiagnosticsSafe({
    component: 'ProjectPropertiesDialog',
    queryName: 'assets:listProjectLibraryAssets',
    args: libraryAssetsArgs,
    result: libraryAssets,
    active: libraryAssetsArgs !== 'skip',
    hidden: !open,
  })

  const fileInputRef = useRef(null)
  const [title, setTitle] = useState(projectName || '')
  const [emoji, setEmoji] = useState(projectEmoji || '🎬')
  const [logline, setLogline] = useState(projectLogline || '')
  const [overlayColor, setOverlayColor] = useState(projectHeroOverlayColor || '#1f1f27')
  const [heroImageDraft, setHeroImageDraft] = useState(projectHeroImage || null)
  const [saving, setSaving] = useState(false)
  const getSignedViewWithCache = useCallback(async (assetId) => {
    if (projectRef?.type !== 'cloud' || !projectRef?.projectId || !assetId) return null
    return getOrCreateSignedViewRequest({
      projectId: projectRef.projectId,
      assetId,
      fetcher: () => getAssetSignedView({
        projectId: projectRef.projectId,
        assetId,
      }),
    })
  }, [getAssetSignedView, projectRef?.projectId, projectRef?.type])

  useEffect(() => {
    if (!open) return
    setTitle(projectName || '')
    setEmoji(projectEmoji || '🎬')
    setLogline(projectLogline || '')
    setOverlayColor(projectHeroOverlayColor || '#1f1f27')
    setHeroImageDraft(projectHeroImage || null)
  }, [open, projectEmoji, projectHeroImage, projectHeroOverlayColor, projectLogline, projectName])

  const heroPreviewSrc = useMemo(
    () => heroImageDraft?.imageAsset?.thumb || heroImageDraft?.image || null,
    [heroImageDraft]
  )

  if (!open) return null

  const handleHeroFileChange = async (event) => {
    const file = event.target.files?.[0]
    if (!file) return
    if (!file.type.match(/^image\//)) {
      alert('Please select an image file (JPG, PNG, WEBP)')
      event.target.value = ''
      return
    }

    try {
      if (projectRef?.type === 'cloud') {
        if (cloudAssetBlocked || !cloudAccessPolicy.canEditCloudProject) {
          alert('Cloud image uploads are blocked while billing is inactive.')
          return
        }
        if (!CLOUD_IMAGE_ALLOWED_SOURCE_MIME_TYPES.includes(file.type)) {
          alert('Cloud uploads support JPG, PNG, or WEBP files for beta.')
          return
        }
        if (file.size > CLOUD_IMAGE_MAX_SOURCE_BYTES) {
          alert('Cloud uploads are limited to 15MB source files for beta.')
          return
        }
        const processed = await processStoryboardUploadForCloud(file, {
          outputWidth: 1280,
          outputHeight: 480,
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
          const signedView = await getSignedViewWithCache(uploadedAssetId)
          const signedPayload = buildShotImageFromLibraryAsset(signedView)
          setHeroImageDraft(signedPayload || uploaded)
        } else {
          setHeroImageDraft(uploaded)
        }
      } else {
        const processed = await processStoryboardUpload(file, {
          thumbnailWidth: 1600,
          fullLongEdge: 2000,
          quality: 0.84,
        })
        setHeroImageDraft({
          image: processed.thumb,
          imageAsset: {
            version: 1,
            mime: processed.mime || 'image/webp',
            thumb: processed.thumb,
            full: null,
            meta: processed.meta || null,
            cloud: null,
          },
        })
      }
    } catch (error) {
      console.error(error)
      alert('Could not process this image. Please try a different file.')
    } finally {
      event.target.value = ''
    }
  }

  const handlePickFromLibrary = async (assetId) => {
    if (projectRef?.type !== 'cloud' || cloudAssetBlocked) return
    const view = await getSignedViewWithCache(assetId)
    const payload = buildShotImageFromLibraryAsset(view)
    if (payload) setHeroImageDraft(payload)
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      setProjectName(title.trim() || 'Untitled Shotlist')
      setProjectEmoji(emoji.trim() || '🎬')
      setProjectLogline(logline)
      setProjectHeroOverlayColor(overlayColor || '#1f1f27')
      if (hasHeroImageValue(heroImageDraft)) {
        setProjectHeroImage(heroImageDraft)
      } else {
        clearProjectHeroImage()
      }
      if (typeof onSaveIdentity === 'function') {
        await onSaveIdentity({
          name: title.trim() || 'Untitled Shotlist',
          emoji: emoji.trim() || '🎬',
        })
      }
      onClose()
    } catch (error) {
      alert(error?.message || 'Could not save project properties.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-overlay" style={{ zIndex: 760 }} onClick={onClose}>
      <div className="modal app-dialog home-project-props-dialog" onClick={(e) => e.stopPropagation()}>
        <h3 className="dialog-title">Project Properties</h3>
        <div className="dialog-form-grid">
          <label className="dialog-label">Project title</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} />

          <label className="dialog-label">Project icon</label>
          <div className="home-project-props-emoji-row">
            {EMOJI_CHOICES.map((choice) => (
              <button key={choice} type="button" className={`home-project-props-emoji ${emoji === choice ? 'active' : ''}`} onClick={() => setEmoji(choice)}>{choice}</button>
            ))}
            <input value={emoji} onChange={(e) => setEmoji(e.target.value)} maxLength={3} placeholder="Any emoji" />
          </div>

          <label className="dialog-label">Project logline</label>
          <textarea value={logline} onChange={(e) => setLogline(e.target.value)} rows={3} maxLength={320} />

          <label className="dialog-label">Hero background image</label>
          <div className="home-project-props-stack">
            <div className="home-project-props-hero-preview" style={heroPreviewSrc ? { backgroundImage: `url(${heroPreviewSrc})` } : {}}>
              {!heroPreviewSrc ? <span>No hero image selected</span> : null}
            </div>
            <div className="home-project-props-inline">
              <button type="button" className="ss-btn ghost" onClick={() => fileInputRef.current?.click()}>Upload Image</button>
              <button type="button" className="ss-btn ghost" onClick={() => setHeroImageDraft(null)}>Remove</button>
            </div>
            <input ref={fileInputRef} type="file" accept="image/*" hidden onChange={handleHeroFileChange} />
            {projectRef?.type === 'cloud' && Array.isArray(libraryAssets) && libraryAssets.length > 0 ? (
              <div className="home-project-props-library">
                {libraryAssets.slice(0, 8).map((asset) => (
                  <button key={String(asset.assetId)} type="button" onClick={() => handlePickFromLibrary(asset.assetId)}>
                    {asset.sourceName || `Asset ${String(asset.assetId).slice(-6)}`}
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          <label className="dialog-label">Hero overlay color</label>
          <div className="home-project-props-inline">
            <input type="color" value={overlayColor || '#1f1f27'} onChange={(e) => setOverlayColor(e.target.value)} />
            <code>{overlayColor || '#1f1f27'}</code>
          </div>
        </div>
        <div className="dialog-actions">
          <button className="dialog-button-secondary" onClick={onClose}>Cancel</button>
          <button className="dialog-button-primary" onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : 'Save'}</button>
        </div>
      </div>
    </div>
  )
}
