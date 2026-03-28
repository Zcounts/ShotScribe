import {
  serializeMobileDayPackage,
  serializeMobileSnapshot,
} from '../../../shared/src/serializers/mobileContracts.ts'
import { getShotLetter } from '../../store'

function slugify(value) {
  return String(value || 'project')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}

function safeDate(dateValue) {
  if (typeof dateValue === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateValue)) return dateValue
  return new Date().toISOString().slice(0, 10)
}

function makeProjectMetadata(projectData) {
  const name = projectData.projectName || 'Untitled Shotlist'
  const projectSlug = slugify(name)
  return {
    projectId: `desktop-${projectSlug || 'project'}`,
    projectSlug,
    projectName: name,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
  }
}

function isoFromDayTime(dayDate, timeString) {
  if (!timeString || typeof timeString !== 'string') return undefined
  const datePart = safeDate(dayDate)
  const match = timeString.trim().match(/^(\d{1,2}):(\d{2})$/)
  if (!match) return undefined
  const [, hours, minutes] = match
  const d = new Date(`${datePart}T${hours.padStart(2, '0')}:${minutes}:00`)
  if (Number.isNaN(d.getTime())) return undefined
  return d.toISOString()
}

function buildShotLookup(scenes) {
  const map = new Map()
  ;(scenes || []).forEach((scene, sceneIdx) => {
    ;(scene.shots || []).forEach((shot, shotIdx) => {
      map.set(shot.id, {
        shot,
        scene,
        displayId: `${sceneIdx + 1}${getShotLetter(shotIdx)}`,
      })
    })
  })
  return map
}

