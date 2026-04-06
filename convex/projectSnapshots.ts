import { v } from 'convex/values'
import { mutation, query } from './_generated/server'
import { assertCanEditCloudProject } from './accessPolicy'
import { requireCurrentUserId, requireProjectRole } from './projectMembers'
import { requireCloudWritesEnabled } from './ops'
import { writeOperationalEvent } from './opsLog'

const usageDiagnosticsEnabled = process.env.CONVEX_USAGE_DIAGNOSTICS === '1'
const MAX_CLOUD_SNAPSHOT_BYTES = 900_000
const INLINE_IMAGE_PREFIXES = ['data:', 'blob:', 'file:']
const SNAPSHOT_TOO_LARGE_ERROR = 'Cloud backup could not be enabled because this project is too large to snapshot right now (usually due to embedded local images).'

function estimatePayloadBytes(value: any) {
  try {
    return new TextEncoder().encode(JSON.stringify(value ?? null)).length
  } catch {
    return -1
  }
}

function isUnsafeInlineImage(value: any) {
  if (typeof value !== 'string') return false
  const trimmed = value.trim().toLowerCase()
  if (!trimmed) return false
  return INLINE_IMAGE_PREFIXES.some((prefix) => trimmed.startsWith(prefix))
}

function sanitizeImageAsset(asset: any, { keepThumbForCloudAsset = false }: { keepThumbForCloudAsset?: boolean } = {}) {
  if (!asset || typeof asset !== 'object') return null
  const hasCloudAsset = typeof asset?.cloud?.assetId === 'string' && asset.cloud.assetId.trim().length > 0
  const safeThumb = isUnsafeInlineImage(asset.thumb) ? null : (asset.thumb || null)
  return {
    version: asset.version || 1,
    mime: asset.mime || 'image/webp',
    thumb: hasCloudAsset ? (keepThumbForCloudAsset ? safeThumb : null) : safeThumb,
    full: null,
    meta: asset.meta || null,
    cloud: hasCloudAsset ? asset.cloud : null,
  }
}

function sanitizeImageNode(node: any, { keepThumbForCloudAsset = false }: { keepThumbForCloudAsset?: boolean } = {}) {
  if (!node || typeof node !== 'object') return node
  const imageAsset = sanitizeImageAsset(node.imageAsset, { keepThumbForCloudAsset })
  const safeImage = isUnsafeInlineImage(node.image) ? null : (node.image || null)
  return {
    ...node,
    image: imageAsset?.cloud?.assetId ? null : safeImage,
    imageAsset,
  }
}

function stripDuplicatedShotThumb(shot: any) {
  if (!shot || typeof shot !== 'object') return shot
  const nextShot = sanitizeImageNode(shot)
  if (
    typeof nextShot.image === 'string'
    && typeof nextShot.imageAsset?.thumb === 'string'
    && nextShot.image === nextShot.imageAsset.thumb
  ) {
    nextShot.image = null
  }
  return nextShot
}

function normalizeForCloudSnapshot(payload: any) {
  if (!payload || typeof payload !== 'object') return payload
  if (!Array.isArray(payload.scenes)) return payload
  return {
    ...payload,
    projectHeroImage: sanitizeImageNode(payload.projectHeroImage, { keepThumbForCloudAsset: true }),
    scenes: payload.scenes.map((scene: any) => ({
      ...scene,
      shots: Array.isArray(scene?.shots) ? scene.shots.map(stripDuplicatedShotThumb) : [],
    })),
  }
}

function snapshotReplacer(_key: string, value: any) {
  if (typeof value === 'number' && !Number.isFinite(value)) return null
  if (typeof value === 'function' || typeof value === 'symbol') return undefined
  if (value instanceof Date) return value.toISOString()
  return value
}

function sanitizeAndAssertSnapshotPayload(payload: any) {
  const normalized = normalizeForCloudSnapshot(payload)
  const serialized = JSON.stringify(normalized, snapshotReplacer)
  const size = serialized ? new TextEncoder().encode(serialized).length : 0
  if (size > MAX_CLOUD_SNAPSHOT_BYTES) {
    throw new Error(SNAPSHOT_TOO_LARGE_ERROR)
  }
  return JSON.parse(serialized || '{}')
}

