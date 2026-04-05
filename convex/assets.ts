import { v } from 'convex/values'
import { action, internalAction, internalMutation, internalQuery, mutation, query } from './_generated/server'
import { api, internal } from './_generated/api'
import { assertCanAccessCloudAssets, assertCanEditCloudProject } from './accessPolicy'
import { requireCurrentUserId, requireProjectRole } from './projectMembers'
import { requireCloudWritesEnabled } from './ops'
import { writeOperationalEvent } from './opsLog'
import { buildStoryboardObjectKey, createPresignedReadUrl, createPresignedUploadUrl, deleteObjectFromS3 } from './storage/s3'

const CLOUD_ASSET_ALLOWED_MIME_TYPES = new Set(['image/webp'])
const CLOUD_ASSET_ALLOWED_SOURCE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])
const CLOUD_ASSET_MAX_SOURCE_BYTES = 15 * 1024 * 1024
const CLOUD_ASSET_MAX_NORMALIZED_BYTES = 4 * 1024 * 1024
const CLOUD_ASSET_NORMALIZED_WIDTH = 640
const CLOUD_ASSET_NORMALIZED_HEIGHT = 360
const DEFAULT_ASSET_DELETE_GRACE_HOURS = 24

function getDeleteGraceWindowMs() {
  const raw = Number(process.env.ASSET_DELETE_GRACE_HOURS || DEFAULT_ASSET_DELETE_GRACE_HOURS)
  const hours = Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_ASSET_DELETE_GRACE_HOURS
  return Math.round(hours * 60 * 60 * 1000)
}

async function hasActiveShotAssignmentReference(ctx: any, projectId: any, assetId: any) {
  const rows = await ctx.db
    .query('shotAssetAssignments')
    .withIndex('by_project_id_asset_id', (q: any) => q.eq('projectId', projectId).eq('assetId', assetId))
    .collect()
  return rows.some((row: any) => !row.removedAt)
}

async function hasLatestSnapshotReference(ctx: any, projectId: any, assetId: any) {
  const project = await ctx.db.get(projectId)
  if (!project?.latestSnapshotId) return false
  const snapshot = await ctx.db.get(project.latestSnapshotId)
  const heroAssetId = snapshot?.payload?.projectHeroImage?.imageAsset?.cloud?.assetId
  if (heroAssetId && String(heroAssetId) === String(assetId)) return true
  const scenes = snapshot?.payload?.scenes || []
  for (const scene of scenes) {
    for (const shot of (scene?.shots || [])) {
      const shotAssetId = shot?.imageAsset?.cloud?.assetId
      if (shotAssetId && String(shotAssetId) === String(assetId)) return true
    }
  }
  return false
}

async function hasAnyActiveReference(ctx: any, projectId: any, assetId: any) {
  const [assignmentRef, snapshotRef] = await Promise.all([
    hasActiveShotAssignmentReference(ctx, projectId, assetId),
    hasLatestSnapshotReference(ctx, projectId, assetId),
  ])
  return assignmentRef || snapshotRef
}

export const getAssetUploadAuthorization = internalQuery({
  args: {
    projectId: v.id('projects'),
  },
  handler: async (ctx, args) => {
    const currentUserId = await requireCurrentUserId(ctx)
    await assertCanEditCloudProject(ctx, currentUserId, args.projectId)
    await requireCloudWritesEnabled(ctx)
    return { currentUserId }
  },
})

export const createAssetUploadIntent = action({
  args: {
    projectId: v.id('projects'),
    kind: v.union(v.literal('storyboard_image')),
    mime: v.string(),
    sourceName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (!CLOUD_ASSET_ALLOWED_MIME_TYPES.has(String(args.mime || '').toLowerCase())) {
      throw new Error('Unsupported cloud asset mime type')
    }

    await ctx.runQuery(internal.assets.getAssetUploadAuthorization, {
      projectId: args.projectId,
    })

    const objectKey = buildStoryboardObjectKey({
      projectId: String(args.projectId),
      sourceName: args.sourceName || 'storyboard-image',
    })
    const signed = await createPresignedUploadUrl({
      objectKey,
      mime: args.mime,
    })

    return {
      provider: 's3' as const,
      uploadUrl: signed.uploadUrl,
      objectKey: signed.objectKey,
      bucket: signed.bucket,
    }
  },
})

