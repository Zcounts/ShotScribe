import { defineSchema, defineTable } from 'convex/server'
import { v } from 'convex/values'

export default defineSchema({
  users: defineTable({
    tokenIdentifier: v.string(),
    subject: v.optional(v.string()),
    email: v.optional(v.string()),
    name: v.optional(v.string()),
    pictureUrl: v.optional(v.string()),
    lastSeenAt: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_token_identifier', ['tokenIdentifier'])
    .index('by_email', ['email']),

  accountProfiles: defineTable({
    userId: v.id('users'),
    displayName: v.optional(v.string()),
    planTier: v.union(v.literal('free'), v.literal('paid')),
    localOnlyEligible: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index('by_user_id', ['userId']),



  billingSubscriptions: defineTable({
    userId: v.optional(v.id('users')),
    stripeCustomerId: v.string(),
    stripeSubscriptionId: v.optional(v.string()),
    stripePriceId: v.optional(v.string()),
    status: v.string(),
    currentPeriodEnd: v.optional(v.number()),
    cancelAtPeriodEnd: v.optional(v.boolean()),
    lastStripeEventId: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_user_id', ['userId'])
    .index('by_stripe_customer_id', ['stripeCustomerId'])
    .index('by_stripe_subscription_id', ['stripeSubscriptionId']),
  projects: defineTable({
    ownerUserId: v.id('users'),
    name: v.string(),
    emoji: v.string(),
    latestSnapshotId: v.optional(v.id('projectSnapshots')),
    archivedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_owner_user_id', ['ownerUserId'])
    .index('by_owner_user_id_updated_at', ['ownerUserId', 'updatedAt']),



  projectMembers: defineTable({
    projectId: v.id('projects'),
    userId: v.id('users'),
    role: v.union(v.literal('editor'), v.literal('viewer')),
    invitedByUserId: v.id('users'),
    revokedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_project_id', ['projectId'])
    .index('by_user_id', ['userId'])
    .index('by_project_id_user_id', ['projectId', 'userId']),

  projectInvites: defineTable({
    projectId: v.id('projects'),
    email: v.string(),
    role: v.union(v.literal('editor'), v.literal('viewer')),
    token: v.string(),
    invitedByUserId: v.id('users'),
    status: v.union(v.literal('pending'), v.literal('accepted'), v.literal('revoked')),
    acceptedByUserId: v.optional(v.id('users')),
    acceptedAt: v.optional(v.number()),
    expiresAt: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_project_id', ['projectId'])
    .index('by_email_status', ['email', 'status'])
    .index('by_token', ['token']),
  projectSnapshots: defineTable({
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
    versionToken: v.string(),
    createdAt: v.number(),
  })
    .index('by_project_id_created_at', ['projectId', 'createdAt'])
    .index('by_created_by_user_id_created_at', ['createdByUserId', 'createdAt']),

  projectAssets: defineTable({
    projectId: v.id('projects'),
    uploadedByUserId: v.id('users'),
    shotId: v.optional(v.string()),
    kind: v.union(v.literal('storyboard_image')),
    mime: v.string(),
    sourceName: v.optional(v.string()),
    thumbStorageId: v.id('_storage'),
    fullStorageId: v.id('_storage'),
    meta: v.optional(v.any()),
    createdAt: v.number(),
    updatedAt: v.number(),
    deletedAt: v.optional(v.number()),
  })
    .index('by_project_id', ['projectId'])
    .index('by_project_id_shot_id', ['projectId', 'shotId']),

  screenplayLocks: defineTable({
    projectId: v.id('projects'),
    sceneId: v.string(),
    holderUserId: v.id('users'),
    holderName: v.optional(v.string()),
    leaseExpiresAt: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_project_id_scene_id', ['projectId', 'sceneId'])
    .index('by_project_id_lease_expires_at', ['projectId', 'leaseExpiresAt']),

  presence: defineTable({
    projectId: v.id('projects'),
    userId: v.id('users'),
    sceneId: v.optional(v.string()),
    mode: v.union(v.literal('viewing'), v.literal('editing')),
    userName: v.optional(v.string()),
    userEmail: v.optional(v.string()),
    lastSeenAt: v.number(),
    expiresAt: v.number(),
  })
    .index('by_project_id_user_id', ['projectId', 'userId'])
    .index('by_project_id_expires_at', ['projectId', 'expiresAt']),
})
