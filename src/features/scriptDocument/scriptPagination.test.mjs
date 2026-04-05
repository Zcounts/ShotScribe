import test from 'node:test'
import assert from 'node:assert/strict'
import { paginateScriptDocument } from './scriptPagination.js'

function makeDoc(lines = 1) {
  const content = []
  content.push({ type: 'scene_heading', attrs: { id: 'h1' }, content: [{ type: 'text', text: 'INT. ROOM - DAY' }] })
  for (let i = 0; i < lines; i += 1) {
    content.push({ type: 'action', attrs: { id: `a_${i}` }, content: [{ type: 'text', text: `Line ${i} ${'x'.repeat(40)}` }] })
  }
  return { type: 'doc', content }
}

test('paginateScriptDocument returns deterministic pages for same input', () => {
  const doc = makeDoc(20)
  const first = paginateScriptDocument({ scriptDocument: doc })
  const second = paginateScriptDocument({ scriptDocument: doc })

  assert.equal(first.pages.length, second.pages.length)
  assert.equal(first.blocks.length, second.blocks.length)
  assert.deepEqual(
    first.pages.map(page => page.blocks.map(block => block.id)),
    second.pages.map(page => page.blocks.map(block => block.id)),
  )
})

test('paginateScriptDocument supports scene-based new-page mode', () => {
  const doc = {
    type: 'doc',
    content: [
      { type: 'scene_heading', attrs: { id: 's1' }, content: [{ type: 'text', text: 'INT. ROOM - DAY' }] },
      { type: 'action', attrs: { id: 'a1' }, content: [{ type: 'text', text: 'Action one.' }] },
      { type: 'scene_heading', attrs: { id: 's2' }, content: [{ type: 'text', text: 'EXT. ROAD - NIGHT' }] },
      { type: 'action', attrs: { id: 'a2' }, content: [{ type: 'text', text: 'Action two.' }] },
    ],
  }

  const natural = paginateScriptDocument({ scriptDocument: doc, scenePaginationMode: 'natural' })
  const forced = paginateScriptDocument({ scriptDocument: doc, scenePaginationMode: 'newPagePerScene' })

  assert.ok(forced.pages.length >= natural.pages.length)
  assert.equal(forced.pages[0].blocks[0].id, 's1')
  assert.equal(forced.pages[1].blocks[0].id, 's2')
})

test('paginateScriptDocument keeps heading nodes as heading block type', () => {
  const paginated = paginateScriptDocument({ scriptDocument: makeDoc(2) })
  assert.equal(paginated.blocks[0].blockType, 'heading')
  assert.equal(paginated.blocks[0].isSceneStart, true)
})
