import test from 'node:test'
import assert from 'node:assert/strict'
import {
  BREAKDOWN_ANNOTATION_KIND,
  addBreakdownAnnotation,
  deriveBreakdownListsFromAnnotations,
  migrateLegacyBreakdownTagsToAnnotations,
  removeBreakdownAnnotation,
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
