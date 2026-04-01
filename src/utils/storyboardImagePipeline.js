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

function toWebpBlobCover(sourceImage, targetWidth, targetHeight, quality) {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas')
    canvas.width = targetWidth
    canvas.height = targetHeight
    const ctx = canvas.getContext('2d', { alpha: false })
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'

    const sourceWidth = sourceImage.naturalWidth || sourceImage.width || targetWidth
    const sourceHeight = sourceImage.naturalHeight || sourceImage.height || targetHeight
    const sourceAspect = sourceWidth / Math.max(1, sourceHeight)
    const targetAspect = targetWidth / Math.max(1, targetHeight)

    let drawWidth = targetWidth
    let drawHeight = targetHeight
    let offsetX = 0
    let offsetY = 0

    if (sourceAspect > targetAspect) {
      drawHeight = targetHeight
      drawWidth = Math.round(targetHeight * sourceAspect)
      offsetX = Math.round((targetWidth - drawWidth) / 2)
    } else {
      drawWidth = targetWidth
      drawHeight = Math.round(targetWidth / Math.max(0.0001, sourceAspect))
      offsetY = Math.round((targetHeight - drawHeight) / 2)
    }

    ctx.drawImage(sourceImage, offsetX, offsetY, drawWidth, drawHeight)
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
  const outputWidth = options.outputWidth || 640
  const outputHeight = options.outputHeight || 360
  const quality = options.quality || 0.84
  const sourceImage = await loadImage(file)
  try {
    const sourceWidth = sourceImage.naturalWidth || sourceImage.width
    const sourceHeight = sourceImage.naturalHeight || sourceImage.height
    const normalizedBlob = await toWebpBlobCover(sourceImage, outputWidth, outputHeight, quality)
    const thumbBlob = normalizedBlob
    const fullBlob = normalizedBlob

    return {
      thumbBlob,
      fullBlob,
      thumbDataUrl: URL.createObjectURL(thumbBlob),
      mime: 'image/webp',
      meta: {
        sourceName: file.name || '',
        sourceMime: file.type || '',
        sourceBytes: file.size || 0,
        sourceWidth,
        sourceHeight,
        thumbWidth: outputWidth,
        thumbHeight: outputHeight,
        fullWidth: outputWidth,
        fullHeight: outputHeight,
        thumbBytes: thumbBlob.size || 0,
        fullBytes: fullBlob.size || 0,
        normalized: {
          width: outputWidth,
          height: outputHeight,
          fit: 'cover',
        },
      },
    }
  } finally {
    URL.revokeObjectURL(sourceImage.src)
  }
}