export const finalizeAssetUpload = mutation({
  args: {
    projectId: v.id('projects'),
    shotId: v.optional(v.string()),
    kind: v.union(v.literal('storyboard_image')),
    mime: v.string(),
    sourceName: v.optional(v.string()),
    provider: v.union(v.literal('convex_storage'), v.literal('s3')),
    objectKey: v.optional(v.string()),
    bucket: v.optional(v.string()),
    thumbStorageId: v.optional(v.id('_storage')),
    fullStorageId: v.optional(v.id('_storage')),
    meta: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const currentUserId = await requireCurrentUserId(ctx)
    await assertCanEditCloudProject(ctx, currentUserId, args.projectId)
    await requireCloudWritesEnabled(ctx)

    if (!CLOUD_ASSET_ALLOWED_MIME_TYPES.has(String(args.mime || '').toLowerCase())) {
      throw new Error('Unsupported cloud asset mime type')
    }

    const sourceMime = String(args?.meta?.sourceMime || '').toLowerCase()
    if (sourceMime && !CLOUD_ASSET_ALLOWED_SOURCE_MIME_TYPES.has(sourceMime)) {
      throw new Error('Unsupported cloud asset source file type')
    }

    const sourceBytes = Number(args?.meta?.sourceBytes || 0)
    if (sourceBytes <= 0 || sourceBytes > CLOUD_ASSET_MAX_SOURCE_BYTES) {
      throw new Error('Source file exceeds cloud upload limit')
    }

    const normalizedWidth = Number(args?.meta?.fullWidth || 0)
    const normalizedHeight = Number(args?.meta?.fullHeight || 0)
    if (normalizedWidth !== CLOUD_ASSET_NORMALIZED_WIDTH || normalizedHeight !== CLOUD_ASSET_NORMALIZED_HEIGHT) {
      throw new Error('Cloud assets must be normalized to 640x360')
    }

    const normalizedBytes = Math.max(
      Number(args?.meta?.thumbBytes || 0),
      Number(args?.meta?.fullBytes || 0),
    )
    if (normalizedBytes <= 0 || normalizedBytes > CLOUD_ASSET_MAX_NORMALIZED_BYTES) {
      throw new Error('Normalized cloud asset exceeds size limit')
    }

    const now = Date.now()
    const provider = args.provider || 'convex_storage'
    if (provider === 's3' && !args.objectKey) {
      throw new Error('Missing object key for s3 asset')
    }
    if (provider === 'convex_storage' && (!args.thumbStorageId || !args.fullStorageId)) {
      throw new Error('Missing Convex storage ids for convex storage asset')
    }

    const assetId = await ctx.db.insert('projectAssets', {
      projectId: args.projectId,
      uploadedByUserId: currentUserId,
      shotId: args.shotId,
      kind: args.kind,
      provider,
      objectKey: args.objectKey,
      bucket: args.bucket,
      mime: args.mime,
      sourceName: args.sourceName,
      thumbStorageId: args.thumbStorageId,
      fullStorageId: args.fullStorageId,
      meta: args.meta,
      deleteStatus: 'active',
      createdAt: now,
      updatedAt: now,
    })

    const thumbUrl = provider === 's3'
      ? null
      : await ctx.storage.getUrl(args.thumbStorageId!)
    const fullUrl = provider === 's3'
      ? null
      : await ctx.storage.getUrl(args.fullStorageId!)

    return {
      assetId,
      thumbUrl,
      fullUrl,
      createdAt: now,
    }
  },
})

