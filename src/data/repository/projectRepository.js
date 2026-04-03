/**
 * @typedef {'local' | 'cloud'} ProjectStorageKind
 *
 * @typedef {{
 *   type: 'local',
 *   path: string | null,
 *   browserProjectId: string | null,
 * }} LocalProjectRef
 *
 * @typedef {{
 *   type: 'cloud',
 *   projectId: string,
 *   snapshotId: string | null,
 * }} CloudProjectRef
 *
 * @typedef {LocalProjectRef | CloudProjectRef} ProjectRef
 *
 * @typedef {{
 *   id: string,
 *   ownerUserId: string,
 *   name: string,
 *   emoji: string,
 *   latestSnapshotId: string | null,
 *   createdAt: number,
 *   updatedAt: number,
 * }} CloudProject
 *
 * @typedef {{
 *   id: string,
 *   projectId: string,
 *   createdByUserId: string,
 *   source: 'manual_save' | 'autosave' | 'local_conversion',
 *   createdAt: number,
 *   payload: Record<string, any>,
 * }} CloudProjectSnapshot
 *
 * @typedef {{
 *   createProject(input: { ownerUserId: string, name: string, emoji: string }): Promise<CloudProject>,
 *   createSnapshot(input: { projectId: string, createdByUserId: string, source: 'manual_save'|'autosave'|'local_conversion'|'restore'|'conflict_recovery', payload: Record<string, any>, expectedLatestSnapshotId?: string, conflictStrategy?: 'last_write_wins'|'fail_on_conflict' }): Promise<CloudProjectSnapshot>,
 *   getProject(projectId: string): Promise<CloudProject | null>,
 *   getLatestSnapshot(projectId: string): Promise<CloudProjectSnapshot | null>,
 *   deleteProjectIfSnapshotless?(projectId: string): Promise<{ ok: boolean }>,
 * }} CloudProjectRepository
 *
 * @typedef {{
 *   local: {
 *     type: 'local',
 *   },
 *   cloud: CloudProjectRepository | null,
 * }} ProjectRepository
 */

/**
 * @param {{ cloud?: CloudProjectRepository | null }} options
 * @returns {ProjectRepository}
 */
export function createProjectRepository({ cloud = null } = {}) {
  return {
    local: {
      type: 'local',
    },
    cloud,
  }
}

/**
 * @param {{ cloudRepository: CloudProjectRepository | null }} options
 * @returns {ProjectRepository}
 */
export function createRepositoryWithCloudAdapter({ cloudRepository }) {
  return createProjectRepository({ cloud: cloudRepository })
}
