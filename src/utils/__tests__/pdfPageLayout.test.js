import test from 'node:test'
import assert from 'node:assert/strict'
import { derivePdfPageLayout } from '../pdfPageLayout.js'

test('derivePdfPageLayout keeps landscape dimensions in width/height order', () => {
  const page = derivePdfPageLayout(1400, 900)
  assert.equal(page.orientation, 'landscape')
  assert.deepEqual(page.format, [1400, 900])
})

test('derivePdfPageLayout keeps portrait dimensions in width/height order', () => {
  const page = derivePdfPageLayout(900, 1400)
  assert.equal(page.orientation, 'portrait')
  assert.deepEqual(page.format, [900, 1400])
})

test('derivePdfPageLayout rejects invalid dimensions', () => {
  assert.throws(() => derivePdfPageLayout(0, 1000), /Invalid PDF page dimensions/)
})
