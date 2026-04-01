/**
 * Cloud repository adapter that accepts transport functions so the store
 * can use Convex-backed projects without depending directly on React hooks.
 */
export function createCloudProjectAdapter({ runMutation, runQuery }) {
  if (typeof runMutation !== 'function' || typeof runQuery !== 'function') {
    return null
  }

  return {
    async createProject({ ownerUserId, name, emoji }) {
      const result = await runMutation('projects:createProject', {
        ownerUserId,
        name,
        emoji,
      })
      return {
        id: String(result.projectId),
        ownerUserId,
        name,
        emoji,
        latestSnapshotId: null,
        createdAt: result.createdAt,
        updatedAt: result.updatedAt,
      }
    },

    async createSnapshot({ projectId, createdByUserId, source, payload }) {
      const result = await runMutation('projectSnapshots:createSnapshot', {
        projectId,
        createdByUserId,
        source,
        payload,
      })
      return {
        id: String(result.snapshotId),
        projectId,
        createdByUserId,
        source,
        createdAt: result.createdAt,
        payload,
      }
    },

    async getProject(projectId) {
      const project = await runQuery('projects:getProjectById', { projectId })
      if (!project) return null
      return {
        id: String(project._id),
        ownerUserId: String(project.ownerUserId),
        name: project.name,
        emoji: project.emoji,
        latestSnapshotId: project.latestSnapshotId ? String(project.latestSnapshotId) : null,
        createdAt: project.createdAt,
        updatedAt: project.updatedAt,
      }
    },

    async getLatestSnapshot(projectId) {
      const snapshot = await runQuery('projectSnapshots:getLatestSnapshotForProject', { projectId })
      if (!snapshot) return null
      return {
        id: String(snapshot._id),
        projectId: String(snapshot.projectId),
        createdByUserId: String(snapshot.createdByUserId),
        source: snapshot.source,
        createdAt: snapshot.createdAt,
        payload: snapshot.payload,
      }
    },
  }
}
