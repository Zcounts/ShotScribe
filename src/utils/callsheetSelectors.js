import { computeCastSceneMetrics } from './callsheetMetrics.js'

const normalizeKey = (value) => String(value || '').trim().toLowerCase()

const splitPeople = (value) => String(value || '')
  .split(/[,&/]/)
  .map(name => name.trim())
  .filter(Boolean)

function parseStartTime(timeStr) {
  if (!timeStr || !timeStr.includes(':')) return null
  const [h, m] = timeStr.split(':').map(Number)
  if (Number.isNaN(h) || Number.isNaN(m)) return null
  return h * 60 + m
}

function parseMinutes(value) {
  const mins = Number.parseFloat(value)
  return Number.isFinite(mins) ? Math.max(0, mins) : 0
}

export function computeProjectedBlockTimes(day, blocks = []) {
  const startMins = parseStartTime(day?.startTime)
  if (startMins === null) return new Map()
  let cursor = startMins
  const byBlockId = new Map()
  blocks.forEach(block => {
    const blockStart = cursor
    if (block.type === 'shot') {
      cursor += parseMinutes(block.shotData?.setupTime) + parseMinutes(block.shotData?.shootTime)
    } else {
      cursor += parseMinutes(block.duration)
    }
    byBlockId.set(block.id, { start: blockStart, end: cursor })
  })
  return byBlockId
}

export function buildDayScheduleRows(day, scheduleWithShots = [], scriptScenes = []) {
  const scheduledDay = scheduleWithShots.find(item => item.id === day?.id)
  if (!scheduledDay) return { scenes: [], events: [], scheduledSceneIds: new Set() }

  const projectedTimes = computeProjectedBlockTimes(day, scheduledDay.blocks || [])
  const scriptSceneMap = new Map((scriptScenes || []).map(scene => [scene.id, scene]))
  const sceneMap = new Map()
  const events = []

  ;(scheduledDay.blocks || []).forEach(block => {
    if (block.type !== 'shot' || !block.shotData) {
      if (block.type && block.type !== 'shot') {
        events.push({
          id: block.id,
          type: block.type,
          label: block.label || (block.type === 'move' ? 'Company Move' : block.type === 'meal' ? 'Meal' : 'Event'),
          duration: block.duration,
          location: block.location || '',
          notes: block.notes || '',
          projected: projectedTimes.get(block.id) || null,
        })
      }
      return
    }

    const linkedId = block.shotData.linkedSceneId || null
    const scriptScene = linkedId ? scriptSceneMap.get(linkedId) : null
    const sceneKey = linkedId || `${block.shotData.sceneLabel}|${block.shotData.location}|${block.shotData.intOrExt}|${block.shotData.dayNight}`
    if (!sceneMap.has(sceneKey)) {
      sceneMap.set(sceneKey, {
        id: sceneKey,
        linkedSceneId: linkedId,
        sceneNumber: scriptScene?.sceneNumber || block.shotData.sceneLabel || '—',
        slugline: scriptScene?.slugline || block.shotData.sceneLabel || 'Untitled scene',
        location: scriptScene?.location || block.shotData.location || '—',
        intExt: scriptScene?.intExt || block.shotData.intOrExt || '—',
        dayNight: scriptScene?.dayNight || block.shotData.dayNight || '—',
        pageCount: Number(scriptScene?.pageCount || 0),
        shotCount: 0,
        castSet: new Set(),
        notes: [],
        start: null,
        end: null,
      })
    }

    const row = sceneMap.get(sceneKey)
    row.shotCount += 1
    if (block.shotData.notes) row.notes.push(block.shotData.notes)
    splitPeople(block.shotData.cast).forEach(name => row.castSet.add(name))
    ;(block.shotData.castRosterEntries || []).forEach(person => row.castSet.add(person.name || person.character || ''))

    const projected = projectedTimes.get(block.id)
    if (projected) {
      row.start = row.start === null ? projected.start : Math.min(row.start, projected.start)
      row.end = row.end === null ? projected.end : Math.max(row.end, projected.end)
    }
  })

  const scenes = Array.from(sceneMap.values()).map(row => ({
    ...row,
    castInvolved: Array.from(row.castSet).filter(Boolean).join(', '),
    notes: row.notes.filter(Boolean).join(' · '),
  }))

  const scheduledSceneIds = new Set(scenes.map(scene => scene.linkedSceneId).filter(Boolean))
  return { scenes, events, scheduledSceneIds }
}

