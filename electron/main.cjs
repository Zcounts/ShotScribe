'use strict'

const { app, BrowserWindow, ipcMain, dialog, Menu, shell } = require('electron')
const path = require('path')
const fs = require('fs')
const os = require('os')

const isDev = !app.isPackaged

function attachRendererDiagnostics(win) {
  const wc = win.webContents

  wc.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    console.error('[Renderer] did-fail-load', {
      errorCode,
      errorDescription,
      validatedURL,
      isMainFrame,
    })
  })

  wc.on('render-process-gone', (_event, details) => {
    console.error('[Renderer] render-process-gone', details)
  })

  wc.on('console-message', (_event, level, message, line, sourceId) => {
    const levels = ['debug', 'info', 'warn', 'error']
    const tag = levels[level] || 'log'
    const printer = tag === 'error' ? console.error : tag === 'warn' ? console.warn : console.log
    printer(`[Renderer console:${tag}] ${message} (${sourceId}:${line})`)
  })

  wc.on('preload-error', (_event, preloadPath, error) => {
    console.error('[Renderer] preload-error', {
      preloadPath,
      message: error?.message,
      stack: error?.stack,
    })
  })
}

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
    title: 'ShotScribe',
    backgroundColor: '#e8e4db',
    show: false,
  })

  // Show window once ready to avoid white flash.
  // Call focus() alongside show() so the OS grants input focus immediately;
  // without it the first click is consumed by the window manager to focus the
  // window rather than being dispatched to the web page (classic Electron
  // click-to-focus behaviour on Linux / some macOS window managers).
  win.once('ready-to-show', () => {
    win.show()
    win.focus()
  })

  if (isDev) {
    win.loadURL('http://localhost:5173')
    win.webContents.openDevTools()
  } else {
    win.loadFile(path.join(app.getAppPath(), 'dist', 'index.html'))
  }

  attachRendererDiagnostics(win)

  // Remove default menu bar in production
  if (!isDev) {
    Menu.setApplicationMenu(null)
  }

  return win
}

process.on('uncaughtException', (error) => {
  console.error('[Main] uncaughtException', error)
})

process.on('unhandledRejection', (reason) => {
  console.error('[Main] unhandledRejection', reason)
})

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

// ─── IPC: Save project to existing path (no dialog) ──────────────────────────
ipcMain.handle('dialog:save-project-silent', async (_event, { filePath, data }) => {
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

// ─── IPC: Save generic JSON ───────────────────────────────────────────────────
ipcMain.handle('dialog:save-json', async (_event, { defaultName, data, filters }) => {
  const { canceled, filePath } = await dialog.showSaveDialog({
    title: 'Export JSON',
    defaultPath: defaultName,
    filters: Array.isArray(filters) && filters.length > 0
      ? filters
      : [{ name: 'JSON', extensions: ['json'] }],
  })
  if (canceled || !filePath) return { success: false }
  try {
    fs.writeFileSync(filePath, data, 'utf8')
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

// ─── IPC: Export PDF via webContents.printToPDF() ────────────────────────────
// Receives a complete HTML document string (all pages, with @page CSS rules and
// break-after: page between sections), loads it in a hidden BrowserWindow, and
// calls Chromium's native printToPDF.  This is far more reliable than the old
// PNG-capture approach: it handles fonts, images, and pagination natively with
// no canvas memory limits.
//
// htmlContent: string — complete self-contained HTML document
// Returns: { success: true, pdfData: number[] } | { success: false, error: string }
ipcMain.handle('dialog:print-to-pdf', async (_event, { htmlContent }) => {
  let win = null
  let tempFile = null

  console.log(`[PDF Main] printToPDF — HTML size: ${(htmlContent.length / 1024).toFixed(0)}KB`)

  try {
    // Write to a temp file so the hidden window loads via file:// (avoids
    // data-URI size limits and allows the browser to resolve relative paths)
    tempFile = path.join(os.tmpdir(), `shotscribe_print_${Date.now()}.html`)
    fs.writeFileSync(tempFile, htmlContent, 'utf8')

    win = new BrowserWindow({
      show: false,
      width: 1600,
      height: 900,
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
        // Allow data URIs (base64 images embedded in the HTML)
        webSecurity: false,
      },
    })

    await win.loadFile(tempFile)

    // Give Chromium time to finish layout, font loading, and image decoding
    // before triggering the print engine.
    await new Promise(resolve => setTimeout(resolve, 2000))

    console.log('[PDF Main] Calling printToPDF…')
    const pdfBuffer = await win.webContents.printToPDF({
      landscape: true,
      pageSize: 'A4',
      printBackground: true,
      margins: { marginType: 'none' },
    })

    console.log(`[PDF Main] PDF generated — ${(pdfBuffer.length / 1024).toFixed(0)}KB`)
    return { success: true, pdfData: Array.from(pdfBuffer) }
  } catch (err) {
    console.error('[PDF Main] printToPDF failed:', err.message)
    return { success: false, error: err.message }
  } finally {
    if (win && !win.isDestroyed()) {
      win.close()
      win = null
    }
    if (tempFile) {
      try { fs.unlinkSync(tempFile) } catch { /* ignore cleanup errors */ }
    }
  }
})
