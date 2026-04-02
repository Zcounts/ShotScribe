import { v } from 'convex/values'
import { action, internalQuery, mutation, query } from './_generated/server'
import { api, internal } from './_generated/api'
import { assertCanAccessCloudAssets, assertCanEditCloudProject } from './accessPolicy'
import { requireCurrentUserId, requireProjectRole } from './projectMembers'
import { requireCloudWritesEnabled } from './ops'
import { writeOperationalEvent } from './opsLog'
import { buildStoryboardObjectKey, createPresignedReadUrl, createPresignedUploadUrl } from './storage/s3'

const CLOUD_ASSET_ALLOWED_MIME_TYPES = new Set(['image/webp'])
const CLOUD_ASSET_ALLOWED_SOURCE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])
const CLOUD_ASSET_MAX_SOURCE_BYTES = 15 * 1024 * 1024
const CLOUD_ASSET_MAX_NORMALIZED_BYTES = 4 * 1024 * 1024
const CLOUD_ASSET_NORMALIZED_WIDTH = 640
const CLOUD_ASSET_NORMALIZED_HEIGHT = 360

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

    const rows = await ctx.db
      .query('projectAssets')
      .withIndex('by_project_id', (q: any) => q.eq('projectId', args.projectId))
      .collect()

    const kind = args.kind || 'storyboard_image'
    const items = rows
      .filter((row: any) => !row.deletedAt && row.kind === kind)
      .sort((a: any, b: any) => Number(b.createdAt || 0) - Number(a.createdAt || 0))
      .slice(0, Math.max(1, Math.min(Number(args.limit || 80), 200)))

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
