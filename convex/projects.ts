import { v } from 'convex/values'
import { internalAction, internalMutation, internalQuery, mutation, query } from './_generated/server'
import { assertCanAccessSharedCloudProject, assertHasPaidCloudAccess, getUserPolicyFlags } from './accessPolicy'
import { hasPaidCloudAccess } from '../shared/src/policies/accessPolicy'
import { getProjectAccessRole, requireCurrentUserId, requireProjectRole } from './projectMembers'
import { requireCloudWritesEnabled } from './ops'
import { writeOperationalEvent } from './opsLog'
import { deleteObjectFromS3 } from './storage/s3'
import { internal } from './_generated/api'

const PROJECT_DELETE_RETENTION_MS = 24 * 60 * 60 * 1000

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

    await assertHasPaidCloudAccess(ctx, currentUserId)
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
    await assertCanAccessSharedCloudProject(ctx, currentUserId, args.projectId)
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
    const currentUserFlags = await getUserPolicyFlags(ctx, currentUserId)
    const hasPaidAccess = hasPaidCloudAccess({
      isAuthenticated: true,
      ...currentUserFlags,
    })

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
        if (!hasPaidAccess) return null
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

    const candidates = Array.from(deduped.values())
      .filter((project: any) => !project.pendingDeleteAt && !project.deleteAfter)

    const usableProjects = await Promise.all(candidates.map(async (project: any) => {
      if (project.latestSnapshotId) {
        const latestSnapshot = await ctx.db.get(project.latestSnapshotId)
        if (latestSnapshot?.payload) return project
      }
      const fallbackSnapshots = await ctx.db
        .query('projectSnapshots')
        .withIndex('by_project_id_created_at', (q: any) => q.eq('projectId', project._id))
        .order('desc')
        .take(1)
      return fallbackSnapshots[0]?.payload ? project : null
    }))

    return usableProjects
      .filter(Boolean)
      .sort((a: any, b: any) => b.updatedAt - a.updatedAt)
  },
})

export const listPendingDeletionProjectsForCurrentUser = query({
  args: {},
  handler: async (ctx) => {
    const currentUserId = await requireCurrentUserId(ctx)

    const ownedProjects = await ctx.db
      .query('projects')
      .withIndex('by_owner_user_id_updated_at', (q: any) => q.eq('ownerUserId', currentUserId))
      .order('desc')
      .collect()

    return ownedProjects
      .filter((project: any) => !!project.pendingDeleteAt && !!project.deleteAfter)
      .sort((a, b) => Number(a.deleteAfter || 0) - Number(b.deleteAfter || 0))
  },
})

export const updateProjectIdentity = mutation({
  args: {
    projectId: v.id('projects'),
    name: v.optional(v.string()),
    emoji: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const currentUserId = await requireCurrentUserId(ctx)
    await requireCloudWritesEnabled(ctx)
    await requireProjectRole(ctx, args.projectId, currentUserId, 'editor')
    const project = await ctx.db.get(args.projectId)
    if (!project) throw new Error('Project not found')

    const name = typeof args.name === 'string' ? args.name.trim() : project.name
    const emoji = typeof args.emoji === 'string' ? args.emoji.trim() : project.emoji
    const now = Date.now()

    await ctx.db.patch(args.projectId, {
      name: name || project.name,
      emoji: emoji || project.emoji || '🎬',
      updatedAt: now,
    })
    return { ok: true, updatedAt: now }
  },
})

export const markProjectPendingDeletion = mutation({
  args: {
    projectId: v.id('projects'),
  },
  handler: async (ctx, args) => {
    const currentUserId = await requireCurrentUserId(ctx)
    await requireCloudWritesEnabled(ctx)
    await requireProjectRole(ctx, args.projectId, currentUserId, 'owner')

    const project = await ctx.db.get(args.projectId)
    if (!project) throw new Error('Project not found')
    if (project.pendingDeleteAt && project.deleteAfter) {
      return { ok: true, alreadyPending: true, deleteAfter: project.deleteAfter }
    }

    const now = Date.now()
    const deleteAfter = now + PROJECT_DELETE_RETENTION_MS
    await ctx.db.patch(args.projectId, {
      pendingDeleteAt: now,
      deleteAfter,
      updatedAt: now,
    })
    await writeOperationalEvent(ctx, {
      event: 'project.delete.pending',
      details: {
        projectId: String(args.projectId),
        userId: String(currentUserId),
        deleteAfter,
      },
    })
    return { ok: true, deleteAfter }
  },
})

