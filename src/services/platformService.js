import { logTelemetry } from '../utils/telemetry'

const DESKTOP_ONLY_ERROR = 'Desktop-only capability is unavailable in this environment.'
const AUTOSAVE_KEY = 'autosave'
const AUTOSAVE_TIME_KEY = 'autosave_time'
const RECENT_PROJECTS_KEY = 'recentProjects'
const BROWSER_PROJECT_INDEX_KEY = 'browserProjectIndex'
const BROWSER_PROJECT_KEY_PREFIX = 'browserProject:'

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

/**
 * Single platform abstraction layer used by the renderer.
 * - Optional desktop bridges delegate via `window.electronAPI` when present.
 * - Browser fallbacks keep flows non-crashing for web deployments.
 */
export const platformService = {
  isDesktop: () => !!getElectronApi(),
  hasPrintToPDF: () => typeof getElectronApi()?.printToPDF === 'function',

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

  openProjectFromPath(filePath) {
    const api = getElectronApi()
    if (api?.openProjectFromPath) return api.openProjectFromPath(filePath)
    return Promise.resolve(unsupportedResult(`openProjectFromPath(${filePath})`))
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
