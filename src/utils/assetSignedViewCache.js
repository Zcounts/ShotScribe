import { recordSignedUrlCacheHit, recordSignedUrlCacheMiss } from './sessionMetrics'
const SIGNED_VIEW_CACHE_TTL_MS = 60 * 1000
const DIAG_KEY = 'ss_convex_diag'

const signedViewCache = new Map()
const signedViewInFlight = new Map()
const signedViewBatchInFlight = new Map()
const recentRequestAt = new Map()

function isDiagnosticsEnabled() {
  if (!import.meta.env.DEV || typeof window === 'undefined') return false
  try {
    if (window.__SS_CONVEX_DIAG__ === true) return true
    return window.localStorage?.getItem(DIAG_KEY) === '1'
  } catch {
    return false
  }
}

function getAssetKey(projectId, assetId) {
  return `${String(projectId || '')}:${String(assetId || '')}`
}

function recordRequest(kind, projectId, assetId) {
  if (!isDiagnosticsEnabled()) return
  const key = `${kind}:${getAssetKey(projectId, assetId)}`
  const now = Date.now()
  const prev = Number(recentRequestAt.get(key) || 0)
  recentRequestAt.set(key, now)
  if (prev && now - prev < 5000) {
    // eslint-disable-next-line no-console
    console.debug('[asset-diag] repeated signed-view request', {
      kind,
      projectId: String(projectId || ''),
      assetId: String(assetId || ''),
      deltaMs: now - prev,
    })
  }
}

export function getCachedSignedView(assetId, { now = Date.now(), ttlMs = SIGNED_VIEW_CACHE_TTL_MS } = {}) {
  const key = String(assetId || '')
  if (!key) return null
  const cached = signedViewCache.get(key)
  if (!cached) {
    recordSignedUrlCacheMiss()
    return null
  }
  const expiresAt = Number(cached.expiresAt || 0)
  const isExpiredByServer = Number.isFinite(expiresAt) && expiresAt > 0 && now >= expiresAt
  const isExpiredByFallbackTtl = now - Number(cached.cachedAt || 0) >= ttlMs
  if (isExpiredByServer || isExpiredByFallbackTtl) {
    signedViewCache.delete(key)
    recordSignedUrlCacheMiss()
    return null
  }
  recordSignedUrlCacheHit()
  return cached.view || null
}

export function setCachedSignedView(assetId, view) {
  const key = String(assetId || '')
  if (!key || !view) return
  const thumbExpiry = Number(view?.thumbExpiresAt || 0)
  const fullExpiry = Number(view?.fullExpiresAt || 0)
  const expiresAt = Math.max(thumbExpiry, fullExpiry)
  signedViewCache.set(key, {
    view,
    cachedAt: Date.now(),
    expiresAt: Number.isFinite(expiresAt) && expiresAt > 0 ? expiresAt : null,
  })
}

export async function getOrCreateSignedViewRequest({ projectId, assetId, fetcher }) {
  const key = String(assetId || '')
  if (!projectId || !key || typeof fetcher !== 'function') return null
  const cached = getCachedSignedView(key)
  if (cached) return cached

  const inFlightKey = getAssetKey(projectId, key)
  const inFlight = signedViewInFlight.get(inFlightKey)
  if (inFlight) return inFlight

  recordRequest('single', projectId, key)
  const request = Promise.resolve(fetcher())
    .then((view) => {
      setCachedSignedView(key, view || null)
      return view || null
    })
    .finally(() => {
      signedViewInFlight.delete(inFlightKey)
    })
  signedViewInFlight.set(inFlightKey, request)
  return request
}

export async function getOrCreateSignedViewsBatchRequest({ projectId, assetIds, fetcher }) {
  if (!projectId || typeof fetcher !== 'function') return {}
  const uniqueAssetIds = Array.from(new Set((assetIds || []).map((id) => String(id || '')).filter(Boolean)))
  if (uniqueAssetIds.length === 0) return {}

  const now = Date.now()
  const cachedViews = {}
  const missingAssetIds = []
  for (const assetId of uniqueAssetIds) {
    const cached = getCachedSignedView(assetId, { now })
    if (cached) cachedViews[assetId] = cached
    else missingAssetIds.push(assetId)
  }
  if (missingAssetIds.length === 0) return cachedViews

  const inFlightKey = `${String(projectId)}:${missingAssetIds.slice().sort().join(',')}`
  let request = signedViewBatchInFlight.get(inFlightKey)
  if (!request) {
    missingAssetIds.forEach((assetId) => recordRequest('batch', projectId, assetId))
    request = Promise.resolve(fetcher(missingAssetIds))
      .then((batch) => {
        Object.entries(batch || {}).forEach(([assetId, view]) => {
          setCachedSignedView(assetId, view)
        })
        return batch || {}
      })
      .finally(() => {
        signedViewBatchInFlight.delete(inFlightKey)
      })
    signedViewBatchInFlight.set(inFlightKey, request)
  }
  const batch = await request
  return { ...cachedViews, ...(batch || {}) }
}
