import { v } from 'convex/values'
import { mutation, query } from './_generated/server'
import { hasPaidCloudAccess, isGrandfatheredOrComped } from '../shared/src/policies/accessPolicy'
import { resolveCanonicalCurrentUser } from './users'

function normalizeEmail(email: string | undefined | null) {
  return String(email || '').trim().toLowerCase()
}

function normalizeOptionalText(value: string | undefined | null) {
  const normalized = typeof value === 'string' ? value.trim() : ''
  return normalized ? normalized : undefined
}

function operationalAdminTokenIsValid(token: string | undefined | null) {
  const expected = normalizeOptionalText(process.env.OPERATIONAL_ADMIN_TOKEN)
  if (!expected) return false
  return token === expected
}

async function requireIdentity(ctx: any) {
  const identity = await ctx.auth.getUserIdentity()
  if (!identity) {
    throw new Error('Not authenticated')
  }
  return identity
}

async function getCurrentUser(ctx: any) {
  await requireIdentity(ctx)
  const resolved = await resolveCanonicalCurrentUser(ctx)
  if (!resolved) return null
  return resolved.user
}

async function getProfileByUserId(ctx: any, userId: any) {
  return ctx.db
    .query('accountProfiles')
    .withIndex('by_user_id', (q: any) => q.eq('userId', userId))
    .unique()
}

function normalizeSubscriptionStatus(status: string | undefined | null) {
  return String(status || '').trim().toLowerCase()
}

function buildCloudAccessSummary(profile: any, subscription: any) {
  const subscriptionStatus = subscription?.status || null
  const hasGrandfatheredAccess = Boolean(profile?.grandfatheredAccess)
  const hasCompedAccess = Boolean(profile?.compedAccess)
  const grandfatheredOrComped = isGrandfatheredOrComped({
    isAuthenticated: true,
    hasGrandfatheredAccess,
    hasCompedAccess,
  })
  const canUseCloudFeatures = hasPaidCloudAccess({
    isAuthenticated: true,
    subscriptionStatus,
    hasGrandfatheredAccess,
    hasCompedAccess,
  })

  const billingState = grandfatheredOrComped
    ? 'manual_override_active'
    : canUseCloudFeatures
      ? 'active'
      : subscriptionStatus
        ? 'inactive'
        : 'none'

  return {
    subscriptionStatus,
    canUseCloudFeatures,
    grandfatheredOrComped,
    billingState,
    currentPeriodEnd: subscription?.currentPeriodEnd || null,
    cancelAtPeriodEnd: Boolean(subscription?.cancelAtPeriodEnd),
  }
}

async function getAdminProfileCount(ctx: any) {
  const profiles = await ctx.db.query('accountProfiles').collect()
  return profiles.filter((profile: any) => Boolean(profile.isAdmin)).length
}

export async function requireCurrentAdmin(ctx: any) {
  const user = await getCurrentUser(ctx)
  if (!user) {
    throw new Error('User not found')
  }

  const profile = await getProfileByUserId(ctx, user._id)
  if (!profile?.isAdmin) {
    throw new Error('Forbidden')
  }

  return { user, profile }
}

async function patchAdminRoleForUser(ctx: any, userId: any, isAdmin: boolean) {
  const profile = await getProfileByUserId(ctx, userId)
  if (!profile) {
    throw new Error('Account profile not found')
  }

  const now = Date.now()
  await ctx.db.patch(profile._id, {
    isAdmin,
    updatedAt: now,
  })

  return { profileId: profile._id, updatedAt: now }
}

async function findUserByEmail(ctx: any, email: string) {
  const normalizedEmail = normalizeEmail(email)
  if (!normalizedEmail) {
    throw new Error('Email is required')
  }

  // Use collect() instead of unique() so that duplicate email rows (possible
  // after manual dashboard runs) don't throw.  Pick the most recently updated
  // row — consistent with canonicalizeUserForIdentity's fallback strategy.
  const users = await ctx.db
    .query('users')
    .withIndex('by_email', (q: any) => q.eq('email', normalizedEmail))
    .collect()

  if (!users.length) {
    throw new Error('User not found for email')
  }

  users.sort((a: any, b: any) => (b.updatedAt || 0) - (a.updatedAt || 0))
  return users[0]
}

