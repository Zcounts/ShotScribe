import type { MobileDayPackage } from '@shotscribe/shared'

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
}

export interface ImportSummary {
  projectId: string
  projectName: string
  importedDayIds: string[]
}
