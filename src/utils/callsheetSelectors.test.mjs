import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildDayScheduleRows,
  deriveDayCastRows,
  buildCallsheetWarnings,
} from './callsheetSelectors.js'

test('buildDayScheduleRows groups schedule from shared schedule + scene data', () => {
  const day = { id: 'd1', startTime: '08:00' }
  const scheduleWithShots = [{
    id: 'd1',
    blocks: [
      { id: 'b1', type: 'shot', shotData: { sceneLabel: '1', location: 'HOUSE', intOrExt: 'INT', dayNight: 'DAY', shootTime: '30', setupTime: '10', linkedSceneId: 's1', cast: 'ALEX' } },
      { id: 'b2', type: 'shot', shotData: { sceneLabel: '1', location: 'HOUSE', intOrExt: 'INT', dayNight: 'DAY', shootTime: '20', setupTime: '10', linkedSceneId: 's1', cast: 'JAMIE' } },
      { id: 'meal1', type: 'meal', label: 'Lunch', duration: 30 },
    ],
  }]
  const scriptScenes = [{ id: 's1', sceneNumber: '1', slugline: 'INT. HOUSE - DAY', location: 'HOUSE', intExt: 'INT', dayNight: 'DAY', pageCount: 2.5, characters: ['ALEX', 'JAMIE'] }]

  const result = buildDayScheduleRows(day, scheduleWithShots, scriptScenes)
  assert.equal(result.scenes.length, 1)
  assert.equal(result.scenes[0].shotCount, 2)
  assert.equal(result.scenes[0].pageCount, 2.5)
  assert.equal(result.events.length, 1)
  assert.ok(result.scheduledSceneIds.has('s1'))
})

test('deriveDayCastRows keeps SC(DAY) and PG(DAY) synced from scheduled scenes and character mapping', () => {
  const scriptScenes = [
    { id: 's1', characters: ['ALEX'], pageCount: 1.25 },
    { id: 's2', characters: ['ALEX', 'JAMIE'], pageCount: 2.0 },
  ]
  const castRoster = [
    { id: 'c1', name: 'Actor A', character: 'ALEX', characterIds: ['ALEX'] },
    { id: 'c2', name: 'Actor B', character: 'JAMIE', characterIds: ['JAMIE'] },
  ]

  let rows = deriveDayCastRows({
    dayId: 'd1',
    callsheet: { cast: [{ id: 'manual1', rosterId: 'c1', pickupTime: '6:00 AM' }] },
    castRoster,
    scriptScenes,
    scheduledSceneIds: new Set(['s1']),
  })

  assert.equal(rows.length, 1)
  assert.equal(rows[0].sceneCount, 1)
  assert.equal(rows[0].pageCount, 1.25)

  rows = deriveDayCastRows({
    dayId: 'd1',
    callsheet: { cast: [{ id: 'manual1', rosterId: 'c1', pickupTime: '6:00 AM' }] },
    castRoster,
    scriptScenes,
    scheduledSceneIds: new Set(['s2']),
  })

  assert.equal(rows.length, 2)
  const actorA = rows.find(row => row.rosterId === 'c1')
  assert.equal(actorA.sceneCount, 1)
  assert.equal(actorA.pageCount, 2.0)
})

test('buildCallsheetWarnings flags missing critical production info', () => {
  const warnings = buildCallsheetWarnings({
    day: { id: 'd1', date: '', startTime: '', basecamp: '' },
    callsheet: {},
    scheduleRows: { scenes: [] },
    castRows: [],
    crewRows: [],
  })

  assert.ok(warnings.some(item => item.includes('General call time')))
  assert.ok(warnings.some(item => item.includes('No scenes are scheduled')))
  assert.ok(warnings.some(item => item.includes('Nearest hospital')))
})
