'use strict'

const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  /** Save project JSON to a .shotlist file via native Save dialog */
  saveProject: (defaultName, data) =>
    ipcRenderer.invoke('dialog:save-project', { defaultName, data }),

  /** Save project to an existing file path without opening a dialog */
  saveProjectSilent: (filePath, data) =>
    ipcRenderer.invoke('dialog:save-project-silent', { filePath, data }),

  /** Open a .shotlist file via native Open dialog */
  openProject: () =>
    ipcRenderer.invoke('dialog:open-project'),

  /** Open a .shotlist file directly from a known path (recent projects) */
  openProjectFromPath: (filePath) =>
    ipcRenderer.invoke('dialog:open-project-path', { filePath }),

  /** Save PDF via native Save dialog (buffer is ArrayBuffer) */
  savePDF: (defaultName, buffer) =>
    ipcRenderer.invoke('dialog:save-pdf', { defaultName, buffer }),

  /** Save PNG via native Save dialog (base64 is base64 string) */
  savePNG: (defaultName, base64) =>
    ipcRenderer.invoke('dialog:save-png', { defaultName, base64 }),


  /** Save generic JSON via native Save dialog */
  saveJson: (defaultName, data, filters) =>
    ipcRenderer.invoke('dialog:save-json', { defaultName, data, filters }),

  /**
   * Export PDF using Chromium's native print engine (webContents.printToPDF).
   * The renderer builds a single self-contained HTML document with all pages
   * and passes it here.  The main process loads it in a hidden BrowserWindow
   * and calls printToPDF({ landscape: true, pageSize: 'A4' }).
   *
   * htmlContent: string — complete self-contained HTML document
   * Returns: { success: true, pdfData: number[] } | { success: false, error: string }
   */
  printToPDF: (htmlContent) =>
    ipcRenderer.invoke('dialog:print-to-pdf', { htmlContent }),

  openExternal: (url) =>
    ipcRenderer.invoke('shell:open-external', { url }),

  revealFile: (filePath) =>
    ipcRenderer.invoke('shell:reveal-file', { filePath }),

  copyText: (text) =>
    ipcRenderer.invoke('clipboard:write-text', { text }),
})
