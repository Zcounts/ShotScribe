import test from 'node:test'
import assert from 'node:assert/strict'
import {
  BREAKDOWN_ANNOTATION_KIND,
  COMMENT_ANNOTATION_KIND,
  SHOT_LINK_ANNOTATION_KIND,
  addBreakdownAnnotation,
  createCommentAnnotationEntity,
  deriveShotLinkIndexFromAnnotations,
  deriveBreakdownListsFromAnnotations,
  migrateLegacyBreakdownTagsToAnnotations,
  migrateLegacyShotLinksToAnnotations,
  removeBreakdownAnnotation,
  removeShotLinkAnnotationByShotId,
  upsertShotLinkAnnotation,
} from './breakdownAnnotations.js'

function baseDocument() {
  return {
    type: 'doc',
    content: [
      { type: 'scene_heading', attrs: { id: 'n1', sourceSceneId: 'sc_1' }, content: [{ type: 'text', text: 'INT. GARAGE - DAY' }] },
      { type: 'action', attrs: { id: 'n2', sourceSceneId: 'sc_1' }, content: [{ type: 'text', text: 'A red car sits under a tarp.' }] },
    ],
  }
}

test('addBreakdownAnnotation creates entity and inline refs', () => {
  const result = addBreakdownAnnotation({
    scriptDocument: baseDocument(),
    scriptAnnotations: { byId: {}, order: [] },
    annotationInput: {
      sceneId: 'sc_1',
      from: 20,
      to: 27,
      quote: 'red car',
      name: 'Hero Car',
      category: 'Vehicles',
      quantity: 1,
    },
  })

  const annotationId = result.scriptAnnotations.order[0]
  const annotation = result.scriptAnnotations.byId[annotationId]
  assert.ok(annotation)
  assert.equal(annotation.kind, BREAKDOWN_ANNOTATION_KIND)
  assert.equal(annotation.category, 'Vehicles')

  const actionNode = result.scriptDocument.content[1]
  assert.ok(Array.isArray(actionNode.attrs.breakdownRefIds))
  assert.ok(actionNode.attrs.breakdownRefIds.includes(annotationId))
})

test('removeBreakdownAnnotation clears entity and refs', () => {
  const added = addBreakdownAnnotation({
    scriptDocument: baseDocument(),
    scriptAnnotations: { byId: {}, order: [] },
    annotationInput: { sceneId: 'sc_1', from: 20, to: 27, quote: 'red car', category: 'Vehicles' },
  })
  const annotationId = added.scriptAnnotations.order[0]

  const removed = removeBreakdownAnnotation({
    scriptDocument: added.scriptDocument,
    scriptAnnotations: added.scriptAnnotations,
    annotationId,
  })

  assert.equal(removed.scriptAnnotations.order.length, 0)
  assert.equal(removed.scriptAnnotations.byId[annotationId], undefined)
  assert.deepEqual(removed.scriptDocument.content[1].attrs.breakdownRefIds, [])
})

test('deriveBreakdownListsFromAnnotations builds per-scene and global lists', () => {
  const addedOne = addBreakdownAnnotation({
    scriptDocument: baseDocument(),
    scriptAnnotations: { byId: {}, order: [] },
    annotationInput: { sceneId: 'sc_1', from: 20, to: 27, quote: 'red car', name: 'Car', category: 'Vehicles', quantity: 1 },
  })
  const addedTwo = addBreakdownAnnotation({
    scriptDocument: addedOne.scriptDocument,
    scriptAnnotations: addedOne.scriptAnnotations,
    annotationInput: { sceneId: 'sc_1', from: 28, to: 32, quote: 'tarp', name: 'Tarp', category: 'Props', quantity: 2 },
  })

  const lists = deriveBreakdownListsFromAnnotations({
    scriptAnnotations: addedTwo.scriptAnnotations,
    scriptScenes: [{ id: 'sc_1' }],
  })

  assert.equal(lists.perScene.sc_1.Vehicles.length, 1)
  assert.equal(lists.perScene.sc_1.Props.length, 1)
  assert.equal(lists.global.Vehicles.Car, 1)
  assert.equal(lists.global.Props.Tarp, 2)
})

test('inline refs survive text edits to same node (non-offset-only resilience)', () => {
  const added = addBreakdownAnnotation({
    scriptDocument: baseDocument(),
    scriptAnnotations: { byId: {}, order: [] },
    annotationInput: { sceneId: 'sc_1', from: 20, to: 27, quote: 'red car', category: 'Vehicles' },
  })
  const annotationId = added.scriptAnnotations.order[0]

  const editedDoc = {
    ...added.scriptDocument,
    content: added.scriptDocument.content.map((node, idx) => (
      idx === 1
        ? { ...node, content: [{ type: 'text', text: 'A very red car sits under a tarp now.' }] }
        : node
    )),
  }

  assert.ok(editedDoc.content[1].attrs.breakdownRefIds.includes(annotationId))
})

