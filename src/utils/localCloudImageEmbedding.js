function isHttpUrl(value) {
  return typeof value === 'string' && /^https?:\/\//i.test(value.trim())
}

function cloudAssetIdFrom(node) {
  const id = node?.imageAsset?.cloud?.assetId
  return typeof id === 'string' && id.trim() ? id.trim() : null
}

function cloudObjectKeyFrom(node) {
  const key = node?.imageAsset?.cloud?.objectKey
  return typeof key === 'string' && key.trim() ? key.trim() : null
}

function imageUrlFrom(node) {
  return [node?.imageAsset?.thumb, node?.imageAsset?.full, node?.image].find(isHttpUrl) || null
}

function hasCloudReference(node) {
  return Boolean(imageUrlFrom(node) || cloudAssetIdFrom(node) || cloudObjectKeyFrom(node) || node?.imageAsset?.cloud?.provider)
}

function collectEntries(projectData = {}) {
  const entries = []
  if (hasCloudReference(projectData.projectHeroImage)) entries.push({ kind: 'hero', node: projectData.projectHeroImage })
  for (const scene of (projectData.scenes || [])) {
    for (const shot of (scene?.shots || [])) {
      if (hasCloudReference(shot)) entries.push({ kind: 'shot', shotId: shot?.id || null, node: shot })
    }
  }
  return entries
}

export function detectCloudImageReferencesForEmbeddedLocalProject(projectData = {}) {
  const entries = collectEntries(projectData)
  return {
    hasCloudImageReferences: entries.length > 0,
    totalCount: entries.length,
    urlCount: entries.filter((entry) => imageUrlFrom(entry.node)).length,
    assetIdCount: entries.filter((entry) => cloudAssetIdFrom(entry.node)).length,
  }
}

function cloneProjectData(projectData) {
  return JSON.parse(JSON.stringify(projectData || {}))
}

async function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(reader.error || new Error('Could not read downloaded image'))
    reader.readAsDataURL(blob)
  })
}

async function blobToWebpDataUrl(blob, quality = 0.84) {
  const fallback = () => blobToDataUrl(blob)
  if (typeof Image === 'undefined' || typeof document === 'undefined') return fallback()
  const objectUrl = URL.createObjectURL(blob)
  try {
    const image = await new Promise((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = reject
      img.src = objectUrl
    })
    const canvas = document.createElement('canvas')
    canvas.width = image.naturalWidth || image.width || 1
    canvas.height = image.naturalHeight || image.height || 1
    const ctx = canvas.getContext('2d', { alpha: false })
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height)
    return canvas.toDataURL('image/webp', quality)
  } catch {
    return fallback()
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

function applyEmbedded(node, dataUrl, baseMeta) {
  node.image = dataUrl
  node.imageAsset = {
    version: 1,
    mime: dataUrl.startsWith('data:image/webp') ? 'image/webp' : (node?.imageAsset?.mime || 'image/*'),
    thumb: dataUrl,
    full: null,
    meta: {
      ...(node?.imageAsset?.meta || {}),
      ...baseMeta,
      embeddedFromCloudReference: true,
    },
    cloud: null,
  }
}

export async function embedCloudImagesInLocalProject({ projectData, cloudImageResolver = null } = {}) {
  const nextProjectData = cloneProjectData(projectData)
  const entries = collectEntries(nextProjectData)
  const cache = new Map()
  let embeddedCount = 0
  let failedCount = 0
  const lineageProjectId = nextProjectData?.cloudLineage?.originProjectId || null

  for (const entry of entries) {
    const node = entry.node
    const url = imageUrlFrom(node)
    const assetId = cloudAssetIdFrom(node)
    const objectKey = cloudObjectKeyFrom(node)
    const cacheKey = url ? `url:${url}` : (assetId ? `asset:${assetId}` : null)
    const baseMeta = {
      ...(url ? { migratedFromCloudUrl: url } : {}),
      ...(assetId ? { migratedFromCloudAssetId: assetId } : {}),
      ...(objectKey ? { migratedFromCloudObjectKey: objectKey } : {}),
    }

    try {
      let dataUrl = cacheKey ? cache.get(cacheKey) : null
      if (!dataUrl && url) {
        const response = await fetch(url)
        if (!response.ok) throw new Error(`Image download failed (${response.status})`)
        dataUrl = await blobToWebpDataUrl(await response.blob())
      }
      if (!dataUrl && assetId && lineageProjectId && typeof cloudImageResolver === 'function') {
        dataUrl = await cloudImageResolver(lineageProjectId, assetId)
      }
      if (!dataUrl) throw new Error('Cloud image could not be resolved')
      if (cacheKey) cache.set(cacheKey, dataUrl)
      applyEmbedded(node, dataUrl, baseMeta)
      embeddedCount += 1
    } catch (error) {
      console.warn('Cloud image embed migration failed', error)
      failedCount += 1
    }
  }

  return { projectData: nextProjectData, embeddedCount, failedCount, totalCount: entries.length }
}
