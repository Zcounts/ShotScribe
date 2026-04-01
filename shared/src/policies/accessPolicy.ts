export const ENTITLED_SUBSCRIPTION_STATUSES = ['active', 'trialing'] as const

export type EntitledSubscriptionStatus = (typeof ENTITLED_SUBSCRIPTION_STATUSES)[number]

export type AccessPolicyContext = {
  isAuthenticated: boolean
  subscriptionStatus?: string | null
  hasGrandfatheredAccess?: boolean
  hasCompedAccess?: boolean
  isAdmin?: boolean
  hasProjectMembership?: boolean
  cloudWritesEnabled?: boolean
  allCollaboratorsHavePaidAccess?: boolean
}

function normalizeStatus(status: string | null | undefined) {
  return String(status || '').trim().toLowerCase()
}

export function isGrandfatheredOrComped(context: AccessPolicyContext) {
  return Boolean(context.hasGrandfatheredAccess || context.hasCompedAccess)
}

export function isAdmin(context: AccessPolicyContext) {
  return Boolean(context.isAdmin)
}

export function hasPaidCloudAccess(context: AccessPolicyContext) {
  if (!context.isAuthenticated) return false
  if (isGrandfatheredOrComped(context)) return true
  return ENTITLED_SUBSCRIPTION_STATUSES.includes(normalizeStatus(context.subscriptionStatus) as EntitledSubscriptionStatus)
}

export function isLocalOnlyUser(context: AccessPolicyContext) {
  return !hasPaidCloudAccess(context)
}

export function canAccessCloudProject(context: AccessPolicyContext) {
  if (!context.isAuthenticated) return false
  return Boolean(context.hasProjectMembership)
}

export function canEditCloudProject(context: AccessPolicyContext) {
  if (!canAccessCloudProject(context)) return false
  if (!hasPaidCloudAccess(context)) return false
  return context.cloudWritesEnabled !== false
}

export function canExportCloudProject(context: AccessPolicyContext) {
  if (!canAccessCloudProject(context)) return false
  return hasPaidCloudAccess(context)
}

export function canAccessCloudAssets(context: AccessPolicyContext) {
  if (!canAccessCloudProject(context)) return false
  return hasPaidCloudAccess(context)
}

export function canCollaborateOnCloudProject(context: AccessPolicyContext) {
  if (!canEditCloudProject(context)) return false
  return context.allCollaboratorsHavePaidAccess !== false
}
