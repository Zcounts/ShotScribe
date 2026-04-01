import React from 'react'
import { useAdminAccess } from './useAdminAccess'

export default function AdminFeatureGuard({ children, fallback = null, loadingFallback = null }) {
  const { loading, canAccessAdminFeatures } = useAdminAccess()

  if (loading) {
    return loadingFallback
  }

  if (!canAccessAdminFeatures) {
    return fallback
  }

  return <>{children}</>
}
