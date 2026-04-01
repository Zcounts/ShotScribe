import { v } from 'convex/values'
import { mutation, query } from './_generated/server'
import { assertCanEditCloudProject } from './accessPolicy'
import { requireCurrentUserId, requireProjectRole } from './projectMembers'
import { requireCloudWritesEnabled } from './ops'
import { writeOperationalEvent } from './opsLog'

export const createSnapshot = mutation({
  args: {
    projectId: v.id('projects'),
    createdByUserId: v.id('users'),
    source: v.union(
      v.literal('manual_save'),
      v.literal('autosave'),
      v.literal('local_conversion'),
      v.literal('restore'),
      v.literal('conflict_recovery'),
    ),
    payload: v.any(),
    expectedLatestSnapshotId: v.optional(v.id('projectSnapshots')),
    conflictStrategy: v.optional(v.union(v.literal('fail_on_conflict'), v.literal('last_write_wins'))),
  },
  handler: async (ctx, args) => {
    const currentUserId = await requireCurrentUserId(ctx)
    if (String(currentUserId) !== String(args.createdByUserId)) {
      throw new Error('Forbidden')
    }

    await assertCanEditCloudProject(ctx, currentUserId, args.projectId)
    await requireCloudWritesEnabled(ctx)

    const now = Date.now()
    const { project } = await requireProjectRole(ctx, args.projectId, currentUserId, 'viewer')
    const currentLatestSnapshotId = project.latestSnapshotId || null
    const conflictStrategy = args.conflictStrategy || 'last_write_wins'
    if (
      args.expectedLatestSnapshotId !== undefined
      && String(args.expectedLatestSnapshotId || '') !== String(currentLatestSnapshotId || '')
    ) {
      if (conflictStrategy === 'last_write_wins') {
        // Continue and write a newer snapshot; latest write becomes authoritative for beta.
      } else {
      return {
        ok: false,
        reason: 'version_conflict',
        latestSnapshotId: currentLatestSnapshotId,
      }
      }
    }

    const versionToken = `${args.projectId}:${now}:${Math.random().toString(36).slice(2, 8)}`
    const snapshotId = await ctx.db.insert('projectSnapshots', {
      projectId: args.projectId,
      createdByUserId: args.createdByUserId,
      source: args.source,
      payload: args.payload,
      versionToken,
      createdAt: now,
    })

    await ctx.db.patch(args.projectId, {
      latestSnapshotId: snapshotId,
      updatedAt: now,
    })

    await writeOperationalEvent(ctx, {
      event: 'project.snapshot.created',
      details: {
        projectId: String(args.projectId),
        snapshotId: String(snapshotId),
        source: args.source,
        userId: String(currentUserId),
      },
    })

    return {
      ok: true,
      snapshotId,
      versionToken,
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

export const listSnapshotsForProject = query({
  args: {
    projectId: v.id('projects'),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const currentUserId = await requireCurrentUserId(ctx)
    await requireProjectRole(ctx, args.projectId, currentUserId, 'viewer')
    const safeLimit = Math.max(1, Math.min(30, Number(args.limit) || 10))
    return ctx.db
      .query('projectSnapshots')
      .withIndex('by_project_id_created_at', (q: any) => q.eq('projectId', args.projectId))
      .order('desc')
      .take(safeLimit)
  },
})
