import { v } from 'convex/values'
import { mutation, query } from './_generated/server'

async function requireIdentity(ctx: any) {
  const identity = await ctx.auth.getUserIdentity()
  if (!identity) {
    throw new Error('Not authenticated')
  }
  return identity
}

async function getProfileByUserId(ctx: any, userId: any) {
  return ctx.db
    .query('accountProfiles')
    .withIndex('by_user_id', (q: any) => q.eq('userId', userId))
    .unique()
}

async function ensureAccountProfile(ctx: any, args: { userId: any, name?: string, now: number }) {
  const existingProfile = await getProfileByUserId(ctx, args.userId)
  if (existingProfile) return existingProfile

  const profileId = await ctx.db.insert('accountProfiles', {
    userId: args.userId,
    displayName: args.name,
    planTier: 'free',
    localOnlyEligible: true,
    grandfatheredAccess: false,
    compedAccess: false,
    isAdmin: false,
    createdAt: args.now,
    updatedAt: args.now,
  })

  return ctx.db.get(profileId)
}

async function mergeDuplicateAccountProfileToCanonical(ctx: any, args: { canonicalUserId: any, duplicateUserId: any, now: number }) {
  const canonicalProfile = await ensureAccountProfile(ctx, {
    userId: args.canonicalUserId,
    now: args.now,
  })
  const duplicateProfile = await getProfileByUserId(ctx, args.duplicateUserId)
  if (!duplicateProfile) return

  await ctx.db.patch(canonicalProfile!._id, {
    displayName: canonicalProfile?.displayName || duplicateProfile.displayName,
    planTier: canonicalProfile?.planTier === 'paid' || duplicateProfile.planTier === 'paid' ? 'paid' : 'free',
    grandfatheredAccess: Boolean(canonicalProfile?.grandfatheredAccess) || Boolean(duplicateProfile.grandfatheredAccess),
    compedAccess: Boolean(canonicalProfile?.compedAccess) || Boolean(duplicateProfile.compedAccess),
    isAdmin: Boolean(canonicalProfile?.isAdmin) || Boolean(duplicateProfile.isAdmin),
    updatedAt: args.now,
  })
}

async function canonicalizeUserForIdentity(ctx: any, args: {
  tokenIdentifier: string,
  email?: string,
  subject?: string,
  name?: string,
  pictureUrl?: string,
  now: number,
}) {
  const tokenMatchedUser = await ctx.db
    .query('users')
    .withIndex('by_token_identifier', (q: any) => q.eq('tokenIdentifier', args.tokenIdentifier))
    .unique()

  const emailMatchedUsers = args.email
    ? await ctx.db
      .query('users')
      .withIndex('by_email', (q: any) => q.eq('email', args.email))
      .collect()
    : []

  let canonicalUser = tokenMatchedUser
  if (!canonicalUser) {
    canonicalUser = [...emailMatchedUsers]
      .sort((a: any, b: any) => (b.updatedAt || 0) - (a.updatedAt || 0))[0]
      || null
  }

  if (!canonicalUser) {
    const userId = await ctx.db.insert('users', {
      tokenIdentifier: args.tokenIdentifier,
      subject: args.subject,
      email: args.email,
      name: args.name,
      pictureUrl: args.pictureUrl,
      createdAt: args.now,
      lastSeenAt: args.now,
      updatedAt: args.now,
    })

    await ensureAccountProfile(ctx, {
      userId,
      name: args.name,
      now: args.now,
    })

    return userId
  }

  await ctx.db.patch(canonicalUser._id, {
    tokenIdentifier: args.tokenIdentifier,
    subject: args.subject,
    email: args.email,
    name: args.name,
    pictureUrl: args.pictureUrl,
    lastSeenAt: args.now,
    updatedAt: args.now,
  })

  await ensureAccountProfile(ctx, {
    userId: canonicalUser._id,
    name: args.name,
    now: args.now,
  })

  const duplicatesByEmail = emailMatchedUsers.filter((candidate: any) => String(candidate._id) !== String(canonicalUser!._id))
  for (const duplicate of duplicatesByEmail) {
    await mergeDuplicateAccountProfileToCanonical(ctx, {
      canonicalUserId: canonicalUser._id,
      duplicateUserId: duplicate._id,
      now: args.now,
    })

    await ctx.db.patch(duplicate._id, {
      email: undefined,
      tokenIdentifier: duplicate.tokenIdentifier === args.tokenIdentifier
        ? `${duplicate.tokenIdentifier}#relinked#${String(duplicate._id)}`
        : duplicate.tokenIdentifier,
      updatedAt: args.now,
    })
  }

  return canonicalUser._id
}

export const upsertCurrentUser = mutation({
  args: {
    email: v.optional(v.string()),
    name: v.optional(v.string()),
    pictureUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx)
    const now = Date.now()

    const subject = typeof identity.subject === 'string' ? identity.subject : undefined
    const rawEmail = args.email ?? (typeof identity.email === 'string' ? identity.email : undefined)
    const email = typeof rawEmail === 'string' ? rawEmail.trim().toLowerCase() : undefined
    const name = args.name ?? (typeof identity.name === 'string' ? identity.name : undefined)
    const pictureUrl = args.pictureUrl ?? (typeof identity.pictureUrl === 'string' ? identity.pictureUrl : undefined)

    const userId = await canonicalizeUserForIdentity(ctx, {
      tokenIdentifier: identity.tokenIdentifier,
      email,
      subject,
      name,
      pictureUrl,
      now,
    })

    return userId
  },
})

export const currentUser = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) return null

    const user = await ctx.db
      .query('users')
      .withIndex('by_token_identifier', (q) => q.eq('tokenIdentifier', identity.tokenIdentifier))
      .unique()

    if (!user) return null

    const accountProfile = await ctx.db
      .query('accountProfiles')
      .withIndex('by_user_id', (q) => q.eq('userId', user._id))
      .unique()

    return {
      user,
      accountProfile,
    }
  },
})
