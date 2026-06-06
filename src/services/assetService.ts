export type StoryboardUploadResult = {
  thumbBlob: Blob,
  fullBlob: Blob,
  mime: string,
  meta: Record<string, any> | null,
  thumbDataUrl?: string | null,
}

export type CloudImageWorkflowPolicy = {
  canAccessCloudAssets?: boolean,
  canEditCloudProject?: boolean,
}

export const LOCAL_ASSET_URI_SCHEME = 'shotscribe-asset://'

export function isCloudImageWorkflowEnabled(projectRef: any, cloudAccessPolicy: CloudImageWorkflowPolicy = {}) {
  return Boolean(
    projectRef?.type === 'cloud'
    && projectRef?.projectId
    && cloudAccessPolicy?.canAccessCloudAssets
    && cloudAccessPolicy?.canEditCloudProject
  )
}

export function isCloudImageReadEnabled(projectRef: any, cloudAccessPolicy: CloudImageWorkflowPolicy = {}) {
  return Boolean(
    projectRef?.type === 'cloud'
    && projectRef?.projectId
    && cloudAccessPolicy?.canAccessCloudAssets
  )
}

export function isLocalAssetUri(value: any) {
  return typeof value === 'string' && value.trim().startsWith(LOCAL_ASSET_URI_SCHEME)
}

export function localAssetUriFromRelativePath(relativePath: string) {
  return `${LOCAL_ASSET_URI_SCHEME}${String(relativePath || '').replace(/^\/+/, '')}`
}

export function relativePathFromLocalAssetUri(uri: any) {
  if (!isLocalAssetUri(uri)) return null
  return String(uri).slice(LOCAL_ASSET_URI_SCHEME.length).replace(/^\/+/, '') || null
}

function safeBaseName(value: any, fallback = 'asset') {
  const base = String(value || fallback)
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/[^a-z0-9_-]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
  return base || fallback
}

async function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(reader.error || new Error('Could not read image blob'))
    reader.readAsDataURL(blob)
  })
}

async function hashBlob(blob: Blob) {
  const buffer = await blob.arrayBuffer()
  if (typeof crypto !== 'undefined' && crypto.subtle?.digest) {
    const digest = await crypto.subtle.digest('SHA-256', buffer)
    return Array.from(new Uint8Array(digest))
      .slice(0, 8)
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('')
  }
  let hash = 0
  const bytes = new Uint8Array(buffer)
  for (const byte of bytes) hash = ((hash << 5) - hash + byte) | 0
  return Math.abs(hash).toString(16).padStart(8, '0')
}

export async function buildLocalImageAsset({
  processed,
  projectFilePath,
  platformService,
  fileNamePrefix = 'asset',
  sourceMeta = {},
}: {
  processed: StoryboardUploadResult,
  projectFilePath?: string | null,
  platformService?: any,
  fileNamePrefix?: string,
  sourceMeta?: Record<string, any>,
}) {
  const blob = processed?.thumbBlob || processed?.fullBlob
  if (!blob) throw new Error('Missing processed local image blob')
  const hash = await hashBlob(blob)
  const fileName = `${safeBaseName(fileNamePrefix)}-${hash}.webp`
  const meta = {
    ...(processed.meta || {}),
    ...(sourceMeta || {}),
    localFileName: fileName,
    localRelativePath: fileName,
  }

  if (projectFilePath && platformService?.writeLocalAsset) {
    try {
      const dataUrl = await blobToDataUrl(blob)
      const writeResult = await platformService.writeLocalAsset(projectFilePath, fileName, dataUrl)
      if (writeResult?.success) {
        const localRelativePath = writeResult.relativePath || fileName
        const ref = localAssetUriFromRelativePath(localRelativePath)
        return {
          image: ref,
          imageAsset: {
            version: 1,
            mime: processed.mime || 'image/webp',
            thumb: ref,
            full: null,
            meta: {
              ...meta,
              localFileName: writeResult.fileName || fileName,
              localRelativePath,
            },
            cloud: null,
          },
        }
      }
    } catch (error) {
      console.warn('Local asset file write failed; falling back to embedded local image', error)
    }
  }

  const fallbackThumb = processed.thumbDataUrl?.startsWith('data:')
    ? processed.thumbDataUrl
    : await blobToDataUrl(blob)
  return {
    image: fallbackThumb,
    imageAsset: {
      version: 1,
      mime: processed.mime || 'image/webp',
      thumb: fallbackThumb,
      full: null,
      meta: {
        ...(processed.meta || {}),
        ...(sourceMeta || {}),
        localFallback: 'embedded_data_url',
      },
      cloud: null,
    },
  }
}

async function uploadBlobToS3(uploadUrl: string, blob: Blob) {
  const response = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': blob.type || 'application/octet-stream',
    },
    body: blob,
  })

  if (!response.ok) {
    throw new Error(`Asset upload failed (${response.status})`)
  }
}

export async function uploadStoryboardAssetToCloud({
  projectId,
  processed,
  createAssetUploadIntent,
  finalizeAssetUpload,
}: {
  projectId: string,
  processed: StoryboardUploadResult,
  createAssetUploadIntent: (args: { projectId: string, kind: 'storyboard_image', mime: string, sourceName?: string }) => Promise<any>,
  finalizeAssetUpload: (args: any) => Promise<any>,
}) {
  if (!projectId) throw new Error('Cloud image upload requires a cloud project id')
  const uploadIntent = await createAssetUploadIntent({
    projectId,
    kind: 'storyboard_image',
    mime: processed.mime,
    sourceName: String(processed?.meta?.sourceName || 'storyboard-image'),
  })

  await uploadBlobToS3(uploadIntent.uploadUrl, processed.thumbBlob)

  const completed = await finalizeAssetUpload({
    projectId,
    kind: 'storyboard_image',
    provider: 's3',
    objectKey: uploadIntent.objectKey,
    bucket: uploadIntent.bucket,
    mime: processed.mime,
    sourceName: processed?.meta?.sourceName || '',
    meta: processed.meta || null,
  })

  return {
    image: completed?.thumbUrl || processed.thumbDataUrl || null,
    imageAsset: {
      version: 1,
      mime: processed.mime,
      thumb: completed?.thumbUrl || processed.thumbDataUrl || null,
      full: null,
      meta: processed.meta || null,
      cloud: {
        assetId: completed?.assetId ? String(completed.assetId) : null,
        provider: 's3',
        objectKey: uploadIntent.objectKey || null,
      },
    },
  }
}

export function collectCloudAssetIdsFromProjectData(projectData: any) {
  const ids = new Set<string>()
  const heroAssetId = projectData?.projectHeroImage?.imageAsset?.cloud?.assetId
  if (heroAssetId) ids.add(String(heroAssetId))
  for (const scene of (projectData?.scenes || [])) {
    for (const shot of (scene?.shots || [])) {
      const assetId = shot?.imageAsset?.cloud?.assetId
      if (assetId) ids.add(String(assetId))
    }
  }
  return Array.from(ids)
}

export function buildShotImageFromLibraryAsset(assetView: any) {
  if (!assetView?.assetId) return null
  return {
    image: assetView?.thumbUrl || null,
    imageAsset: {
      version: 1,
      mime: assetView?.mime || 'image/webp',
      thumb: assetView?.thumbUrl || null,
      full: assetView?.fullUrl || null,
      meta: assetView?.meta || null,
      cloud: {
        assetId: String(assetView.assetId),
        provider: assetView?.provider || 's3',
      },
    },
  }
}
