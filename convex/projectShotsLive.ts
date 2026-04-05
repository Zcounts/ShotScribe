import { v } from 'convex/values'
import { mutation, query } from './_generated/server'
import { requireCurrentUserId, requireProjectRole } from './projectMembers'
import { requireCloudWritesEnabled } from './ops'

function normalizeShotPayload(shot: any) {
  const customFields = Object.fromEntries(
    Object.entries(shot || {}).filter(([key]) => String(key).startsWith('custom_')),
  )
  return {
    cameraName: shot?.cameraName || 'Camera 1',
    focalLength: shot?.focalLength || '',
    color: shot?.color || undefined,
    image: shot?.image || undefined,
    imageAsset: shot?.imageAsset || undefined,
    specs: shot?.specs || { size: '', type: '', move: '', equip: '' },
    notes: shot?.notes || '',
    subject: shot?.subject || '',
    description: shot?.description || '',
    cast: shot?.cast || '',
    checked: !!shot?.checked,
    intOrExt: shot?.intOrExt || '',
    dayNight: shot?.dayNight || '',
    scriptTime: shot?.scriptTime || '',
    setupTime: shot?.setupTime || '',
    shotAspectRatio: shot?.shotAspectRatio || '',
    predictedTakes: shot?.predictedTakes || '',
    shootTime: shot?.shootTime || '',
    takeNumber: shot?.takeNumber || '',
    sound: shot?.sound || '',
    props: shot?.props || '',
    frameRate: shot?.frameRate || '',
    linkedSceneId: shot?.linkedSceneId || undefined,
    linkedDialogueLine: shot?.linkedDialogueLine || undefined,
    linkedDialogueOffset: Number.isFinite(shot?.linkedDialogueOffset) ? shot.linkedDialogueOffset : undefined,
    linkedScriptRangeStart: Number.isFinite(shot?.linkedScriptRangeStart) ? shot.linkedScriptRangeStart : undefined,
    linkedScriptRangeEnd: Number.isFinite(shot?.linkedScriptRangeEnd) ? shot.linkedScriptRangeEnd : undefined,
    customFields,
  }
}

export const listShotsByProject = query({
  args: { projectId: v.id('projects') },
  handler: async (ctx, args) => {
    const currentUserId = await requireCurrentUserId(ctx)
    await requireProjectRole(ctx, args.projectId, currentUserId, 'viewer')
    return ctx.db
      .query('projectShots')
      .withIndex('by_project_id_scene_id_order', (q: any) => q.eq('projectId', args.projectId))
      .collect()
  },
})

export const upsertShot = mutation({
  args: {
    projectId: v.id('projects'),
    sceneId: v.string(),
    shotId: v.string(),
    order: v.number(),
    payload: v.any(),
  },
  handler: async (ctx, args) => {
    const currentUserId = await requireCurrentUserId(ctx)
    await requireProjectRole(ctx, args.projectId, currentUserId, 'editor')
    await requireCloudWritesEnabled(ctx)
    const now = Date.now()
    const existing = await ctx.db
      .query('projectShots')
      .withIndex('by_project_id_shot_id', (q: any) => q.eq('projectId', args.projectId).eq('shotId', args.shotId))
      .unique()
    const nextPayload = normalizeShotPayload(args.payload)
    if (existing) {
      await ctx.db.patch(existing._id, {
        sceneId: args.sceneId,
        order: args.order,
        ...nextPayload,
        updatedByUserId: currentUserId,
        updatedAt: now,
      })
      return { ok: true, shotDocId: existing._id }
    }
    const id = await ctx.db.insert('projectShots', {
      projectId: args.projectId,
      sceneId: args.sceneId,
      shotId: args.shotId,
      order: args.order,
      ...nextPayload,
      updatedByUserId: currentUserId,
      createdAt: now,
      updatedAt: now,
    })
    return { ok: true, shotDocId: id }
  },
})

export const deleteShot = mutation({
  args: {
    projectId: v.id('projects'),
    shotId: v.string(),
  },
  handler: async (ctx, args) => {
    const currentUserId = await requireCurrentUserId(ctx)
    await requireProjectRole(ctx, args.projectId, currentUserId, 'editor')
    await requireCloudWritesEnabled(ctx)
    const row = await ctx.db
      .query('projectShots')
      .withIndex('by_project_id_shot_id', (q: any) => q.eq('projectId', args.projectId).eq('shotId', args.shotId))
      .unique()
    if (row) await ctx.db.delete(row._id)
    return { ok: true }
  },
})
