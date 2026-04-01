import { v } from 'convex/values'
import { mutation, query } from './_generated/server'
import { requireCloudEntitlement } from './billing'
import { requireCloudWritesEnabled } from './ops'

const ROLE_RANK: Record<string, number> = {
  viewer: 1,
  editor: 2,
  owner: 3,
}

function normalizeEmail(email: string) {
  return String(email || '').trim().toLowerCase()
}

function createInviteToken() {
  return `${Math.random().toString(36).slice(2)}${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`
}

async function requireIdentity(ctx: any) {
  const identity = await ctx.auth.getUserIdentity()
  if (!identity) throw new Error('Not authenticated')
  return identity
}

export async function requireCurrentUserId(ctx: any) {
  const identity = await requireIdentity(ctx)
  const user = await ctx.db
    .query('users')
    .withIndex('by_token_identifier', (q: any) => q.eq('tokenIdentifier', identity.tokenIdentifier))
    .unique()

  if (!user) throw new Error('User not found')
  return user._id
}

export async function getProjectAccessRole(ctx: any, projectId: any, userId: any) {
  const project = await ctx.db.get(projectId)
  if (!project) throw new Error('Project not found')

  if (String(project.ownerUserId) === String(userId)) {
    return { project, role: 'owner' as const }
  }

  const membership = await ctx.db
    .query('projectMembers')
    .withIndex('by_project_id_user_id', (q: any) => q.eq('projectId', projectId).eq('userId', userId))
    .unique()

  if (!membership || membership.revokedAt) {
    return { project, role: null }
  }

  return { project, role: membership.role }
}

export async function requireProjectRole(ctx: any, projectId: any, userId: any, minimumRole: 'viewer' | 'editor' | 'owner') {
  const { project, role } = await getProjectAccessRole(ctx, projectId, userId)
  if (!role || ROLE_RANK[role] < ROLE_RANK[minimumRole]) {
    throw new Error('Forbidden')
  }
  return { project, role }
}

export const listProjectMembers = query({
  args: {
    projectId: v.id('projects'),
  },
  handler: async (ctx, args) => {
    const currentUserId = await requireCurrentUserId(ctx)
    const { project, role } = await requireProjectRole(ctx, args.projectId, currentUserId, 'viewer')

    const memberships = await ctx.db
      .query('projectMembers')
      .withIndex('by_project_id', (q: any) => q.eq('projectId', args.projectId))
      .collect()

    const activeMemberships = memberships.filter((member: any) => !member.revokedAt)

    const usersById = new Map<string, any>()
    for (const member of activeMemberships) {
      const memberUser = await ctx.db.get(member.userId)
      if (memberUser) {
        usersById.set(String(member.userId), memberUser)
      }
    }

    const ownerUser = await ctx.db.get(project.ownerUserId)

    return {
      currentUserRole: role,
      members: [
        {
          userId: String(project.ownerUserId),
          role: 'owner',
          email: ownerUser?.email || null,
          name: ownerUser?.name || null,
        },
        ...activeMemberships.map((member: any) => {
          const memberUser = usersById.get(String(member.userId))
          return {
            userId: String(member.userId),
            role: member.role,
            email: memberUser?.email || null,
            name: memberUser?.name || null,
          }
        }),
      ],
    }
  },
})

export const inviteProjectMember = mutation({
  args: {
    projectId: v.id('projects'),
    email: v.string(),
    role: v.union(v.literal('editor'), v.literal('viewer')),
  },
  handler: async (ctx, args) => {
    const currentUserId = await requireCurrentUserId(ctx)
    const { project } = await requireProjectRole(ctx, args.projectId, currentUserId, 'owner')
    await requireCloudEntitlement(ctx, currentUserId)
    await requireCloudWritesEnabled(ctx)

    const normalizedInviteEmail = normalizeEmail(args.email)
    if (!normalizedInviteEmail) throw new Error('Email is required')

    const existingUser = await ctx.db
      .query('users')
      .withIndex('by_email', (q: any) => q.eq('email', normalizedInviteEmail))
      .unique()

    if (existingUser) {
      const existingMembership = await ctx.db
        .query('projectMembers')
        .withIndex('by_project_id_user_id', (q: any) => q.eq('projectId', args.projectId).eq('userId', existingUser._id))
        .unique()

      const now = Date.now()
      if (existingMembership) {
        await ctx.db.patch(existingMembership._id, {
          role: args.role,
          revokedAt: undefined,
          invitedByUserId: currentUserId,
          updatedAt: now,
        })
      } else {
        await ctx.db.insert('projectMembers', {
          projectId: args.projectId,
          userId: existingUser._id,
          role: args.role,
          invitedByUserId: currentUserId,
          createdAt: now,
          updatedAt: now,
        })
      }
    }

    const now = Date.now()
    const token = createInviteToken()
    const expiresAt = now + (1000 * 60 * 60 * 24 * 7)
    await ctx.db.insert('projectInvites', {
      projectId: args.projectId,
      email: normalizedInviteEmail,
      role: args.role,
      token,
      invitedByUserId: currentUserId,
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      expiresAt,
    })

    const inviteBase = process.env.INVITE_URL_BASE || process.env.CONVEX_INVITE_URL_BASE || ''
    return {
      projectId: String(project._id),
      token,
      inviteUrl: inviteBase ? `${inviteBase.replace(/\/$/, '')}/accept-invite?token=${encodeURIComponent(token)}` : null,
      expiresAt,
    }
  },
})