async function findAllUsersByEmail(ctx: any, email: string) {
  const normalizedEmail = normalizeEmail(email)
  if (!normalizedEmail) return []
  return ctx.db
    .query('users')
    .withIndex('by_email', (q: any) => q.eq('email', normalizedEmail))
    .collect()
}

export const getMyAdminState = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx)
    if (!user) {
      return {
        isAuthenticated: false,
        isAdmin: false,
      }
    }

    const profile = await getProfileByUserId(ctx, user._id)
    return {
      isAuthenticated: true,
      isAdmin: Boolean(profile?.isAdmin),
      userId: String(user._id),
      email: user.email || null,
      name: user.name || null,
    }
  },
})

export const listAdmins = query({
  args: {},
  handler: async (ctx) => {
    await requireCurrentAdmin(ctx)

    const profiles = await ctx.db.query('accountProfiles').collect()
    const adminProfiles = profiles.filter((profile: any) => Boolean(profile.isAdmin))

    const admins = []
    for (const profile of adminProfiles) {
      const user = await ctx.db.get(profile.userId)
      admins.push({
        userId: String(profile.userId),
        email: user?.email || null,
        name: user?.name || null,
        isAdmin: true,
        updatedAt: profile.updatedAt,
      })
    }

    return admins.sort((a, b) => (a.email || '').localeCompare(b.email || ''))
  },
})

export const getAdminDashboardOverview = query({
  args: {
    recentLimit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireCurrentAdmin(ctx)
    const recentLimit = Math.min(Math.max(args.recentLimit || 10, 1), 50)

    const [users, profiles, subscriptions, projects, memberships] = await Promise.all([
      ctx.db.query('users').collect(),
      ctx.db.query('accountProfiles').collect(),
      ctx.db.query('billingSubscriptions').collect(),
      ctx.db.query('projects').collect(),
      ctx.db.query('projectMembers').collect(),
    ])

    const profileByUserId = new Map<string, any>()
    for (const profile of profiles) {
      profileByUserId.set(String(profile.userId), profile)
    }

    const subscriptionByUserId = new Map<string, any>()
    for (const subscription of subscriptions) {
      if (!subscription.userId) continue
      const key = String(subscription.userId)
      const existing = subscriptionByUserId.get(key)
      if (!existing || (subscription.updatedAt || 0) > (existing.updatedAt || 0)) {
        subscriptionByUserId.set(key, subscription)
      }
    }

    let totalPaidUsers = 0
    let totalGrandfatheredOrCompedUsers = 0
    for (const user of users) {
      const profile = profileByUserId.get(String(user._id))
      const subscription = subscriptionByUserId.get(String(user._id))
      const access = buildCloudAccessSummary(profile, subscription)
      if (access.canUseCloudFeatures) totalPaidUsers += 1
      if (access.grandfatheredOrComped) totalGrandfatheredOrCompedUsers += 1
    }

    const totalActiveSubscriptions = subscriptions.filter((subscription: any) => {
      const normalizedStatus = normalizeSubscriptionStatus(subscription.status)
      return normalizedStatus === 'active' || normalizedStatus === 'trialing'
    }).length

    const totalCloudProjects = projects.length
    const totalActiveCloudProjects = projects.filter((project: any) => !project.archivedAt).length
    const totalSharedMemberships = memberships.filter((membership: any) => !membership.revokedAt).length
    const sharedProjectIds = new Set(
      memberships
        .filter((membership: any) => !membership.revokedAt)
        .map((membership: any) => String(membership.projectId)),
    )

    const recentSignups = [...users]
      .sort((a: any, b: any) => (b.createdAt || 0) - (a.createdAt || 0))
      .slice(0, recentLimit)
      .map((user: any) => ({
        userId: String(user._id),
        email: user.email || null,
        name: user.name || null,
        createdAt: user.createdAt,
      }))

    const recentSubscriptionChanges = [...subscriptions]
      .sort((a: any, b: any) => (b.updatedAt || 0) - (a.updatedAt || 0))
      .slice(0, recentLimit)
      .map((subscription: any) => ({
        subscriptionId: String(subscription._id),
        userId: subscription.userId ? String(subscription.userId) : null,
        status: subscription.status,
        currentPeriodEnd: subscription.currentPeriodEnd || null,
        cancelAtPeriodEnd: Boolean(subscription.cancelAtPeriodEnd),
        updatedAt: subscription.updatedAt,
      }))

    return {
      totals: {
        totalSignups: users.length,
        totalPaidUsers,
        totalActiveSubscriptions,
        totalGrandfatheredOrCompedUsers,
        totalCloudProjects,
        totalActiveCloudProjects,
        totalSharedProjects: sharedProjectIds.size,
        totalSharedMemberships,
      },
      recentSignups,
      recentSubscriptionChanges,
      generatedAt: Date.now(),
    }
  },
})