export function deriveDayCastRows({
  dayId,
  callsheet = {},
  castRoster = [],
  scriptScenes = [],
  scheduledSceneIds = new Set(),
}) {
  const dayCastRows = Array.isArray(callsheet.cast) ? callsheet.cast : []
  const manualByRosterId = new Map(dayCastRows.filter(row => row?.rosterId).map(row => [row.rosterId, row]))

  const included = castRoster.filter(entry => {
    const keys = [entry.character, ...(entry.characterIds || [])].map(normalizeKey).filter(Boolean)
    if (keys.length === 0) return false
    return scriptScenes
      .filter(scene => scheduledSceneIds.has(scene.id))
      .some(scene => (scene.characters || []).some(char => keys.includes(normalizeKey(char))))
  })

  const rosterRows = included.map(entry => {
    const manual = manualByRosterId.get(entry.id) || {}
    const castCharacterKeys = new Set([entry.character, ...(entry.characterIds || [])].map(normalizeKey).filter(Boolean))
    const metrics = computeCastSceneMetrics({
      castCharacterKeys,
      scriptScenes,
      allowedSceneIds: scheduledSceneIds,
      normalizeCharacterKey: normalizeKey,
    })
    return {
      id: manual.id || `derived_${entry.id}`,
      rosterId: entry.id,
      name: entry.name || '',
      character: entry.character || entry.characterIds?.[0] || '',
      sceneCount: metrics.sceneCount,
      pageCount: metrics.pageCount,
      pickupTime: manual.pickupTime || '',
      makeupCall: manual.makeupCall || '',
      setCall: manual.setCall || '',
      contact: [entry.phone, entry.email].filter(Boolean).join(' · '),
    }
  })

  const unknownManual = dayCastRows
    .filter(row => !row?.rosterId || !castRoster.some(entry => entry.id === row.rosterId))
    .map(row => ({
      id: row.id,
      rosterId: row.rosterId || null,
      name: row.name || 'Unlinked cast member',
      character: row.character || '',
      sceneCount: 0,
      pageCount: 0,
      pickupTime: row.pickupTime || '',
      makeupCall: row.makeupCall || '',
      setCall: row.setCall || '',
      contact: '',
    }))

  return [...rosterRows, ...unknownManual]
}

export function deriveDayCrewRows({ callsheet = {}, crewRoster = [], day }) {
  const dayCrewRows = Array.isArray(callsheet.crew) ? callsheet.crew : []
  const manualByRosterId = new Map(dayCrewRows.filter(row => row?.rosterId).map(row => [row.rosterId, row]))

  const rosterRows = crewRoster.map(entry => {
    const manual = manualByRosterId.get(entry.id) || {}
    return {
      id: manual.id || `derived_${entry.id}`,
      rosterId: entry.id,
      name: entry.name || '',
      role: entry.role || entry.department || 'Crew',
      department: entry.department || '',
      callTime: manual.callTime || '',
      notes: manual.notes || entry.notes || '',
      contact: [entry.phone, entry.email].filter(Boolean).join(' · '),
      defaultCall: day?.startTime || '',
    }
  })

  const unknownManual = dayCrewRows
    .filter(row => !row?.rosterId || !crewRoster.some(entry => entry.id === row.rosterId))
    .map(row => ({
      id: row.id,
      rosterId: row.rosterId || null,
      name: row.name || 'Unlinked crew member',
      role: row.role || '',
      department: '',
      callTime: row.callTime || '',
      notes: row.notes || '',
      contact: '',
      defaultCall: day?.startTime || '',
    }))

  return [...rosterRows, ...unknownManual]
}

export function buildCallsheetWarnings({ day, callsheet = {}, scheduleRows, castRows, crewRows }) {
  const warnings = []
  if (!day?.startTime) warnings.push('General call time is missing on Schedule.')
  if (!day?.date) warnings.push('Shoot date is missing on Schedule.')
  if (!day?.primaryLocation) warnings.push('Primary shoot location is missing.')
  if (!callsheet.weather) warnings.push('Weather summary is missing.')
  if (!callsheet.sunrise || !callsheet.sunset) warnings.push('Sunrise and/or sunset time is missing.')
  if (!callsheet.nearestHospital) warnings.push('Nearest hospital details are missing.')
  if (!callsheet.emergencyContacts) warnings.push('Emergency contacts are missing.')
  if (!callsheet.keyContacts) warnings.push('Key production contacts are missing.')
  if (!callsheet.parkingNotes) warnings.push('Parking / arrival notes are missing.')
  if (!callsheet.directions && !callsheet.mapsLink) warnings.push('Directions or map link is missing.')
  if (!callsheet.safetyNotes && !callsheet.additionalNotes) warnings.push('Safety / special notes are missing.')
  if ((scheduleRows?.scenes || []).length === 0) warnings.push('No scenes are scheduled for this shoot day.')
  if ((crewRows || []).length === 0) warnings.push('No crew assigned in Cast/Crew roster yet.')
  if ((castRows || []).length === 0) warnings.push('No cast linked to scheduled scenes yet.')
  if ((castRows || []).some(row => !row.pickupTime && !row.makeupCall && !row.setCall)) warnings.push('Some cast call times are missing.')
  if ((crewRows || []).length > 0 && (crewRows || []).some(row => !row.callTime && !row.defaultCall)) warnings.push('Some crew call times are missing.')
  return warnings
}
