import { useEffect } from 'react'
import { useMutation, useQuery } from 'convex/react'
import useStore from '../store'
import useCloudAccessPolicy from '../features/billing/useCloudAccessPolicy'

export default function CloudSyncCoordinator() {
  const projectRef = useStore(s => s.projectRef)
  const setCloudSyncContext = useStore(s => s.setCloudSyncContext)
  const flushCloudSync = useStore(s => s.flushCloudSync)
  const hasUnsavedChanges = useStore(s => s.hasUnsavedChanges)
  const createSnapshot = useMutation('projectSnapshots:createSnapshot')
  const cloudUser = useQuery('users:currentUser')
  const cloudAccessPolicy = useCloudAccessPolicy()

  useEffect(() => {
    const isCloudProject = projectRef?.type === 'cloud'
    setCloudSyncContext({
      canSync: isCloudProject && cloudAccessPolicy.canEditCloudProject,
      cloudWritesEnabled: cloudAccessPolicy.canEditCloudProject,
      runSnapshotMutation: createSnapshot,
      currentUserId: cloudUser?.user?._id ? String(cloudUser.user._id) : null,
      collaborationMode: isCloudProject && cloudAccessPolicy.canCollaborateOnCloudProject,
    })
  }, [
    cloudAccessPolicy.canCollaborateOnCloudProject,
    cloudAccessPolicy.canEditCloudProject,
    cloudUser?.user?._id,
    createSnapshot,
    projectRef?.type,
    setCloudSyncContext,
  ])

  useEffect(() => {
    if (projectRef?.type !== 'cloud') return undefined
    const flush = () => {
      if (!hasUnsavedChanges) return
      flushCloudSync({ reason: 'manual' })
    }
    window.addEventListener('beforeunload', flush)
    window.addEventListener('pagehide', flush)
    return () => {
      window.removeEventListener('beforeunload', flush)
      window.removeEventListener('pagehide', flush)
    }
  }, [flushCloudSync, hasUnsavedChanges, projectRef?.type])

  return null
}
