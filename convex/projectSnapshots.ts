import { v } from 'convex/values'
import { mutation, query } from './_generated/server'

async function requireIdentity(ctx: any) {
  const identity = await ctx.auth.getUserIdentity()
  if (!identity) {
    throw new Error('Not authenticated')
  }
  return identity
}

async function requireCurrentUserId(ctx: any) {
  const identity = await requireIdentity(ctx)
  const user = await ctx.db
    .query('users')
    .withIndex('by_token_identifier', (q: any) => q.eq('tokenIdentifier', identity.tokenIdentifier))
    .unique()

  if (!user) {
    throw new Error('User not found')
  }

  return user._id
}

async function requireProjectOwnership(ctx: any, projectId: any, userId: any) {
  const project = await ctx.db.get(projectId)
  if (!project) {
    throw new Error('Project not found')
  }
  if (String(project.ownerUserId) !== String(userId)) {
    throw new Error('Forbidden')
  }
  return project
}

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

    await requireProjectOwnership(ctx, args.projectId, currentUserId)

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
    const project = await requireProjectOwnership(ctx, args.projectId, currentUserId)

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
