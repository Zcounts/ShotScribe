import type { MobileDayPackage } from '@shotscribe/shared'

export type MobileMode = 'local' | 'cloud'

export type MobileTabKey =
  | 'overview'
  | 'schedule'
  | 'shotlist'
  | 'storyboard'
  | 'callsheet'
  | 'script_supervisor'
  | 'project'

export type ShotStatus = 'todo' | 'in_progress' | 'done' | 'skipped'

export interface ShotFieldEdit {
  status?: ShotStatus
  shotNotes?: string
  scriptSupervisorNotes?: string
  actualStartTime?: string
  actualEndTime?: string
  updatedAt: string
}

export interface StoredDayEntry {
  dayId: string
  packageId: string
  packageVersion: number
  shootDate: string
  updatedAt: string
  importedAt: string
  scheduleItemCount: number
  dayPackage: MobileDayPackage
}

export interface StoredProjectEntry {
  projectId: string
  projectName: string
  projectSlug?: string
  timezone?: string
  updatedAt: string
  importedAt: string
  days: Record<string, StoredDayEntry>
}

export interface StoredLibrary {
  version: 1
  projects: Record<string, StoredProjectEntry>
  shotEdits: Record<string, ShotFieldEdit>
}

export interface StoredLastOpened {
  mode: MobileMode
  projectId: string
  dayId: string
  tab: MobileTabKey
}

export interface StoredSession {
  version: 1
  lastOpened: StoredLastOpened | null
}

export interface ImportSummary {
  projectId: string
  projectName: string
  importedDayIds: string[]
}
