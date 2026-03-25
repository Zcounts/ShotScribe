import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

import {
  parseHostedFeedManifest,
  parseLimitedMobileUpdatePayload,
  parseMobileDayPackage,
  parseMobileSnapshot,
  serializeMobileSnapshot,
} from '../dist/index.js'

const examplesDir = path.resolve('examples')

function loadExample(name) {
  return fs.readFileSync(path.join(examplesDir, name), 'utf8')
}

test('parses valid example payloads', () => {
  const dayPackage = parseMobileDayPackage(loadExample('mobile-day-package.example.json'))
  const snapshot = parseMobileSnapshot(loadExample('mobile-snapshot.example.json'))
  const manifest = parseHostedFeedManifest(loadExample('hosted-feed-manifest.example.json'))
  const updates = parseLimitedMobileUpdatePayload(loadExample('limited-mobile-update-payload.example.json'))

  assert.equal(dayPackage.packageType, 'mobile-day-package')
  assert.equal(snapshot.snapshotType, 'mobile-snapshot')
  assert.equal(manifest.manifestType, 'hosted-feed-manifest')
  assert.equal(updates.payloadType, 'limited-mobile-update')
})

test('round-trips snapshot serialization', () => {
  const raw = loadExample('mobile-snapshot.example.json')
  const parsed = parseMobileSnapshot(raw)
  const serialized = serializeMobileSnapshot(parsed)
  const reparsed = parseMobileSnapshot(serialized)

  assert.equal(reparsed.snapshotId, parsed.snapshotId)
  assert.equal(reparsed.schemaVersion, 1)
})

test('rejects unsupported schemaVersion', () => {
  const raw = JSON.parse(loadExample('limited-mobile-update-payload.example.json'))
  raw.schemaVersion = 2

  assert.throws(() => {
    parseLimitedMobileUpdatePayload(JSON.stringify(raw))
  })
})
