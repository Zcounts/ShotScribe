import { v } from 'convex/values'
import { mutation, query } from './_generated/server'
import { requireCloudEntitlement } from './billing'
import { getProjectAccessRole, requireCurrentUserId, requireProjectRole } from './projectMembers'
import { requireCloudWritesEnabled } from './ops'
import { writeOperationalEvent } from './opsLog'

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

    await requireCloudEntitlement(ctx, currentUserId)
    await requireCloudWritesEnabled(ctx)

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
    const { project, role } = await getProjectAccessRole(ctx, args.projectId, currentUserId)
    if (!role) throw new Error('Forbidden')
    return {
      ...project,
      currentUserRole: role,
    }
  },
})

export const listProjectsForCurrentUser = query({
  args: {},
  handler: async (ctx) => {
    const currentUserId = await requireCurrentUserId(ctx)

    const ownedProjects = await ctx.db
      .query('projects')
      .withIndex('by_owner_user_id_updated_at', (q: any) => q.eq('ownerUserId', currentUserId))
      .order('desc')
      .collect()

    const memberRows = await ctx.db
      .query('projectMembers')
      .withIndex('by_user_id', (q: any) => q.eq('userId', currentUserId))
      .collect()

    const activeMemberRows = memberRows.filter((row: any) => !row.revokedAt)

    const sharedProjects = await Promise.all(
      activeMemberRows.map(async (row: any) => {
        const project = await ctx.db.get(row.projectId)
        if (!project) return null
        return { ...project, currentUserRole: row.role }
      }),
    )

    const merged = [
      ...ownedProjects.map(project => ({ ...project, currentUserRole: 'owner' })),
      ...sharedProjects.filter(Boolean) as any[],
    ]

    const deduped = new Map<string, any>()
    for (const project of merged) {
      deduped.set(String(project._id), project)
    }

    return Array.from(deduped.values()).sort((a, b) => b.updatedAt - a.updatedAt)
  },
})

export const seedTestCloudProject = mutation({
  args: {
    name: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const ownerUserId = await requireCurrentUserId(ctx)
    await requireCloudEntitlement(ctx, ownerUserId)
    await requireCloudWritesEnabled(ctx)

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
      versionToken: `seed:${projectId}:${now}`,
      createdAt: now,
    })

    await ctx.db.patch(projectId, {
      latestSnapshotId: snapshotId,
      updatedAt: now,
    })

    await requireProjectRole(ctx, projectId, ownerUserId, 'owner')
    await writeOperationalEvent(ctx, {
      event: 'project.seed.created',
      details: {
        projectId: String(projectId),
        ownerUserId: String(ownerUserId),
      },
    })

    return {
      projectId,
      snapshotId,
    }
  },
})
