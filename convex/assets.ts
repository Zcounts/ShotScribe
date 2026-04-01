import { v } from 'convex/values'
import { mutation, query } from './_generated/server'
import { assertCanAccessCloudAssets, assertCanEditCloudProject } from './accessPolicy'
import { requireCurrentUserId, requireProjectRole } from './projectMembers'
import { requireCloudWritesEnabled } from './ops'
import { writeOperationalEvent } from './opsLog'

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
