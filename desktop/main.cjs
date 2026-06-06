const path = require('path')
const fs = require('fs/promises')
const { app, BrowserWindow, clipboard, dialog, ipcMain, shell } = require('electron')
const localAssets = require('./localAssets.cjs')

let mainWindow = null

function ok(value = {}) {
  return { success: true, ...value }
}

function fail(error) {
  return { success: false, error: error?.message || String(error || 'Unknown desktop bridge error') }
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 960,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  const devUrl = process.env.SHOTSCRIBE_DEV_SERVER_URL
  if (devUrl) await mainWindow.loadURL(devUrl)
  else await mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
}

function registerHandler(channel, fn) {
  ipcMain.handle(channel, async (_event, ...args) => {
    try {
      return await fn(...args)
    } catch (error) {
      return fail(error)
    }
  })
}

function registerFileHandlers() {
  registerHandler('shotscribe:saveProject', async (defaultName, data) => {
    const result = await dialog.showSaveDialog(mainWindow, {
      defaultPath: defaultName || 'Untitled Shotlist.shotlist',
      filters: [{ name: 'ShotScribe Project', extensions: ['shotlist'] }, { name: 'JSON', extensions: ['json'] }],
    })
    if (result.canceled || !result.filePath) return { success: false, cancelled: true }
    await fs.writeFile(result.filePath, String(data || ''), 'utf8')
    return ok({ filePath: result.filePath })
  })

  registerHandler('shotscribe:saveProjectSilent', async (filePath, data) => {
    if (!filePath) throw new Error('Missing project file path.')
    await fs.writeFile(filePath, String(data || ''), 'utf8')
    return ok({ filePath })
  })

  registerHandler('shotscribe:openProject', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile'],
      filters: [{ name: 'ShotScribe Project', extensions: ['shotlist', 'json'] }],
    })
    if (result.canceled || !result.filePaths?.[0]) return { success: false, cancelled: true }
    const filePath = result.filePaths[0]
    const data = await fs.readFile(filePath, 'utf8')
    return ok({ filePath, data })
  })

  registerHandler('shotscribe:openProjectFromPath', async (filePath) => {
    if (!filePath) throw new Error('Missing project file path.')
    const data = await fs.readFile(filePath, 'utf8')
    return ok({ filePath, data })
  })

  registerHandler('shotscribe:saveJson', async (defaultName, data) => {
    const result = await dialog.showSaveDialog(mainWindow, {
      defaultPath: defaultName || 'export.json',
      filters: [{ name: 'JSON', extensions: ['json'] }],
    })
    if (result.canceled || !result.filePath) return { success: false, cancelled: true }
    await fs.writeFile(result.filePath, String(data || ''), 'utf8')
    return ok({ filePath: result.filePath })
  })
}

function registerLocalAssetHandlers() {
  registerHandler('shotscribe:ensureProjectAssetFolder', async (projectFilePath) => localAssets.ensureProjectAssetFolder(projectFilePath))
  registerHandler('shotscribe:writeLocalAsset', async (projectFilePath, fileName, data) => localAssets.writeLocalAsset(projectFilePath, fileName, data))
  registerHandler('shotscribe:readLocalAsset', async (projectFilePath, relativePath) => localAssets.readLocalAsset(projectFilePath, relativePath))
  registerHandler('shotscribe:downloadUrlToLocalAsset', async (projectFilePath, url, suggestedFileName) => localAssets.downloadUrlToLocalAsset(projectFilePath, url, suggestedFileName))
  registerHandler('shotscribe:revealProjectAssetsFolder', async (projectFilePath) => localAssets.revealProjectAssetsFolder(projectFilePath))
}

function registerOsHandlers() {
  registerHandler('shotscribe:openExternal', async (url) => {
    await shell.openExternal(String(url || ''))
    return ok()
  })
  registerHandler('shotscribe:revealFile', async (filePath) => {
    shell.showItemInFolder(filePath)
    return ok()
  })
  registerHandler('shotscribe:copyText', async (text) => {
    clipboard.writeText(String(text || ''))
    return ok()
  })
  registerHandler('shotscribe:printToPDF', async () => fail(new Error('printToPDF is not implemented in the bundled desktop bridge.')))
  registerHandler('shotscribe:savePDF', async () => fail(new Error('savePDF is not implemented in the bundled desktop bridge.')))
  registerHandler('shotscribe:savePNG', async () => fail(new Error('savePNG is not implemented in the bundled desktop bridge.')))
}

app.whenReady().then(async () => {
  registerFileHandlers()
  registerLocalAssetHandlers()
  registerOsHandlers()
  await createWindow()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', async () => {
  if (BrowserWindow.getAllWindows().length === 0) await createWindow()
})
