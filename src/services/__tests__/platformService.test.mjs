import assert from 'node:assert/strict'
import { createServer } from 'vite'

const server = await createServer({
  configFile: false,
  server: { middlewareMode: true },
  appType: 'custom',
})

try {
  const { platformService } = await server.ssrLoadModule('/src/services/platformService.js')

  assert.equal(typeof platformService, 'object')
  assert.equal(typeof platformService.isBrowserFolderProjectPath, 'function')
  assert.equal(platformService.isBrowserFolderProjectPath('browser-fsa:test/Test.shotlist'), true)
  assert.equal(platformService.isBrowserFolderProjectPath('browser:test'), false)
  assert.equal(platformService.isBrowserFolderProjectPath(null), false)
} finally {
  await server.close()
}