export const getAssetView = query({
  args: {
    projectId: v.id('projects'),
    assetId: v.id('projectAssets'),
  },
  handler: async (ctx, args) => {
    const currentUserId = await requireCurrentUserId(ctx)
    await requireProjectRole(ctx, args.projectId, currentUserId, 'viewer')
    await assertCanAccessCloudAssets(ctx, currentUserId, args.projectId)

    const asset = await ctx.db.get(args.assetId)
    if (!asset || String(asset.projectId) !== String(args.projectId) || asset.deletedAt) {
      return null
    }

    const provider = asset.provider || 'convex_storage'
    const thumbUrl = provider === 'convex_storage' && asset.thumbStorageId
      ? await ctx.storage.getUrl(asset.thumbStorageId)
      : null
    const fullUrl = provider === 'convex_storage' && asset.fullStorageId
      ? await ctx.storage.getUrl(asset.fullStorageId)
      : null

    return {
      assetId: args.assetId,
      provider,
      thumbUrl,
      fullUrl,
      mime: asset.mime,
      meta: asset.meta || null,
      shotId: asset.shotId || null,
    }
  },
})

export const getAssetSignedView = action({
  args: {
    projectId: v.id('projects'),
    assetId: v.id('projectAssets'),
  },
  handler: async (ctx, args) => {
    const asset = await ctx.runQuery(api.assets.getAssetView, args)
    if (!asset) return null
    if (asset.provider !== 's3') return asset

    const dbAsset = await ctx.runQuery(internal.assets.getAssetRecordForSignedView, args)
    if (!dbAsset?.objectKey) return null
    const signed = await createPresignedReadUrl({ objectKey: dbAsset.objectKey })
    return {
      ...asset,
      thumbUrl: signed.readUrl,
      fullUrl: signed.readUrl,
    }
  },
})

export const listProjectLibraryAssets = query({
  args: {
    projectId: v.id('projects'),
    kind: v.optional(v.union(v.literal('storyboard_image'))),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const currentUserId = await requireCurrentUserId(ctx)
    await requireProjectRole(ctx, args.projectId, currentUserId, 'viewer')
    await assertCanAccessCloudAssets(ctx, currentUserId, args.projectId)

    const kind = args.kind || 'storyboard_image'
    const safeLimit = Math.max(1, Math.min(Number(args.limit || 80), 200))

    // Fast path for current rows (explicitly marked active).
    const activeRows = await ctx.db
      .query('projectAssets')
      .withIndex('by_project_id_kind_delete_status_created_at', (q: any) => (
        q
          .eq('projectId', args.projectId)
          .eq('kind', kind)
          .eq('deleteStatus', 'active')
      ))
      .order('desc')
      .take(safeLimit)

    // Legacy compatibility: include rows created before deleteStatus was
    // standardized, while keeping read volume bounded.
    const needsLegacyRows = activeRows.length < safeLimit
    const legacyRows = needsLegacyRows
      ? await ctx.db
          .query('projectAssets')
          .withIndex('by_project_id_kind_created_at', (q: any) => (
            q
              .eq('projectId', args.projectId)
              .eq('kind', kind)
          ))
          .order('desc')
          .take(safeLimit * 2)
      : []

    const rowsById = new Map<string, any>()
    for (const row of activeRows) rowsById.set(String(row._id), row)
    for (const row of legacyRows) {
      if (rowsById.has(String(row._id))) continue
      if (row.deletedAt || row.deleteStatus === 'soft_deleted' || row.deleteStatus === 'hard_deleted') continue
      rowsById.set(String(row._id), row)
      if (rowsById.size >= safeLimit) break
    }
    const items = Array.from(rowsById.values()).slice(0, safeLimit)

    return items.map((asset: any) => ({
      assetId: asset._id,
      kind: asset.kind,
      provider: asset.provider || 'convex_storage',
      mime: asset.mime,
      sourceName: asset.sourceName || null,
      meta: asset.meta || null,
      createdAt: asset.createdAt,
    }))
  },
})

export const getAssetRecordForSignedView = internalQuery({
  args: {
    projectId: v.id('projects'),
    assetId: v.id('projectAssets'),
  },
  handler: async (ctx, args) => {
    const currentUserId = await requireCurrentUserId(ctx)
    await requireProjectRole(ctx, args.projectId, currentUserId, 'viewer')
    await assertCanAccessCloudAssets(ctx, currentUserId, args.projectId)
    const asset = await ctx.db.get(args.assetId)
    if (!asset || String(asset.projectId) !== String(args.projectId) || asset.deletedAt) {
      return null
    }
    return {
      objectKey: asset.objectKey || null,
    }
  },
})