export const findUserByEmailForAdmin = query({
  args: {
    email: v.string(),
  },
  handler: async (ctx, args) => {
    await requireCurrentAdmin(ctx)
    const user = await findUserByEmail(ctx, args.email)

    return {
      userId: String(user._id),
      email: user.email || null,
      name: user.name || null,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    }
  },
})

export const getAdminUserDetail = query({
  args: {
    userId: v.id('users'),
  },
  handler: async (ctx, args) => {
    await requireCurrentAdmin(ctx)

    const user = await ctx.db.get(args.userId)
    if (!user) throw new Error('User not found')

    const [profile, subscription, ownedProjects, memberRows] = await Promise.all([
      ctx.db
        .query('accountProfiles')
        .withIndex('by_user_id', (q: any) => q.eq('userId', args.userId))
        .unique(),
      ctx.db
        .query('billingSubscriptions')
        .withIndex('by_user_id', (q: any) => q.eq('userId', args.userId))
        .unique(),
      ctx.db
        .query('projects')
        .withIndex('by_owner_user_id', (q: any) => q.eq('ownerUserId', args.userId))
        .collect(),
      ctx.db
        .query('projectMembers')
        .withIndex('by_user_id', (q: any) => q.eq('userId', args.userId))
        .collect(),
    ])

    const activeSharedMemberships = memberRows.filter((row: any) => !row.revokedAt)
    const access = buildCloudAccessSummary(profile, subscription)

    return {
      user: {
        userId: String(user._id),
        email: user.email || null,
        name: user.name || null,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        lastSeenAt: user.lastSeenAt,
      },
      billing: {
        billingState: access.billingState,
        subscriptionStatus: access.subscriptionStatus,
        currentPeriodEnd: access.currentPeriodEnd,
        cancelAtPeriodEnd: access.cancelAtPeriodEnd,
      },
      cloudAccess: {
        canUseCloudFeatures: access.canUseCloudFeatures,
        isLocalOnlyUser: !access.canUseCloudFeatures,
      },
      planFlags: {
        planTier: profile?.planTier || (access.canUseCloudFeatures ? 'paid' : 'free'),
        grandfatheredAccess: Boolean(profile?.grandfatheredAccess),
        compedAccess: Boolean(profile?.compedAccess),
        grandfatheredOrComped: access.grandfatheredOrComped,
      },
      projectCounts: {
        owned: ownedProjects.length,
        shared: activeSharedMemberships.length,
      },
      admin: {
        isAdmin: Boolean(profile?.isAdmin),
      },
    }
  },
})

