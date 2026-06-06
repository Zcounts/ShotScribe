import assert from 'node:assert/strict'
import { createServer } from 'vite'

const server = await createServer({ configFile: false, server: { middlewareMode: true }, appType: 'custom' })
try {
  const { detectCloudImageReferencesForEmbeddedLocalProject } = await server.ssrLoadModule('/src/utils/localCloudImageEmbedding.js')
  const summary = detectCloudImageReferencesForEmbeddedLocalProject({
    projectHeroImage: { image: 'data:image/png;base64,AAAA', imageAsset: { cloud: null } },
    scenes: [{ shots: [
      { id: 'local', image: 'data:image/png;base64,AAAA', imageAsset: { cloud: null } },
      { id: 'remote', image: 'https://example.com/shot.webp', imageAsset: { cloud: { assetId: 'asset_1', objectKey: 'storyboard/a.webp' } } },
    ] }],
  })
  assert.equal(summary.hasCloudImageReferences, true)
  assert.equal(summary.totalCount, 1)
  assert.equal(summary.urlCount, 1)
  assert.equal(summary.assetIdCount, 1)
} finally {
  await server.close()
}
