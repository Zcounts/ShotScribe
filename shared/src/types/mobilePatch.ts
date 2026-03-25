import type { SharedProjectRef, SharedShotPatch } from './project'

export interface MobilePatchEnvelope {
  schemaVersion: number
  createdAt: string
  project: SharedProjectRef
  patches: SharedShotPatch[]
}
