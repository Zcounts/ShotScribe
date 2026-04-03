const MAX_CLOUD_SNAPSHOT_BYTES = 900_000

function stripDuplicatedShotThumb(shot) {
  if (!shot || typeof shot !== 'object') return shot
  const nextShot = { ...shot }
  if (typeof nextShot.image === 'string' && typeof nextShot.imageAsset?.thumb === 'string' && nextShot.image === nextShot.imageAsset.thumb) {
    // Cloud snapshots only need one copy of the thumbnail value.
    nextShot.image = null
  }
  return nextShot
}

function normalizeForCloudSnapshot(payload) {
  if (!payload || typeof payload !== 'object') return payload
  if (!Array.isArray(payload.scenes)) return payload
  return {
    ...payload,
    scenes: payload.scenes.map((scene) => ({
      ...scene,
      shots: Array.isArray(scene?.shots) ? scene.shots.map(stripDuplicatedShotThumb) : [],
    })),
  }
}

function replacer(_key, value) {
  if (typeof File !== 'undefined' && value instanceof File) return undefined
  if (typeof Blob !== 'undefined' && value instanceof Blob) return undefined
  if (typeof value === 'number' && !Number.isFinite(value)) return null
  if (typeof value === 'function' || typeof value === 'symbol') return undefined
  if (value instanceof Date) return value.toISOString()
  return value
}

export function buildConvexSafeSnapshotPayload(payload) {
  const normalized = normalizeForCloudSnapshot(payload)
  const serialized = JSON.stringify(normalized, replacer)
  const size = serialized ? new TextEncoder().encode(serialized).length : 0

  if (size > MAX_CLOUD_SNAPSHOT_BYTES) {
    throw new Error('Cloud backup could not be enabled because this project is too large to snapshot right now (usually due to embedded local images).')
  }

  return JSON.parse(serialized || '{}')
}
