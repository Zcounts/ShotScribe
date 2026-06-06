import { localAssetUriFromRelativePath } from '../services/assetService'

function isEmbeddedImageDataUrl(value) {
  return typeof value === 'string' && value.trim().startsWith('data:image/')
}

function cloneProjectData(projectData) {
  return JSON.parse(JSON.stringify(projectData || {}))
}

function collectEntries(projectData = {}) {
  const entries = []
  const addNode = ({ kind, shotId = null, node }) => {
    if (!node || typeof node !== 'object') return
    const refs = [node?.imageAsset?.thumb, node?.image, node?.imageAsset?.full].filter(isEmbeddedImageDataUrl)
    if (refs.length === 0) return
    entries.push({ kind, shotId, node, dataUrl: refs[0], refs: Array.from(new Set(refs)) })
  }
  addNode({ kind: 'hero', node: projectData.projectHeroImage })
  for (const scene of (projectData.scenes || [])) {
    for (const shot of (scene?.shots || [])) addNode({ kind: 'shot', shotId: shot?.id || null, node: shot })
  }
  return entries
}

export function detectEmbeddedImageReferencesForLocalProject(projectData = {}) {
  const entries = collectEntries(projectData)
  return {
    hasEmbeddedImageReferences: entries.length > 0,
    totalCount: entries.length,
    uniqueCount: new Set(entries.map((entry) => entry.dataUrl)).size,
    shotCount: entries.filter((entry) => entry.kind === 'shot').length,
    heroCount: entries.filter((entry) => entry.kind === 'hero').length,
  }
}

function mimeFromDataUrl(dataUrl) {
  const match = String(dataUrl || '').match(/^data:([^;,]+)[;,]/i)
  return match?.[1] || 'image/*'
}

async function blobFromDataUrl(dataUrl) {
  const response = await fetch(dataUrl)
  return response.blob()
}

async function hashBlob(blob) {
  const buffer = await blob.arrayBuffer()
  if (typeof crypto !== 'undefined' && crypto.subtle?.digest) {
    const digest = await crypto.subtle.digest('SHA-256', buffer)
    return Array.from(new Uint8Array(digest)).slice(0, 8).map((byte) => byte.toString(16).padStart(2, '0')).join('')
  }
  let hash = 0
  const bytes = new Uint8Array(buffer)
  for (const byte of bytes) hash = ((hash << 5) - hash + byte) | 0
  return Math.abs(hash).toString(16).padStart(8, '0')
}

async function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(reader.error || new Error('Could not read embedded image'))
    reader.readAsDataURL(blob)
  })
}

async function convertDataUrlToWebpBlob(dataUrl, quality = 0.84) {
  if (typeof Image === 'undefined' || typeof document === 'undefined') return blobFromDataUrl(dataUrl)
  return new Promise((resolve) => {
    const image = new Image()
    image.onload = () => {
      try {
        const width = image.naturalWidth || image.width || 1
        const height = image.naturalHeight || image.height || 1
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d', { alpha: false })
        ctx.imageSmoothingEnabled = true
        ctx.imageSmoothingQuality = 'high'
        ctx.drawImage(image, 0, 0, width, height)
        canvas.toBlob((blob) => resolve(blob || null), 'image/webp', quality)
      } catch {
        resolve(null)
      }
    }
    image.onerror = () => resolve(null)
    image.src = dataUrl
  }).then(async (blob) => blob || blobFromDataUrl(dataUrl))
}

function applyReplacement(node, replacement, originalMime) {
  node.image = replacement.ref
  node.imageAsset = {
    version: 1,
    mime: 'image/webp',
    thumb: replacement.ref,
    full: null,
    meta: {
      ...(node?.imageAsset?.meta || {}),
      extractedFromEmbeddedDataUrl: true,
      originalEmbeddedMime: originalMime,
      localFileName: replacement.fileName,
      localRelativePath: replacement.relativePath,
    },
    cloud: null,
  }
}

export async function extractEmbeddedImagesToLocalAssets({
  projectData,
  projectFilePath,
  platformService,
} = {}) {
  const nextProjectData = cloneProjectData(projectData)
  const entries = collectEntries(nextProjectData)
  if (!entries.length) return { projectData: nextProjectData, embeddedFoundCount: 0, writtenCount: 0, rewrittenCount: 0, failedCount: 0 }
  const cache = new Map()
  let writtenCount = 0
  let rewrittenCount = 0
  let failedCount = 0

  for (const entry of entries) {
    const dataUrl = entry.dataUrl
    const originalMime = mimeFromDataUrl(dataUrl)
    let replacement = cache.get(dataUrl) || null
    try {
      if (!replacement) {
        const blob = await convertDataUrlToWebpBlob(dataUrl)
        const hash = await hashBlob(blob)
        const prefix = entry.kind === 'shot' && entry.shotId ? `shot-${entry.shotId}` : 'hero'
        const fileName = `${prefix}-${hash}.webp`.replace(/[^a-z0-9_.-]+/gi, '-')
        const writeResult = await platformService.writeLocalAsset(projectFilePath, fileName, await blobToDataUrl(blob))
        if (!writeResult?.success) throw new Error(writeResult?.error || 'Local asset write failed')
        const relativePath = writeResult.relativePath || writeResult.fileName || fileName
        replacement = {
          ref: localAssetUriFromRelativePath(relativePath),
          fileName: writeResult.fileName || fileName,
          relativePath,
        }
        cache.set(dataUrl, replacement)
        writtenCount += 1
      }
      applyReplacement(entry.node, replacement, originalMime)
      rewrittenCount += 1
    } catch (error) {
      console.warn('Embedded image extraction failed', error)
      failedCount += 1
    }
  }

  return {
    projectData: nextProjectData,
    embeddedFoundCount: entries.length,
    writtenCount,
    rewrittenCount,
    failedCount,
  }
}
