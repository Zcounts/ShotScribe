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

async function requirePaidPlan(ctx: any, userId: any) {
  const profile = await ctx.db
    .query('accountProfiles')
    .withIndex('by_user_id', (q: any) => q.eq('userId', userId))
    .unique()

  if (!profile || profile.planTier !== 'paid') {
    throw new Error('Cloud projects require a paid plan')
  }
}

export const createProject = mutation({
  args: {
    ownerUserId: v.id('users'),
    name: v.string(),
    emoji: v.string(),
  },
  handler: async (ctx, args) => {
    const currentUserId = await requireCurrentUserId(ctx)
    if (String(currentUserId) !== String(args.ownerUserId)) {
      throw new Error('Forbidden')
    }

    await requirePaidPlan(ctx, currentUserId)

    const now = Date.now()
    const projectId = await ctx.db.insert('projects', {
      ownerUserId: args.ownerUserId,
      name: args.name,
      emoji: args.emoji,
      createdAt: now,
      updatedAt: now,
    })

    return {
      projectId,
      createdAt: now,
      updatedAt: now,
    }
  },
})

export const getProjectById = query({
  args: {
    projectId: v.id('projects'),
  },
  handler: async (ctx, args) => {
    const currentUserId = await requireCurrentUserId(ctx)
    const project = await ctx.db.get(args.projectId)
    if (!project) return null
    if (String(project.ownerUserId) !== String(currentUserId)) {
      throw new Error('Forbidden')
    }
    return project
  },
})

export const listProjectsForCurrentUser = query({
  args: {},
  handler: async (ctx) => {
    const currentUserId = await requireCurrentUserId(ctx)
    return ctx.db
      .query('projects')
      .withIndex('by_owner_user_id_updated_at', (q: any) => q.eq('ownerUserId', currentUserId))
      .order('desc')
      .collect()
  },
})

export const seedTestCloudProject = mutation({
  args: {
    name: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const ownerUserId = await requireCurrentUserId(ctx)
    await requirePaidPlan(ctx, ownerUserId)

    const now = Date.now()
    const projectName = args.name || `Seed Cloud Project ${new Date(now).toISOString()}`
    const projectId = await ctx.db.insert('projects', {
      ownerUserId,
      name: projectName,
      emoji: '☁️',
      createdAt: now,
      updatedAt: now,
    })

    const snapshotId = await ctx.db.insert('projectSnapshots', {
      projectId,
      createdByUserId: ownerUserId,
      source: 'manual_save',
      payload: {
        version: 2,
        projectName,
        projectEmoji: '☁️',
        scenes: [],
        schedule: [],
      },
      createdAt: now,
    })

    await ctx.db.patch(projectId, {
      latestSnapshotId: snapshotId,
      updatedAt: now,
    })

    return {
      projectId,
      snapshotId,
    }
  },
})
