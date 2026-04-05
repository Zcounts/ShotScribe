import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildBreakdownAggregates,
  buildShotLinkIndexByScene,
  createScriptDerivationDebouncer,
  deriveScriptAdapterOutputs,
} from './derivationPipeline.js'

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

test('deriveScriptAdapterOutputs derives scenes, metadata, breakdown aggregates, and shot link indexes', () => {
  const scriptDocument = {
    type: 'doc',
    content: [
      { type: 'scene_heading', attrs: { id: 'n1', sourceSceneId: 'sc_1' }, content: [{ type: 'text', text: 'INT. KITCHEN - DAY' }] },
      { type: 'action', attrs: { id: 'n2', sourceSceneId: 'sc_1' }, content: [{ type: 'text', text: 'Coffee boils.' }] },
      { type: 'scene_heading', attrs: { id: 'n3', sourceSceneId: 'sc_2' }, content: [{ type: 'text', text: 'EXT. STREET - NIGHT' }] },
      { type: 'action', attrs: { id: 'n4', sourceSceneId: 'sc_2' }, content: [{ type: 'text', text: 'Cars pass by.' }] },
    ],
  }

  const previousScriptScenes = [
    { id: 'sc_1', sceneNumber: '1', linkedShotIds: [], notes: '', importSource: 'Fixture', color: null },
    { id: 'sc_2', sceneNumber: '2', linkedShotIds: [], notes: '', importSource: 'Fixture', color: null },
  ]

  const scriptAnnotations = {
    byId: {
      bd_1: {
        id: 'bd_1',
        kind: 'breakdown',
        sceneIdAtCreate: 'sc_2',
        category: 'Props',
        name: 'Car keys',
        quantity: 1,
        anchor: { from: 2, to: 10, quote: 'Car keys' },
      },
    },
    order: ['bd_1'],
  }

  const storyboardScenes = [
    {
      id: 'story_1',
      shots: [
        { id: 'shot_a', linkedSceneId: 'sc_2', linkedScriptRangeStart: 3, linkedScriptRangeEnd: 15, color: '#22d3ee', displayId: '2A' },
      ],
    },
  ]

  const result = deriveScriptAdapterOutputs({
    scriptDocument,
    previousScriptScenes,
    scriptSettings: { scenePaginationMode: 'natural' },
    scriptAnnotations,
    storyboardScenes,
  })

  assert.equal(result.scriptScenes.length, 2)
  assert.equal(result.scriptScenes[0].id, 'sc_1')
  assert.equal(result.scriptScenes[1].id, 'sc_2')
  assert.equal(result.compatibility.sceneMetadataByScriptSceneId.sc_2.slugline, 'EXT. STREET - NIGHT')
  assert.equal(result.compatibility.breakdownTags.length, 1)
  assert.equal(result.compatibility.breakdownAggregates.total, 1)
  assert.equal(result.compatibility.breakdownAggregates.byCategory.Props, 1)
  assert.equal(result.compatibility.breakdownLists.perScene.sc_2.Props.length, 1)
  assert.equal(result.compatibility.breakdownLists.global.Props['Car keys'], 1)
  assert.equal(result.compatibility.shotLinkIndexBySceneId.sc_2.length, 1)
})

test('buildBreakdownAggregates groups by scene and category', () => {
  const aggregates = buildBreakdownAggregates([
    { id: 'a', sceneId: 's1', category: 'Props' },
    { id: 'b', sceneId: 's1', category: 'Props' },
    { id: 'c', sceneId: 's2', category: 'Wardrobe' },
  ])

  assert.equal(aggregates.total, 3)
  assert.equal(aggregates.byScene.s1.total, 2)
  assert.equal(aggregates.byScene.s1.byCategory.Props, 2)
  assert.equal(aggregates.byCategory.Wardrobe, 1)
})

test('buildShotLinkIndexByScene ignores invalid ranges and sorts valid ranges', () => {
  const index = buildShotLinkIndexByScene([
    {
      id: 'story_1',
      shots: [
        { id: 'shot_bad', linkedSceneId: 'sc_1', linkedScriptRangeStart: 10, linkedScriptRangeEnd: 10 },
        { id: 'shot_b', linkedSceneId: 'sc_1', linkedScriptRangeStart: 20, linkedScriptRangeEnd: 25 },
        { id: 'shot_a', linkedSceneId: 'sc_1', linkedScriptRangeStart: 5, linkedScriptRangeEnd: 8 },
      ],
    },
  ])

  assert.equal(index.sc_1.length, 2)
  assert.equal(index.sc_1[0].shotId, 'shot_a')
  assert.equal(index.sc_1[1].shotId, 'shot_b')
})

test('createScriptDerivationDebouncer runs once for burst typing and uses latest payload', async () => {
  const received = []
  const debouncer = createScriptDerivationDebouncer({
    delayMs: 30,
    onDerive: async (payload) => {
      received.push(payload)
    },
  })

  debouncer.schedule({ rev: 1 })
  debouncer.schedule({ rev: 2 })
  debouncer.schedule({ rev: 3 })

  assert.equal(received.length, 0)
  await wait(70)
  assert.equal(received.length, 1)
  assert.equal(received[0].rev, 3)
})

test('createScriptDerivationDebouncer flush runs pending derivation immediately', async () => {
  const received = []
  const debouncer = createScriptDerivationDebouncer({
    delayMs: 200,
    onDerive: async (payload) => {
      received.push(payload)
    },
  })

  debouncer.schedule({ rev: 4 })
  await debouncer.flush()

  assert.equal(received.length, 1)
  assert.equal(received[0].rev, 4)
  assert.equal(debouncer.isPending(), false)
})