export const acceptProjectInvite = mutation({
  args: {
    token: v.string(),
  },
  handler: async (ctx, args) => {
    const currentUserId = await requireCurrentUserId(ctx)
    await requireCloudWritesEnabled(ctx)
    const user = await ctx.db.get(currentUserId)
    const normalizedUserEmail = normalizeEmail(user?.email || '')

    const invite = await ctx.db
      .query('projectInvites')
      .withIndex('by_token', (q: any) => q.eq('token', args.token))
      .unique()

    if (!invite) throw new Error('Invite not found')
    if (invite.status !== 'pending') throw new Error('Invite is no longer valid')
    if (invite.expiresAt < Date.now()) throw new Error('Invite has expired')
    if (normalizeEmail(invite.email) !== normalizedUserEmail) throw new Error('Invite email does not match your account')

    const membership = await ctx.db
      .query('projectMembers')
      .withIndex('by_project_id_user_id', (q: any) => q.eq('projectId', invite.projectId).eq('userId', currentUserId))
      .unique()

    const now = Date.now()
    if (membership) {
      await ctx.db.patch(membership._id, {
        role: invite.role,
        revokedAt: undefined,
        updatedAt: now,
      })
    } else {
      await ctx.db.insert('projectMembers', {
        projectId: invite.projectId,
        userId: currentUserId,
        role: invite.role,
        invitedByUserId: invite.invitedByUserId,
        createdAt: now,
        updatedAt: now,
      })
    }

    await ctx.db.patch(invite._id, {
      status: 'accepted',
      acceptedByUserId: currentUserId,
      acceptedAt: now,
      updatedAt: now,
    })

    return { projectId: String(invite.projectId), role: invite.role }
  },
})

export const revokeProjectMember = mutation({
  args: {
    projectId: v.id('projects'),
    userId: v.id('users'),
  },
  handler: async (ctx, args) => {
    const currentUserId = await requireCurrentUserId(ctx)
    const { project } = await requireProjectRole(ctx, args.projectId, currentUserId, 'owner')
    await requireCloudEntitlement(ctx, currentUserId)
    await requireCloudWritesEnabled(ctx)
    if (String(project.ownerUserId) === String(args.userId)) throw new Error('Cannot revoke project owner')

    const membership = await ctx.db
      .query('projectMembers')
      .withIndex('by_project_id_user_id', (q: any) => q.eq('projectId', args.projectId).eq('userId', args.userId))
      .unique()

    if (!membership) return { revoked: false }

    const now = Date.now()
    await ctx.db.patch(membership._id, {
      revokedAt: now,
      updatedAt: now,
    })

    return { revoked: true }
  },
})

export const updateProjectMemberRole = mutation({
  args: {
    projectId: v.id('projects'),
    userId: v.id('users'),
    role: v.union(v.literal('editor'), v.literal('viewer')),
  },
  handler: async (ctx, args) => {
    const currentUserId = await requireCurrentUserId(ctx)
    const { project } = await requireProjectRole(ctx, args.projectId, currentUserId, 'owner')
    await requireCloudEntitlement(ctx, currentUserId)
    await requireCloudWritesEnabled(ctx)
    if (String(project.ownerUserId) === String(args.userId)) throw new Error('Cannot change owner role')

    const membership = await ctx.db
      .query('projectMembers')
      .withIndex('by_project_id_user_id', (q: any) => q.eq('projectId', args.projectId).eq('userId', args.userId))
      .unique()

    if (!membership || membership.revokedAt) {
      throw new Error('Member not found')
    }

    await ctx.db.patch(membership._id, {
      role: args.role,
      updatedAt: Date.now(),
    })

    return { ok: true }
  },
})