async function upsertSnapshotHead(ctx: any, args: {
  projectId: any,
  latestSnapshotId: any,
  latestSnapshotCreatedAt: number,
  latestSnapshotSource: any,
  latestSnapshotVersionToken: string,
  latestSnapshotPayloadBytes: number,
}) {
  const existingHead = await ctx.db
    .query('projectSnapshotHeads')
    .withIndex('by_project_id', (q: any) => q.eq('projectId', args.projectId))
    .unique()

  const patch = {
    latestSnapshotId: args.latestSnapshotId,
    latestSnapshotCreatedAt: args.latestSnapshotCreatedAt,
    latestSnapshotSource: args.latestSnapshotSource,
    latestSnapshotVersionToken: args.latestSnapshotVersionToken,
    latestSnapshotPayloadBytes: args.latestSnapshotPayloadBytes,
    latestSnapshotHasPayload: true,
    updatedAt: Date.now(),
  }

  if (existingHead) {
    await ctx.db.patch(existingHead._id, patch)
    return existingHead._id
  }

  return ctx.db.insert('projectSnapshotHeads', {
    projectId: args.projectId,
    ...patch,
  })
}

async function writeSnapshot(ctx: any, args: {
  projectId: any,
  createdByUserId: any,
  source: 'manual_save' | 'autosave' | 'local_conversion' | 'restore' | 'conflict_recovery',
  payload: any,
  currentUserId: any,
}) {
  const now = Date.now()
  const versionToken = `${args.projectId}:${now}:${Math.random().toString(36).slice(2, 8)}`
  const payloadBytes = estimatePayloadBytes(args.payload)
  const snapshotId = await ctx.db.insert('projectSnapshots', {
    projectId: args.projectId,
    createdByUserId: args.createdByUserId,
    source: args.source,
    payload: args.payload,
    versionToken,
    createdAt: now,
  })

  const payloadProjectName = typeof args.payload?.projectName === 'string'
    ? args.payload.projectName.trim()
    : ''
  const payloadProjectEmoji = typeof args.payload?.projectEmoji === 'string'
    ? args.payload.projectEmoji.trim()
    : ''

  await ctx.db.patch(args.projectId, {
    latestSnapshotId: snapshotId,
    ...(payloadProjectName ? { name: payloadProjectName } : {}),
    ...(payloadProjectEmoji ? { emoji: payloadProjectEmoji } : {}),
    updatedAt: now,
  })
  await upsertSnapshotHead(ctx, {
    projectId: args.projectId,
    latestSnapshotId: snapshotId,
    latestSnapshotCreatedAt: now,
    latestSnapshotSource: args.source,
    latestSnapshotVersionToken: versionToken,
    latestSnapshotPayloadBytes: payloadBytes,
  })

  await writeOperationalEvent(ctx, {
    event: 'project.snapshot.created',
    details: {
      projectId: String(args.projectId),
      snapshotId: String(snapshotId),
      source: args.source,
      userId: String(args.currentUserId),
      payloadBytes,
    },
  })

  if (usageDiagnosticsEnabled) {
    // eslint-disable-next-line no-console
    console.info('[convex-usage] snapshot.write', {
      projectId: String(args.projectId),
      snapshotId: String(snapshotId),
      source: args.source,
      payloadBytes,
    })
  }

  return {
    ok: true,
    snapshotId,
    versionToken,
    createdAt: now,
  }
}

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

    const { project } = await requireProjectRole(ctx, args.projectId, currentUserId, 'viewer')
    const currentLatestSnapshotId = project.latestSnapshotId || null
    if (
      args.expectedLatestSnapshotId !== undefined
      && String(args.expectedLatestSnapshotId || '') !== String(currentLatestSnapshotId || '')
    ) {
      return {
        ok: false,
        reason: 'version_conflict',
        latestSnapshotId: currentLatestSnapshotId,
      }
    }

    return writeSnapshot(ctx, {
      projectId: args.projectId,
      createdByUserId: args.createdByUserId,
      source: args.source,
      payload: args.payload,
      currentUserId,
    })
  },
})

