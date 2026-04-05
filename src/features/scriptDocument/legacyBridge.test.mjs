import test from 'node:test'
import assert from 'node:assert/strict'
import {
  convertLegacyScriptScenesToProseMirrorDocument,
  convertProseMirrorDocumentToLegacyCompatibility,
  normalizeScriptDocumentState,
  SCRIPT_DOC_VERSION,
  SCRIPT_DERIVATION_VERSION,
} from './legacyBridge.js'

function makeLegacyScene(overrides = {}) {
  return {
    id: overrides.id || `sc_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    sceneNumber: overrides.sceneNumber ?? '1',
    slugline: overrides.slugline || 'INT. LAB - DAY',
    intExt: overrides.intExt || 'INT',
    dayNight: overrides.dayNight || 'DAY',
    location: overrides.location || 'LAB',
    customHeader: overrides.customHeader || overrides.slugline || 'INT. LAB - DAY',
    characters: overrides.characters || [],
    actionText: overrides.actionText || '',
    screenplayText: overrides.screenplayText || '',
    screenplayElements: overrides.screenplayElements || [],
    dialogueCount: overrides.dialogueCount || 0,
    pageCount: overrides.pageCount ?? null,
    pageStart: overrides.pageStart ?? null,
    pageEnd: overrides.pageEnd ?? null,
    complexityTags: overrides.complexityTags || [],
    estimatedMinutes: overrides.estimatedMinutes ?? null,
    linkedShotIds: overrides.linkedShotIds || [],
    notes: overrides.notes || '',
    importSource: overrides.importSource || 'Fixture',
    color: overrides.color || null,
  }
}

test('legacy -> ProseMirror -> legacy retains slugline metadata and scene id', () => {
  const legacyScenes = [
    makeLegacyScene({
      id: 'sc_a',
      sceneNumber: '12A',
      slugline: 'INT. HALLWAY - NIGHT',
      intExt: 'INT',
      dayNight: 'NIGHT',
      location: 'HALLWAY',
      screenplayElements: [
        { id: 'el_1', type: 'heading', text: 'INT. HALLWAY - NIGHT' },
        { id: 'el_2', type: 'action', text: 'Lights flicker.' },
      ],
      color: '#f87171',
      notes: 'Keep dark',
    }),
  ]

  const pm = convertLegacyScriptScenesToProseMirrorDocument(legacyScenes)
  const roundTrip = convertProseMirrorDocumentToLegacyCompatibility({
    scriptDocument: pm.scriptDocument,
    previousScriptScenes: legacyScenes,
  })

  assert.equal(roundTrip.scriptScenes.length, 1)
  assert.equal(roundTrip.scriptScenes[0].id, 'sc_a')
  assert.equal(roundTrip.scriptScenes[0].slugline, 'INT. HALLWAY - NIGHT')
  assert.equal(roundTrip.scriptScenes[0].intExt, 'INT')
  assert.equal(roundTrip.scriptScenes[0].dayNight, 'NIGHT')
  assert.equal(roundTrip.scriptScenes[0].location, 'HALLWAY')
})

test('ProseMirror compatibility conversion splits scenes on additional headings', () => {
  const previous = [
    makeLegacyScene({
      id: 'sc_base',
      sceneNumber: '1',
      screenplayElements: [
        { id: 'a', type: 'heading', text: 'INT. KITCHEN - DAY' },
        { id: 'b', type: 'action', text: 'Steam rises.' },
      ],
    }),
  ]

  const pm = {
    type: 'doc',
    content: [
      { type: 'scene_heading', attrs: { id: 'n1', sourceSceneId: 'sc_base' }, content: [{ type: 'text', text: 'INT. KITCHEN - DAY' }] },
      { type: 'action', attrs: { id: 'n2', sourceSceneId: 'sc_base' }, content: [{ type: 'text', text: 'Steam rises.' }] },
      { type: 'scene_heading', attrs: { id: 'n3' }, content: [{ type: 'text', text: 'EXT. ROOF - NIGHT' }] },
      { type: 'action', attrs: { id: 'n4' }, content: [{ type: 'text', text: 'Rain starts.' }] },
    ],
  }

  const result = convertProseMirrorDocumentToLegacyCompatibility({
    scriptDocument: pm,
    previousScriptScenes: previous,
  })

  assert.equal(result.scriptScenes.length, 2)
  assert.equal(result.scriptScenes[0].id, 'sc_base')
  assert.equal(result.scriptScenes[1].slugline, 'EXT. ROOF - NIGHT')
  assert.equal(result.scriptScenes[1].intExt, 'EXT')
  assert.equal(result.scriptScenes[1].dayNight, 'NIGHT')
})

test('normalizeScriptDocumentState migrates legacy-only payloads safely', () => {
  const legacyScenes = [
    makeLegacyScene({
      id: 'sc_legacy',
      screenplayElements: [
        { id: 'el1', type: 'heading', text: 'INT. OFFICE - DAY' },
        { id: 'el2', type: 'action', text: 'Phones ring.' },
      ],
    }),
  ]

  const state = normalizeScriptDocumentState({
    scriptScenes: legacyScenes,
    scriptDocument: null,
    scriptDocVersion: null,
    scriptDerivationVersion: null,
  })

  assert.equal(state.scriptDocVersion, SCRIPT_DOC_VERSION)
  assert.equal(state.scriptDerivationVersion, SCRIPT_DERIVATION_VERSION)
  assert.equal(state.scriptDocument.type, 'doc')
  assert.equal(state.scriptScenes.length, 1)
  assert.equal(state.scriptScenes[0].id, 'sc_legacy')
  assert.equal(state.migratedFromLegacyScriptScenes, true)
})

test('compatibility output includes stable shape keys expected by existing consumers', () => {
  const legacyScenes = [
    makeLegacyScene({
      id: 'sc_shape',
      sceneNumber: '7',
      screenplayElements: [
        { id: 'el_1', type: 'heading', text: 'EXT. FIELD - DAWN' },
        { id: 'el_2', type: 'action', text: 'Mist rolls over grass.' },
      ],
      color: '#22d3ee',
    }),
  ]

  const pm = convertLegacyScriptScenesToProseMirrorDocument(legacyScenes)
  const result = convertProseMirrorDocumentToLegacyCompatibility({
    scriptDocument: pm.scriptDocument,
    previousScriptScenes: legacyScenes,
    scriptAnnotations: {
      byId: {
        bd_1: {
          id: 'bd_1',
          kind: 'breakdown',
          sceneIdAtCreate: 'sc_shape',
          category: 'Props',
          name: 'Lantern',
          quantity: 1,
          anchor: { from: 2, to: 9, quote: 'Lantern' },
          createdAt: '2026-04-05T00:00:00.000Z',
        },
      },
      order: ['bd_1'],
    },
  })

  const scene = result.scriptScenes[0]
  assert.ok(scene)
  assert.ok(Array.isArray(scene.screenplayElements))
  assert.ok('sceneNumber' in scene)
  assert.ok('pageCount' in scene)
  assert.ok('pageStart' in scene)
  assert.ok('pageEnd' in scene)
  assert.ok(result.compatibility.sceneMetadataByScriptSceneId.sc_shape)
  assert.equal(result.compatibility.sceneMetadataByScriptSceneId.sc_shape.slugline, 'EXT. FIELD - DAWN')
  assert.equal(result.compatibility.breakdownTags.length, 1)
  assert.equal(result.compatibility.breakdownTags[0].category, 'Props')
})

test('normalizeScriptDocumentState can prefer legacy script scenes when canonical doc is stale', () => {
  const staleDoc = {
    type: 'doc',
    content: [
      { type: 'scene_heading', attrs: { id: 'stale_1', sourceSceneId: 'sc_old' }, content: [{ type: 'text', text: 'INT. STALE ROOM - DAY' }] },
    ],
  }
  const legacyScenes = [
    makeLegacyScene({
      id: 'sc_fresh',
      screenplayElements: [
        { id: 'f1', type: 'heading', text: 'EXT. FRESH FIELD - NIGHT' },
        { id: 'f2', type: 'action', text: 'Wind blows.' },
      ],
    }),
  ]

  const normalized = normalizeScriptDocumentState({
    scriptDocument: staleDoc,
    scriptScenes: legacyScenes,
    preferLegacyScriptScenes: true,
  })

  assert.equal(normalized.scriptScenes.length, 1)
  assert.equal(normalized.scriptScenes[0].id, 'sc_fresh')
  assert.equal(normalized.scriptScenes[0].slugline, 'EXT. FRESH FIELD - NIGHT')
  assert.equal(normalized.migratedFromLegacyScriptScenes, true)
})

test('normalizeScriptDocumentState migrates legacy breakdown tags into structured annotations', () => {
  const normalized = normalizeScriptDocumentState({
    scriptScenes: [
      makeLegacyScene({
        id: 'sc_tag',
        screenplayElements: [{ id: 'h1', type: 'heading', text: 'INT. STUDIO - DAY' }],
      }),
    ],
    scriptSettings: {
      breakdownTags: [
        {
          id: 'bd_legacy',
          sceneId: 'sc_tag',
          start: 0,
          end: 6,
          text: 'STUDIO',
          name: 'Studio',
          category: 'Locations',
          quantity: 1,
        },
      ],
    },
  })

  assert.equal(normalized.scriptAnnotations.order.length, 1)
  const annotation = normalized.scriptAnnotations.byId[normalized.scriptAnnotations.order[0]]
  assert.equal(annotation.category, 'Locations')
  assert.equal(annotation.sceneIdAtCreate, 'sc_tag')
})

test('normalizeScriptDocumentState migrates legacy shot link ranges into shot-link annotations', () => {
  const normalized = normalizeScriptDocumentState({
    scriptScenes: [
      makeLegacyScene({
        id: 'sc_shot',
        screenplayElements: [{ id: 'h1', type: 'heading', text: 'EXT. YARD - DAY' }],
      }),
    ],
    storyboardScenes: [
      {
        id: 'story_1',
        shots: [
          { id: 'shot_legacy', linkedSceneId: 'sc_shot', linkedScriptRangeStart: 2, linkedScriptRangeEnd: 8 },
        ],
      },
    ],
  })

  const shotLinkAnnotation = normalized.scriptAnnotations.order
    .map((id) => normalized.scriptAnnotations.byId[id])
    .find(annotation => annotation?.kind === 'shot_link_annotation')
  assert.ok(shotLinkAnnotation)
  assert.equal(shotLinkAnnotation.sceneIdAtCreate, 'sc_shot')
  assert.equal(shotLinkAnnotation.shotId, 'shot_legacy')
})