export const getAssetReadAuthorization = internalQuery({
  args: {
    projectId: v.id('projects'),
  },
  handler: async (ctx, args) => {
    const currentUserId = await requireCurrentUserId(ctx)
    await requireProjectRole(ctx, args.projectId, currentUserId, 'viewer')
    await assertCanAccessCloudAssets(ctx, currentUserId, args.projectId)
    return { ok: true }
  },
})

export const getAssetSignedViewsBatch = action({
  args: {
    projectId: v.id('projects'),
    assetIds: v.array(v.id('projectAssets')),
  },
  handler: async (ctx, args) => {
    await ctx.runQuery(internal.assets.getAssetReadAuthorization, {
      projectId: args.projectId,
    })

    const requested = new Set(args.assetIds.map((id: any) => String(id)))
    if (requested.size === 0) return {}

    const rows = await ctx.runQuery(internal.assets.getProjectAssetRowsForBatchRead, {
      projectId: args.projectId,
      assetIds: args.assetIds,
    })
    const matched = rows.filter((row: any) => requested.has(String(row.assetId)))

    const results: Record<string, any> = {}
    for (const row of matched) {
      if (row.provider === 's3' && row.objectKey) {
        const signed = await createPresignedReadUrl({ objectKey: row.objectKey })
        results[String(row.assetId)] = {
          assetId: row.assetId,
          provider: row.provider,
          thumbUrl: signed.readUrl,
          fullUrl: signed.readUrl,
          mime: row.mime,
          meta: row.meta || null,
        }
      } else {
        const legacy = await ctx.runQuery(api.assets.getAssetView, {
          projectId: args.projectId,
          assetId: row.assetId,
        })
        if (legacy) results[String(row.assetId)] = legacy
      }
    }

    return results
  },
})

export const getProjectAssetRowsForBatchRead = internalQuery({
  args: {
    projectId: v.id('projects'),
    assetIds: v.array(v.id('projectAssets')),
  },
  handler: async (ctx, args) => {
    const rows = await Promise.all(args.assetIds.map((assetId) => ctx.db.get(assetId)))
    return rows
      .filter((row: any) => row && String(row.projectId) === String(args.projectId) && !row.deletedAt)
      .map((row: any) => ({
        assetId: row._id,
        provider: row.provider || 'convex_storage',
        objectKey: row.objectKey || null,
        mime: row.mime,
        meta: row.meta || null,
      }))
  },
})

export const assignShotLibraryAsset = mutation({
  args: {
    projectId: v.id('projects'),
    shotId: v.string(),
    assetId: v.id('projectAssets'),
  },
  handler: async (ctx, args) => {
    const currentUserId = await requireCurrentUserId(ctx)
    await assertCanEditCloudProject(ctx, currentUserId, args.projectId)
    await requireCloudWritesEnabled(ctx)

    const asset = await ctx.db.get(args.assetId)
    if (!asset || asset.deletedAt || String(asset.projectId) !== String(args.projectId)) {
      throw new Error('Asset not found')
    }

    const existingRows = await ctx.db
      .query('shotAssetAssignments')
      .withIndex('by_project_id_shot_id', (q: any) => q.eq('projectId', args.projectId).eq('shotId', args.shotId))
      .collect()
    const existing = existingRows.find((row: any) => !row.removedAt) || null

    const now = Date.now()
    if (existing) {
      await ctx.db.patch(existing._id, {
        assetId: args.assetId,
        assignedByUserId: currentUserId,
        updatedAt: now,
        removedAt: undefined,
      })
    } else {
      await ctx.db.insert('shotAssetAssignments', {
        projectId: args.projectId,
        shotId: args.shotId,
        assetId: args.assetId,
        assignedByUserId: currentUserId,
        createdAt: now,
        updatedAt: now,
      })
    }

    return {
      ok: true,
      assetId: args.assetId,
      shotId: args.shotId,
    }
  },
})

