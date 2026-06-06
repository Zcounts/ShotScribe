import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { deriveSceneShotPrefix, formatShotDisplayId } from '../src/utils/shotDisplay.js'

function displayIds(scene, fallbackSceneNumber, count) {
  const prefix = deriveSceneShotPrefix(scene, fallbackSceneNumber)
  return Array.from({ length: count }, (_, shotIndex) => formatShotDisplayId(prefix, shotIndex))
}

describe('shot display IDs', () => {
  it('uses the scene shotNumberPrefix with period-separated shot letters', () => {
    const scene = { sceneLabel: 'SCENE 4', shotNumberPrefix: '2A' }

    assert.deepEqual(displayIds(scene, 4, 2), ['2A.A', '2A.B'])
  })

  it('updates derived shot labels when the scene shotNumberPrefix changes', () => {
    const scene = { sceneLabel: 'SCENE 4', shotNumberPrefix: '4' }
    assert.deepEqual(displayIds(scene, 4, 2), ['4.A', '4.B'])

    const updatedScene = { ...scene, shotNumberPrefix: '2A' }
    assert.deepEqual(displayIds(updatedScene, 4, 2), ['2A.A', '2A.B'])
  })

  it('falls back to a normalized scene number or label when shotNumberPrefix is empty', () => {
    assert.deepEqual(
      displayIds({ sceneNumber: ' 11A ', shotNumberPrefix: '' }, 4, 1),
      ['11A.A'],
    )
    assert.deepEqual(
      displayIds({ sceneLabel: 'SCENE 7B', shotNumberPrefix: '' }, 4, 1),
      ['7B.A'],
    )
  })

  it('does not let scene order or page index override a custom prefix', () => {
    const scene = { sceneNumber: '4', sceneLabel: 'SCENE 4', shotNumberPrefix: 'SC7B' }

    assert.deepEqual(displayIds(scene, 99, 1), ['SC7B.A'])
  })
})
