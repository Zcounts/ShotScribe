import { v } from 'convex/values'
import { mutation, query } from './_generated/server'
import { requireCurrentUserId, requireProjectRole } from './projectMembers'
import { requireCloudWritesEnabled } from './ops'

function normalizeScenePayload(scene: any) {
  return {
    sceneLabel: String(scene?.sceneLabel || '').trim() || 'SCENE',
    slugline: scene?.slugline || '',
    location: scene?.location || '',
    intOrExt: scene?.intOrExt || '',
    dayNight: scene?.dayNight || '',
    color: scene?.color || null,
    linkedScriptSceneId: scene?.linkedScriptSceneId || null,
    pageNotes: Array.isArray(scene?.pageNotes) ? scene.pageNotes.map((entry: any) => String(entry || '')) : [''],
    pageColors: Array.isArray(scene?.pageColors) ? scene.pageColors.map((entry: any) => String(entry || '')) : [],
  }
}

export const listScenesByProject = query({
  args: { projectId: v.id('projects') },
  handler: async (ctx, args) => {
    const currentUserId = await requireCurrentUserId(ctx)
    await requireProjectRole(ctx, args.projectId, currentUserId, 'viewer')
    return ctx.db
      .query('projectScenes')
      .withIndex('by_project_id_order', (q: any) => q.eq('projectId', args.projectId))
      .collect()
  },
})

export const upsertScene = mutation({
  args: {
    projectId: v.id('projects'),
    sceneId: v.string(),
    order: v.number(),
    payload: v.any(),
  },
  handler: async (ctx, args) => {
    const currentUserId = await requireCurrentUserId(ctx)
    await requireProjectRole(ctx, args.projectId, currentUserId, 'editor')
    await requireCloudWritesEnabled(ctx)
    const now = Date.now()
    const existing = await ctx.db
      .query('projectScenes')
      .withIndex('by_project_id_scene_id', (q: any) => q.eq('projectId', args.projectId).eq('sceneId', args.sceneId))
      .unique()
    const nextPayload = normalizeScenePayload(args.payload)
    if (existing) {
      await ctx.db.patch(existing._id, {
        ...nextPayload,
        order: args.order,
        updatedByUserId: currentUserId,
        updatedAt: now,
      })
      return { ok: true, sceneDocId: existing._id }
    }
    const id = await ctx.db.insert('projectScenes', {
      projectId: args.projectId,
      sceneId: args.sceneId,
      order: args.order,
      ...nextPayload,
      updatedByUserId: currentUserId,
      createdAt: now,
      updatedAt: now,
    })
    return { ok: true, sceneDocId: id }
  },
})

export const deleteScene = mutation({
  args: {
    projectId: v.id('projects'),
    sceneId: v.string(),
  },
  handler: async (ctx, args) => {
    const currentUserId = await requireCurrentUserId(ctx)
    await requireProjectRole(ctx, args.projectId, currentUserId, 'editor')
    await requireCloudWritesEnabled(ctx)
    const row = await ctx.db
      .query('projectScenes')
      .withIndex('by_project_id_scene_id', (q: any) => q.eq('projectId', args.projectId).eq('sceneId', args.sceneId))
      .unique()
    if (row) await ctx.db.delete(row._id)
    return { ok: true }
  },
})
