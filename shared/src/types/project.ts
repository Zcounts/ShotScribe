export interface SharedProjectRef {
  projectId: string
  projectName: string
  snapshotId: string
}

export type SharedProjectStorageType = 'local' | 'cloud'

export interface SharedLocalProjectRef {
  type: 'local'
  path?: string | null
  browserProjectId?: string | null
}

export interface SharedCloudProjectRef {
  type: 'cloud'
  projectId: string
  snapshotId?: string | null
}

export type SharedProjectStorageRef = SharedLocalProjectRef | SharedCloudProjectRef

export interface SharedCloudProjectMetadata {
  projectId: string
  ownerUserId: string
  name: string
  emoji: string
  latestSnapshotId?: string | null
  createdAt: number
  updatedAt: number
}

export interface SharedCloudProjectSnapshot {
  snapshotId: string
  projectId: string
  createdByUserId: string
  source: 'manual_save' | 'autosave' | 'local_conversion'
  createdAt: number
  payload: Record<string, unknown>
}

export interface SharedShotPatch {
  shotId: string
  shotStatus?: 'todo' | 'in_progress' | 'done'
  actualStartTime?: string
  actualEndTime?: string
  quickNotes?: string
  omitOrDefer?: boolean
  dayOrderIndex?: number
}
