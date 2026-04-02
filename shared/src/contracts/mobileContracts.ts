export type PackageSchemaVersion = 1

export interface MobileProjectMetadata {
  projectId: string
  projectSlug?: string
  projectName: string
  timezone?: string
}

export type ScheduleItemType = 'shot' | 'break' | 'move' | 'meal' | 'travel'

export interface MobileScheduleItem {
  scheduleItemId: string
  dayId: string
  type: ScheduleItemType
  shotId?: string
  shotDisplayName?: string
  shotCameraName?: string
  focalLength?: string
  shotSize?: string
  shotType?: string
  shotMove?: string
  shotEquipment?: string
  shotNotes?: string
  shotImageUrl?: string
  shotColor?: string
  sceneId?: string
  title?: string
  plannedStartTime?: string
  plannedEndTime?: string
  actualStartTime?: string
  actualEndTime?: string
  status?: 'todo' | 'in_progress' | 'done' | 'skipped'
  sortOrder: number
}

export interface MobileStoryboardReference {
  shotId: string
  shotDisplayName?: string
  shotCameraName?: string
  focalLength?: string
  shotSize?: string
  shotType?: string
  shotMove?: string
  shotEquipment?: string
  shotNotes?: string
  shotColor?: string
  thumbnailUrl?: string
  thumbnailWidth?: number
  thumbnailHeight?: number
  updatedAt: string
}

export interface MobileCallsheetData {
  dayId: string
  callTime?: string
  nearestHospital?: string
  shootLocation?: string
  locationAddress?: string
  parkingNotes?: string
  directions?: string
  mapsLink?: string
  weatherSummary?: string
  safetyNotes?: string
  generalNotes?: string
  cast?: Array<{
    name: string
    role?: string
    character?: string
    phone?: string
    email?: string
    notes?: string
  }>
  crew?: Array<{
    name: string
    role?: string
    department?: string
    phone?: string
    email?: string
    notes?: string
  }>
  scheduleHighlights?: Array<{
    itemId: string
    type: ScheduleItemType
    label: string
  }>
}

export interface MobileDayPackage {
  schemaVersion: PackageSchemaVersion
  packageType: 'mobile-day-package'
  packageId: string
  packageVersion: number
  generatedAt: string
  updatedAt: string
  project: MobileProjectMetadata
  dayId: string
  shootDate: string
  scheduleItems: MobileScheduleItem[]
  storyboardRefs: MobileStoryboardReference[]
  callsheet?: MobileCallsheetData
}

export interface MobileSnapshot {
  schemaVersion: PackageSchemaVersion
  snapshotType: 'mobile-snapshot'
  snapshotId: string
  packageVersion: number
  createdAt: string
  updatedAt: string
  project: MobileProjectMetadata
  source: {
    sourceType: 'imported' | 'hosted'
    manifestVersion?: number
  }
  dayPackages: MobileDayPackage[]
}

export interface HostedPackageMetadata {
  packageId: string
  dayId: string
  packageVersion: number
  updatedAt: string
  downloadUrl: string
  checksumSha256?: string
  sizeBytes?: number
}

export interface HostedFeedManifest {
  schemaVersion: PackageSchemaVersion
  manifestType: 'hosted-feed-manifest'
  projectId: string
  projectSlug: string
  latestFeedVersion: number
  generatedAt: string
  latestSnapshotId?: string
  packages: HostedPackageMetadata[]
}

export interface LimitedMobileUpdateItem {
  updateId: string
  dayId: string
  scheduleItemId?: string
  shotId?: string
  status?: 'todo' | 'in_progress' | 'done' | 'skipped'
  actualStartTime?: string
  actualEndTime?: string
  quickNotes?: string
  omitOrDefer?: boolean
  dayOrderIndex?: number
  updatedAt: string
}

export interface LimitedMobileUpdatePayload {
  schemaVersion: PackageSchemaVersion
  payloadType: 'limited-mobile-update'
  projectId: string
  snapshotId: string
  packageVersion: number
  createdAt: string
  updates: LimitedMobileUpdateItem[]
}
