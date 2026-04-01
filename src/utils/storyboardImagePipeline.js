function loadImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = URL.createObjectURL(file)
  })
}

function computeContainSize(width, height, maxLongEdge) {
  if (!width || !height) return { width: maxLongEdge, height: maxLongEdge }
  const longEdge = Math.max(width, height)
  const scale = Math.min(1, maxLongEdge / longEdge)
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  }
}

function toWebpDataUrl(sourceImage, targetWidth, targetHeight, quality) {
  const canvas = document.createElement('canvas')
  canvas.width = targetWidth
  canvas.height = targetHeight
  const ctx = canvas.getContext('2d', { alpha: false })
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(sourceImage, 0, 0, targetWidth, targetHeight)
  return canvas.toDataURL('image/webp', quality)
}

function toWebpBlob(sourceImage, targetWidth, targetHeight, quality) {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas')
    canvas.width = targetWidth
    canvas.height = targetHeight
    const ctx = canvas.getContext('2d', { alpha: false })
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(sourceImage, 0, 0, targetWidth, targetHeight)
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('Failed to render WEBP blob'))
        return
      }
      resolve(blob)
    }, 'image/webp', quality)
  })
}

function estimateDataUrlBytes(dataUrl) {
  if (!dataUrl || typeof dataUrl !== 'string') return 0
  const base64Payload = dataUrl.split(',')[1] || ''
  return Math.round((base64Payload.length * 3) / 4)
}

export async function processStoryboardUpload(file, options = {}) {
  const thumbnailWidth = options.thumbnailWidth || 480
  const fullLongEdge = options.fullLongEdge || 1600
  const quality = options.quality || 0.84
  const sourceImage = await loadImage(file)
  try {
    const sourceWidth = sourceImage.naturalWidth || sourceImage.width
    const sourceHeight = sourceImage.naturalHeight || sourceImage.height
    const thumbScale = thumbnailWidth / Math.max(1, sourceWidth)
    const thumbHeight = Math.max(1, Math.round(sourceHeight * Math.min(1, thumbScale)))
    const fullSize = computeContainSize(sourceWidth, sourceHeight, fullLongEdge)

    const thumb = toWebpDataUrl(sourceImage, Math.min(sourceWidth, thumbnailWidth), thumbHeight, quality)
    const full = toWebpDataUrl(sourceImage, fullSize.width, fullSize.height, quality)

    return {
      thumb,
      full,
      mime: 'image/webp',
      meta: {
        sourceName: file.name || '',
        sourceBytes: file.size || 0,
        sourceWidth,
        sourceHeight,
        thumbWidth: Math.min(sourceWidth, thumbnailWidth),
        thumbHeight,
        fullWidth: fullSize.width,
        fullHeight: fullSize.height,
        thumbBytes: estimateDataUrlBytes(thumb),
        fullBytes: estimateDataUrlBytes(full),
      },
    }
  } finally {
    URL.revokeObjectURL(sourceImage.src)
  }
}

export async function processStoryboardUploadForCloud(file, options = {}) {
  const thumbnailWidth = options.thumbnailWidth || 480
  const fullLongEdge = options.fullLongEdge || 1600
  const quality = options.quality || 0.84
  const sourceImage = await loadImage(file)
  try {
    const sourceWidth = sourceImage.naturalWidth || sourceImage.width
    const sourceHeight = sourceImage.naturalHeight || sourceImage.height
    const thumbScale = thumbnailWidth / Math.max(1, sourceWidth)
    const thumbHeight = Math.max(1, Math.round(sourceHeight * Math.min(1, thumbScale)))
    const fullSize = computeContainSize(sourceWidth, sourceHeight, fullLongEdge)
    const thumbWidth = Math.min(sourceWidth, thumbnailWidth)

    const [thumbBlob, fullBlob] = await Promise.all([
      toWebpBlob(sourceImage, thumbWidth, thumbHeight, quality),
      toWebpBlob(sourceImage, fullSize.width, fullSize.height, quality),
    ])

    return {
      thumbBlob,
      fullBlob,
      thumbDataUrl: URL.createObjectURL(thumbBlob),
      mime: 'image/webp',
      meta: {
        sourceName: file.name || '',
        sourceBytes: file.size || 0,
        sourceWidth,
        sourceHeight,
        thumbWidth,
        thumbHeight,
        fullWidth: fullSize.width,
        fullHeight: fullSize.height,
        thumbBytes: thumbBlob.size || 0,
        fullBytes: fullBlob.size || 0,
      },
    }
  } finally {
    URL.revokeObjectURL(sourceImage.src)
  }
}
