import {
  canAccessCloudProject,
  canAccessCloudAssets,
  canCollaborateOnCloudProject,
  canEditCloudProject,
  canExportCloudProject,
  hasPaidCloudAccess,
  isAdmin as isAdminAccessPolicy,
  isGrandfatheredOrComped,
  isLocalOnlyUser,
} from '../shared/src/policies/accessPolicy'

const ROLE_RANK: Record<string, number> = {
  viewer: 1,
  editor: 2,
  owner: 3,
}

async function getSubscriptionStatusForUser(ctx: any, userId: any) {
  const subscription = await ctx.db
    .query('billingSubscriptions')
    .withIndex('by_user_id', (q: any) => q.eq('userId', userId))
    .unique()
  return subscription?.status || null
}

async function getAccountProfileForUser(ctx: any, userId: any) {
  return ctx.db
    .query('accountProfiles')
    .withIndex('by_user_id', (q: any) => q.eq('userId', userId))
    .unique()
}

async function getProjectRoleForUser(ctx: any, projectId: any, userId: any) {
  const project = await ctx.db.get(projectId)
  if (!project) throw new Error('Project not found')

  if (String(project.ownerUserId) === String(userId)) return 'owner'

  const membership = await ctx.db
    .query('projectMembers')
    .withIndex('by_project_id_user_id', (q: any) => q.eq('projectId', projectId).eq('userId', userId))
    .unique()
  if (!membership || membership.revokedAt) return null
  return membership.role
}

export async function assertCanAccessSharedCloudProject(ctx: any, userId: any, projectId: any) {
  const [flags, role] = await Promise.all([
    getUserPolicyFlags(ctx, userId),
    getProjectRoleForUser(ctx, projectId, userId),
  ])

  const canAccess = canAccessCloudProject({
    isAuthenticated: true,
    ...flags,
    hasProjectMembership: Boolean(role),
  })
  if (!canAccess || !role) {
    throw new Error('Forbidden')
  }

  if (role !== 'owner' && !hasPaidCloudAccess({ isAuthenticated: true, ...flags })) {
    throw new Error('Shared cloud collaboration requires an active paid subscription')
  }

  return { role, flags }
}

export async function assertAllActiveCollaboratorsHavePaidAccess(ctx: any, projectId: any) {
  const memberships = await ctx.db
    .query('projectMembers')
    .withIndex('by_project_id', (q: any) => q.eq('projectId', projectId))
    .collect()

  const activeMembers = memberships.filter((member: any) => !member.revokedAt)
  for (const member of activeMembers) {
    const memberFlags = await getUserPolicyFlags(ctx, member.userId)
    const isEntitled = hasPaidCloudAccess({
      isAuthenticated: true,
      ...memberFlags,
    })
    if (!isEntitled) {
      throw new Error('All collaborators on shared cloud projects must have paid cloud access')
    }
  }
}

export async function getUserPolicyFlags(ctx: any, userId: any) {
  const [subscriptionStatus, profile] = await Promise.all([
    getSubscriptionStatusForUser(ctx, userId),
    getAccountProfileForUser(ctx, userId),
  ])

  return {
    subscriptionStatus,
    hasGrandfatheredAccess: Boolean(profile?.grandfatheredAccess),
    hasCompedAccess: Boolean(profile?.compedAccess),
    isAdmin: Boolean(profile?.isAdmin),
  }
}

export async function assertHasPaidCloudAccess(ctx: any, userId: any) {
  const flags = await getUserPolicyFlags(ctx, userId)
  const allowed = hasPaidCloudAccess({
    isAuthenticated: true,
    ...flags,
  })
  if (!allowed) throw new Error('Cloud features require an active paid subscription')
}

export async function assertCanEditCloudProject(ctx: any, userId: any, projectId: any, cloudWritesEnabled = true) {
  const [flags, role] = await Promise.all([
    getUserPolicyFlags(ctx, userId),
    getProjectRoleForUser(ctx, projectId, userId),
  ])

  const canEdit = canEditCloudProject({
    isAuthenticated: true,
    ...flags,
    hasProjectMembership: Boolean(role),
    cloudWritesEnabled,
  })

  if (!canEdit || !role || ROLE_RANK[role] < ROLE_RANK.editor) {
    throw new Error('Forbidden')
  }
}

export async function assertCanCollaborateOnCloudProject(
  ctx: any,
  userId: any,
  projectId: any,
  allCollaboratorsHavePaidAccess = true,
  cloudWritesEnabled = true,
) {
  const [flags, role] = await Promise.all([
    getUserPolicyFlags(ctx, userId),
    getProjectRoleForUser(ctx, projectId, userId),
  ])

  const allowed = canCollaborateOnCloudProject({
    isAuthenticated: true,
    ...flags,
    hasProjectMembership: Boolean(role),
    allCollaboratorsHavePaidAccess,
    cloudWritesEnabled,
  })

  if (!allowed || !role || ROLE_RANK[role] < ROLE_RANK.owner) {
    throw new Error('Forbidden')
  }
}

export async function assertCanAccessCloudAssets(ctx: any, userId: any, projectId: any) {
  const [flags, role] = await Promise.all([
    getUserPolicyFlags(ctx, userId),
    getProjectRoleForUser(ctx, projectId, userId),
  ])

  const allowed = canAccessCloudAssets({
    isAuthenticated: true,
    ...flags,
    hasProjectMembership: Boolean(role),
  })
  if (!allowed) throw new Error('Forbidden')
}

export async function assertCanExportCloudProject(ctx: any, userId: any, projectId: any) {
  const [flags, role] = await Promise.all([
    getUserPolicyFlags(ctx, userId),
    getProjectRoleForUser(ctx, projectId, userId),
  ])

  const allowed = canExportCloudProject({
    isAuthenticated: true,
    ...flags,
    hasProjectMembership: Boolean(role),
  })
  if (!allowed) throw new Error('Forbidden')
}

export async function getCloudPolicySummary(ctx: any, userId: any) {
  const flags = await getUserPolicyFlags(ctx, userId)
  return {
    ...flags,
    hasPaidCloudAccess: hasPaidCloudAccess({ isAuthenticated: true, ...flags }),
    isGrandfatheredOrComped: isGrandfatheredOrComped({ isAuthenticated: true, ...flags }),
    isLocalOnlyUser: isLocalOnlyUser({ isAuthenticated: true, ...flags }),
    isAdmin: isAdminAccessPolicy({ isAuthenticated: true, ...flags }),
  }
}
