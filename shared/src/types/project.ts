export interface SharedProjectRef {
  projectId: string
  projectName: string
  snapshotId: string
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
