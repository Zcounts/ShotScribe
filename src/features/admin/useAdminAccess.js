import { useMemo } from 'react'
import { useQuery } from 'convex/react'

export function useAdminAccess() {
  const entitlement = useQuery('billing:getMyEntitlement')

  return useMemo(() => {
    if (entitlement === undefined) {
      return {
        loading: true,
        isAdmin: false,
        canAccessAdminFeatures: false,
      }
    }

    const isAdmin = Boolean(entitlement?.isAdmin)
    return {
      loading: false,
      isAdmin,
      canAccessAdminFeatures: isAdmin,
    }
  }, [entitlement])
}
