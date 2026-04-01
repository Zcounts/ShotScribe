import { v } from 'convex/values'
import { action, internalMutation, internalQuery, query } from './_generated/server'
import { api } from './_generated/api'

const ENTITLED_SUBSCRIPTION_STATUSES = new Set(['active', 'trialing'])

function normalizeEmail(email: string | undefined | null) {
  return typeof email === 'string' ? email.trim().toLowerCase() : ''
}

export function subscriptionStatusAllowsCloudFeatures(status: string | undefined | null) {
  return ENTITLED_SUBSCRIPTION_STATUSES.has(String(status || '').toLowerCase())
}

export async function canUseCloudFeatures(ctx: any, userId: any) {
  const subscription = await ctx.db
    .query('billingSubscriptions')
    .withIndex('by_user_id', (q: any) => q.eq('userId', userId))
    .unique()

  if (!subscription) return false
  return subscriptionStatusAllowsCloudFeatures(subscription.status)
}

async function patchAccountTierForUser(ctx: any, userId: any, canUseCloud: boolean, now: number) {
  const profile = await ctx.db
    .query('accountProfiles')
    .withIndex('by_user_id', (q: any) => q.eq('userId', userId))
    .unique()

  if (!profile) return

  await ctx.db.patch(profile._id, {
    planTier: canUseCloud ? 'paid' : 'free',
    updatedAt: now,
  })
}



export async function requireCloudEntitlement(ctx: any, userId: any) {
  const allowed = await canUseCloudFeatures(ctx, userId)
  if (!allowed) {
    throw new Error('Cloud features require an active paid subscription')
  }
}

export const getMyEntitlement = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) {
      return {
        canUseCloudFeatures: false,
        checkoutAvailable: false,
        subscriptionStatus: null,
      }
    }

    const user = await ctx.db
      .query('users')
      .withIndex('by_token_identifier', (q: any) => q.eq('tokenIdentifier', identity.tokenIdentifier))
      .unique()

    if (!user) {
      return {
        canUseCloudFeatures: false,
        checkoutAvailable: false,
        subscriptionStatus: null,
      }
    }

    const subscription = await ctx.db
      .query('billingSubscriptions')
      .withIndex('by_user_id', (q: any) => q.eq('userId', user._id))
      .unique()

    const subscriptionStatus = subscription?.status || null
    return {
      canUseCloudFeatures: subscriptionStatusAllowsCloudFeatures(subscriptionStatus),
      checkoutAvailable: Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_PRICE_ID),
      subscriptionStatus,
    }
  },
})

export const getUserForBillingToken = internalQuery({
  args: { tokenIdentifier: v.string() },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query('users')
      .withIndex('by_token_identifier', (q: any) => q.eq('tokenIdentifier', args.tokenIdentifier))
      .unique()

    return user
      ? {
          _id: user._id,
          email: user.email || null,
          name: user.name || null,
        }
      : null
  },
})

async function stripeRequest(path: string, body: URLSearchParams) {
  const secretKey = process.env.STRIPE_SECRET_KEY
  if (!secretKey) throw new Error('Missing STRIPE_SECRET_KEY')

  const response = await fetch(`https://api.stripe.com/v1${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${secretKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  })

  const payload = await response.json()
  if (!response.ok) {
    throw new Error(payload?.error?.message || 'Stripe request failed')
  }
  return payload
}

export const createCheckoutSession = action({
  args: {
    successUrl: v.string(),
    cancelUrl: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) throw new Error('Not authenticated')

    const priceId = process.env.STRIPE_PRICE_ID
    if (!priceId) throw new Error('Missing STRIPE_PRICE_ID')

    const user = await ctx.runQuery(api.billing.getUserForBillingToken, {
      tokenIdentifier: identity.tokenIdentifier,
    })
    if (!user) throw new Error('User not found')

    const body = new URLSearchParams()
    body.set('mode', 'subscription')
    body.set('success_url', args.successUrl)
    body.set('cancel_url', args.cancelUrl)
    body.set('line_items[0][price]', priceId)
    body.set('line_items[0][quantity]', '1')
    body.set('allow_promotion_codes', 'true')
    body.set('client_reference_id', String(user._id))
    body.set('metadata[userId]', String(user._id))

    const email = normalizeEmail(user.email)
    if (email) {
      body.set('customer_email', email)
    }

    const session = await stripeRequest('/checkout/sessions', body)

    return {
      sessionId: session.id,
      url: session.url,
    }
  },
})

export const syncStripeSubscription = internalMutation({
  args: {
    eventId: v.string(),
    customerId: v.optional(v.string()),
    subscriptionId: v.optional(v.string()),
    status: v.optional(v.string()),
    priceId: v.optional(v.string()),
    currentPeriodEnd: v.optional(v.number()),
    cancelAtPeriodEnd: v.optional(v.boolean()),
    userId: v.optional(v.id('users')),
    customerEmail: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now()

    let record = null
    if (args.subscriptionId) {
      record = await ctx.db
        .query('billingSubscriptions')
        .withIndex('by_stripe_subscription_id', (q: any) => q.eq('stripeSubscriptionId', args.subscriptionId))
        .unique()
    }

    if (!record && args.customerId) {
      record = await ctx.db
        .query('billingSubscriptions')
        .withIndex('by_stripe_customer_id', (q: any) => q.eq('stripeCustomerId', args.customerId))
        .unique()
    }

    let resolvedUserId = args.userId || record?.userId

    if (!resolvedUserId && args.customerEmail) {
      const normalizedEmail = normalizeEmail(args.customerEmail)
      if (normalizedEmail) {
        const user = await ctx.db
          .query('users')
          .withIndex('by_email', (q: any) => q.eq('email', normalizedEmail))
          .unique()
        resolvedUserId = user?._id
      }
    }

    const status = args.status || 'incomplete'

    const patch = {
      userId: resolvedUserId,
      stripeCustomerId: args.customerId || record?.stripeCustomerId || '',
      stripeSubscriptionId: args.subscriptionId,
      status,
      stripePriceId: args.priceId,
      currentPeriodEnd: args.currentPeriodEnd,
      cancelAtPeriodEnd: args.cancelAtPeriodEnd,
      lastStripeEventId: args.eventId,
      updatedAt: now,
    }

    if (record) {
      await ctx.db.patch(record._id, patch)
    } else {
      await ctx.db.insert('billingSubscriptions', {
        ...patch,
        createdAt: now,
      })
    }

    if (resolvedUserId) {
      await patchAccountTierForUser(ctx, resolvedUserId, subscriptionStatusAllowsCloudFeatures(status), now)
    }

    return { ok: true }
  },
})
