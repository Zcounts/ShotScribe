import type {
  HostedFeedManifest,
  LimitedMobileUpdatePayload,
  MobileDayPackage,
  MobileSnapshot,
} from './contracts/mobileContracts.js'

export const mobileDayPackageExample: MobileDayPackage = {
  schemaVersion: 1,
  packageType: 'mobile-day-package',
  packageId: 'pkg_day_2026_04_12_v3',
  packageVersion: 3,
  generatedAt: '2026-04-10T19:00:00Z',
  updatedAt: '2026-04-10T19:00:00Z',
  project: {
    projectId: 'proj_abc123',
    projectSlug: 'pilot-ep101',
    projectName: 'Pilot Episode 101',
    timezone: 'America/Los_Angeles',
  },
  dayId: 'day_01',
  shootDate: '2026-04-12',
  scheduleItems: [
    {
      scheduleItemId: 'sched_001',
      dayId: 'day_01',
      type: 'shot',
      shotId: 'shot_001A',
      sceneId: 'scene_12',
      title: 'Opening dolly in',
      plannedStartTime: '2026-04-12T15:00:00Z',
      plannedEndTime: '2026-04-12T15:20:00Z',
      status: 'todo',
      sortOrder: 0,
    },
  ],
  storyboardRefs: [
    {
      shotId: 'shot_001A',
      thumbnailUrl: 'https://example.invalid/thumbs/shot_001A.jpg',
      thumbnailWidth: 640,
      thumbnailHeight: 360,
      updatedAt: '2026-04-10T18:59:50Z',
    },
  ],
  callsheet: {
    dayId: 'day_01',
    callTime: '2026-04-12T13:30:00Z',
    shootLocation: 'Warehouse Stage A',
    weatherSummary: 'Clear, 72F',
    safetyNotes: 'Hearing protection near practical effects',
    generalNotes: 'Lunch at 12:30 PM local',
  },
}

export const mobileSnapshotExample: MobileSnapshot = {
  schemaVersion: 1,
  snapshotType: 'mobile-snapshot',
  snapshotId: 'snap_2026_04_10_190000z',
  packageVersion: 3,
  createdAt: '2026-04-10T19:00:00Z',
  updatedAt: '2026-04-10T19:00:00Z',
  project: mobileDayPackageExample.project,
  source: {
    sourceType: 'imported',
  },
  dayPackages: [mobileDayPackageExample],
}

export const hostedFeedManifestExample: HostedFeedManifest = {
  schemaVersion: 1,
  manifestType: 'hosted-feed-manifest',
  projectId: 'proj_abc123',
  projectSlug: 'pilot-ep101',
  latestFeedVersion: 12,
  generatedAt: '2026-04-10T19:05:00Z',
  latestSnapshotId: 'snap_2026_04_10_190000z',
  packages: [
    {
      packageId: 'pkg_day_2026_04_12_v3',
      dayId: 'day_01',
      packageVersion: 3,
      updatedAt: '2026-04-10T19:00:00Z',
      downloadUrl: 'https://example.invalid/feed/pilot-ep101/day_01/v3.json',
      checksumSha256: '3a65f4426f4f4d322f1f8fbebf5ce89bd0dcd212d5df31f942fb5bd6c0f8ea4f',
      sizeBytes: 14221,
    },
  ],
}

export const limitedMobileUpdatePayloadExample: LimitedMobileUpdatePayload = {
  schemaVersion: 1,
  payloadType: 'limited-mobile-update',
  projectId: 'proj_abc123',
  snapshotId: 'snap_2026_04_10_190000z',
  packageVersion: 3,
  createdAt: '2026-04-12T16:12:00Z',
  updates: [
    {
      updateId: 'upd_001',
      dayId: 'day_01',
      scheduleItemId: 'sched_001',
      shotId: 'shot_001A',
      status: 'in_progress',
      actualStartTime: '2026-04-12T16:10:00Z',
      quickNotes: 'Need one extra take for focus.',
      omitOrDefer: false,
      dayOrderIndex: 0,
      updatedAt: '2026-04-12T16:11:40Z',
    },
  ],
}
