import { z } from 'zod'

export const packageSchemaVersionSchema = z.literal(1)

const isoDateTimeString = z.string().datetime({ offset: true })
const optionalIsoDateTimeString = isoDateTimeString.optional()

export const mobileProjectMetadataSchema = z.object({
  projectId: z.string().min(1),
  projectSlug: z.string().min(1).optional(),
  projectName: z.string().min(1),
  timezone: z.string().min(1).optional(),
})

export const mobileScheduleItemSchema = z.object({
  scheduleItemId: z.string().min(1),
  dayId: z.string().min(1),
  type: z.enum(['shot', 'break', 'move', 'meal', 'travel']),
  shotId: z.string().min(1).optional(),
  shotDisplayName: z.string().min(1).optional(),
  shotCameraName: z.string().min(1).optional(),
  focalLength: z.string().min(1).optional(),
  shotSize: z.string().min(1).optional(),
  shotType: z.string().min(1).optional(),
  shotMove: z.string().min(1).optional(),
  shotEquipment: z.string().min(1).optional(),
  shotNotes: z.string().optional(),
  shotImageUrl: z.string().optional(),
  shotColor: z.string().min(1).optional(),
  sceneId: z.string().min(1).optional(),
  title: z.string().min(1).optional(),
  plannedStartTime: optionalIsoDateTimeString,
  plannedEndTime: optionalIsoDateTimeString,
  actualStartTime: optionalIsoDateTimeString,
  actualEndTime: optionalIsoDateTimeString,
  status: z.enum(['todo', 'in_progress', 'done']).optional(),
  sortOrder: z.number().int().nonnegative(),
})

export const mobileStoryboardReferenceSchema = z.object({
  shotId: z.string().min(1),
  shotDisplayName: z.string().min(1).optional(),
  shotCameraName: z.string().min(1).optional(),
  focalLength: z.string().min(1).optional(),
  shotSize: z.string().min(1).optional(),
  shotType: z.string().min(1).optional(),
  shotMove: z.string().min(1).optional(),
  shotEquipment: z.string().min(1).optional(),
  shotNotes: z.string().optional(),
  shotColor: z.string().min(1).optional(),
  thumbnailUrl: z.string().url().optional(),
  thumbnailWidth: z.number().int().positive().optional(),
  thumbnailHeight: z.number().int().positive().optional(),
  updatedAt: isoDateTimeString,
})

export const mobileCallsheetDataSchema = z.object({
  dayId: z.string().min(1),
  callTime: optionalIsoDateTimeString,
  nearestHospital: z.string().optional(),
  shootLocation: z.string().optional(),
  locationAddress: z.string().optional(),
  parkingNotes: z.string().optional(),
  directions: z.string().optional(),
  mapsLink: z.string().optional(),
  weatherSummary: z.string().optional(),
  safetyNotes: z.string().optional(),
  generalNotes: z.string().optional(),
  cast: z.array(z.object({
    name: z.string().min(1),
    role: z.string().optional(),
    character: z.string().optional(),
    phone: z.string().optional(),
    email: z.string().optional(),
    notes: z.string().optional(),
  })).optional(),
  crew: z.array(z.object({
    name: z.string().min(1),
    role: z.string().optional(),
    department: z.string().optional(),
    phone: z.string().optional(),
    email: z.string().optional(),
    notes: z.string().optional(),
  })).optional(),
  scheduleHighlights: z.array(z.object({
    itemId: z.string().min(1),
    type: z.enum(['shot', 'break', 'move', 'meal', 'travel']),
    label: z.string().min(1),
  })).optional(),
})

export const mobileDayPackageSchema = z.object({
  schemaVersion: packageSchemaVersionSchema,
  packageType: z.literal('mobile-day-package'),
  packageId: z.string().min(1),
  packageVersion: z.number().int().positive(),
  generatedAt: isoDateTimeString,
  updatedAt: isoDateTimeString,
  project: mobileProjectMetadataSchema,
  dayId: z.string().min(1),
  shootDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  scheduleItems: z.array(mobileScheduleItemSchema),
  storyboardRefs: z.array(mobileStoryboardReferenceSchema),
  callsheet: mobileCallsheetDataSchema.optional(),
})

export const mobileSnapshotSchema = z.object({
  schemaVersion: packageSchemaVersionSchema,
  snapshotType: z.literal('mobile-snapshot'),
  snapshotId: z.string().min(1),
  packageVersion: z.number().int().positive(),
  createdAt: isoDateTimeString,
  updatedAt: isoDateTimeString,
  project: mobileProjectMetadataSchema,
  source: z.object({
    sourceType: z.enum(['imported', 'hosted']),
    manifestVersion: z.number().int().positive().optional(),
  }),
  dayPackages: z.array(mobileDayPackageSchema),
})

export const hostedPackageMetadataSchema = z.object({
  packageId: z.string().min(1),
  dayId: z.string().min(1),
  packageVersion: z.number().int().positive(),
  updatedAt: isoDateTimeString,
  downloadUrl: z.string().url(),
  checksumSha256: z.string().regex(/^[a-fA-F0-9]{64}$/).optional(),
  sizeBytes: z.number().int().positive().optional(),
})

export const hostedFeedManifestSchema = z.object({
  schemaVersion: packageSchemaVersionSchema,
  manifestType: z.literal('hosted-feed-manifest'),
  projectId: z.string().min(1),
  projectSlug: z.string().min(1),
  latestFeedVersion: z.number().int().positive(),
  generatedAt: isoDateTimeString,
  latestSnapshotId: z.string().min(1).optional(),
  packages: z.array(hostedPackageMetadataSchema),
})

export const limitedMobileUpdateItemSchema = z.object({
  updateId: z.string().min(1),
  dayId: z.string().min(1),
  scheduleItemId: z.string().min(1).optional(),
  shotId: z.string().min(1).optional(),
  status: z.enum(['todo', 'in_progress', 'done']).optional(),
  actualStartTime: optionalIsoDateTimeString,
  actualEndTime: optionalIsoDateTimeString,
  quickNotes: z.string().max(5000).optional(),
  omitOrDefer: z.boolean().optional(),
  dayOrderIndex: z.number().int().nonnegative().optional(),
  updatedAt: isoDateTimeString,
})

export const limitedMobileUpdatePayloadSchema = z.object({
  schemaVersion: packageSchemaVersionSchema,
  payloadType: z.literal('limited-mobile-update'),
  projectId: z.string().min(1),
  snapshotId: z.string().min(1),
  packageVersion: z.number().int().positive(),
  createdAt: isoDateTimeString,
  updates: z.array(limitedMobileUpdateItemSchema).min(1),
})
