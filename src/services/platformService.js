import { logTelemetry } from '../utils/telemetry'

const DESKTOP_ONLY_ERROR = 'Desktop-only capability is unavailable in this environment.'
const AUTOSAVE_KEY = 'autosave'
const AUTOSAVE_TIME_KEY = 'autosave_time'
const RECENT_PROJECTS_KEY = 'recentProjects'
const BROWSER_PROJECT_INDEX_KEY = 'browserProjectIndex'
const BROWSER_PROJECT_KEY_PREFIX = 'browserProject:'
const BROWSER_FSA_PROJECT_PREFIX = 'browser-fsa:'
const BROWSER_FSA_DB_NAME = 'shotscribe-local-project-folders'
const BROWSER_FSA_DB_VERSION = 1
const BROWSER_FSA_STORE = 'projects'
let activeBrowserFolderProject = null

function getElectronApi() {
  if (typeof window === 'undefined') return null
  return window.electronAPI || null
}

function unsupportedResult(action) {
  return { success: false, error: `${action}: ${DESKTOP_ONLY_ERROR}` }
}

function readLocalStorageJson(key, fallback = null) {
  try {
    if (typeof localStorage === 'undefined') return fallback
    const raw = localStorage.getItem(key)
    if (!raw) return fallback
    return JSON.parse(raw)
  } catch {
    return fallback
  }
}

function writeLocalStorageJson(key, value) {
  if (typeof localStorage === 'undefined') return false
  localStorage.setItem(key, JSON.stringify(value))
  return true
}

