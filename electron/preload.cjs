'use strict'

const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  /** Save project JSON to a .shotlist file via native Save dialog */
  saveProject: (defaultName, data) =>
    ipcRenderer.invoke('dialog:save-project', { defaultName, data }),

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
})
