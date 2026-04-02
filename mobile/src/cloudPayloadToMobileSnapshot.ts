import type { MobileDayPackage, MobileSnapshot } from '@shotscribe/shared'

function getShotLetter(index: number): string {
  let out = ''
  let value = index
  do {
    out = String.fromCharCode(65 + (value % 26)) + out
    value = Math.floor(value / 26) - 1
  } while (value >= 0)
  return out
}

function safeIso(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value.trim()) return undefined
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString()
}

function normalizeProjectId(payload: Record<string, any>, fallbackId: string): string {
  if (typeof payload.projectId === 'string' && payload.projectId) return payload.projectId
  if (typeof payload.id === 'string' && payload.id) return payload.id
  return fallbackId
}

export function createMobileSnapshotFromCloudPayload(
  payload: Record<string, any>,
  options: { projectId: string; projectName?: string },
): MobileSnapshot {
  const nowIso = new Date().toISOString()
  const scenes = Array.isArray(payload.scenes) ? payload.scenes : []
  const scheduleDays = Array.isArray(payload.schedule) ? payload.schedule : []
  const shotLookup = new Map<string, { shot: any; scene: any; displayLabel: string }>()

  scenes.forEach((scene: any, sceneIndex: number) => {
    const shots = Array.isArray(scene?.shots) ? scene.shots : []
    shots.forEach((shot: any, shotIndex: number) => {
      const shotId = String(shot?.id ?? '')
      if (!shotId) return
      shotLookup.set(shotId, {
        shot,
        scene,
        displayLabel: `${sceneIndex + 1}${getShotLetter(shotIndex)} - ${shot?.cameraName || 'Camera 1'}`,
      })
    })
  })

  const dayPackages: MobileDayPackage[] = scheduleDays.map((day: any, dayIndex: number) => {
    const dayId = String(day?.id || `day_${dayIndex + 1}`)
    const dayDate = typeof day?.date === 'string' ? day.date : new Date().toISOString().slice(0, 10)
    const blocks = Array.isArray(day?.blocks) ? day.blocks : []

    const scheduleItems = blocks.map((block: any, blockIndex: number) => {
      const isShot = block?.type === 'shot' && block?.shotId
      const linked = isShot ? shotLookup.get(String(block.shotId)) : null
      const shot = linked?.shot
      return {
        scheduleItemId: String(block?.id || `${dayId}_block_${blockIndex + 1}`),
        dayId,
        type: isShot ? 'shot' : (block?.type || 'break'),
        shotId: isShot ? String(block.shotId) : undefined,
        shotDisplayName: linked?.displayLabel,
        shotCameraName: shot?.cameraName || undefined,
        focalLength: shot?.focalLength || undefined,
        shotSize: shot?.specs?.size || undefined,
        shotType: shot?.specs?.type || undefined,
        shotMove: shot?.specs?.move || undefined,
        shotEquipment: shot?.specs?.equip || undefined,
        shotNotes: shot?.notes || undefined,
        shotImageUrl: shot?.image || undefined,
        shotColor: shot?.color || undefined,
        sceneId: linked?.scene?.id || undefined,
        title: typeof block?.label === 'string' ? block.label : (isShot ? linked?.displayLabel : block?.type),
        plannedStartTime: safeIso(block?.startTime),
        plannedEndTime: safeIso(block?.endTime),
        actualStartTime: safeIso(block?.actualStartTime),
        actualEndTime: safeIso(block?.actualEndTime),
        status: shot?.status === 'skipped' ? 'skipped' : shot?.checked ? 'done' : 'todo',
        sortOrder: blockIndex,
      } as const
    })

    const storyboardRefs = blocks
      .filter((block: any) => block?.type === 'shot' && block?.shotId)
      .map((block: any) => {
        const linked = shotLookup.get(String(block.shotId))
        const shot = linked?.shot
        return {
          shotId: String(block.shotId),
          shotDisplayName: linked?.displayLabel,
          shotCameraName: shot?.cameraName || undefined,
          focalLength: shot?.focalLength || undefined,
          shotSize: shot?.specs?.size || undefined,
          shotType: shot?.specs?.type || undefined,
          shotMove: shot?.specs?.move || undefined,
          shotEquipment: shot?.specs?.equip || undefined,
          shotNotes: shot?.notes || undefined,
          shotColor: shot?.color || undefined,
          thumbnailUrl: shot?.image || undefined,
          updatedAt: nowIso,
        }
      })

    return {
      schemaVersion: 1,
      packageType: 'mobile-day-package',
      packageId: `cloud_${options.projectId}_${dayId}_${Date.now()}`,
      packageVersion: 1,
      generatedAt: nowIso,
      updatedAt: nowIso,
      project: {
        projectId: normalizeProjectId(payload, options.projectId),
        projectName: options.projectName || payload.projectName || 'Cloud Project',
        projectSlug: typeof payload.projectSlug === 'string' ? payload.projectSlug : undefined,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
      },
      dayId,
      shootDate: dayDate,
      scheduleItems,
      storyboardRefs,
      callsheet: undefined,
    }
  })

  return {
    schemaVersion: 1,
    snapshotType: 'mobile-snapshot',
    snapshotId: `cloud_snapshot_${Date.now()}`,
    packageVersion: 1,
    createdAt: nowIso,
    updatedAt: nowIso,
    project: {
      projectId: normalizeProjectId(payload, options.projectId),
      projectName: options.projectName || payload.projectName || 'Cloud Project',
      projectSlug: typeof payload.projectSlug === 'string' ? payload.projectSlug : undefined,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    },
    source: { sourceType: 'hosted' },
    dayPackages,
  }
}