export const commitScriptDomain = mutation({
  args: {
    projectId: v.id('projects'),
    createdByUserId: v.id('users'),
    scriptPayload: v.any(),
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

    const { project } = await requireProjectRole(ctx, args.projectId, currentUserId, 'viewer')
    const currentLatestSnapshotId = project.latestSnapshotId || null
    if (
      args.expectedLatestSnapshotId !== undefined
      && String(args.expectedLatestSnapshotId || '') !== String(currentLatestSnapshotId || '')
    ) {
      return {
        ok: false,
        reason: 'version_conflict',
        latestSnapshotId: currentLatestSnapshotId,
      }
    }

    let latestPayload: any = {}
    if (project.latestSnapshotId) {
      const latestSnapshot = await ctx.db.get(project.latestSnapshotId)
      latestPayload = (latestSnapshot?.payload && typeof latestSnapshot.payload === 'object')
        ? latestSnapshot.payload
        : {}
    } else {
      const fallback = await ctx.db
        .query('projectSnapshots')
        .withIndex('by_project_id_created_at', (q: any) => q.eq('projectId', args.projectId))
        .order('desc')
        .take(1)
      latestPayload = (fallback[0]?.payload && typeof fallback[0].payload === 'object') ? fallback[0].payload : {}
    }

    const mergedPayload = {
      ...latestPayload,
      ...(args.scriptPayload && typeof args.scriptPayload === 'object' ? args.scriptPayload : {}),
    }

    const safeMergedPayload = sanitizeAndAssertSnapshotPayload(mergedPayload)

    return writeSnapshot(ctx, {
      projectId: args.projectId,
      createdByUserId: args.createdByUserId,
      source: 'autosave',
      payload: safeMergedPayload,
      currentUserId,
    })
  },
})

export const getLatestSnapshotHeadForProject = query({
  args: {
    projectId: v.id('projects'),
  },
  handler: async (ctx, args) => {
    const currentUserId = await requireCurrentUserId(ctx)
    const { project } = await requireProjectRole(ctx, args.projectId, currentUserId, 'viewer')

    const head = await ctx.db
      .query('projectSnapshotHeads')
      .withIndex('by_project_id', (q: any) => q.eq('projectId', args.projectId))
      .unique()
    if (head) return head

    // Compatibility fallback for legacy projects: infer lightweight head from
    // project pointer without pulling the full snapshot payload into list paths.
    if (project.latestSnapshotId) {
      return {
        projectId: args.projectId,
        latestSnapshotId: project.latestSnapshotId,
        latestSnapshotCreatedAt: project.updatedAt || null,
        latestSnapshotSource: null,
        latestSnapshotVersionToken: null,
        latestSnapshotPayloadBytes: null,
        latestSnapshotHasPayload: true,
        updatedAt: project.updatedAt || Date.now(),
      }
    }

    return {
      projectId: args.projectId,
      latestSnapshotId: null,
      latestSnapshotCreatedAt: null,
      latestSnapshotSource: null,
      latestSnapshotVersionToken: null,
      latestSnapshotPayloadBytes: null,
      latestSnapshotHasPayload: false,
      updatedAt: Date.now(),
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
      const latest = await ctx.db.get(project.latestSnapshotId)
      if (usageDiagnosticsEnabled && latest) {
        // eslint-disable-next-line no-console
        console.info('[convex-usage] snapshot.read.latest', {
          projectId: String(args.projectId),
          snapshotId: String(latest._id),
          payloadBytes: estimatePayloadBytes(latest.payload),
        })
      }
      return latest
    }

    const snapshots = await ctx.db
      .query('projectSnapshots')
      .withIndex('by_project_id_created_at', (q: any) => q.eq('projectId', args.projectId))
      .order('desc')
      .take(1)

    const fallback = snapshots[0] || null
    if (usageDiagnosticsEnabled && fallback) {
      // eslint-disable-next-line no-console
      console.info('[convex-usage] snapshot.read.fallback', {
        projectId: String(args.projectId),
        snapshotId: String(fallback._id),
        payloadBytes: estimatePayloadBytes(fallback.payload),
      })
    }
    return fallback
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
