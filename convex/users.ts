import { v } from 'convex/values'
import { mutation, query } from './_generated/server'

async function requireIdentity(ctx: any) {
  const identity = await ctx.auth.getUserIdentity()
  if (!identity) {
    throw new Error('Not authenticated')
  }
  return identity
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

    const existingUser = await ctx.db
      .query('users')
      .withIndex('by_token_identifier', (q) => q.eq('tokenIdentifier', identity.tokenIdentifier))
      .unique()

    const subject = typeof identity.subject === 'string' ? identity.subject : undefined
    const rawEmail = args.email ?? (typeof identity.email === 'string' ? identity.email : undefined)
    const email = typeof rawEmail === 'string' ? rawEmail.trim().toLowerCase() : undefined
    const name = args.name ?? (typeof identity.name === 'string' ? identity.name : undefined)
    const pictureUrl = args.pictureUrl ?? (typeof identity.pictureUrl === 'string' ? identity.pictureUrl : undefined)

    if (existingUser) {
      await ctx.db.patch(existingUser._id, {
        subject,
        email,
        name,
        pictureUrl,
        lastSeenAt: now,
        updatedAt: now,
      })
      return existingUser._id
    }

    const userId = await ctx.db.insert('users', {
      tokenIdentifier: identity.tokenIdentifier,
      subject,
      email,
      name,
      pictureUrl,
      createdAt: now,
      lastSeenAt: now,
      updatedAt: now,
    })

    await ctx.db.insert('accountProfiles', {
      userId,
      displayName: name,
      planTier: 'free',
      localOnlyEligible: true,
      createdAt: now,
      updatedAt: now,
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
