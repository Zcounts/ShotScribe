import { v } from 'convex/values'
import { mutation, query } from './_generated/server'
import { requireCurrentUserId } from './projectMembers'
import { requireCurrentAdmin } from './admin'

const CLOUD_WRITES_ENABLED_KEY = 'cloud_writes_enabled'

function normalizeOptionalText(value: string | undefined | null) {
  const normalized = typeof value === 'string' ? value.trim() : ''
  return normalized ? normalized : undefined
}

function operationalAdminTokenIsValid(token: string) {
  const expected = normalizeOptionalText(process.env.OPERATIONAL_ADMIN_TOKEN)
  if (!expected) return false
  return token === expected
}

export async function isCloudWritesEnabled(ctx: any) {
  const flag = await ctx.db
    .query('operationalFlags')
    .withIndex('by_key', (q: any) => q.eq('key', CLOUD_WRITES_ENABLED_KEY))
    .unique()

  if (!flag) return true
  return !!flag.enabled
}

export async function requireCloudWritesEnabled(ctx: any) {
  const enabled = await isCloudWritesEnabled(ctx)
  if (!enabled) {
    throw new Error('Cloud writes are temporarily disabled for incident mitigation')
  }
}

export const getOperationalFlags = query({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query('operationalFlags').collect()
    return rows
      .sort((a: any, b: any) => a.key.localeCompare(b.key))
      .map((row: any) => ({
        key: row.key,
        enabled: !!row.enabled,
        reason: row.reason || null,
        updatedAt: row.updatedAt,
      }))
  },
})

export const setOperationalFlag = mutation({
  args: {
    adminToken: v.string(),
    key: v.string(),
    enabled: v.boolean(),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (!operationalAdminTokenIsValid(args.adminToken)) {
      throw new Error('Forbidden')
    }

    const now = Date.now()
    const currentUserId = await requireCurrentUserId(ctx)
    const existing = await ctx.db
      .query('operationalFlags')
      .withIndex('by_key', (q: any) => q.eq('key', args.key))
      .unique()

    const patch = {
      enabled: args.enabled,
      reason: normalizeOptionalText(args.reason),
      updatedByUserId: currentUserId,
      updatedAt: now,
    }

    if (existing) {
      await ctx.db.patch(existing._id, patch)
    } else {
      await ctx.db.insert('operationalFlags', {
        key: args.key,
        ...patch,
      })
    }

    return {
      key: args.key,
      enabled: args.enabled,
      updatedAt: now,
    }
  },
})

export const setOperationalFlagAsAdmin = mutation({
  args: {
    key: v.string(),
    enabled: v.boolean(),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { user } = await requireCurrentAdmin(ctx)

    const now = Date.now()
    const existing = await ctx.db
      .query('operationalFlags')
      .withIndex('by_key', (q: any) => q.eq('key', args.key))
      .unique()

    const patch = {
      enabled: args.enabled,
      reason: normalizeOptionalText(args.reason),
      updatedByUserId: user._id,
      updatedAt: now,
    }

    if (existing) {
      await ctx.db.patch(existing._id, patch)
    } else {
      await ctx.db.insert('operationalFlags', {
        key: args.key,
        ...patch,
      })
    }

    return {
      key: args.key,
      enabled: args.enabled,
      updatedAt: now,
    }
  },
})


export const getOperationalDiagnostics = query({
  args: {},
  handler: async (ctx) => {
    const cloudWritesEnabled = await isCloudWritesEnabled(ctx)
    const recentEvents = await ctx.db
      .query('operationalEvents')
      .withIndex('by_created_at')
      .order('desc')
      .take(25)

    return {
      cloudWritesEnabled,
      recentEvents,
      generatedAt: Date.now(),
    }
  },
})