function buildScheduleItems(day, shotLookup) {
  return (day.blocks || []).map((block, index) => {
    if (block.type === 'shot') {
      const linked = shotLookup.get(block.shotId)
      const shot = linked?.shot
      const shotImageUrl = (shot?.image && (shot.image.startsWith('data:image/') || /^https?:\/\//.test(shot.image)))
        ? shot.image
        : undefined
      return {
        scheduleItemId: block.id,
        dayId: day.id,
        type: 'shot',
        shotId: block.shotId,
        shotDisplayName: linked ? `${linked.displayId} - ${shot?.cameraName || 'Camera 1'}` : undefined,
        shotCameraName: shot?.cameraName || undefined,
        focalLength: shot?.focalLength || undefined,
        shotSize: shot?.specs?.size || undefined,
        shotType: shot?.specs?.type || undefined,
        shotMove: shot?.specs?.move || undefined,
        shotEquipment: shot?.specs?.equip || undefined,
        shotNotes: shot?.notes || undefined,
        shotImageUrl,
        shotColor: shot?.color || undefined,
        sceneId: linked?.scene?.id,
        title: linked ? `${linked.displayId} ${linked.scene.sceneLabel}` : 'Shot',
        status: linked?.shot?.checked ? 'done' : 'todo',
        sortOrder: index,
      }
    }

    return {
      scheduleItemId: block.id,
      dayId: day.id,
      type: block.type,
      title: block.label || block.type,
      sortOrder: index,
    }
  })
}

function buildStoryboardRefs(day, shotLookup, timestampIso) {
  return (day.blocks || [])
    .filter(block => block.type === 'shot' && block.shotId)
    .map(block => shotLookup.get(block.shotId))
    .filter(Boolean)
    .map(({ shot, displayId }) => {
      const out = {
        shotId: shot.id,
        shotDisplayName: `${displayId} - ${shot.cameraName || 'Camera 1'}`,
        shotCameraName: shot.cameraName || undefined,
        focalLength: shot.focalLength || undefined,
        shotSize: shot.specs?.size || undefined,
        shotType: shot.specs?.type || undefined,
        shotMove: shot.specs?.move || undefined,
        shotEquipment: shot.specs?.equip || undefined,
        shotNotes: shot.notes || undefined,
        shotColor: shot.color || undefined,
        updatedAt: timestampIso,
      }
      if (shot.image && /^https?:\/\//.test(shot.image)) {
        out.thumbnailUrl = shot.image
      } else if (shot.image && shot.image.startsWith('data:image/')) {
        out.thumbnailUrl = shot.image
      }
      return out
    })
}

function buildCallsheet(day, callsheets, shotLookup) {
  const callsheet = callsheets?.[day.id]
  if (!callsheet && !day.startTime && !day.basecamp) return undefined

  const castList = Array.isArray(callsheet?.cast)
    ? callsheet.cast
      .filter(person => person && person.name)
      .map(person => ({
        name: person.name,
        role: person.role || undefined,
        character: person.character || undefined,
        phone: person.phone || undefined,
        email: person.email || undefined,
        notes: person.notes || undefined,
      }))
    : []

  const crewList = Array.isArray(callsheet?.crew)
    ? callsheet.crew
      .filter(person => person && person.name)
      .map(person => ({
        name: person.name,
        role: person.role || undefined,
        department: person.department || undefined,
        phone: person.phone || undefined,
        email: person.email || undefined,
        notes: person.notes || undefined,
      }))
    : []

  const scheduleHighlights = Array.isArray(day.blocks)
    ? day.blocks.map(block => ({
      itemId: block.id,
      type: block.type,
      label: block.type === 'shot'
        ? (block.shotId
          ? (shotLookup.get(block.shotId)
            ? `${shotLookup.get(block.shotId).displayId} - ${shotLookup.get(block.shotId).shot.cameraName || 'Camera 1'}`
            : `Shot ${block.shotId}`)
          : 'Shot TBD')
        : (block.label || block.type),
    }))
    : []

  return {
    dayId: day.id,
    callTime: isoFromDayTime(day.date, day.startTime),
    nearestHospital: callsheet?.nearestHospital || '',
    shootLocation: day.primaryLocation || callsheet?.shootLocation || day.basecamp || '',
    locationAddress: callsheet?.locationAddress || '',
    parkingNotes: callsheet?.parkingNotes || '',
    directions: callsheet?.directions || '',
    mapsLink: callsheet?.mapsLink || '',
    weatherSummary: callsheet?.weather || '',
    safetyNotes: callsheet?.emergencyContacts || '',
    generalNotes: callsheet?.additionalNotes || '',
    cast: castList,
    crew: crewList,
    scheduleHighlights,
  }
}

export function createMobileDayPackageFromProject(projectData, options = {}) {
  const day = (projectData.schedule || []).find(d => d.id === options.dayId)
  if (!day) throw new Error('Cannot export mobile package: shoot day was not found.')

  const nowIso = options.nowIso || new Date().toISOString()
  const project = makeProjectMetadata(projectData)
  const shotLookup = buildShotLookup(projectData.scenes || [])
  const displayByShotId = new Map()
  ;(projectData.scenes || []).forEach((scene, sceneIdx) => {
    ;(scene.shots || []).forEach((shot, shotIdx) => {
      displayByShotId.set(shot.id, `${sceneIdx + 1}${getShotLetter(shotIdx)} - ${shot.cameraName || 'Camera 1'}`)
    })
  })
  const scheduleItems = buildScheduleItems(day, shotLookup).map(item => {
    if (item.type !== 'shot' || !item.shotId) return item
    return {
      ...item,
      shotDisplayName: item.shotDisplayName || displayByShotId.get(item.shotId),
    }
  })

  return {
    schemaVersion: 1,
    packageType: 'mobile-day-package',
    packageId: `pkg_${day.id}_${Date.now()}`,
    packageVersion: options.packageVersion || 1,
    generatedAt: nowIso,
    updatedAt: nowIso,
    project,
    dayId: day.id,
    shootDate: safeDate(day.date),
    scheduleItems,
    storyboardRefs: buildStoryboardRefs(day, shotLookup, nowIso).map(ref => ({
      ...ref,
      shotDisplayName: displayByShotId.get(ref.shotId),
    })),
    callsheet: buildCallsheet(day, projectData.callsheets, shotLookup),
  }
}

export function createMobileSnapshotFromProject(projectData, options = {}) {
  const nowIso = options.nowIso || new Date().toISOString()
  const project = makeProjectMetadata(projectData)
  const schedule = projectData.schedule || []
  const selectedDayIds = options.dayIds?.length ? options.dayIds : schedule.map(day => day.id)

  const dayPackages = selectedDayIds
    .map(dayId => createMobileDayPackageFromProject(projectData, { ...options, dayId, nowIso }))

  return {
    schemaVersion: 1,
    snapshotType: 'mobile-snapshot',
    snapshotId: `snap_${Date.now()}`,
    packageVersion: options.packageVersion || 1,
    createdAt: nowIso,
    updatedAt: nowIso,
    project,
    source: {
      sourceType: 'imported',
    },
    dayPackages,
  }
}

async function saveJsonToFile(defaultName, data) {
  if (window.electronAPI?.saveJson) {
    return window.electronAPI.saveJson(defaultName, data, [
      { name: 'JSON', extensions: ['json'] },
    ])
  }

  const blob = new Blob([data], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = defaultName
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
  return { success: true }
}

export async function exportMobilePackageFromProject(projectData, options = {}) {
  const mode = options.mode || 'day'
  const baseName = slugify(projectData.projectName || 'project') || 'project'

  if (mode === 'snapshot') {
    const snapshot = createMobileSnapshotFromProject(projectData, options)
    const json = serializeMobileSnapshot(snapshot)
    const fileName = `${baseName}.mobile-snapshot.json`
    return saveJsonToFile(fileName, json)
  }

  const dayPackage = createMobileDayPackageFromProject(projectData, options)
  const json = serializeMobileDayPackage(dayPackage)
  const fileName = `${baseName}.${dayPackage.dayId}.mobile-day-package.json`
  return saveJsonToFile(fileName, json)
}
