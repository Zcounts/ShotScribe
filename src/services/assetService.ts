export type StoryboardUploadResult = {
  thumbBlob: Blob,
  fullBlob: Blob,
  mime: string,
  meta: Record<string, any> | null,
  thumbDataUrl?: string | null,
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
  shotId,
  processed,
  createAssetUploadIntent,
  finalizeAssetUpload,
}: {
  projectId: string,
  shotId: string,
  processed: StoryboardUploadResult,
  createAssetUploadIntent: (args: { projectId: string, kind: 'storyboard_image', mime: string, sourceName?: string }) => Promise<any>,
  finalizeAssetUpload: (args: any) => Promise<any>,
}) {
  const uploadIntent = await createAssetUploadIntent({
    projectId,
    kind: 'storyboard_image',
    mime: processed.mime,
    sourceName: String(processed?.meta?.sourceName || 'storyboard-image'),
  })

  await uploadBlobToS3(uploadIntent.uploadUrl, processed.thumbBlob)

  const completed = await finalizeAssetUpload({
    projectId,
    shotId,
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
  for (const scene of (projectData?.scenes || [])) {
    for (const shot of (scene?.shots || [])) {
      const assetId = shot?.imageAsset?.cloud?.assetId
      if (assetId) ids.add(String(assetId))
    }
  }
  return Array.from(ids)
}