export const unassignShotLibraryAsset = mutation({
  args: {
    projectId: v.id('projects'),
    shotId: v.string(),
  },
  handler: async (ctx, args) => {
    const currentUserId = await requireCurrentUserId(ctx)
    await assertCanEditCloudProject(ctx, currentUserId, args.projectId)
    await requireCloudWritesEnabled(ctx)

    const existingRows = await ctx.db
      .query('shotAssetAssignments')
      .withIndex('by_project_id_shot_id', (q: any) => q.eq('projectId', args.projectId).eq('shotId', args.shotId))
      .collect()
    const existing = existingRows.find((row: any) => !row.removedAt) || null

    if (!existing) return { ok: true, removed: false }
    const now = Date.now()
    await ctx.db.patch(existing._id, {
      removedAt: now,
      updatedAt: now,
      assignedByUserId: currentUserId,
    })
    return { ok: true, removed: true }
  },
})

export const softDeleteLibraryAsset = mutation({
  args: {
    projectId: v.id('projects'),
    assetId: v.id('projectAssets'),
  },
  handler: async (ctx, args) => {
    const currentUserId = await requireCurrentUserId(ctx)
    await assertCanEditCloudProject(ctx, currentUserId, args.projectId)
    await requireCloudWritesEnabled(ctx)

    const asset = await ctx.db.get(args.assetId)
    if (!asset || String(asset.projectId) !== String(args.projectId)) {
      throw new Error('Asset not found')
    }
    if (asset.deleteStatus === 'hard_deleted') {
      return { ok: false, reason: 'already_hard_deleted' as const }
    }
    if (asset.deletedAt && asset.deleteStatus === 'soft_deleted') {
      return { ok: true, softDeleted: true, alreadyDeleted: true }
    }

    const hasReferences = await hasAnyActiveReference(ctx, args.projectId, args.assetId)
    if (hasReferences) {
      const now = Date.now()
      await ctx.db.patch(args.assetId, {
        deleteStatus: 'blocked_referenced',
        updatedAt: now,
      })
      return { ok: false, reason: 'blocked_referenced' as const }
    }

    const now = Date.now()
    const hardDeleteAfter = now + getDeleteGraceWindowMs()
    await ctx.db.patch(args.assetId, {
      deletedAt: now,
      hardDeleteAfter,
      deleteStatus: 'soft_deleted',
      deleteError: undefined,
      updatedAt: now,
    })

    await ctx.scheduler.runAfter(
      hardDeleteAfter - now,
      internal.assets.hardDeleteAssetWorker,
      { projectId: args.projectId, assetId: args.assetId },
    )

    return {
      ok: true,
      softDeleted: true,
      hardDeleteAfter,
    }
  },
})

export const undoSoftDeleteLibraryAsset = mutation({
  args: {
    projectId: v.id('projects'),
    assetId: v.id('projectAssets'),
  },
  handler: async (ctx, args) => {
    const currentUserId = await requireCurrentUserId(ctx)
    await assertCanEditCloudProject(ctx, currentUserId, args.projectId)
    await requireCloudWritesEnabled(ctx)

    const asset = await ctx.db.get(args.assetId)
    if (!asset || String(asset.projectId) !== String(args.projectId)) {
      throw new Error('Asset not found')
    }
    if (!asset.deletedAt || asset.deleteStatus !== 'soft_deleted') {
      return { ok: false, restored: false, reason: 'not_soft_deleted' as const }
    }

    const now = Date.now()
    await ctx.db.patch(args.assetId, {
      deletedAt: undefined,
      hardDeleteAfter: undefined,
      deleteStatus: 'active',
      deleteError: undefined,
      updatedAt: now,
    })
    return { ok: true, restored: true }
  },
})