export const setCompedAccessForUser = mutation({
  args: {
    userId: v.id('users'),
    enabled: v.boolean(),
  },
  handler: async (ctx, args) => {
    await requireCurrentAdmin(ctx)
    const profile = await getProfileByUserId(ctx, args.userId)
    if (!profile) throw new Error('Account profile not found')

    const now = Date.now()
    await ctx.db.patch(profile._id, {
      compedAccess: args.enabled,
      updatedAt: now,
    })

    return {
      userId: String(args.userId),
      compedAccess: args.enabled,
      updatedAt: now,
    }
  },
})

export const setGrandfatheredAccessForUser = mutation({
  args: {
    userId: v.id('users'),
    enabled: v.boolean(),
  },
  handler: async (ctx, args) => {
    await requireCurrentAdmin(ctx)
    const profile = await getProfileByUserId(ctx, args.userId)
    if (!profile) throw new Error('Account profile not found')

    const now = Date.now()
    await ctx.db.patch(profile._id, {
      grandfatheredAccess: args.enabled,
      updatedAt: now,
    })

    return {
      userId: String(args.userId),
      grandfatheredAccess: args.enabled,
      updatedAt: now,
    }
  },
})

export const getSafeOperationalControls = query({
  args: {},
  handler: async (ctx) => {
    await requireCurrentAdmin(ctx)

    const cloudWritesFlag = await ctx.db
      .query('operationalFlags')
      .withIndex('by_key', (q: any) => q.eq('key', 'cloud_writes_enabled'))
      .unique()

    return {
      cloudWritesEnabled: cloudWritesFlag ? Boolean(cloudWritesFlag.enabled) : true,
      cloudWritesReason: cloudWritesFlag?.reason || null,
      cloudWritesUpdatedAt: cloudWritesFlag?.updatedAt || null,
      safeKeys: ['cloud_writes_enabled'],
    }
  },
})

export const setCloudWritesEnabled = mutation({
  args: {
    enabled: v.boolean(),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { user } = await requireCurrentAdmin(ctx)
    const now = Date.now()

    const existing = await ctx.db
      .query('operationalFlags')
      .withIndex('by_key', (q: any) => q.eq('key', 'cloud_writes_enabled'))
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
        key: 'cloud_writes_enabled',
        ...patch,
      })
    }

    return {
      key: 'cloud_writes_enabled',
      enabled: args.enabled,
      updatedAt: now,
    }
  },
})

export const bootstrapFirstAdmin = mutation({
  args: {
    adminToken: v.string(),
    email: v.string(),
  },
  handler: async (ctx, args) => {
    if (!operationalAdminTokenIsValid(args.adminToken)) {
      throw new Error('Forbidden')
    }

    const adminCount = await getAdminProfileCount(ctx)
    if (adminCount > 0) {
      throw new Error('Admin bootstrap already completed')
    }

    const user = await findUserByEmail(ctx, args.email)
    await patchAdminRoleForUser(ctx, user._id, true)

    return {
      userId: String(user._id),
      email: user.email || null,
      isAdmin: true,
    }
  },
})

