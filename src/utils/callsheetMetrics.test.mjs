import test from 'node:test'
import assert from 'node:assert/strict'
import { computeCastSceneMetrics, resolveLinkedScriptSceneId } from './callsheetMetrics.js'

const normalize = value => String(value || '').trim().toLowerCase()

test('resolveLinkedScriptSceneId falls back to storyboard-scene script link', () => {
  assert.equal(
    resolveLinkedScriptSceneId({ linkedSceneId: null }, { linkedScriptSceneId: 'script_scene_1' }),
    'script_scene_1'
  )
  assert.equal(
    resolveLinkedScriptSceneId({ linkedSceneId: 'script_scene_2' }, { linkedScriptSceneId: 'script_scene_1' }),
    'script_scene_2'
  )
})

test('computeCastSceneMetrics calculates PG(DAY) from selected day scene set and character membership', () => {
  const castCharacterKeys = new Set(['alex'])
  const scriptScenes = [
    { id: 's1', characters: ['ALEX'], pageCount: 2.5 },
    { id: 's2', characters: ['ALEX'], pageCount: 1.0 },
    { id: 's3', characters: ['JAMIE'], pageCount: 3.0 },
  ]

  let metrics = computeCastSceneMetrics({
    castCharacterKeys,
    scriptScenes,
    allowedSceneIds: new Set(['s1']),
    normalizeCharacterKey: normalize,
  })
  assert.equal(metrics.sceneCount, 1)
  assert.equal(metrics.pageCount, 2.5)

  metrics = computeCastSceneMetrics({
    castCharacterKeys,
    scriptScenes: scriptScenes.map(scene => (scene.id === 's1' ? { ...scene, pageCount: 3.25 } : scene)),
    allowedSceneIds: new Set(['s1']),
    normalizeCharacterKey: normalize,
  })
  assert.equal(metrics.pageCount, 3.25)

  metrics = computeCastSceneMetrics({
    castCharacterKeys,
    scriptScenes: scriptScenes.map(scene => (scene.id === 's1' ? { ...scene, characters: ['SAM'] } : scene)),
    allowedSceneIds: new Set(['s1']),
    normalizeCharacterKey: normalize,
  })
  assert.equal(metrics.sceneCount, 0)
  assert.equal(metrics.pageCount, 0)
})