export const restorePendingDeletionProject = mutation({
  args: {
    projectId: v.id('projects'),
  },
  handler: async (ctx, args) => {
    const currentUserId = await requireCurrentUserId(ctx)
    await requireCloudWritesEnabled(ctx)
    await requireProjectRole(ctx, args.projectId, currentUserId, 'owner')

    const project = await ctx.db.get(args.projectId)
    if (!project) throw new Error('Project not found')
    if (!project.pendingDeleteAt || !project.deleteAfter) {
      return { ok: false, restored: false, reason: 'not_pending' as const }
    }
    if (Date.now() > Number(project.deleteAfter)) {
      return { ok: false, restored: false, reason: 'window_elapsed' as const }
    }

    const now = Date.now()
    await ctx.db.patch(args.projectId, {
      pendingDeleteAt: undefined,
      deleteAfter: undefined,
      updatedAt: now,
    })
    await writeOperationalEvent(ctx, {
      event: 'project.delete.restored',
      details: {
        projectId: String(args.projectId),
        userId: String(currentUserId),
      },
    })
    return { ok: true, restored: true }
  },
})

export const deleteProjectIfSnapshotless = mutation({
  args: {
    projectId: v.id('projects'),
  },
  handler: async (ctx, args) => {
    const currentUserId = await requireCurrentUserId(ctx)
    const { project } = await requireProjectRole(ctx, args.projectId, currentUserId, 'owner')
    if (!project) return { ok: false, reason: 'not_found' as const }

    const snapshots = await ctx.db
      .query('projectSnapshots')
      .withIndex('by_project_id_created_at', (q: any) => q.eq('projectId', args.projectId))
      .take(1)

    if (snapshots.length > 0 || project.latestSnapshotId) {
      return { ok: false, reason: 'has_snapshots' as const }
    }

    await ctx.db.delete(args.projectId)
    return { ok: true }
  },
})

export const listDueProjectDeletes = internalQuery({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const now = Date.now()
    const rows = await ctx.db.query('projects').collect()
    return rows
      .filter((row: any) => !!row.deleteAfter && Number(row.deleteAfter) <= now)
      .sort((a: any, b: any) => Number(a.deleteAfter || 0) - Number(b.deleteAfter || 0))
      .slice(0, Math.max(1, Math.min(Number(args.limit || 20), 100)))
      .map((row: any) => ({ projectId: row._id }))
  },
})

export const getProjectDeletionBundle = internalQuery({
  args: {
    projectId: v.id('projects'),
  },
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId)
    if (!project) return { ok: false, reason: 'not_found' as const }
    if (!project.pendingDeleteAt || !project.deleteAfter || Number(project.deleteAfter) > Date.now()) {
      return { ok: false, reason: 'not_due' as const }
    }

    const projectAssets = await ctx.db
      .query('projectAssets')
      .withIndex('by_project_id', (q: any) => q.eq('projectId', args.projectId))
      .collect()
    const shotAssetAssignments = await ctx.db
      .query('shotAssetAssignments')
      .withIndex('by_project_id_shot_id', (q: any) => q.eq('projectId', args.projectId))
      .collect()
    const projectMembers = await ctx.db
      .query('projectMembers')
      .withIndex('by_project_id', (q: any) => q.eq('projectId', args.projectId))
      .collect()
    const projectInvites = await ctx.db
      .query('projectInvites')
      .withIndex('by_project_id', (q: any) => q.eq('projectId', args.projectId))
      .collect()
    const projectSnapshots = await ctx.db
      .query('projectSnapshots')
      .withIndex('by_project_id_created_at', (q: any) => q.eq('projectId', args.projectId))
      .collect()
    const presenceRows = await ctx.db
      .query('presence')
      .withIndex('by_project_id_expires_at', (q: any) => q.eq('projectId', args.projectId))
      .collect()
    const screenplayLocks = await ctx.db
      .query('screenplayLocks')
      .withIndex('by_project_id_lease_expires_at', (q: any) => q.eq('projectId', args.projectId))
      .collect()

    return {
      ok: true,
      assetDeletes: projectAssets.map((asset: any) => ({
        provider: asset.provider || 'convex_storage',
        thumbStorageId: asset.thumbStorageId || null,
        fullStorageId: asset.fullStorageId || null,
        objectKey: asset.objectKey || null,
      })),
      deleteIds: {
        projectAssetIds: projectAssets.map((row: any) => row._id),
        shotAssetAssignmentIds: shotAssetAssignments.map((row: any) => row._id),
        projectMemberIds: projectMembers.map((row: any) => row._id),
        projectInviteIds: projectInvites.map((row: any) => row._id),
        projectSnapshotIds: projectSnapshots.map((row: any) => row._id),
        presenceIds: presenceRows.map((row: any) => row._id),
        screenplayLockIds: screenplayLocks.map((row: any) => row._id),
      },
    }
  },
})