export const getRecentlyDeletedLibraryAssets = query({
  args: {
    projectId: v.id('projects'),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const currentUserId = await requireCurrentUserId(ctx)
    await requireProjectRole(ctx, args.projectId, currentUserId, 'viewer')
    await assertCanAccessCloudAssets(ctx, currentUserId, args.projectId)

    const safeLimit = Math.max(1, Math.min(Number(args.limit || 20), 100))
    const rows = await ctx.db
      .query('projectAssets')
      .withIndex('by_project_id_delete_status_deleted_at', (q: any) => (
        q
          .eq('projectId', args.projectId)
          .eq('deleteStatus', 'soft_deleted')
      ))
      .order('desc')
      .take(safeLimit)

    return rows
      .filter((row: any) => !!row.deletedAt)
      .map((asset: any) => ({
        assetId: asset._id,
        sourceName: asset.sourceName || null,
        deletedAt: asset.deletedAt,
        hardDeleteAfter: asset.hardDeleteAfter || null,
      }))
  },
})

export const prepareAssetHardDelete = internalMutation({
  args: {
    projectId: v.id('projects'),
    assetId: v.id('projectAssets'),
  },
  handler: async (ctx, args) => {
    const asset = await ctx.db.get(args.assetId)
    if (!asset || String(asset.projectId) !== String(args.projectId)) {
      return { ok: false, reason: 'not_found' as const }
    }
    if (asset.deleteStatus !== 'soft_deleted' || !asset.deletedAt || !asset.hardDeleteAfter) {
      return { ok: false, reason: 'not_due' as const }
    }
    if (Date.now() < Number(asset.hardDeleteAfter)) {
      return { ok: false, reason: 'retention_not_elapsed' as const }
    }

    const hasReferences = await hasAnyActiveReference(ctx, args.projectId, args.assetId)
    if (hasReferences) {
      await ctx.db.patch(args.assetId, {
        deleteStatus: 'blocked_referenced',
        updatedAt: Date.now(),
      })
      return { ok: false, reason: 'blocked_referenced' as const }
    }

    return {
      ok: true,
      provider: asset.provider || 'convex_storage',
      thumbStorageId: asset.thumbStorageId || null,
      fullStorageId: asset.fullStorageId || null,
      objectKey: asset.objectKey || null,
    }
  },
})

export const finalizeAssetHardDelete = internalMutation({
  args: {
    projectId: v.id('projects'),
    assetId: v.id('projectAssets'),
    status: v.union(v.literal('hard_deleted'), v.literal('delete_failed')),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const asset = await ctx.db.get(args.assetId)
    if (!asset || String(asset.projectId) !== String(args.projectId)) {
      return { ok: false }
    }
    const now = Date.now()
    await ctx.db.patch(args.assetId, {
      deleteStatus: args.status,
      deleteError: args.error,
      updatedAt: now,
      ...(args.status === 'hard_deleted'
        ? { deletedAt: now, hardDeleteAfter: undefined }
        : {}),
    })
    return { ok: true }
  },
})

export const hardDeleteAssetWorker = internalAction({
  args: {
    projectId: v.id('projects'),
    assetId: v.id('projectAssets'),
  },
  handler: async (ctx, args) => {
    const prepared = await ctx.runMutation(internal.assets.prepareAssetHardDelete, args)
    if (!prepared?.ok) return prepared

    try {
      if (prepared.provider === 'convex_storage') {
        await ctx.runMutation(internal.assets.hardDeleteConvexStorageAsset, {
          projectId: args.projectId,
          assetId: args.assetId,
          thumbStorageId: prepared.thumbStorageId,
          fullStorageId: prepared.fullStorageId,
        })
      } else if (prepared.objectKey) {
        await deleteObjectFromS3({ objectKey: prepared.objectKey })
      }

      await ctx.runMutation(internal.assets.finalizeAssetHardDelete, {
        projectId: args.projectId,
        assetId: args.assetId,
        status: 'hard_deleted',
      })
      return { ok: true, deleted: true }
    } catch (err: any) {
      await ctx.runMutation(internal.assets.finalizeAssetHardDelete, {
        projectId: args.projectId,
        assetId: args.assetId,
        status: 'delete_failed',
        error: String(err?.message || err || 'unknown_delete_failure'),
      })
      return { ok: false, deleted: false, reason: 'delete_failed' as const }
    }
  },
})

