import type { SharedProjectRef } from './project'

export interface MobilePackageEnvelope {
  schemaVersion: number
  exportedAt: string
  project: SharedProjectRef
  payload: Record<string, unknown>
}
