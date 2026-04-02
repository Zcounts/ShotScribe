import { serializeMobileSnapshot, type MobileDayPackage } from '@shotscribe/shared'
import type { ShotFieldEdit, ShotStatus, StoredProjectEntry } from './types'

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

export function buildShotKey(projectId: string, dayId: string, shotId: string) {
  return `${projectId}::${dayId}::${shotId}`
}

function applyStatusToShot(shot: any, status?: ShotStatus) {
  if (!status) return
  if (status === 'skipped') {
    shot.status = 'skipped'
    shot.checked = false
    return
  }
  shot.status = status
  shot.checked = status === 'done'
}

export function applyEditsToDayPackage(dayPackage: MobileDayPackage, projectId: string, shotEdits: Record<string, ShotFieldEdit>): MobileDayPackage {
  const next = clone(dayPackage)
  next.scheduleItems = next.scheduleItems.map((item) => {
    if (!item.shotId) return item
    const edit = shotEdits[buildShotKey(projectId, next.dayId, item.shotId)]
    if (!edit) return item
    return {
      ...item,
      status: edit.status ?? item.status,
      shotNotes: edit.shotNotes ?? item.shotNotes,
      actualStartTime: edit.actualStartTime || item.actualStartTime,
      actualEndTime: edit.actualEndTime || item.actualEndTime,
    }
  })

  next.storyboardRefs = next.storyboardRefs.map((item) => {
    const edit = shotEdits[buildShotKey(projectId, next.dayId, item.shotId)]
    if (!edit) return item
    return {
      ...item,
      shotNotes: edit.shotNotes ?? item.shotNotes,
    }
  })

  return next
}

export function applyEditsToCloudPayload(payload: Record<string, any>, projectId: string, shotEdits: Record<string, ShotFieldEdit>) {
  const next = clone(payload)
  const shotById = new Map<string, any>()
  for (const scene of next.scenes || []) {
    for (const shot of scene.shots || []) {
      shotById.set(String(shot.id), shot)
    }
  }

  for (const day of next.schedule || []) {
    for (const block of day.blocks || []) {
      if (block.type !== 'shot' || !block.shotId) continue
      const shotId = String(block.shotId)
      const edit = shotEdits[buildShotKey(projectId, day.id, shotId)]
      if (!edit) continue
      const shot = shotById.get(shotId)
      if (shot) {
        applyStatusToShot(shot, edit.status)
        if (typeof edit.shotNotes === 'string') shot.notes = edit.shotNotes
        if (typeof edit.scriptSupervisorNotes === 'string') shot.scriptSupervisorNotes = edit.scriptSupervisorNotes
      }
      if (typeof edit.actualStartTime === 'string') block.actualStartTime = edit.actualStartTime
      if (typeof edit.actualEndTime === 'string') block.actualEndTime = edit.actualEndTime
    }
  }

  return next
}

export function exportProjectAsSnapshot(project: StoredProjectEntry, shotEdits: Record<string, ShotFieldEdit>) {
  const dayPackages = Object.values(project.days).map((day) => applyEditsToDayPackage(day.dayPackage, project.projectId, shotEdits))
  return serializeMobileSnapshot({
    schemaVersion: 1,
    snapshotType: 'mobile-snapshot',
    snapshotId: `snapshot_${Date.now()}`,
    packageVersion: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    project: {
      projectId: project.projectId,
      projectName: project.projectName,
      projectSlug: project.projectSlug,
      timezone: project.timezone,
    },
    source: { sourceType: 'imported' },
    dayPackages,
  })
}
