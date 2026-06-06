import { localAssetUriFromRelativePath } from '../services/assetService'

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
  const candidates = [node?.imageAsset?.thumb, node?.imageAsset?.full, node?.image]
  return candidates.find(isHttpUrl) || null
}

function hasCloudReference(node) {
  return Boolean(cloudAssetIdFrom(node) || cloudObjectKeyFrom(node) || node?.imageAsset?.cloud?.provider || imageUrlFrom(node))
}

function getEntries(projectData = {}) {
  const entries = []
  if (hasCloudReference(projectData.projectHeroImage)) {
    entries.push({ kind: 'hero', node: projectData.projectHeroImage })
  }
  for (const scene of (projectData.scenes || [])) {
    for (const shot of (scene?.shots || [])) {
      if (hasCloudReference(shot)) entries.push({ kind: 'shot', shotId: shot?.id || null, node: shot })
    }
  }
  return entries
}

export function detectCloudImageReferencesForLocalProject(projectData = {}) {
  const entries = getEntries(projectData)
  return {
    hasCloudImageReferences: entries.length > 0,
    totalCount: entries.length,
    urlCount: entries.filter(entry => imageUrlFrom(entry.node)).length,
    assetIdCount: entries.filter(entry => cloudAssetIdFrom(entry.node)).length,
  }
}

function cloneProjectData(projectData) {
  return JSON.parse(JSON.stringify(projectData || {}))
}

function makePlaceholder(node, status, extraMeta = {}) {
  const originalUrl = imageUrlFrom(node)
  const originalAssetId = cloudAssetIdFrom(node)
  const originalObjectKey = cloudObjectKeyFrom(node)
  return {
    image: null,
    imageAsset: {
      version: 1,
      mime: node?.imageAsset?.mime || 'image/webp',
      thumb: null,
      full: null,
      meta: {
        ...(node?.imageAsset?.meta || {}),
        ...(originalUrl ? { migratedFromCloudUrl: originalUrl } : {}),
        ...(originalAssetId ? { migratedFromCloudAssetId: originalAssetId } : {}),
        ...(originalObjectKey ? { migratedFromCloudObjectKey: originalObjectKey } : {}),
        localMigrationStatus: status,
        ...extraMeta,
      },
      cloud: null,
    },
  }
}

function applyReplacement(node, replacement) {
  if (!node || !replacement) return
  node.image = replacement.image || replacement.imageAsset?.thumb || null
  node.imageAsset = replacement.imageAsset || null
}

async function migrateUrlToLocalAsset({ platformService, projectFilePath, url, fileName, meta }) {
  const result = await platformService.downloadUrlToLocalAsset(projectFilePath, url, fileName)
  if (!result?.success) return null
  const relativePath = result.relativePath || result.fileName || fileName
  const ref = localAssetUriFromRelativePath(relativePath)
  return {
    image: ref,
    imageAsset: {
      version: 1,
      mime: result.mime || 'image/webp',
      thumb: ref,
      full: null,
      meta: {
        ...(meta || {}),
        localFileName: result.fileName || fileName,
        localRelativePath: relativePath,
      },
      cloud: null,
    },
  }
}

export async function migrateCloudImagesToLocalAssets({
  projectData,
  projectFilePath,
  platformService,
  cloudImageResolver = null,
} = {}) {
  const nextProjectData = cloneProjectData(projectData)
  const entries = getEntries(nextProjectData)
  if (!entries.length) return { projectData: nextProjectData, migratedCount: 0, failedCount: 0, skipped: false }
  const cache = new Map()
  let migratedCount = 0
  let failedCount = 0
  const lineageProjectId = nextProjectData?.cloudLineage?.originProjectId || null

  for (const entry of entries) {
    const node = entry.node
    const url = imageUrlFrom(node)
    const assetId = cloudAssetIdFrom(node)
    const cacheKey = url ? `url:${url}` : (assetId ? `asset:${assetId}` : null)
    const sourceName = entry.kind === 'shot' && entry.shotId ? `shot-${entry.shotId}` : 'hero'
    const fileName = `${sourceName}-${assetId || Date.now()}.webp`.replace(/[^a-z0-9_.-]+/gi, '-')
    const objectKey = cloudObjectKeyFrom(node)
    const baseMeta = {
      ...(node?.imageAsset?.meta || {}),
      ...(url ? { migratedFromCloudUrl: url } : {}),
      ...(assetId ? { migratedFromCloudAssetId: assetId } : {}),
      ...(objectKey ? { migratedFromCloudObjectKey: objectKey } : {}),
    }

    if (cacheKey && cache.has(cacheKey)) {
      const cached = cache.get(cacheKey)
      applyReplacement(node, cached || makePlaceholder(node, 'cloud_image_not_downloaded'))
      if (cached) migratedCount += 1
      else failedCount += 1
      continue
    }

    let replacement = null
    try {
      if (url && projectFilePath && platformService?.downloadUrlToLocalAsset) {
        replacement = await migrateUrlToLocalAsset({ platformService, projectFilePath, url, fileName, meta: baseMeta })
      }
      if (!replacement && assetId && lineageProjectId && typeof cloudImageResolver === 'function') {
        const dataUrl = await cloudImageResolver(lineageProjectId, assetId)
        if (dataUrl && projectFilePath && platformService?.writeLocalAsset) {
          const writeResult = await platformService.writeLocalAsset(projectFilePath, fileName, dataUrl)
          if (writeResult?.success) {
            const relativePath = writeResult.relativePath || writeResult.fileName || fileName
            const ref = localAssetUriFromRelativePath(relativePath)
            replacement = {
              image: ref,
              imageAsset: {
                version: 1,
                mime: 'image/webp',
                thumb: ref,
                full: null,
                meta: { ...baseMeta, localFileName: writeResult.fileName || fileName, localRelativePath: relativePath },
                cloud: null,
              },
            }
          }
        }
      }
    } catch (error) {
      console.warn('Cloud image local migration failed', error)
      replacement = null
    }

    if (cacheKey) cache.set(cacheKey, replacement)
    if (replacement) {
      migratedCount += 1
      applyReplacement(node, replacement)
    } else {
      failedCount += 1
      applyReplacement(node, makePlaceholder(node, 'cloud_image_not_downloaded'))
    }
  }

  return { projectData: nextProjectData, migratedCount, failedCount, skipped: false }
}
