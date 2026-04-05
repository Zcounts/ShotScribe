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

const ROLE_RANK = Object.freeze({
  viewer: 1,
  editor: 2,
  owner: 3,
})

export function getReadOnlyReason(entitlement, currentUserRole = null) {
  if (currentUserRole === 'viewer') {
    return 'You have viewer access on this cloud project. Ask the owner to grant editor access to make changes.'
  }
  if (!entitlement?.subscriptionStatus) {
    return 'Cloud access requires an active paid plan. You can keep using local-only projects and local import/export.'
  }
  return `Billing is currently ${entitlement.subscriptionStatus}. This cloud project is read-only until billing is reactivated.`
}

export default function useCloudAccessPolicy(options = {}) {
  const projectRef = useStore(s => s.projectRef)
  const isCloudProject = projectRef?.type === 'cloud'
  const cloudProjectId = isCloudProject ? projectRef.projectId : null
  const roleOverride = typeof options?.projectRole === 'string' ? options.projectRole : null
  const storedEntitlement = useStore(s => s.entitlement)
  const userDataLoaded = useStore(s => s.userDataLoaded)
  const projectQuery = useQuery(
    'projects:getProjectById',
    cloudProjectId && !roleOverride ? { projectId: cloudProjectId } : 'skip'
  )
  const entitlement = storedEntitlement || DEFAULT_SUMMARY
  const isEntitlementLoading = !userDataLoaded

  return useMemo(() => {
    const currentUserRole = isCloudProject ? (roleOverride || projectQuery?.currentUserRole || null) : null
    const hasEditorRole = !isCloudProject || ROLE_RANK[currentUserRole] >= ROLE_RANK.editor
    const context = {
      isAuthenticated: true,
      subscriptionStatus: entitlement.subscriptionStatus,
      hasGrandfatheredAccess: entitlement.grandfatheredOrComped,
      hasCompedAccess: false,
      hasProjectMembership: isCloudProject ? Boolean(currentUserRole) : false,
      cloudWritesEnabled: true,
      allCollaboratorsHavePaidAccess: true,
    }

    const paidCloudAccess = hasPaidCloudAccess(context)
    const canEdit = isCloudProject ? canEditCloudProject(context) && hasEditorRole : true
    const canExport = isCloudProject ? canExportCloudProject(context) : true
    const canAccessAssets = isCloudProject ? canAccessCloudAssets(context) : true
    const canCollaborate = isCloudProject ? canCollaborateOnCloudProject(context) && hasEditorRole : true
    const readOnly = isCloudProject && !canEdit

    return {
      entitlement,
      isCloudProject,
      currentUserRole,
      isEntitlementLoading,
      paidCloudAccess,
      canEditCloudProject: canEdit,
      canExportCloudProject: canExport,
      canAccessCloudAssets: canAccessAssets,
      canCollaborateOnCloudProject: canCollaborate,
      readOnly,
      readOnlyReason: readOnly ? getReadOnlyReason(entitlement, currentUserRole) : '',
    }
  }, [entitlement, isCloudProject, isEntitlementLoading, projectQuery?.currentUserRole, roleOverride, userDataLoaded])
}
