import { v } from 'convex/values'
import { mutation, query } from './_generated/server'
import { requireCurrentUserId, requireProjectRole } from './projectMembers'

const PRESENCE_TTL_MS = 15000

export const heartbeat = mutation({
  args: {
    projectId: v.id('projects'),
    sceneId: v.optional(v.string()),
    mode: v.union(v.literal('viewing'), v.literal('editing')),
  },
  handler: async (ctx, args) => {
    const currentUserId = await requireCurrentUserId(ctx)
    await requireProjectRole(ctx, args.projectId, currentUserId, 'viewer')

    const now = Date.now()
    const existing = await ctx.db
      .query('presence')
      .withIndex('by_project_id_user_id', (q: any) => q.eq('projectId', args.projectId).eq('userId', currentUserId))
      .unique()

    const user = await ctx.db.get(currentUserId)
    const patch = {
      sceneId: args.sceneId,
      mode: args.mode,
      userName: user?.name,
      userEmail: user?.email,
      lastSeenAt: now,
      expiresAt: now + PRESENCE_TTL_MS,
    }

    if (existing) {
      await ctx.db.patch(existing._id, patch)
      return { ok: true }
    }

    await ctx.db.insert('presence', {
      projectId: args.projectId,
      userId: currentUserId,
      ...patch,
    })
    return { ok: true }
  },
})

export const listProjectPresence = query({
  args: { projectId: v.id('projects') },
  handler: async (ctx, args) => {
    const currentUserId = await requireCurrentUserId(ctx)
    await requireProjectRole(ctx, args.projectId, currentUserId, 'viewer')

    const now = Date.now()
    const rows = await ctx.db
      .query('presence')
      .withIndex('by_project_id_expires_at', (q: any) => q.eq('projectId', args.projectId))
      .collect()

    return rows.filter((row: any) => row.expiresAt > now)
  },
})