export const finalizeProjectHardDelete = internalMutation({
  args: {
    projectId: v.id('projects'),
    deleteIds: v.object({
      projectAssetIds: v.array(v.id('projectAssets')),
      shotAssetAssignmentIds: v.array(v.id('shotAssetAssignments')),
      projectMemberIds: v.array(v.id('projectMembers')),
      projectInviteIds: v.array(v.id('projectInvites')),
      projectSnapshotIds: v.array(v.id('projectSnapshots')),
      presenceIds: v.array(v.id('presence')),
      screenplayLockIds: v.array(v.id('screenplayLocks')),
    }),
  },
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId)
    if (!project) return { ok: false, reason: 'not_found' as const }
    if (!project.pendingDeleteAt || !project.deleteAfter || Number(project.deleteAfter) > Date.now()) {
      return { ok: false, reason: 'not_due' as const }
    }

    for (const rowId of args.deleteIds.shotAssetAssignmentIds) await ctx.db.delete(rowId)
    for (const rowId of args.deleteIds.projectMemberIds) await ctx.db.delete(rowId)
    for (const rowId of args.deleteIds.projectInviteIds) await ctx.db.delete(rowId)
    for (const rowId of args.deleteIds.projectSnapshotIds) await ctx.db.delete(rowId)
    for (const rowId of args.deleteIds.presenceIds) await ctx.db.delete(rowId)
    for (const rowId of args.deleteIds.screenplayLockIds) await ctx.db.delete(rowId)
    for (const rowId of args.deleteIds.projectAssetIds) await ctx.db.delete(rowId)
    await ctx.db.delete(args.projectId)
    return { ok: true }
  },
})

export const deleteConvexStorageBlobs = internalMutation({
  args: {
    thumbStorageId: v.optional(v.id('_storage')),
    fullStorageId: v.optional(v.id('_storage')),
  },
  handler: async (ctx, args) => {
    if (args.thumbStorageId) await ctx.storage.delete(args.thumbStorageId)
    if (args.fullStorageId) await ctx.storage.delete(args.fullStorageId)
    return { ok: true }
  },
})

export const hardDeleteProjectWorker = internalAction({
  args: {
    projectId: v.id('projects'),
  },
  handler: async (ctx, args) => {
    const bundle = await ctx.runQuery(internal.projects.getProjectDeletionBundle, { projectId: args.projectId })
    if (!bundle?.ok) return bundle

    try {
      for (const asset of bundle.assetDeletes) {
        if (asset.provider === 'convex_storage') {
          await ctx.runMutation(internal.projects.deleteConvexStorageBlobs, {
            thumbStorageId: asset.thumbStorageId || undefined,
            fullStorageId: asset.fullStorageId || undefined,
          })
        } else if (asset.objectKey) {
          await deleteObjectFromS3({ objectKey: asset.objectKey })
        }
      }

      return ctx.runMutation(internal.projects.finalizeProjectHardDelete, {
        projectId: args.projectId,
        deleteIds: bundle.deleteIds,
      })
    } catch (error: any) {
      return { ok: false, reason: 'delete_failed' as const, error: String(error?.message || error || 'unknown_delete_failure') }
    }
  },
})

export const runProjectDeleteReconciliation = internalAction({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const due = await ctx.runQuery(internal.projects.listDueProjectDeletes, {
      limit: args.limit || 20,
    })
    let processed = 0
    for (const item of due) {
      await ctx.runAction(internal.projects.hardDeleteProjectWorker, item)
      processed += 1
    }
    return { ok: true, processed }
  },
})

export const seedTestCloudProject = mutation({
  args: {
    name: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const ownerUserId = await requireCurrentUserId(ctx)
    await assertHasPaidCloudAccess(ctx, ownerUserId)
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
