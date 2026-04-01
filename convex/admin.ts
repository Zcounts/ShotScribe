import { v } from 'convex/values'
import { mutation, query } from './_generated/server'

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
  const identity = await requireIdentity(ctx)
  return ctx.db
    .query('users')
    .withIndex('by_token_identifier', (q: any) => q.eq('tokenIdentifier', identity.tokenIdentifier))
    .unique()
}

async function getProfileByUserId(ctx: any, userId: any) {
  return ctx.db
    .query('accountProfiles')
    .withIndex('by_user_id', (q: any) => q.eq('userId', userId))
    .unique()
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

  const user = await ctx.db
    .query('users')
    .withIndex('by_email', (q: any) => q.eq('email', normalizedEmail))
    .unique()

  if (!user) {
    throw new Error('User not found for email')
  }

  return user
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

    const user = await findUserByEmail(ctx, args.email)

    if (!args.isAdmin) {
      const adminCount = await getAdminProfileCount(ctx)
      const profile = await getProfileByUserId(ctx, user._id)
      if (profile?.isAdmin && adminCount <= 1) {
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
