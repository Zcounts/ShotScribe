import { v } from 'convex/values'
import { mutation, query } from './_generated/server'
import { requireCurrentUserId, requireProjectRole } from './projectMembers'

const LOCK_LEASE_MS = 30000

async function clearExpiredProjectLocks(ctx: any, projectId: any, now: number) {
  const rows = await ctx.db
    .query('screenplayLocks')
    .withIndex('by_project_id_lease_expires_at', (q: any) => q.eq('projectId', projectId))
    .collect()

  await Promise.all(
    rows
      .filter((row: any) => row.leaseExpiresAt <= now)
      .map((row: any) => ctx.db.delete(row._id)),
  )
}

export const listProjectLocks = query({
  args: { projectId: v.id('projects') },
  handler: async (ctx, args) => {
    const currentUserId = await requireCurrentUserId(ctx)
    await requireProjectRole(ctx, args.projectId, currentUserId, 'viewer')

    const now = Date.now()
    const rows = await ctx.db
      .query('screenplayLocks')
      .withIndex('by_project_id_lease_expires_at', (q: any) => q.eq('projectId', args.projectId))
      .collect()

    return rows.filter((row: any) => row.leaseExpiresAt > now)
  },
})

export const acquireSceneLock = mutation({
  args: {
    projectId: v.id('projects'),
    sceneId: v.string(),
  },
  handler: async (ctx, args) => {
    const currentUserId = await requireCurrentUserId(ctx)
    await requireProjectRole(ctx, args.projectId, currentUserId, 'editor')

    const now = Date.now()
    await clearExpiredProjectLocks(ctx, args.projectId, now)

    const existing = await ctx.db
      .query('screenplayLocks')
      .withIndex('by_project_id_scene_id', (q: any) => q.eq('projectId', args.projectId).eq('sceneId', args.sceneId))
      .unique()

    const currentUser = await ctx.db.get(currentUserId)
    const lockPayload = {
      holderUserId: currentUserId,
      holderName: currentUser?.name,
      leaseExpiresAt: now + LOCK_LEASE_MS,
      updatedAt: now,
    }

    if (!existing) {
      const lockId = await ctx.db.insert('screenplayLocks', {
        projectId: args.projectId,
        sceneId: args.sceneId,
        createdAt: now,
        ...lockPayload,
      })
      return { ok: true, lockId, holderUserId: currentUserId, expiresAt: lockPayload.leaseExpiresAt }
    }

    if (String(existing.holderUserId) !== String(currentUserId) && existing.leaseExpiresAt > now) {
      return {
        ok: false,
        reason: 'locked_by_other',
        holderUserId: existing.holderUserId,
        holderName: existing.holderName || null,
        expiresAt: existing.leaseExpiresAt,
      }
    }

    await ctx.db.patch(existing._id, lockPayload)
    return { ok: true, lockId: existing._id, holderUserId: currentUserId, expiresAt: lockPayload.leaseExpiresAt }
  },
})

export const releaseSceneLock = mutation({
  args: {
    projectId: v.id('projects'),
    sceneId: v.string(),
  },
  handler: async (ctx, args) => {
    const currentUserId = await requireCurrentUserId(ctx)
    await requireProjectRole(ctx, args.projectId, currentUserId, 'editor')

    const existing = await ctx.db
      .query('screenplayLocks')
      .withIndex('by_project_id_scene_id', (q: any) => q.eq('projectId', args.projectId).eq('sceneId', args.sceneId))
      .unique()

    if (!existing) return { released: false }
    if (String(existing.holderUserId) !== String(currentUserId)) {
      return { released: false, reason: 'not_lock_holder' }
    }

    await ctx.db.delete(existing._id)
    return { released: true }
  },
})