test('migrateLegacyBreakdownTagsToAnnotations keeps legacy compatibility', () => {
  const migrated = migrateLegacyBreakdownTagsToAnnotations({
    legacyBreakdownTags: [
      {
        id: 'legacy_1',
        sceneId: 'sc_1',
        start: 5,
        end: 12,
        text: 'red car',
        name: 'Car',
        category: 'Vehicles',
        quantity: 1,
      },
    ],
    scriptAnnotations: { byId: {}, order: [] },
  })

  assert.equal(migrated.order.length, 1)
  const annotation = migrated.byId[migrated.order[0]]
  assert.equal(annotation.kind, BREAKDOWN_ANNOTATION_KIND)
  assert.equal(annotation.sceneIdAtCreate, 'sc_1')
  assert.equal(annotation.anchor.from, 5)
  assert.equal(annotation.anchor.to, 12)
})

test('upsertShotLinkAnnotation upserts one link per shot id', () => {
  const first = upsertShotLinkAnnotation({
    scriptAnnotations: { byId: {}, order: [] },
    annotationInput: { shotId: 'shot_1', sceneId: 'sc_1', from: 12, to: 16, color: '#22d3ee', label: '1A' },
  })
  const second = upsertShotLinkAnnotation({
    scriptAnnotations: first.scriptAnnotations,
    annotationInput: { shotId: 'shot_1', sceneId: 'sc_1', from: 18, to: 24, color: '#22d3ee', label: '1A' },
  })

  assert.equal(second.scriptAnnotations.order.length, 1)
  const entity = second.scriptAnnotations.byId[second.scriptAnnotations.order[0]]
  assert.equal(entity.kind, SHOT_LINK_ANNOTATION_KIND)
  assert.equal(entity.anchor.from, 18)
  assert.equal(entity.anchor.to, 24)
})

test('removeShotLinkAnnotationByShotId removes shot-link entities', () => {
  const added = upsertShotLinkAnnotation({
    scriptAnnotations: { byId: {}, order: [] },
    annotationInput: { shotId: 'shot_2', sceneId: 'sc_2', from: 4, to: 8 },
  })
  const removed = removeShotLinkAnnotationByShotId({
    scriptAnnotations: added.scriptAnnotations,
    shotId: 'shot_2',
  })

  assert.equal(removed.order.length, 0)
})

test('migrateLegacyShotLinksToAnnotations imports historical linked ranges', () => {
  const migrated = migrateLegacyShotLinksToAnnotations({
    storyboardScenes: [
      {
        id: 'story_1',
        shots: [{ id: 'shot_legacy', linkedSceneId: 'sc_9', linkedScriptRangeStart: 3, linkedScriptRangeEnd: 11 }],
      },
    ],
    scriptAnnotations: { byId: {}, order: [] },
  })

  assert.equal(migrated.order.length, 1)
  const entity = migrated.byId[migrated.order[0]]
  assert.equal(entity.kind, SHOT_LINK_ANNOTATION_KIND)
  assert.equal(entity.sceneIdAtCreate, 'sc_9')
})

test('deriveShotLinkIndexFromAnnotations prefers annotation substrate and falls back to legacy shots', () => {
  const fromAnnotations = deriveShotLinkIndexFromAnnotations({
    scriptAnnotations: {
      byId: {
        sl_1: { id: 'sl_1', kind: SHOT_LINK_ANNOTATION_KIND, shotId: 'shot_a', sceneIdAtCreate: 'sc_1', anchor: { from: 1, to: 5 }, color: '#f00', label: '1A' },
      },
      order: ['sl_1'],
    },
    storyboardScenes: [
      {
        id: 'story_1',
        shots: [{ id: 'shot_a', linkedSceneId: 'sc_1', linkedScriptRangeStart: 2, linkedScriptRangeEnd: 3 }],
      },
    ],
  })
  assert.equal(fromAnnotations.sc_1.length, 1)
  assert.equal(fromAnnotations.sc_1[0].start, 1)

  const fallback = deriveShotLinkIndexFromAnnotations({
    scriptAnnotations: { byId: {}, order: [] },
    storyboardScenes: [
      {
        id: 'story_2',
        shots: [{ id: 'shot_b', linkedSceneId: 'sc_2', linkedScriptRangeStart: 7, linkedScriptRangeEnd: 10 }],
      },
    ],
  })
  assert.equal(fallback.sc_2[0].shotId, 'shot_b')
})

test('createCommentAnnotationEntity provides comment-ready rails without enabling UI', () => {
  const entity = createCommentAnnotationEntity({
    threadId: 'thread_1',
    sceneId: 'sc_4',
    from: 9,
    to: 20,
    quote: 'line here',
  })

  assert.equal(entity.kind, COMMENT_ANNOTATION_KIND)
  assert.equal(entity.threadId, 'thread_1')
  assert.deepEqual(entity.comments, [])
})
