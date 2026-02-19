import { create } from 'zustand'
import { arrayMove } from '@dnd-kit/sortable'

const CARD_COLORS = [
  '#4ade80', // green
  '#22d3ee', // cyan
  '#facc15', // yellow
  '#f87171', // red
  '#60a5fa', // blue
  '#fb923c', // orange
  '#c084fc', // purple
  '#f472b6', // pink
]

const DEFAULT_COLOR = '#4ade80'

let shotCounter = 0

function createShot(sceneNumber = 1, overrides = {}) {
  shotCounter++
  return {
    id: `shot_${Date.now()}_${shotCounter}`,
    sceneNumber,
    cameraName: 'Camera 1',
    focalLength: '85mm',
    color: DEFAULT_COLOR,
    image: null,
    specs: {
      size: 'WIDE SHOT',
      type: 'EYE LVL',
      move: 'STATIC',
      equip: 'STICKS',
    },
    notes: '',
    ...overrides,
  }
}

function getShotLetter(index) {
  if (index < 26) return String.fromCharCode(65 + index)
  const firstChar = String.fromCharCode(65 + Math.floor(index / 26) - 1)
  const secondChar = String.fromCharCode(65 + (index % 26))
  return firstChar + secondChar
}

function getSceneNumber(sceneLabel) {
  const match = sceneLabel.match(/\d+/)
  return match ? parseInt(match[0]) : 1
}

