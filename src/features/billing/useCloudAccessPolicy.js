import { useMemo } from 'react'
import { useQuery } from 'convex/react'
import useStore from '../../store'
import {
  canAccessCloudAssets,
  canCollaborateOnCloudProject,
  canEditCloudProject,
  canExportCloudProject,
  hasPaidCloudAccess,
} from '../../../shared/src/policies/accessPolicy'

const DEFAULT_SUMMARY = Object.freeze({
  canUseCloudFeatures: false,
  subscriptionStatus: null,
  grandfatheredOrComped: false,
  billingState: 'none',
})

export function getReadOnlyReason(entitlement) {
  if (!entitlement?.subscriptionStatus) {
    return 'Cloud access requires an active paid plan. You can keep using local-only projects and local import/export.'
  }
  return `Billing is currently ${entitlement.subscriptionStatus}. This cloud project is read-only until billing is reactivated.`
}

export default function useCloudAccessPolicy() {
  const projectRef = useStore(s => s.projectRef)
  const isCloudProject = projectRef?.type === 'cloud'
  const entitlementQuery = useQuery('billing:getMyEntitlement')
  const entitlement = entitlementQuery || DEFAULT_SUMMARY
  const isEntitlementLoading = entitlementQuery === undefined

  return useMemo(() => {
    const context = {
      isAuthenticated: true,
      subscriptionStatus: entitlement.subscriptionStatus,
      hasGrandfatheredAccess: entitlement.grandfatheredOrComped,
      hasCompedAccess: false,
      hasProjectMembership: isCloudProject,
      cloudWritesEnabled: true,
      allCollaboratorsHavePaidAccess: true,
    }

    const paidCloudAccess = hasPaidCloudAccess(context)
    const canEdit = isCloudProject ? canEditCloudProject(context) : true
    const canExport = isCloudProject ? canExportCloudProject(context) : true
    const canAccessAssets = isCloudProject ? canAccessCloudAssets(context) : true
    const canCollaborate = isCloudProject ? canCollaborateOnCloudProject(context) : true
    const readOnly = isCloudProject && !canEdit

    return {
      entitlement,
      isCloudProject,
      isEntitlementLoading,
      paidCloudAccess,
      canEditCloudProject: canEdit,
      canExportCloudProject: canExport,
      canAccessCloudAssets: canAccessAssets,
      canCollaborateOnCloudProject: canCollaborate,
      readOnly,
      readOnlyReason: readOnly ? getReadOnlyReason(entitlement) : '',
    }
  }, [entitlement, isCloudProject, isEntitlementLoading])
}