export const hardDeleteConvexStorageAsset = internalMutation({
  args: {
    projectId: v.id('projects'),
    assetId: v.id('projectAssets'),
    thumbStorageId: v.optional(v.id('_storage')),
    fullStorageId: v.optional(v.id('_storage')),
  },
  handler: async (ctx, args) => {
    if (args.thumbStorageId) await ctx.storage.delete(args.thumbStorageId)
    if (args.fullStorageId) await ctx.storage.delete(args.fullStorageId)
    return { ok: true }
  },
})

export const listDueAssetDeletes = internalQuery({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const now = Date.now()
    const rows = await ctx.db.query('projectAssets').collect()
    return rows
      .filter((row: any) => row.deleteStatus === 'soft_deleted' && Number(row.hardDeleteAfter || 0) <= now)
      .sort((a: any, b: any) => Number(a.hardDeleteAfter || 0) - Number(b.hardDeleteAfter || 0))
      .slice(0, Math.max(1, Math.min(Number(args.limit || 50), 200)))
      .map((row: any) => ({
        projectId: row.projectId,
        assetId: row._id,
      }))
  },
})

// Fetches an S3-backed asset server-side and returns it as a base64 data URL.
// This bypasses CORS restrictions that prevent browser-side fetch() of signed
// S3 GET URLs.  Used by CloudSyncCoordinator to embed image bytes in local
// .shotlist exports so files remain self-contained without cloud connectivity.
export const getAssetThumbnailBase64 = action({
  args: {
    projectId: v.id('projects'),
    assetId: v.id('projectAssets'),
  },
  handler: async (ctx, args) => {
    const dbAsset = await ctx.runQuery(internal.assets.getAssetRecordForSignedView, args)
    if (!dbAsset?.objectKey) return null
    const signed = await createPresignedReadUrl({ objectKey: dbAsset.objectKey })
    const resp = await fetch(signed.readUrl)
    if (!resp.ok) return null
    const arrayBuffer = await resp.arrayBuffer()
    const bytes = new Uint8Array(arrayBuffer)
    // latin1 decode maps each byte to its Unicode code point (0–255), which
    // btoa then encodes correctly as base64.
    const latin1 = new TextDecoder('latin1').decode(bytes)
    return `data:image/webp;base64,${btoa(latin1)}`
  },
})

export const runAssetDeleteReconciliation = internalAction({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const due = await ctx.runQuery(internal.assets.listDueAssetDeletes, {
      limit: args.limit || 50,
    })
    let processed = 0
    for (const item of due) {
      await ctx.runAction(internal.assets.hardDeleteAssetWorker, item)
      processed += 1
    }
    return { ok: true, processed }
  },
})

export const pruneOrphanedAssets = mutation({
  args: {
    projectId: v.id('projects'),
    keepAssetIds: v.array(v.id('projectAssets')),
  },
  handler: async (ctx, args) => {
    const currentUserId = await requireCurrentUserId(ctx)
    await assertCanEditCloudProject(ctx, currentUserId, args.projectId)
    await requireCloudWritesEnabled(ctx)

    const keep = new Set(args.keepAssetIds.map((id: any) => String(id)))
    const allAssets = await ctx.db
      .query('projectAssets')
      .withIndex('by_project_id', (q: any) => q.eq('projectId', args.projectId))
      .collect()

    const now = Date.now()
    let removedCount = 0
    for (const asset of allAssets) {
      if (asset.deletedAt || keep.has(String(asset._id))) continue
      const provider = asset.provider || 'convex_storage'
      if (provider === 'convex_storage') {
        if (asset.thumbStorageId) await ctx.storage.delete(asset.thumbStorageId)
        if (asset.fullStorageId) await ctx.storage.delete(asset.fullStorageId)
      }
      await ctx.db.patch(asset._id, {
        deletedAt: now,
        updatedAt: now,
      })
      removedCount += 1
    }

    if (removedCount > 0) {
      await writeOperationalEvent(ctx, {
        event: 'project.assets.pruned',
        details: {
          projectId: String(args.projectId),
          removedCount,
          userId: String(currentUserId),
        },
      })
    }

    return { removedCount }
  },
})
