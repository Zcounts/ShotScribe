const { contextBridge, ipcRenderer } = require('electron')

const invoke = (channel, ...args) => ipcRenderer.invoke(channel, ...args)

contextBridge.exposeInMainWorld('electronAPI', {
  saveProject: (defaultName, data) => invoke('shotscribe:saveProject', defaultName, data),
  saveProjectSilent: (filePath, data) => invoke('shotscribe:saveProjectSilent', filePath, data),
  openProject: () => invoke('shotscribe:openProject'),
  openProjectFromPath: (filePath) => invoke('shotscribe:openProjectFromPath', filePath),
  printToPDF: (htmlContent) => invoke('shotscribe:printToPDF', htmlContent),
  savePDF: (defaultName, buffer) => invoke('shotscribe:savePDF', defaultName, buffer),
  savePNG: (defaultName, base64) => invoke('shotscribe:savePNG', defaultName, base64),
  saveJson: (defaultName, data, filters) => invoke('shotscribe:saveJson', defaultName, data, filters),
  openExternal: (url) => invoke('shotscribe:openExternal', url),
  revealFile: (filePath) => invoke('shotscribe:revealFile', filePath),
  copyText: (text) => invoke('shotscribe:copyText', text),
  ensureProjectAssetFolder: (projectFilePath) => invoke('shotscribe:ensureProjectAssetFolder', projectFilePath),
  writeLocalAsset: (projectFilePath, fileName, data) => invoke('shotscribe:writeLocalAsset', projectFilePath, fileName, data),
  readLocalAsset: (projectFilePath, relativePath) => invoke('shotscribe:readLocalAsset', projectFilePath, relativePath),
  downloadUrlToLocalAsset: (projectFilePath, url, suggestedFileName) => invoke('shotscribe:downloadUrlToLocalAsset', projectFilePath, url, suggestedFileName),
  revealProjectAssetsFolder: (projectFilePath) => invoke('shotscribe:revealProjectAssetsFolder', projectFilePath),
})
