import assert from 'node:assert/strict'
import { createServer } from 'vite'

const server = await createServer({ configFile: false, server: { middlewareMode: true }, appType: 'custom' })
try {
  const { detectEmbeddedImageReferencesForLocalProject } = await server.ssrLoadModule('/src/utils/localEmbeddedImageExtraction.js')
  const dataUrl = 'data:image/png;base64,AAAA'
  const summary = detectEmbeddedImageReferencesForLocalProject({
    projectHeroImage: { image: dataUrl, imageAsset: { thumb: dataUrl, cloud: null } },
    scenes: [{ shots: [{ id: 'shot_1', image: dataUrl, imageAsset: { thumb: dataUrl, full: dataUrl, cloud: null } }] }],
  })
  assert.equal(summary.hasEmbeddedImageReferences, true)
  assert.equal(summary.totalCount, 2)
  assert.equal(summary.uniqueCount, 1)
  assert.equal(summary.shotCount, 1)
  assert.equal(summary.heroCount, 1)
} finally {
  await server.close()
}
