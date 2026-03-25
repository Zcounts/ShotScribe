import { z } from 'zod'

export const sharedProjectRefSchema = z.object({
  projectId: z.string().min(1),
  projectName: z.string().min(1),
  snapshotId: z.string().min(1),
})

export const mobilePackageEnvelopeSchema = z.object({
  schemaVersion: z.number().int().positive(),
  exportedAt: z.string().min(1),
  project: sharedProjectRefSchema,
  payload: z.record(z.unknown()),
})

export const mobilePatchEnvelopeSchema = z.object({
  schemaVersion: z.number().int().positive(),
  createdAt: z.string().min(1),
  project: sharedProjectRefSchema,
  patches: z.array(
    z.object({
      shotId: z.string().min(1),
      shotStatus: z.enum(['todo', 'in_progress', 'done']).optional(),
      actualStartTime: z.string().optional(),
      actualEndTime: z.string().optional(),
      quickNotes: z.string().optional(),
      omitOrDefer: z.boolean().optional(),
      dayOrderIndex: z.number().int().optional(),
    })
  ),
})
