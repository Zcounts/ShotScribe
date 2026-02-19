'use strict'

const { app, BrowserWindow, ipcMain, dialog, Menu, shell } = require('electron')
const path = require('path')
const fs = require('fs')

const isDev = !app.isPackaged

function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    icon: path.join(__dirname, '../assets/icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
    title: 'Storyboard',
    backgroundColor: '#e8e4db',
    show: false,
  })

  // Show window once ready to avoid white flash
  win.once('ready-to-show', () => win.show())

  if (isDev) {
    win.loadURL('http://localhost:5173')
    win.webContents.openDevTools()
  } else {
    win.loadFile(path.join(app.getAppPath(), 'dist', 'index.html'))
  }

  // Remove default menu bar in production
  if (!isDev) {
    Menu.setApplicationMenu(null)
  }

  return win
}

app.whenReady().then(() => {
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

// ─── IPC: Save project ────────────────────────────────────────────────────────
ipcMain.handle('dialog:save-project', async (_event, { defaultName, data }) => {
  const { canceled, filePath } = await dialog.showSaveDialog({
    title: 'Save Project',
    defaultPath: defaultName,
    filters: [{ name: 'Shotlist Project', extensions: ['shotlist'] }],
  })
  if (canceled || !filePath) return { success: false }
  try {
    fs.writeFileSync(filePath, data, 'utf8')
    return { success: true, filePath }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

// ─── IPC: Open project ────────────────────────────────────────────────────────
ipcMain.handle('dialog:open-project', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    title: 'Open Project',
    filters: [{ name: 'Shotlist Project', extensions: ['shotlist', 'json'] }],
    properties: ['openFile'],
  })
  if (canceled || filePaths.length === 0) return { success: false }
  try {
    const data = fs.readFileSync(filePaths[0], 'utf8')
    return { success: true, data, filePath: filePaths[0] }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

// ─── IPC: Open project from known path ───────────────────────────────────────
ipcMain.handle('dialog:open-project-path', async (_event, { filePath }) => {
  try {
    const data = fs.readFileSync(filePath, 'utf8')
    return { success: true, data, filePath }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

// ─── IPC: Save PDF ────────────────────────────────────────────────────────────
ipcMain.handle('dialog:save-pdf', async (_event, { defaultName, buffer }) => {
  const { canceled, filePath } = await dialog.showSaveDialog({
    title: 'Export PDF',
    defaultPath: defaultName,
    filters: [{ name: 'PDF Document', extensions: ['pdf'] }],
  })
  if (canceled || !filePath) return { success: false }
  try {
    fs.writeFileSync(filePath, Buffer.from(buffer))
    return { success: true, filePath }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

// ─── IPC: Save PNG ────────────────────────────────────────────────────────────
ipcMain.handle('dialog:save-png', async (_event, { defaultName, base64 }) => {
  const { canceled, filePath } = await dialog.showSaveDialog({
    title: 'Export PNG',
    defaultPath: defaultName,
    filters: [{ name: 'PNG Image', extensions: ['png'] }],
  })
  if (canceled || !filePath) return { success: false }
  try {
    fs.writeFileSync(filePath, Buffer.from(base64, 'base64'))
    return { success: true, filePath }
  } catch (err) {
    return { success: false, error: err.message }
  }
})