function downloadTextFile(defaultName, data, mimeType = 'application/json') {
  if (typeof document === 'undefined') return unsupportedResult(`downloadTextFile(${defaultName})`)
  const blob = new Blob([data], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = defaultName
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
  return { success: true }
}

function openJsonFilePicker() {
  return new Promise((resolve, reject) => {
    try {
      const input = document.createElement('input')
      input.type = 'file'
      input.accept = '.shotlist,.json'
      input.onchange = (event) => {
        const file = event.target.files?.[0]
        if (!file) {
          resolve({ success: false, cancelled: true })
          return
        }
        const reader = new FileReader()
        reader.onload = (ev) => {
          resolve({
            success: true,
            data: String(ev.target?.result || ''),
            filePath: file.name,
          })
        }
        reader.onerror = () => reject(reader.error || new Error('Failed reading selected file'))
        reader.readAsText(file)
      }
      document.body.appendChild(input)
      input.click()
      document.body.removeChild(input)
    } catch (error) {
      reject(error)
    }
  })
}


function isFileSystemAccessSupported() {
  return typeof window !== 'undefined'
    && typeof window.showDirectoryPicker === 'function'
    && typeof indexedDB !== 'undefined'
}

function sanitizeProjectBaseName(value) {
  const base = String(value || 'Untitled Shotlist')
    .trim()
    .replace(/[^a-z0-9_-]+/gi, '_')
    .replace(/^_+|_+$/g, '')
  return base || 'Untitled_Shotlist'
}

function browserFsaProjectPath(projectId, fileName) {
  return `${BROWSER_FSA_PROJECT_PREFIX}${projectId}/${fileName}`
}

function isBrowserFsaProjectPath(projectFilePath) {
  return typeof projectFilePath === 'string' && projectFilePath.startsWith(BROWSER_FSA_PROJECT_PREFIX)
}

function makeBrowserFsaProjectId() {
  return `fsa_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
}

function openBrowserFsaDb() {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null)
  return new Promise((resolve) => {
    const request = indexedDB.open(BROWSER_FSA_DB_NAME, BROWSER_FSA_DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(BROWSER_FSA_STORE)) db.createObjectStore(BROWSER_FSA_STORE, { keyPath: 'id' })
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => resolve(null)
  })
}

async function saveBrowserFsaProjectRecord(record) {
  const db = await openBrowserFsaDb()
  if (!db) return false
  return new Promise((resolve) => {
    const tx = db.transaction(BROWSER_FSA_STORE, 'readwrite')
    tx.objectStore(BROWSER_FSA_STORE).put(record)
    tx.oncomplete = () => resolve(true)
    tx.onerror = () => resolve(false)
  })
}

async function loadBrowserFsaProjectRecord(projectId) {
  const db = await openBrowserFsaDb()
  if (!db || !projectId) return null
  return new Promise((resolve) => {
    const tx = db.transaction(BROWSER_FSA_STORE, 'readonly')
    const request = tx.objectStore(BROWSER_FSA_STORE).get(projectId)
    request.onsuccess = () => resolve(request.result || null)
    request.onerror = () => resolve(null)
  })
}

async function ensureHandlePermission(handle, mode = 'readwrite') {
  if (!handle) return false
  const opts = { mode }
  if (typeof handle.queryPermission === 'function') {
    const current = await handle.queryPermission(opts)
    if (current === 'granted') return true
  }
  if (typeof handle.requestPermission === 'function') {
    return (await handle.requestPermission(opts)) === 'granted'
  }
  return true
}

async function setActiveBrowserFolderProject(record) {
  if (!record?.directoryHandle || !record?.fileHandle || !record?.assetDirHandle) return null
  const ok = await ensureHandlePermission(record.directoryHandle, 'readwrite')
  if (!ok) throw new Error('Folder permission was not granted.')
  activeBrowserFolderProject = record
  await saveBrowserFsaProjectRecord(record)
  return record
}

async function getActiveBrowserFolderProject(projectFilePath = null) {
  let projectId = activeBrowserFolderProject?.id || null
  if (isBrowserFsaProjectPath(projectFilePath)) {
    projectId = String(projectFilePath).slice(BROWSER_FSA_PROJECT_PREFIX.length).split('/')[0] || projectId
  }
  if (!activeBrowserFolderProject && projectId) activeBrowserFolderProject = await loadBrowserFsaProjectRecord(projectId)
  if (!activeBrowserFolderProject) return null
  const ok = await ensureHandlePermission(activeBrowserFolderProject.directoryHandle, 'readwrite')
  if (!ok) throw new Error('Folder permission was not granted.')
  return activeBrowserFolderProject
}

async function writeTextFileHandle(fileHandle, data) {
  const writable = await fileHandle.createWritable()
  await writable.write(String(data || ''))
  await writable.close()
}

async function readTextFileHandle(fileHandle) {
  const file = await fileHandle.getFile()
  return file.text()
}

async function dataToBlob(arrayBufferOrBase64, mime = 'application/octet-stream') {
  if (arrayBufferOrBase64 instanceof Blob) return arrayBufferOrBase64
  if (arrayBufferOrBase64 instanceof ArrayBuffer || ArrayBuffer.isView(arrayBufferOrBase64)) return new Blob([arrayBufferOrBase64], { type: mime })
  const value = String(arrayBufferOrBase64 || '')
  if (value.startsWith('data:')) return fetch(value).then((response) => response.blob())
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return new Blob([bytes], { type: mime })
}

async function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(reader.error || new Error('Could not read local asset'))
    reader.readAsDataURL(blob)
  })
}

function mimeFromFileName(fileName) {
  const lower = String(fileName || '').toLowerCase()
  if (lower.endsWith('.webp')) return 'image/webp'
  if (lower.endsWith('.png')) return 'image/png'
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg'
  if (lower.endsWith('.gif')) return 'image/gif'
  return 'application/octet-stream'
}

function sanitizeLocalAssetFileName(fileName) {
  const safe = String(fileName || 'asset.webp').split(/[\\/]/).pop().replace(/[^a-z0-9_.-]+/gi, '-')
  return safe || 'asset.webp'
}

async function chooseShotlistFileHandle(directoryHandle) {
  const shotlistFiles = []
  for await (const [name, handle] of directoryHandle.entries()) {
    if (handle.kind === 'file' && name.toLowerCase().endsWith('.shotlist')) shotlistFiles.push({ name, handle })
  }
  if (shotlistFiles.length === 0) throw new Error('No .shotlist file found in that folder.')
  if (shotlistFiles.length === 1) return shotlistFiles[0]
  const list = shotlistFiles.map((entry, index) => `${index + 1}. ${entry.name}`).join('\n')
  const selected = Number(window.prompt(`Choose a .shotlist file to open:\n\n${list}`, '1'))
  const entry = shotlistFiles[selected - 1]
  if (!entry) throw new Error('No .shotlist file selected.')
  return entry
}

async function openBrowserProjectFolder() {
  if (!isFileSystemAccessSupported()) return unsupportedResult('openLocalProjectFolder')
  const directoryHandle = await window.showDirectoryPicker({ mode: 'readwrite' })
  if (!(await ensureHandlePermission(directoryHandle, 'readwrite'))) return { success: false, cancelled: true, error: 'Folder permission was not granted.' }
  const { name: fileName, handle: fileHandle } = await chooseShotlistFileHandle(directoryHandle)
  const baseName = fileName.replace(/\.shotlist$/i, '')
  const assetDirHandle = await directoryHandle.getDirectoryHandle(`${baseName}.assets`, { create: true })
  const projectId = makeBrowserFsaProjectId()
  const record = { id: projectId, directoryHandle, fileHandle, assetDirHandle, fileName, folderName: directoryHandle.name, baseName }
  await setActiveBrowserFolderProject(record)
  const data = await readTextFileHandle(fileHandle)
  return { success: true, data, filePath: browserFsaProjectPath(projectId, fileName), fileName, projectId, folderName: directoryHandle.name, storageMode: 'browser-file-system-access' }
}

async function createBrowserProjectFolder(projectName, data) {
  if (!isFileSystemAccessSupported()) return unsupportedResult('createLocalProjectFolder')
  const directoryHandle = await window.showDirectoryPicker({ mode: 'readwrite' })
  if (!(await ensureHandlePermission(directoryHandle, 'readwrite'))) return { success: false, cancelled: true, error: 'Folder permission was not granted.' }
  const baseName = sanitizeProjectBaseName(projectName)
  const fileName = `${baseName}.shotlist`
  const fileHandle = await directoryHandle.getFileHandle(fileName, { create: true })
  const assetDirHandle = await directoryHandle.getDirectoryHandle(`${baseName}.assets`, { create: true })
  await writeTextFileHandle(fileHandle, data || '{}')
  const projectId = makeBrowserFsaProjectId()
  const record = { id: projectId, directoryHandle, fileHandle, assetDirHandle, fileName, folderName: directoryHandle.name, baseName }
  await setActiveBrowserFolderProject(record)
  return { success: true, filePath: browserFsaProjectPath(projectId, fileName), fileName, projectId, folderName: directoryHandle.name, storageMode: 'browser-file-system-access' }
}

async function saveBrowserFolderProject(filePath, data) {
  const project = await getActiveBrowserFolderProject(filePath)
  if (!project?.fileHandle) return unsupportedResult('saveBrowserFolderProject')
  await writeTextFileHandle(project.fileHandle, data)
  return { success: true, filePath: browserFsaProjectPath(project.id, project.fileName), fileName: project.fileName, projectId: project.id, storageMode: 'browser-file-system-access' }
}

async function importLooseFileIntoBrowserFolder(fileName, data) {
  if (!isFileSystemAccessSupported()) return unsupportedResult('importLooseFileIntoLocalProjectFolder')
  const directoryHandle = await window.showDirectoryPicker({ mode: 'readwrite' })
  if (!(await ensureHandlePermission(directoryHandle, 'readwrite'))) return { success: false, cancelled: true, error: 'Folder permission was not granted.' }
  const safeFileName = sanitizeProjectBaseName(String(fileName || 'Imported_Project').replace(/\.shotlist$/i, '')) + '.shotlist'
  const baseName = safeFileName.replace(/\.shotlist$/i, '')
  const fileHandle = await directoryHandle.getFileHandle(safeFileName, { create: true })
  const assetDirHandle = await directoryHandle.getDirectoryHandle(`${baseName}.assets`, { create: true })
  await writeTextFileHandle(fileHandle, data || '{}')
  const projectId = makeBrowserFsaProjectId()
  const record = { id: projectId, directoryHandle, fileHandle, assetDirHandle, fileName: safeFileName, folderName: directoryHandle.name, baseName }
  await setActiveBrowserFolderProject(record)
  return { success: true, filePath: browserFsaProjectPath(projectId, safeFileName), fileName: safeFileName, projectId, folderName: directoryHandle.name, storageMode: 'browser-file-system-access' }
}

/**
 * Single platform abstraction layer used by the renderer.
 * - Optional desktop bridges delegate via `window.electronAPI` when present.
 * - Browser fallbacks keep flows non-crashing for web deployments.
 */
export const platformService = {
  isDesktop: () => !!getElectronApi(),
  hasPrintToPDF: () => typeof getElectronApi()?.printToPDF === 'function',
  supportsFileSystemAccess: () => isFileSystemAccessSupported(),
  isBrowserFolderProjectPath,

  createLocalProjectFolder(projectName, data) {
    const api = getElectronApi()
    if (api?.createLocalProjectFolder) return api.createLocalProjectFolder(projectName, data)
    return createBrowserProjectFolder(projectName, data)
  },

  openLocalProjectFolder() {
    const api = getElectronApi()
    if (api?.openLocalProjectFolder) return api.openLocalProjectFolder()
    return openBrowserProjectFolder()
  },

  importLooseFileIntoLocalProjectFolder(fileName, data) {
    return importLooseFileIntoBrowserFolder(fileName, data)
  },

  saveBrowserFolderProject(filePath, data) {
    return saveBrowserFolderProject(filePath, data)
  },

  saveProject(defaultName, data) {
    const api = getElectronApi()
    if (api?.saveProject) {
      return api.saveProject(defaultName, data).then((result) => {
        logTelemetry('project_save_result', { method: 'desktop', success: !!result?.success, hasError: !!result?.error })
        return result
      })
    }
    const result = downloadTextFile(defaultName, data)
    logTelemetry('project_save_result', { method: 'browser-download', success: !!result?.success, hasError: !!result?.error })
    return Promise.resolve(result)
  },

  saveProjectSilent(filePath, data) {
    const api = getElectronApi()
    if (api?.saveProjectSilent) return api.saveProjectSilent(filePath, data)
    if (isBrowserFsaProjectPath(filePath)) return saveBrowserFolderProject(filePath, data)
    return Promise.resolve(unsupportedResult('saveProjectSilent'))
  },

  openProject() {
    const api = getElectronApi()
    if (api?.openProject) {
      return api.openProject().then((result) => {
        logTelemetry('project_open_result', { method: 'desktop', success: !!result?.success, cancelled: !!result?.cancelled, hasError: !!result?.error })
        return result
      })
    }
    return openJsonFilePicker().then((result) => {
      logTelemetry('project_open_result', { method: 'browser-picker', success: !!result?.success, cancelled: !!result?.cancelled, hasError: !!result?.error })
      return result
    })
  },

  async openProjectFromPath(filePath) {
    const api = getElectronApi()
    if (api?.openProjectFromPath) return api.openProjectFromPath(filePath)
    if (isBrowserFsaProjectPath(filePath)) {
      const project = await getActiveBrowserFolderProject(filePath)
      if (!project?.fileHandle) return unsupportedResult(`openProjectFromPath(${filePath})`)
      const data = await readTextFileHandle(project.fileHandle)
      return { success: true, data, filePath: browserFsaProjectPath(project.id, project.fileName), fileName: project.fileName, projectId: project.id, storageMode: 'browser-file-system-access' }
    }
    return Promise.resolve(unsupportedResult(`openProjectFromPath(${filePath})`))
  },


  async ensureProjectAssetFolder(projectFilePath) {
    const api = getElectronApi()
    if (api?.ensureProjectAssetFolder) return api.ensureProjectAssetFolder(projectFilePath)
    const project = await getActiveBrowserFolderProject(projectFilePath)
    if (project?.assetDirHandle) return { success: true, assetFolder: `${project.folderName}/${project.baseName}.assets`, storageMode: 'browser-file-system-access' }
    return unsupportedResult(`ensureProjectAssetFolder(${projectFilePath || 'unsaved'})`)
  },

  async writeLocalAsset(projectFilePath, fileName, arrayBufferOrBase64) {
    const api = getElectronApi()
    if (api?.writeLocalAsset) return api.writeLocalAsset(projectFilePath, fileName, arrayBufferOrBase64)
    const project = await getActiveBrowserFolderProject(projectFilePath)
    if (!project?.assetDirHandle) return unsupportedResult(`writeLocalAsset(${fileName || 'asset'})`)
    const safeFileName = sanitizeLocalAssetFileName(fileName)
    const blob = await dataToBlob(arrayBufferOrBase64, mimeFromFileName(safeFileName))
    const handle = await project.assetDirHandle.getFileHandle(safeFileName, { create: true })
    const writable = await handle.createWritable()
    await writable.write(blob)
    await writable.close()
    return { success: true, fileName: safeFileName, relativePath: safeFileName, bytes: blob.size, mime: blob.type || mimeFromFileName(safeFileName), storageMode: 'browser-file-system-access' }
  },

  async readLocalAsset(projectFilePath, relativePath) {
    const api = getElectronApi()
    if (api?.readLocalAsset) return api.readLocalAsset(projectFilePath, relativePath)
    const project = await getActiveBrowserFolderProject(projectFilePath)
    if (!project?.assetDirHandle) return unsupportedResult(`readLocalAsset(${relativePath || 'asset'})`)
    const safeFileName = sanitizeLocalAssetFileName(relativePath)
    const handle = await project.assetDirHandle.getFileHandle(safeFileName)
    const file = await handle.getFile()
    return { success: true, relativePath: safeFileName, dataUrl: await blobToDataUrl(file), bytes: file.size, mime: file.type || mimeFromFileName(safeFileName), storageMode: 'browser-file-system-access' }
  },

  async downloadUrlToLocalAsset(projectFilePath, url, suggestedFileName) {
    const api = getElectronApi()
    if (api?.downloadUrlToLocalAsset) return api.downloadUrlToLocalAsset(projectFilePath, url, suggestedFileName)
    const response = await fetch(url)
    if (!response.ok) return { success: false, error: `Image download failed (${response.status})` }
    const blob = await response.blob()
    return this.writeLocalAsset(projectFilePath, suggestedFileName || 'cloud-image.webp', blob)
  },

  revealProjectAssetsFolder(projectFilePath) {
    const api = getElectronApi()
    if (api?.revealProjectAssetsFolder) return api.revealProjectAssetsFolder(projectFilePath)
    return Promise.resolve(unsupportedResult(`revealProjectAssetsFolder(${projectFilePath || 'unsaved'})`))
  },

  printToPDF(htmlContent) {
    const api = getElectronApi()
    if (api?.printToPDF) return api.printToPDF(htmlContent)
    return Promise.resolve(unsupportedResult('printToPDF'))
  },

  savePDF(defaultName, buffer) {
    const api = getElectronApi()
    if (api?.savePDF) return api.savePDF(defaultName, buffer)
    return Promise.resolve(unsupportedResult('savePDF'))
  },

  savePNG(defaultName, base64) {
    const api = getElectronApi()
    if (api?.savePNG) return api.savePNG(defaultName, base64)
    return Promise.resolve(unsupportedResult('savePNG'))
  },

  saveJson(defaultName, data, filters) {
    const api = getElectronApi()
    if (api?.saveJson) {
      return api.saveJson(defaultName, data, filters).then((result) => {
        logTelemetry('json_export_result', { method: 'desktop', success: !!result?.success, hasError: !!result?.error })
        return result
      })
    }
    const result = downloadTextFile(defaultName, data)
    logTelemetry('json_export_result', { method: 'browser-download', success: !!result?.success, hasError: !!result?.error })
    return Promise.resolve(result)
  },

  openExternal(url) {
    const api = getElectronApi()
    if (api?.openExternal) return api.openExternal(url)
    window.open(url, '_blank', 'noopener,noreferrer')
    return Promise.resolve({ success: true })
  },

  revealFile(filePath) {
    const api = getElectronApi()
    if (api?.revealFile) return api.revealFile(filePath)
    return Promise.resolve(unsupportedResult(`revealFile(${filePath})`))
  },

  copyText(text) {
    const api = getElectronApi()
    if (api?.copyText) return api.copyText(text)
    if (navigator?.clipboard?.writeText) {
      return navigator.clipboard.writeText(String(text || ''))
        .then(() => ({ success: true }))
        .catch((error) => ({ success: false, error: error?.message || 'clipboard write failed' }))
    }
    return Promise.resolve(unsupportedResult('copyText'))
  },

  loadRecentProjects() {
    const parsed = readLocalStorageJson(RECENT_PROJECTS_KEY, [])
    return Array.isArray(parsed) ? parsed : []
  },

  saveRecentProjects(projects) {
    try {
      writeLocalStorageJson(RECENT_PROJECTS_KEY, Array.isArray(projects) ? projects : [])
    } catch {
      // Ignore unavailable storage in constrained browser contexts.
    }
  },

  saveAutosave(data) {
    try {
      writeLocalStorageJson(AUTOSAVE_KEY, data)
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(AUTOSAVE_TIME_KEY, new Date().toISOString())
      }
    } catch {
      // Ignore unavailable storage in constrained browser contexts.
    }
  },

  loadAutosave() {
    return {
      data: readLocalStorageJson(AUTOSAVE_KEY, null),
      savedAt: (typeof localStorage !== 'undefined') ? localStorage.getItem(AUTOSAVE_TIME_KEY) : null,
    }
  },

  ensureBrowserProjectId(existingId = null) {
    if (existingId) return existingId
    return `browser_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
  },

  saveBrowserProjectSnapshot(projectId, payload) {
    const id = this.ensureBrowserProjectId(projectId)
    try {
      writeLocalStorageJson(`${BROWSER_PROJECT_KEY_PREFIX}${id}`, payload)
      const index = readLocalStorageJson(BROWSER_PROJECT_INDEX_KEY, [])
      const nextIndex = Array.isArray(index) ? index.filter(entry => entry !== id) : []
      nextIndex.unshift(id)
      writeLocalStorageJson(BROWSER_PROJECT_INDEX_KEY, nextIndex.slice(0, 30))
    } catch {
      // Ignore unavailable storage in constrained browser contexts.
    }
    return id
  },

  loadBrowserProjectSnapshot(projectId) {
    if (!projectId) return null
    return readLocalStorageJson(`${BROWSER_PROJECT_KEY_PREFIX}${projectId}`, null)
  },
}

export { DESKTOP_ONLY_ERROR }
