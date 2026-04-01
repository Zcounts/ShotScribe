import { v } from 'convex/values'
import { mutation, query } from './_generated/server'
import { requireCurrentUserId, requireProjectRole } from './projectMembers'

export const createSnapshot = mutation({
  args: {
    projectId: v.id('projects'),
    createdByUserId: v.id('users'),
    source: v.union(v.literal('manual_save'), v.literal('autosave'), v.literal('local_conversion')),
    payload: v.any(),
  },
  handler: async (ctx, args) => {
    const currentUserId = await requireCurrentUserId(ctx)
    if (String(currentUserId) !== String(args.createdByUserId)) {
      throw new Error('Forbidden')
    }

    await requireProjectRole(ctx, args.projectId, currentUserId, 'editor')

    const now = Date.now()
    const snapshotId = await ctx.db.insert('projectSnapshots', {
      projectId: args.projectId,
      createdByUserId: args.createdByUserId,
      source: args.source,
      payload: args.payload,
      createdAt: now,
    })

    await ctx.db.patch(args.projectId, {
      latestSnapshotId: snapshotId,
      updatedAt: now,
    })

    return {
      snapshotId,
      createdAt: now,
    }
  },
})

export const getLatestSnapshotForProject = query({
  args: {
    projectId: v.id('projects'),
  },
  handler: async (ctx, args) => {
    const currentUserId = await requireCurrentUserId(ctx)
    const { project } = await requireProjectRole(ctx, args.projectId, currentUserId, 'viewer')

    if (project.latestSnapshotId) {
      return ctx.db.get(project.latestSnapshotId)
    }

    const snapshots = await ctx.db
      .query('projectSnapshots')
      .withIndex('by_project_id_created_at', (q: any) => q.eq('projectId', args.projectId))
      .order('desc')
      .take(1)

    return snapshots[0] || null
  },
})
