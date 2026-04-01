import { v } from 'convex/values'
import { action, internalMutation, internalQuery, query } from './_generated/server'
import { api } from './_generated/api'
import { getStripeBillingConfig, getStripeSecretKey } from './stripeConfig'
import {
  hasPaidCloudAccess,
  isGrandfatheredOrComped,
} from '../shared/src/policies/accessPolicy'

function normalizeEmail(email: string | undefined | null) {
  return typeof email === 'string' ? email.trim().toLowerCase() : ''
}

export function subscriptionStatusAllowsCloudFeatures(status: string | undefined | null) {
  return hasPaidCloudAccess({
    isAuthenticated: true,
    subscriptionStatus: status,
  })
}

export async function canUseCloudFeatures(ctx: any, userId: any) {
  const subscription = await ctx.db
    .query('billingSubscriptions')
    .withIndex('by_user_id', (q: any) => q.eq('userId', userId))
    .unique()

  const profile = await ctx.db
    .query('accountProfiles')
    .withIndex('by_user_id', (q: any) => q.eq('userId', userId))
    .unique()

  return hasPaidCloudAccess({
    isAuthenticated: true,
    subscriptionStatus: subscription?.status,
    hasGrandfatheredAccess: Boolean(profile?.grandfatheredAccess),
    hasCompedAccess: Boolean(profile?.compedAccess),
  })
}

async function patchAccountTierForUser(ctx: any, userId: any, now: number) {
  const profile = await ctx.db
    .query('accountProfiles')
    .withIndex('by_user_id', (q: any) => q.eq('userId', userId))
    .unique()

  if (!profile) return

  const canUseCloud = await canUseCloudFeatures(ctx, userId)

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

async function getBillingCustomerForUser(ctx: any, userId: any) {
  return ctx.db
    .query('billingCustomers')
    .withIndex('by_user_id', (q: any) => q.eq('userId', userId))
    .unique()
}

async function upsertBillingCustomer(ctx: any, args: { userId: any, stripeCustomerId: string, email?: string | null }) {
  const now = Date.now()
  const existing = await ctx.db
    .query('billingCustomers')
    .withIndex('by_stripe_customer_id', (q: any) => q.eq('stripeCustomerId', args.stripeCustomerId))
    .unique()

  const normalizedEmail = normalizeEmail(args.email)
  if (existing) {
    await ctx.db.patch(existing._id, {
      userId: args.userId,
      email: normalizedEmail || existing.email,
      updatedAt: now,
    })
    return existing.stripeCustomerId
  }

  const byUser = await getBillingCustomerForUser(ctx, args.userId)
  if (byUser) {
    await ctx.db.patch(byUser._id, {
      stripeCustomerId: args.stripeCustomerId,
      email: normalizedEmail || byUser.email,
      updatedAt: now,
    })
    return args.stripeCustomerId
  }

  await ctx.db.insert('billingCustomers', {
    userId: args.userId,
    stripeCustomerId: args.stripeCustomerId,
    email: normalizedEmail || undefined,
    createdAt: now,
    updatedAt: now,
  })

  return args.stripeCustomerId
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

    const [subscription, profile] = await Promise.all([
      ctx.db
      .query('billingSubscriptions')
      .withIndex('by_user_id', (q: any) => q.eq('userId', user._id))
      .unique(),
      ctx.db
        .query('accountProfiles')
        .withIndex('by_user_id', (q: any) => q.eq('userId', user._id))
        .unique(),
    ])

    const subscriptionStatus = subscription?.status || null
    const grandfatheredOrComped = isGrandfatheredOrComped({
      isAuthenticated: true,
      hasGrandfatheredAccess: Boolean(profile?.grandfatheredAccess),
      hasCompedAccess: Boolean(profile?.compedAccess),
    })
    const canUseCloud = hasPaidCloudAccess({
      isAuthenticated: true,
      subscriptionStatus,
      hasGrandfatheredAccess: Boolean(profile?.grandfatheredAccess),
      hasCompedAccess: Boolean(profile?.compedAccess),
    })

    const stripeConfig = getStripeBillingConfig()
    const billingState = grandfatheredOrComped
      ? 'manual_override_active'
      : canUseCloud
        ? 'active'
        : subscriptionStatus
          ? 'inactive'
          : 'none'

    return {
      canUseCloudFeatures: canUseCloud,
      checkoutAvailable: stripeConfig.checkoutAvailable,
      portalAvailable: stripeConfig.portalAvailable,
      subscriptionStatus,
      grandfatheredOrComped,
      isAdmin: Boolean(profile?.isAdmin),
      isLocalOnlyUser: !canUseCloud,
      billingState,
      currentPeriodEnd: subscription?.currentPeriodEnd || null,
      cancelAtPeriodEnd: Boolean(subscription?.cancelAtPeriodEnd),
      planTier: profile?.planTier || (canUseCloud ? 'paid' : 'free'),
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
  const secretKey = getStripeSecretKey()
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

async function ensureStripeCustomer(ctx: any, user: { _id: string, email: string | null, name: string | null }) {
  const existing = await getBillingCustomerForUser(ctx, user._id)
  if (existing?.stripeCustomerId) return existing.stripeCustomerId

  const createBody = new URLSearchParams()
  const email = normalizeEmail(user.email)
  if (email) {
    createBody.set('email', email)
  }
  if (user.name) {
    createBody.set('name', user.name)
  }
  createBody.set('metadata[userId]', String(user._id))

  const customer = await stripeRequest('/customers', createBody)
  if (!customer?.id) throw new Error('Failed to create Stripe customer')

  await upsertBillingCustomer(ctx, {
    userId: user._id,
    stripeCustomerId: String(customer.id),
    email: user.email,
  })

  return String(customer.id)
}

export const createCheckoutSession = action({
  args: {
    successUrl: v.string(),
    cancelUrl: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) throw new Error('Not authenticated')

    const { priceId } = getStripeBillingConfig()
    if (!priceId) throw new Error('Missing STRIPE_PRICE_ID')

    const user = await ctx.runQuery(api.billing.getUserForBillingToken, {
      tokenIdentifier: identity.tokenIdentifier,
    })
    if (!user) throw new Error('User not found')

    const stripeCustomerId = await ensureStripeCustomer(ctx, user)

    const body = new URLSearchParams()
    body.set('mode', 'subscription')
    body.set('success_url', args.successUrl)
    body.set('cancel_url', args.cancelUrl)
    body.set('line_items[0][price]', priceId)
    body.set('line_items[0][quantity]', '1')
    body.set('allow_promotion_codes', 'true')
    body.set('customer', stripeCustomerId)
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

export const createPortalSession = action({
  args: {
    returnUrl: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) throw new Error('Not authenticated')

    const { portalAvailable } = getStripeBillingConfig()
    if (!portalAvailable) throw new Error('Stripe portal is not configured')

    const user = await ctx.runQuery(api.billing.getUserForBillingToken, {
      tokenIdentifier: identity.tokenIdentifier,
    })
    if (!user) throw new Error('User not found')

    const stripeCustomerId = await ensureStripeCustomer(ctx, user)
    const body = new URLSearchParams()
    body.set('customer', stripeCustomerId)
    body.set('return_url', args.returnUrl)

    const session = await stripeRequest('/billing_portal/sessions', body)
    return {
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

    if (resolvedUserId && args.customerId) {
      await upsertBillingCustomer(ctx, {
        userId: resolvedUserId,
        stripeCustomerId: args.customerId,
        email: args.customerEmail,
      })
    }

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
      await patchAccountTierForUser(ctx, resolvedUserId, now)
    }

    return { ok: true }
  },
})
