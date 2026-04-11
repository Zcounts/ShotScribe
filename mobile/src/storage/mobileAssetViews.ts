export interface StoredAssetViewEntry {
  projectId: string
  assetId: string
  url: string
  expiresAt?: number
  cachedAt: number
}

export interface StoredAssetViewCache {
  version: 1
  entries: Record<string, StoredAssetViewEntry>
}

const ASSET_VIEW_STORAGE_KEY = 'shotscribe.mobile.assetSignedViews.v1'
const FALLBACK_TTL_MS = 60 * 1000

const EMPTY_CACHE: StoredAssetViewCache = {
  version: 1,
  entries: {},
}

function makeKey(projectId: string, assetId: string) {
  return `${projectId}:${assetId}`
}

export function loadAssetViewCache(): StoredAssetViewCache {
  const raw = window.localStorage.getItem(ASSET_VIEW_STORAGE_KEY)
  if (!raw) return EMPTY_CACHE
  try {
    const parsed = JSON.parse(raw) as Partial<StoredAssetViewCache>
    if (parsed.version !== 1 || typeof parsed.entries !== 'object' || !parsed.entries) return EMPTY_CACHE
    const entries: StoredAssetViewCache['entries'] = {}
    for (const [key, unsafeEntry] of Object.entries(parsed.entries)) {
      if (!unsafeEntry || typeof unsafeEntry !== 'object') continue
      const entry = unsafeEntry as Partial<StoredAssetViewEntry>
      if (!entry.projectId || !entry.assetId || !entry.url) continue
      entries[key] = {
        projectId: String(entry.projectId),
        assetId: String(entry.assetId),
        url: String(entry.url),
        expiresAt: Number.isFinite(entry.expiresAt) ? Number(entry.expiresAt) : undefined,
        cachedAt: Number.isFinite(entry.cachedAt) ? Number(entry.cachedAt) : Date.now(),
      }
    }
    return { version: 1, entries }
  } catch {
    return EMPTY_CACHE
  }
}

export function saveAssetViewCache(cache: StoredAssetViewCache): void {
  window.localStorage.setItem(ASSET_VIEW_STORAGE_KEY, JSON.stringify(cache))
}

export function getCachedAssetViewUrl(
  cache: StoredAssetViewCache,
  projectId: string,
  assetId: string,
  now = Date.now(),
): string | null {
  const entry = cache.entries[makeKey(projectId, assetId)]
  if (!entry) return null
  const isExpiredByServer = Number.isFinite(entry.expiresAt) && Number(entry.expiresAt) > 0 && now >= Number(entry.expiresAt)
  const isExpiredByFallback = now - Number(entry.cachedAt || 0) >= FALLBACK_TTL_MS
  if (isExpiredByServer || isExpiredByFallback) return null
  return entry.url
}

export function upsertAssetViewUrl(
  cache: StoredAssetViewCache,
  entry: StoredAssetViewEntry,
): StoredAssetViewCache {
  const key = makeKey(entry.projectId, entry.assetId)
  return {
    version: 1,
    entries: {
      ...cache.entries,
      [key]: entry,
    },
  }
}