const useStore = create((set, get) => ({
  // Project metadata
  projectPath: null,
  projectName: 'Untitled Shotlist',
  lastSaved: null,

  // Page settings
  sceneLabel: 'SCENE 1',
  location: 'CLUB',
  intOrExt: 'INT',
  cameraName: 'Camera 1',
  cameraBody: 'fx30',
  pageNotes: '*NOTE: \n*SHOOT ORDER: ',

  // Global settings
  columnCount: 4,
  defaultFocalLength: '85mm',
  theme: 'light',
  autoSave: true,
  useDropdowns: true,

  // Shots
  shots: [],

  // Recent projects
  recentProjects: JSON.parse(localStorage.getItem('recentProjects') || '[]'),

  // UI state
  settingsOpen: false,
  contextMenu: null, // { shotId, x, y }
  colorPickerShotId: null,
  autoSaveTimer: null,

  // Computed: get shots with their display IDs
  getShotsWithIds: () => {
    const { shots, sceneLabel } = get()
    const sceneNum = getSceneNumber(sceneLabel)
    return shots.map((shot, index) => ({
      ...shot,
      displayId: `${sceneNum}${getShotLetter(index)}`,
    }))
  },

  // Shot actions
  addShot: () => {
    const { shots, sceneLabel, cameraName, defaultFocalLength } = get()
    const sceneNumber = getSceneNumber(sceneLabel)
    const newShot = createShot(sceneNumber, {
      cameraName,
      focalLength: defaultFocalLength,
      color: DEFAULT_COLOR,
    })
    set({ shots: [...shots, newShot] })
    get()._scheduleAutoSave()
  },

  deleteShot: (id) => {
    set(state => ({ shots: state.shots.filter(s => s.id !== id) }))
    get()._scheduleAutoSave()
  },

  duplicateShot: (id) => {
    const { shots } = get()
    const idx = shots.findIndex(s => s.id === id)
    if (idx === -1) return
    const original = shots[idx]
    shotCounter++
    const duplicate = {
      ...original,
      id: `shot_${Date.now()}_${shotCounter}`,
      notes: original.notes,
      image: original.image,
      specs: { ...original.specs },
    }
    const newShots = [
      ...shots.slice(0, idx + 1),
      duplicate,
      ...shots.slice(idx + 1),
    ]
    set({ shots: newShots })
    get()._scheduleAutoSave()
  },

  reorderShots: (activeId, overId) => {
    const { shots } = get()
    const oldIndex = shots.findIndex(s => s.id === activeId)
    const newIndex = shots.findIndex(s => s.id === overId)
    if (oldIndex === -1 || newIndex === -1) return
    set({ shots: arrayMove(shots, oldIndex, newIndex) })
    get()._scheduleAutoSave()
  },

  updateShot: (id, updates) => {
    set(state => ({
      shots: state.shots.map(s => s.id === id ? { ...s, ...updates } : s),
    }))
    get()._scheduleAutoSave()
  },

  updateShotSpec: (id, specKey, value) => {
    set(state => ({
      shots: state.shots.map(s =>
        s.id === id ? { ...s, specs: { ...s.specs, [specKey]: value } } : s
      ),
    }))
    get()._scheduleAutoSave()
  },

  updateShotNotes: (id, notes) => {
    set(state => ({
      shots: state.shots.map(s => s.id === id ? { ...s, notes } : s),
    }))
    get()._scheduleAutoSave()
  },

  updateShotColor: (id, color) => {
    set(state => ({
      shots: state.shots.map(s => s.id === id ? { ...s, color } : s),
    }))
    get()._scheduleAutoSave()
  },

  updateShotImage: (id, imageBase64) => {
    set(state => ({
      shots: state.shots.map(s => s.id === id ? { ...s, image: imageBase64 } : s),
    }))
    get()._scheduleAutoSave()
  },

  // Page/document settings
  setSceneLabel: (label) => { set({ sceneLabel: label }); get()._scheduleAutoSave() },
  setLocation: (location) => { set({ location }); get()._scheduleAutoSave() },
  setIntOrExt: (value) => { set({ intOrExt: value }); get()._scheduleAutoSave() },
  setCameraName: (name) => { set({ cameraName: name }); get()._scheduleAutoSave() },
  setCameraBody: (body) => { set({ cameraBody: body }); get()._scheduleAutoSave() },
  setPageNotes: (notes) => { set({ pageNotes: notes }); get()._scheduleAutoSave() },
  setProjectName: (name) => { set({ projectName: name }) },

  // Global settings
  setColumnCount: (count) => { set({ columnCount: count }) },
  setDefaultFocalLength: (fl) => { set({ defaultFocalLength: fl }) },
  setTheme: (theme) => { set({ theme }) },
  setAutoSave: (enabled) => { set({ autoSave: enabled }) },
  setUseDropdowns: (val) => { set({ useDropdowns: val }) },

  // UI actions
  toggleSettings: () => set(state => ({ settingsOpen: !state.settingsOpen })),
  closeSettings: () => set({ settingsOpen: false }),

  showContextMenu: (shotId, x, y) => set({ contextMenu: { shotId, x, y } }),
  hideContextMenu: () => set({ contextMenu: null }),

  showColorPicker: (shotId) => set({ colorPickerShotId: shotId }),
  hideColorPicker: () => set({ colorPickerShotId: null }),

  // Save / Load
  getProjectData: () => {
    const {
      projectName, sceneLabel, location, intOrExt,
      cameraName, cameraBody, pageNotes, columnCount,
      defaultFocalLength, theme, autoSave, useDropdowns, shots,
    } = get()
    return {
      version: 1,
      projectName, sceneLabel, location, intOrExt,
      cameraName, cameraBody, pageNotes, columnCount,
      defaultFocalLength, theme, autoSave, useDropdowns,
      shots: shots.map(s => ({ ...s })),
      exportedAt: new Date().toISOString(),
    }
  },

  saveProject: async () => {
    const data = get().getProjectData()
    const totalSize = JSON.stringify(data).length
    if (totalSize > 50 * 1024 * 1024) {
      alert('Warning: Project file exceeds 50MB due to embedded images. Consider removing some images.')
    }
    const json = JSON.stringify(data, null, 2)
    const defaultName = `${data.projectName.replace(/[^a-z0-9]/gi, '_')}.shotlist`

    if (window.electronAPI) {
      // Native desktop: use system Save dialog
      const result = await window.electronAPI.saveProject(defaultName, json)
      if (result.success) {
        set({ lastSaved: new Date().toISOString(), projectPath: result.filePath })
      }
    } else {
      // Browser fallback: trigger download
      const blob = new Blob([json], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = defaultName
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      set({ lastSaved: new Date().toISOString() })
    }
  },

  loadProject: (data) => {
    const {
      projectName, sceneLabel, location, intOrExt,
      cameraName, cameraBody, pageNotes, columnCount,
      defaultFocalLength, theme, autoSave, useDropdowns, shots,
    } = data
    set({
      projectName: projectName || 'Untitled Shotlist',
      sceneLabel: sceneLabel || 'SCENE 1',
      location: location || 'LOCATION',
      intOrExt: intOrExt || 'INT',
      cameraName: cameraName || 'Camera 1',
      cameraBody: cameraBody || 'fx30',
      pageNotes: pageNotes || '',
      columnCount: columnCount || 4,
      defaultFocalLength: defaultFocalLength || '85mm',
      theme: theme || 'light',
      autoSave: autoSave !== undefined ? autoSave : true,
      useDropdowns: useDropdowns !== undefined ? useDropdowns : true,
      shots: (shots || []).map(s => ({
        id: s.id || `shot_${Date.now()}_${++shotCounter}`,
        sceneNumber: s.sceneNumber || 1,
        cameraName: s.cameraName || 'Camera 1',
        focalLength: s.focalLength || '85mm',
        color: s.color || DEFAULT_COLOR,
        image: s.image || null,
        specs: s.specs || { size: '', type: '', move: '', equip: '' },
        notes: s.notes || '',
      })),
      lastSaved: new Date().toISOString(),
    })
  },

  openProject: async () => {
    if (window.electronAPI) {
      // Native desktop: use system Open dialog
      const result = await window.electronAPI.openProject()
      if (!result.success) return
      try {
        const data = JSON.parse(result.data)
        get().loadProject(data)
        const fileName = result.filePath.split(/[\\/]/).pop()
        const recent = get().recentProjects.filter(r => r.path !== result.filePath)
        const newRecent = [
          { name: fileName, path: result.filePath, date: new Date().toISOString(), shots: data.shots?.length || 0 },
          ...recent,
        ].slice(0, 10)
        set({ recentProjects: newRecent, projectPath: result.filePath })
        localStorage.setItem('recentProjects', JSON.stringify(newRecent))
      } catch {
        alert('Failed to load project: Invalid file format')
      }
    } else {
      // Browser fallback: file input
      const input = document.createElement('input')
      input.type = 'file'
      input.accept = '.shotlist,.json'
      input.onchange = (e) => {
        const file = e.target.files[0]
        if (!file) return
        const reader = new FileReader()
        reader.onload = (ev) => {
          try {
            const data = JSON.parse(ev.target.result)
            get().loadProject(data)
            const recent = get().recentProjects.filter(r => r.name !== file.name)
            const newRecent = [
              { name: file.name, path: file.name, date: new Date().toISOString(), shots: data.shots?.length || 0 },
              ...recent,
            ].slice(0, 10)
            set({ recentProjects: newRecent })
            localStorage.setItem('recentProjects', JSON.stringify(newRecent))
          } catch {
            alert('Failed to load project: Invalid file format')
          }
        }
        reader.readAsText(file)
      }
      document.body.appendChild(input)
      input.click()
      document.body.removeChild(input)
    }
  },

  openProjectFromPath: async (filePath) => {
    if (!window.electronAPI) return
    const result = await window.electronAPI.openProjectFromPath(filePath)
    if (!result.success) {
      alert(`Could not open file: ${result.error || 'File not found'}`)
      return
    }
    try {
      const data = JSON.parse(result.data)
      get().loadProject(data)
      const fileName = filePath.split(/[\\/]/).pop()
      const recent = get().recentProjects.filter(r => r.path !== filePath)
      const newRecent = [
        { name: fileName, path: filePath, date: new Date().toISOString(), shots: data.shots?.length || 0 },
        ...recent,
      ].slice(0, 10)
      set({ recentProjects: newRecent, projectPath: filePath })
      localStorage.setItem('recentProjects', JSON.stringify(newRecent))
    } catch {
      alert('Failed to load project: Invalid file format')
    }
  },

  newProject: () => {
    const name = prompt('Scene name:', 'SCENE 1')
    if (name === null) return
    set({
      projectName: name,
      sceneLabel: name.toUpperCase(),
      location: 'LOCATION',
      intOrExt: 'INT',
      cameraName: 'Camera 1',
      cameraBody: 'fx30',
      pageNotes: '*NOTE: \n*SHOOT ORDER: ',
      shots: [],
      projectPath: null,
      lastSaved: null,
    })
  },

  // Auto-save
  _autoSaveTimeout: null,
  _scheduleAutoSave: () => {
    const state = get()
    if (!state.autoSave) return
    if (state._autoSaveTimeout) clearTimeout(state._autoSaveTimeout)
    const timeout = setTimeout(() => {
      const data = get().getProjectData()
      localStorage.setItem('autosave', JSON.stringify(data))
      localStorage.setItem('autosave_time', new Date().toISOString())
    }, 60000)
    set({ _autoSaveTimeout: timeout })
  },

  CARD_COLORS,
}))

export default useStore
