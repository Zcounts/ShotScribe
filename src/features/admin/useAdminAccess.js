import { useMemo } from 'react'
import useStore from '../../store'

export function useAdminAccess() {
  const entitlement = useStore(s => s.entitlement)
  const userDataLoaded = useStore(s => s.userDataLoaded)

  return useMemo(() => {
    if (!userDataLoaded) {
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
  }, [entitlement, userDataLoaded])
}
