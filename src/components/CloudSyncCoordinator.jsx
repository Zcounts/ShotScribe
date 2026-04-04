import { useEffect, useRef } from 'react'
import { useConvex, useMutation, useQuery } from 'convex/react'
import useStore from '../store'
import useCloudAccessPolicy from '../features/billing/useCloudAccessPolicy'

const CLOUD_PROJECT_SESSION_KEY = 'ss_active_cloud_project_id'

export default function CloudSyncCoordinator() {
  const projectRef = useStore(s => s.projectRef)
  const setCloudSyncContext = useStore(s => s.setCloudSyncContext)
  const setCloudRepositoryAdapter = useStore(s => s.setCloudRepositoryAdapter)
  const flushCloudSync = useStore(s => s.flushCloudSync)
  const applyIncomingCloudSnapshot = useStore(s => s.applyIncomingCloudSnapshot)
  const openCloudProject = useStore(s => s.openCloudProject)
  const hasUnsavedChanges = useStore(s => s.hasUnsavedChanges)
  const convex = useConvex()
  const createProject = useMutation('projects:createProject')
  const createSnapshot = useMutation('projectSnapshots:createSnapshot')
  const cloudUser = useQuery('users:currentUser')
  const cloudProjectId = projectRef?.type === 'cloud' ? projectRef.projectId : null
  const latestSnapshot = useQuery(
    'projectSnapshots:getLatestSnapshotForProject',
    cloudProjectId ? { projectId: cloudProjectId } : 'skip',
  )
  const cloudAccessPolicy = useCloudAccessPolicy()

  // Guard so the sessionStorage restore runs at most once per mount, even if
  // the adapter effect re-fires due to dependency changes.
  const hasAttemptedRestoreRef = useRef(false)

  useEffect(() => {
    setCloudRepositoryAdapter({
      runMutation: async (name, args) => {
        if (name === 'projects:createProject') return createProject(args)
        if (name === 'projectSnapshots:createSnapshot') return createSnapshot(args)
        throw new Error(`Unsupported mutation: ${name}`)
      },
      runQuery: async (name, args) => convex.query(name, args || {}),
    })

    // After the cloud repository adapter is ready, check whether a cloud
    // project was open in the previous session (stored in sessionStorage by
    // openCloudProject). If yes, and the store is still in local mode, reopen
    // the project automatically — this makes a browser refresh return the user
    // to their cloud project rather than landing on a blank local state.
    if (!hasAttemptedRestoreRef.current) {
      hasAttemptedRestoreRef.current = true
      try {
        const savedId = sessionStorage.getItem(CLOUD_PROJECT_SESSION_KEY)
        if (savedId && useStore.getState().projectRef?.type !== 'cloud') {
          openCloudProject({ projectId: savedId }).catch(() => {
            // If the project no longer exists or access was revoked, wipe the
            // saved ID so we don't keep attempting a broken restore.
            try { sessionStorage.removeItem(CLOUD_PROJECT_SESSION_KEY) } catch {}
          })
        }
      } catch {}
    }
  }, [convex, createProject, createSnapshot, openCloudProject, setCloudRepositoryAdapter])

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

  useEffect(() => {
    if (!cloudProjectId || !latestSnapshot?._id || !latestSnapshot?.payload) return
    applyIncomingCloudSnapshot({
      projectId: cloudProjectId,
      snapshotId: String(latestSnapshot._id),
      payload: latestSnapshot.payload,
    })
  }, [applyIncomingCloudSnapshot, cloudProjectId, latestSnapshot?._id, latestSnapshot?.payload])

  return null
}
