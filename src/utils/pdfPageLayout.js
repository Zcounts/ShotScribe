export function derivePdfPageLayout(widthPx, heightPx) {
  const width = Number(widthPx)
  const height = Number(heightPx)

  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new Error('Invalid PDF page dimensions.')
  }

  const orientation = width >= height ? 'landscape' : 'portrait'
  return {
    width,
    height,
    orientation,
    format: [width, height],
  }
}
