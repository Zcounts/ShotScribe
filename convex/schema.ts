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
})
