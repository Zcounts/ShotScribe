export type StoryboardUploadResult = {
  thumbBlob: Blob,
  fullBlob: Blob,
  mime: string,
  meta: Record<string, any> | null,
  thumbDataUrl?: string | null,
}

async function uploadBlobToConvex(uploadUrl: string, blob: Blob) {
  const response = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      'Content-Type': blob.type || 'application/octet-stream',
    },
    body: blob,
  })

  if (!response.ok) {
    throw new Error(`Asset upload failed (${response.status})`)
  }

  const json = await response.json()
  if (!json?.storageId) {
    throw new Error('Asset upload did not return a storage id')
  }
  return json.storageId as string
}

export async function uploadStoryboardAssetToCloud({
  projectId,
  shotId,
  processed,
  createAssetUploadUrl,
  completeAssetUpload,
}: {
  projectId: string,
  shotId: string,
  processed: StoryboardUploadResult,
  createAssetUploadUrl: (args: { projectId: string }) => Promise<{ uploadUrl: string }>,
  completeAssetUpload: (args: any) => Promise<any>,
}) {
  const thumbTarget = await createAssetUploadUrl({ projectId })

  const thumbStorageId = await uploadBlobToConvex(thumbTarget.uploadUrl, processed.thumbBlob)
  const fullStorageId = thumbStorageId

  const completed = await completeAssetUpload({
    projectId,
    shotId,
    kind: 'storyboard_image',
    mime: processed.mime,
    sourceName: processed?.meta?.sourceName || '',
    thumbStorageId,
    fullStorageId,
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
        thumbStorageId,
        fullStorageId,
      },
    },
  }
}

export function collectCloudAssetIdsFromProjectData(projectData: any) {
  const ids = new Set<string>()
  for (const scene of (projectData?.scenes || [])) {
    for (const shot of (scene?.shots || [])) {
      const assetId = shot?.imageAsset?.cloud?.assetId
      if (assetId) ids.add(String(assetId))
    }
  }
  return Array.from(ids)
}
