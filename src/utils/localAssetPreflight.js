const INLINE_IMAGE_PREFIXES = ['data:', 'blob:', 'file:']

function isInlineLocalImageRef(value) {
  if (typeof value !== 'string') return false
  const trimmed = value.trim().toLowerCase()
  if (!trimmed) return false
  return INLINE_IMAGE_PREFIXES.some((prefix) => trimmed.startsWith(prefix))
}

function hasCloudAssetId(imageAsset) {
  return typeof imageAsset?.cloud?.assetId === 'string' && imageAsset.cloud.assetId.trim().length > 0
}

export function detectUnmigratedLocalAssetsFromProjectData(projectData = {}) {
  const shotIds = []
  let hasHeroPending = false

  const heroImage = projectData?.projectHeroImage
  if (heroImage && !hasCloudAssetId(heroImage.imageAsset)) {
    const heroRef = heroImage?.imageAsset?.thumb || heroImage?.image || null
    if (isInlineLocalImageRef(heroRef)) hasHeroPending = true
  }

  for (const scene of (projectData?.scenes || [])) {
    for (const shot of (scene?.shots || [])) {
      if (hasCloudAssetId(shot?.imageAsset)) continue
      const sourceRef = shot?.imageAsset?.thumb || shot?.image || null
      if (!isInlineLocalImageRef(sourceRef)) continue
      if (shot?.id) shotIds.push(String(shot.id))
    }
  }

  const uniqueShotIds = Array.from(new Set(shotIds))
  return {
    hasHeroPending,
    pendingHeroCount: hasHeroPending ? 1 : 0,
    pendingShotIds: uniqueShotIds,
    pendingShotCount: uniqueShotIds.length,
    totalPendingCount: uniqueShotIds.length + (hasHeroPending ? 1 : 0),
  }
}