// Repair tool for split-identity production scenarios.
// Run this from the Convex dashboard function runner while signed in as the
// real Clerk user ("Act as user" → select the REAL Clerk user from the list).
// It finds the exact user record the current JWT maps to and forces isAdmin=true,
// bypassing email lookup entirely.  Requires the OPERATIONAL_ADMIN_TOKEN env var.
export const repairAdminForCurrentUser = mutation({
  args: { adminToken: v.string() },
  handler: async (ctx, args) => {
    if (!operationalAdminTokenIsValid(args.adminToken)) {
      throw new Error('Forbidden')
    }

    const identity = await requireIdentity(ctx)
    const now = Date.now()

    // Step 1: find canonical user — token match is the ground truth.
    let canonicalUser: any = null
    try {
      canonicalUser = await ctx.db
        .query('users')
        .withIndex('by_token_identifier', (q: any) => q.eq('tokenIdentifier', identity.tokenIdentifier))
        .unique()
    } catch {
      // Multiple rows with same tokenIdentifier — fall through to email
    }

    // Step 2: if no token match, find by email (same fallback as resolveCanonicalCurrentUser).
    if (!canonicalUser) {
      const normalizedEmail = normalizeEmail(identity.email)
      if (!normalizedEmail) {
        throw new Error('No tokenIdentifier match and no email on identity — cannot identify canonical user')
      }
      const emailUsers = await ctx.db
        .query('users')
        .withIndex('by_email', (q: any) => q.eq('email', normalizedEmail))
        .collect()
      if (!emailUsers.length) {
        throw new Error('No user found for this Clerk identity. Sign in once to bootstrap the user record, then retry.')
      }
      emailUsers.sort((a: any, b: any) => (b.updatedAt || 0) - (a.updatedAt || 0))
      canonicalUser = emailUsers[0]
    }

    const profile = await getProfileByUserId(ctx, canonicalUser._id)
    if (!profile) {
      throw new Error('No accountProfile found for this user. Run users:upsertCurrentUser first.')
    }

    const wasAlreadyAdmin = Boolean(profile.isAdmin)
    if (!wasAlreadyAdmin) {
      await ctx.db.patch(profile._id, { isAdmin: true, updatedAt: now })
    }

    return {
      userId: String(canonicalUser._id),
      email: canonicalUser.email || null,
      tokenIdentifier: canonicalUser.tokenIdentifier,
      isAdmin: true,
      wasAlreadyAdmin,
      repaired: !wasAlreadyAdmin,
    }
  },
})

export const setAdminRoleWithToken = mutation({
  args: {
    adminToken: v.string(),
    email: v.string(),
    isAdmin: v.boolean(),
  },
  handler: async (ctx, args) => {
    if (!operationalAdminTokenIsValid(args.adminToken)) {
      throw new Error('Forbidden')
    }

    // When granting, patch ALL users with this email so the grant reaches the
    // canonical row regardless of which one the current Clerk session resolves
    // to.  When revoking, only revoke from the most-recently-updated one (safe
    // default) to avoid accidentally touching unrelated duplicate rows.
    const allUsers = await findAllUsersByEmail(ctx, args.email)
    if (!allUsers.length) {
      throw new Error('User not found for email')
    }

    allUsers.sort((a: any, b: any) => (b.updatedAt || 0) - (a.updatedAt || 0))
    const primaryUser = allUsers[0]

    if (!args.isAdmin) {
      const adminCount = await getAdminProfileCount(ctx)
      const profile = await getProfileByUserId(ctx, primaryUser._id)
      if (profile?.isAdmin && adminCount <= 1) {
        throw new Error('Cannot revoke the last admin')
      }
    }

    const now = Date.now()
    const usersToUpdate = args.isAdmin ? allUsers : [primaryUser]
    for (const u of usersToUpdate) {
      const profile = await getProfileByUserId(ctx, u._id)
      if (profile) {
        await ctx.db.patch(profile._id, { isAdmin: args.isAdmin, updatedAt: now })
      }
    }

    return {
      userId: String(primaryUser._id),
      email: primaryUser.email || null,
      isAdmin: args.isAdmin,
      rowsPatched: usersToUpdate.length,
    }
  },
})

export const setAdminRole = mutation({
  args: {
    email: v.string(),
    isAdmin: v.boolean(),
  },
  handler: async (ctx, args) => {
    const { user: currentUser } = await requireCurrentAdmin(ctx)
    const user = await findUserByEmail(ctx, args.email)

    if (!args.isAdmin) {
      const adminCount = await getAdminProfileCount(ctx)
      const targetProfile = await getProfileByUserId(ctx, user._id)
      const isSelf = String(currentUser._id) === String(user._id)
      if (targetProfile?.isAdmin && adminCount <= 1 && isSelf) {
        throw new Error('Cannot remove your own last-admin access')
      }
      if (targetProfile?.isAdmin && adminCount <= 1) {
        throw new Error('Cannot revoke the last admin')
      }
    }

    await patchAdminRoleForUser(ctx, user._id, args.isAdmin)

    return {
      userId: String(user._id),
      email: user.email || null,
      isAdmin: args.isAdmin,
    }
  },
})
