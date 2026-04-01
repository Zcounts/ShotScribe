import { v } from 'convex/values'
import { mutation, query } from './_generated/server'
import { assertCanAccessCloudAssets, assertCanEditCloudProject } from './accessPolicy'
import { requireCurrentUserId, requireProjectRole } from './projectMembers'
import { requireCloudWritesEnabled } from './ops'
import { writeOperationalEvent } from './opsLog'

const CLOUD_ASSET_ALLOWED_MIME_TYPES = new Set(['image/webp'])
const CLOUD_ASSET_ALLOWED_SOURCE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])
const CLOUD_ASSET_MAX_SOURCE_BYTES = 15 * 1024 * 1024
const CLOUD_ASSET_MAX_NORMALIZED_BYTES = 4 * 1024 * 1024
const CLOUD_ASSET_NORMALIZED_WIDTH = 640
const CLOUD_ASSET_NORMALIZED_HEIGHT = 360

export const createAssetUploadUrl = mutation({
  args: {
    projectId: v.id('projects'),
  },
  handler: async (ctx, args) => {
    const currentUserId = await requireCurrentUserId(ctx)
    await assertCanEditCloudProject(ctx, currentUserId, args.projectId)
    await requireCloudWritesEnabled(ctx)
    const uploadUrl = await ctx.storage.generateUploadUrl()
    return { uploadUrl }
  },
})

export const completeAssetUpload = mutation({
  args: {
    projectId: v.id('projects'),
    shotId: v.optional(v.string()),
    kind: v.union(v.literal('storyboard_image')),
    mime: v.string(),
    sourceName: v.optional(v.string()),
    thumbStorageId: v.id('_storage'),
    fullStorageId: v.id('_storage'),
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
    const assetId = await ctx.db.insert('projectAssets', {
      projectId: args.projectId,
      uploadedByUserId: currentUserId,
      shotId: args.shotId,
      kind: args.kind,
      mime: args.mime,
      sourceName: args.sourceName,
      thumbStorageId: args.thumbStorageId,
      fullStorageId: args.fullStorageId,
      meta: args.meta,
      createdAt: now,
      updatedAt: now,
    })

    const thumbUrl = await ctx.storage.getUrl(args.thumbStorageId)
    const fullUrl = await ctx.storage.getUrl(args.fullStorageId)

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

    const thumbUrl = await ctx.storage.getUrl(asset.thumbStorageId)
    const fullUrl = await ctx.storage.getUrl(asset.fullStorageId)

    return {
      assetId: args.assetId,
      thumbUrl,
      fullUrl,
      mime: asset.mime,
      meta: asset.meta || null,
      shotId: asset.shotId || null,
    }
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
      await ctx.storage.delete(asset.thumbStorageId)
      await ctx.storage.delete(asset.fullStorageId)
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
