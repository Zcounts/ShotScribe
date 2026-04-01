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

  projectSnapshots: defineTable({
    projectId: v.id('projects'),
    createdByUserId: v.id('users'),
    source: v.union(v.literal('manual_save'), v.literal('autosave'), v.literal('local_conversion')),
    payload: v.any(),
    createdAt: v.number(),
  })
    .index('by_project_id_created_at', ['projectId', 'createdAt'])
    .index('by_created_by_user_id_created_at', ['createdByUserId', 'createdAt']),
})
