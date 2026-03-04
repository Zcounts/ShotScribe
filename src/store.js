import { create } from 'zustand'
import { arrayMove } from '@dnd-kit/sortable'

export const CARD_COLORS = [
  '#4ade80', // green
  '#22d3ee', // cyan
  '#facc15', // yellow
  '#f87171', // red
  '#60a5fa', // blue
  '#fb923c', // orange
  '#c084fc', // purple
  '#f472b6', // pink
]

export const DEFAULT_COLUMN_CONFIG = [
  { key: 'checked',        visible: true },
  { key: 'displayId',      visible: true },
  { key: '__int__',        visible: true },
  { key: '__dn__',         visible: true },
  { key: 'subject',        visible: true },
  { key: 'specs.type',     visible: true },
  { key: 'focalLength',    visible: true },
  { key: 'specs.equip',    visible: true },
  { key: 'specs.move',     visible: true },
  { key: 'specs.size',     visible: true },
  { key: 'notes',          visible: true },
  { key: 'scriptTime',     visible: true },
  { key: 'setupTime',      visible: true },
  { key: 'predictedTakes', visible: true },
  { key: 'shootTime',      visible: true },
  { key: 'takeNumber',     visible: true },
]

export const DEFAULT_SCHEDULE_COLUMN_CONFIG = [
  { key: 'image',              visible: true,  label: 'Storyboard Image' },
  { key: 'notes',              visible: true,  label: 'Notes' },
  { key: 'shootingLocation',   visible: true,  label: 'Shooting Location' },
  { key: 'castMembers',        visible: true,  label: 'Cast' },
  { key: 'estimatedShootTime', visible: true,  label: 'Shoot Time' },
  { key: 'estimatedSetupTime', visible: true,  label: 'Setup Time' },
  { key: 'projectedTime',      visible: true,  label: 'Estimated Time' },
]

const DEFAULT_COLOR = '#4ade80'

let shotCounter = 0
let sceneIdCounter = 0
let dayIdCounter = 0
let blockIdCounter = 0

function createShot(overrides = {}) {
  shotCounter++
  return {
    id: `shot_${Date.now()}_${shotCounter}`,
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
    subject: '',
    checked: false,
    // Per-shot I/E and D/N (shotlist-only; scene heading uses scene.intOrExt/dayNight)
    intOrExt: '',
    dayNight: '',
    // AD-specific shotlist fields (not shown in storyboard view)
    scriptTime: '',
    setupTime: '',
    predictedTakes: '',
    shootTime: '',
    takeNumber: '',
    ...overrides,
  }
}

function createScene(overrides = {}) {
  sceneIdCounter++
  return {
    id: `scene_${Date.now()}_${sceneIdCounter}`,
    sceneLabel: 'SCENE',
    location: 'LOCATION',
    intOrExt: 'INT',
    dayNight: 'DAY',
    cameras: [{ name: 'Camera 1', body: 'fx30' }],
    pageNotes: '*NOTE: \n*SHOOT ORDER: ',
    shots: [],
    ...overrides,
  }
}

// Valid shot letters: A-Z excluding I (confused with 1), O (confused with 0), S (confused with 5)
const VALID_SHOT_LETTERS = 'ABCDEFGHJKLMNPQRTUVWXYZ' // 23 letters

function getShotLetter(index) {
  const n = VALID_SHOT_LETTERS.length // 23
  if (index < n) return VALID_SHOT_LETTERS[index]
  // Double-letter format (AA, AB, ...) also skipping I, O, S in both positions
  const adjusted = index - n
  const firstIdx = Math.floor(adjusted / n)
  const secondIdx = adjusted % n
  return VALID_SHOT_LETTERS[firstIdx] + VALID_SHOT_LETTERS[secondIdx]
}

const initialScene = createScene({
  id: 'scene_1',
  sceneLabel: 'SCENE 1',
  location: 'CLUB',
  intOrExt: 'INT',
  cameras: [{ name: 'Camera 1', body: 'fx30' }],
})
// Reset counter after initial scene so user-added scenes don't conflict
sceneIdCounter = 0

const useStore = create((set, get) => ({
  // Project metadata
  projectPath: null,
  projectName: 'Untitled Shotlist',
  lastSaved: null,

  // Scenes (multi-scene support)
  scenes: [initialScene],

  // Global settings
  columnCount: 4,
  defaultFocalLength: '85mm',
  theme: 'light',
  autoSave: true,
  useDropdowns: true,

  // Recent projects
  recentProjects: JSON.parse(localStorage.getItem('recentProjects') || '[]'),

  // Schedule — array of shooting days, each with a list of shot blocks that
  // reference shots by ID so they stay linked to the storyboard/shotlist.
  // Shape: [{ id, date, shotBlocks: [{ id, shotId, estimatedShootTime,
  //           estimatedSetupTime, shootingLocation, castMembers }] }]
  schedule: [],

  // UI state
  settingsOpen: false,
  contextMenu: null, // { shotId, sceneId, x, y }
  activeTab: 'storyboard', // 'storyboard' | 'shotlist' | 'schedule'
  shotlistColumnConfig: DEFAULT_COLUMN_CONFIG,
  scheduleColumnConfig: DEFAULT_SCHEDULE_COLUMN_CONFIG,

  // Custom columns and dropdown options
  customColumns: [], // [{ key, label, fieldType: 'text'|'dropdown' }]
  customDropdownOptions: {}, // { fieldKey: ['option1', 'option2', ...] }

  // ── Schedule helpers ─────────────────────────────────────────────────

  // Returns the full schedule with each shot block enriched by live data
  // pulled from the linked shot and its parent scene.  This means any edits
  // on the Storyboard or Shotlist are immediately reflected in the Schedule
  // without duplicating data in the store.
  getScheduleWithShots: () => {
    const { schedule, scenes } = get()

    // Build a map: shotId → { shot, scene, displayId }
    const shotMap = new Map()
    scenes.forEach((scene, sceneIdx) => {
      scene.shots.forEach((shot, shotIdx) => {
        shotMap.set(shot.id, {
          shot,
          scene,
          displayId: `${sceneIdx + 1}${getShotLetter(shotIdx)}`,
        })
      })
    })

    return schedule.map(day => ({
      ...day,
      shotBlocks: day.shotBlocks.map(block => {
        const found = shotMap.get(block.shotId)
        return {
          ...block,
          // Null when the referenced shot has been deleted
          shotData: found ? {
            displayId: found.displayId,
            subject: found.shot.subject,
            notes: found.shot.notes,
            intOrExt: found.shot.intOrExt || found.scene.intOrExt,
            dayNight: found.shot.dayNight || found.scene.dayNight,
            sceneLabel: found.scene.sceneLabel,
            location: found.scene.location,
            image: found.shot.image || null,
          } : null,
        }
      }),
    }))
  },

  // ── Schedule actions ─────────────────────────────────────────────────

  addShootingDay: (overrides = {}) => {
    dayIdCounter++
    const day = {
      id: `day_${Date.now()}_${dayIdCounter}`,
      date: '',
      startTime: '',
      basecamp: '',
      shotBlocks: [],
      ...overrides,
    }
    set(state => ({ schedule: [...state.schedule, day] }))
    get()._scheduleAutoSave()
    return day.id
  },

  addBreakBlock: (dayId, name = 'Break', durationMins = 0) => {
    blockIdCounter++
    const block = {
      id: `block_${Date.now()}_${blockIdCounter}`,
      type: 'break',
      breakName: name,
      breakDuration: durationMins,
    }
    set(state => ({
      schedule: state.schedule.map(d =>
        d.id === dayId ? { ...d, shotBlocks: [...d.shotBlocks, block] } : d
      ),
    }))
    get()._scheduleAutoSave()
    return block.id
  },

  removeShootingDay: (dayId) => {
    set(state => ({ schedule: state.schedule.filter(d => d.id !== dayId) }))
    get()._scheduleAutoSave()
  },

  updateShootingDay: (dayId, updates) => {
    set(state => ({
      schedule: state.schedule.map(d => d.id === dayId ? { ...d, ...updates } : d),
    }))
    get()._scheduleAutoSave()
  },

  addShotBlock: (dayId, shotId) => {
    blockIdCounter++
    const block = {
      id: `block_${Date.now()}_${blockIdCounter}`,
      shotId,
      estimatedShootTime: '',
      estimatedSetupTime: '',
      shootingLocation: '',
      castMembers: [],
    }
    set(state => ({
      schedule: state.schedule.map(d =>
        d.id === dayId ? { ...d, shotBlocks: [...d.shotBlocks, block] } : d
      ),
    }))
    get()._scheduleAutoSave()
    return block.id
  },

  removeShotBlock: (dayId, blockId) => {
    set(state => ({
      schedule: state.schedule.map(d =>
        d.id === dayId
          ? { ...d, shotBlocks: d.shotBlocks.filter(b => b.id !== blockId) }
          : d
      ),
    }))
    get()._scheduleAutoSave()
  },

  updateShotBlock: (dayId, blockId, updates) => {
    set(state => ({
      schedule: state.schedule.map(d =>
        d.id === dayId
          ? { ...d, shotBlocks: d.shotBlocks.map(b => b.id === blockId ? { ...b, ...updates } : b) }
          : d
      ),
    }))
    get()._scheduleAutoSave()
  },

  reorderDays: (activeDayId, overDayId) => {
    set(state => {
      const oldIdx = state.schedule.findIndex(d => d.id === activeDayId)
      const newIdx = state.schedule.findIndex(d => d.id === overDayId)
      if (oldIdx === -1 || newIdx === -1) return state
      return { schedule: arrayMove(state.schedule, oldIdx, newIdx) }
    })
    get()._scheduleAutoSave()
  },

  // Commits a multi-container DnD drag result in one atomic update.
  // dayUpdates: [{ id: dayId, shotBlocks: block[] }]
  applyScheduleDrag: (dayUpdates) => {
    set(state => ({
      schedule: state.schedule.map(d => {
        const update = dayUpdates.find(u => u.id === d.id)
        return update ? { ...d, shotBlocks: update.shotBlocks } : d
      }),
    }))
    get()._scheduleAutoSave()
  },

  // ── Scene helpers ────────────────────────────────────────────────────

  getScene: (sceneId) => get().scenes.find(s => s.id === sceneId),

  // Returns shots for a scene with computed displayIds.
  // Scene number is always derived from the scene's position in the scenes array
  // (index 0 → Scene 1, index 1 → Scene 2, etc.) — never from the sceneLabel text,
  // which is editable and can be out of sync.
  getShotsForScene: (sceneId) => {
    const scenes = get().scenes
    const sceneIndex = scenes.findIndex(s => s.id === sceneId)
    if (sceneIndex === -1) return []
    const scene = scenes[sceneIndex]
    const sceneNum = sceneIndex + 1
    return scene.shots.map((shot, index) => ({
      ...shot,
      displayId: `${sceneNum}${getShotLetter(index)}`,
    }))
  },

  // Total shot count across all scenes (for toolbar)
  getTotalShots: () => get().scenes.reduce((acc, s) => acc + s.shots.length, 0),

  // ── Scene actions ────────────────────────────────────────────────────

  addScene: (overrides = {}) => {
    const currentScenes = get().scenes
    const sceneNum = currentScenes.length + 1
    const scene = createScene({ sceneLabel: `SCENE ${sceneNum}`, ...overrides })
    set(state => ({ scenes: [...state.scenes, scene] }))
    get()._scheduleAutoSave()
    return scene.id
  },

  deleteScene: (sceneId) => {
    set(state => {
      if (state.scenes.length <= 1) return state
      const scene = state.scenes.find(s => s.id === sceneId)
      const deletedShotIds = new Set(scene ? scene.shots.map(sh => sh.id) : [])
      return {
        scenes: state.scenes.filter(s => s.id !== sceneId),
        // Remove any schedule blocks that reference shots from the deleted scene
        schedule: state.schedule.map(day => ({
          ...day,
          shotBlocks: day.shotBlocks.filter(b => !deletedShotIds.has(b.shotId)),
        })),
      }
    })
    get()._scheduleAutoSave()
  },

  updateScene: (sceneId, updates) => {
    set(state => ({
      scenes: state.scenes.map(s => s.id === sceneId ? { ...s, ...updates } : s),
    }))
    get()._scheduleAutoSave()
  },

  // ── Shot actions (most work by shotId, searching across all scenes) ──

  addShot: (sceneId) => {
    const { scenes, defaultFocalLength } = get()
    const scene = scenes.find(s => s.id === sceneId)
    if (!scene) return
    const newShot = createShot({
      cameraName: scene.cameras?.[0]?.name || 'Camera 1',
      focalLength: defaultFocalLength,
      color: DEFAULT_COLOR,
      intOrExt: scene.intOrExt || '',
      dayNight: scene.dayNight || '',
    })
    set(state => ({
      scenes: state.scenes.map(s =>
        s.id === sceneId ? { ...s, shots: [...s.shots, newShot] } : s
      ),
    }))
    get()._scheduleAutoSave()
  },

  deleteShot: (shotId) => {
    set(state => ({
      scenes: state.scenes.map(s => ({
        ...s,
        shots: s.shots.filter(sh => sh.id !== shotId),
      })),
    }))
    get()._scheduleAutoSave()
  },

  duplicateShot: (shotId) => {
    set(state => ({
      scenes: state.scenes.map(scene => {
        const idx = scene.shots.findIndex(s => s.id === shotId)
        if (idx === -1) return scene
        shotCounter++
        const original = scene.shots[idx]
        const duplicate = {
          ...original,
          id: `shot_${Date.now()}_${shotCounter}`,
          specs: { ...original.specs },
        }
        return {
          ...scene,
          shots: [
            ...scene.shots.slice(0, idx + 1),
            duplicate,
            ...scene.shots.slice(idx + 1),
          ],
        }
      }),
    }))
    get()._scheduleAutoSave()
  },

  reorderShots: (sceneId, activeId, overId) => {
    set(state => ({
      scenes: state.scenes.map(scene => {
        if (scene.id !== sceneId) return scene
        const oldIndex = scene.shots.findIndex(s => s.id === activeId)
        const newIndex = scene.shots.findIndex(s => s.id === overId)
        if (oldIndex === -1 || newIndex === -1) return scene
        return { ...scene, shots: arrayMove(scene.shots, oldIndex, newIndex) }
      }),
    }))
    get()._scheduleAutoSave()
  },

  updateShot: (shotId, updates) => {
    set(state => ({
      scenes: state.scenes.map(s => ({
        ...s,
        shots: s.shots.map(sh => sh.id === shotId ? { ...sh, ...updates } : sh),
      })),
    }))
    get()._scheduleAutoSave()
  },

  updateShotSpec: (shotId, specKey, value) => {
    set(state => ({
      scenes: state.scenes.map(s => ({
        ...s,
        shots: s.shots.map(sh =>
          sh.id === shotId ? { ...sh, specs: { ...sh.specs, [specKey]: value } } : sh
        ),
      })),
    }))
    get()._scheduleAutoSave()
  },

  updateShotNotes: (shotId, notes) => {
    set(state => ({
      scenes: state.scenes.map(s => ({
        ...s,
        shots: s.shots.map(sh => sh.id === shotId ? { ...sh, notes } : sh),
      })),
    }))
    get()._scheduleAutoSave()
  },

  updateShotColor: (shotId, color) => {
    set(state => ({
      scenes: state.scenes.map(s => ({
        ...s,
        shots: s.shots.map(sh => sh.id === shotId ? { ...sh, color } : sh),
      })),
    }))
    get()._scheduleAutoSave()
  },

  updateShotImage: (shotId, imageBase64) => {
    set(state => ({
      scenes: state.scenes.map(s => ({
        ...s,
        shots: s.shots.map(sh => sh.id === shotId ? { ...sh, image: imageBase64 } : sh),
      })),
    }))
    get()._scheduleAutoSave()
  },

  // ── Global settings ──────────────────────────────────────────────────

  setColumnCount: (count) => set({ columnCount: count }),
  setDefaultFocalLength: (fl) => set({ defaultFocalLength: fl }),
  setTheme: (theme) => set({ theme }),
  setAutoSave: (enabled) => set({ autoSave: enabled }),
  setUseDropdowns: (val) => set({ useDropdowns: val }),
  setProjectName: (name) => set({ projectName: name }),

  // ── UI actions ───────────────────────────────────────────────────────

  toggleSettings: () => set(state => ({ settingsOpen: !state.settingsOpen })),
  closeSettings: () => set({ settingsOpen: false }),
  setActiveTab: (tab) => set({ activeTab: tab }),
  setShotlistColumnConfig: (config) => {
    set({ shotlistColumnConfig: config })
    get()._scheduleAutoSave()
  },

  setScheduleColumnConfig: (config) => {
    set({ scheduleColumnConfig: config })
    get()._scheduleAutoSave()
  },

  addCustomColumn: (label, fieldType) => {
    const key = `custom_${Date.now()}`
    const col = { key, label, fieldType: fieldType || 'text' }
    set(state => ({
      customColumns: [...state.customColumns, col],
      shotlistColumnConfig: [...state.shotlistColumnConfig, { key, visible: true }],
    }))
    get()._scheduleAutoSave()
  },

  removeCustomColumn: (key) => {
    set(state => ({
      customColumns: state.customColumns.filter(c => c.key !== key),
      shotlistColumnConfig: state.shotlistColumnConfig.filter(c => c.key !== key),
    }))
    get()._scheduleAutoSave()
  },

  addCustomDropdownOption: (field, option) => {
    set(state => {
      const current = state.customDropdownOptions[field] || []
      if (current.includes(option)) return state
      return {
        customDropdownOptions: {
          ...state.customDropdownOptions,
          [field]: [...current, option],
        },
      }
    })
    get()._scheduleAutoSave()
  },

  showContextMenu: (shotId, sceneId, x, y) => set({ contextMenu: { shotId, sceneId, x, y } }),
  hideContextMenu: () => set({ contextMenu: null }),

  // ── Save / Load ──────────────────────────────────────────────────────

  getProjectData: () => {
    const {
      projectName, columnCount, defaultFocalLength,
      theme, autoSave, useDropdowns, scenes, shotlistColumnConfig,
      customColumns, customDropdownOptions, schedule, scheduleColumnConfig,
    } = get()
    return {
      version: 2,
      projectName,
      columnCount,
      defaultFocalLength,
      theme,
      autoSave,
      useDropdowns,
      shotlistColumnConfig,
      scheduleColumnConfig,
      customColumns,
      customDropdownOptions,
      // Scenes and shots are reconstructed field-by-field so that any
      // non-serializable value that accidentally landed in state (e.g. a DOM
      // event object spread via an overrides parameter) is stripped before
      // reaching JSON.stringify.  Custom columns use a 'custom_' key prefix
      // and are preserved via an explicit pass over the shot's keys.
      scenes: scenes.map(scene => {
        const shots = scene.shots.map(s => {
          const shot = {
            id: s.id,
            cameraName: s.cameraName,
            focalLength: s.focalLength,
            color: s.color,
            image: s.image,
            specs: s.specs
              ? { size: s.specs.size, type: s.specs.type, move: s.specs.move, equip: s.specs.equip }
              : { size: '', type: '', move: '', equip: '' },
            notes: s.notes,
            subject: s.subject,
            checked: s.checked,
            intOrExt: s.intOrExt,
            dayNight: s.dayNight,
            scriptTime: s.scriptTime,
            setupTime: s.setupTime,
            predictedTakes: s.predictedTakes,
            shootTime: s.shootTime,
            takeNumber: s.takeNumber,
          }
          for (const key of Object.keys(s)) {
            if (key.startsWith('custom_')) shot[key] = s[key]
          }
          return shot
        })
        return {
          id: scene.id,
          sceneLabel: scene.sceneLabel,
          location: scene.location,
          intOrExt: scene.intOrExt,
          dayNight: scene.dayNight,
          cameras: scene.cameras,
          pageNotes: scene.pageNotes,
          shots,
        }
      }),
      // Schedule blocks are also reconstructed explicitly for the same reason.
      schedule: schedule.map(day => ({
        id: day.id,
        date: day.date,
        startTime: day.startTime,
        basecamp: day.basecamp,
        shotBlocks: (day.shotBlocks || []).map(b =>
          b.type === 'break'
            ? { id: b.id, type: b.type, breakName: b.breakName, breakDuration: b.breakDuration }
            : {
                id: b.id,
                shotId: b.shotId,
                estimatedShootTime: b.estimatedShootTime,
                estimatedSetupTime: b.estimatedSetupTime,
                shootingLocation: b.shootingLocation,
                castMembers: Array.isArray(b.castMembers) ? [...b.castMembers] : [],
              }
        ),
      })),
      exportedAt: new Date().toISOString(),
    }
  },

  // "Save" — overwrites the current file silently if a path is known;
  // falls back to a Save As dialog when the project has never been saved.
  saveProject: async () => {
    let data, json
    try {
      data = get().getProjectData()
      json = JSON.stringify(data, null, 2)
    } catch (err) {
      // Try each top-level field individually to surface which one contains
      // the non-serializable value, making future debugging much easier.
      let badField = null
      if (data) {
        for (const key of Object.keys(data)) {
          try { JSON.stringify(data[key]) } catch { badField = key; break }
        }
      }
      const hint = badField ? `\n\nProblematic field: "${badField}"` : ''
      alert(`Save failed: could not serialize project data.${hint}\n\n${err.message}`)
      return
    }

    if (json.length > 50 * 1024 * 1024) {
      alert('Warning: Project file exceeds 50MB due to embedded images. Consider removing some images.')
    }

    const defaultName = `${data.projectName.replace(/[^a-z0-9]/gi, '_')}.shotlist`
    const existingPath = get().projectPath

    if (window.electronAPI) {
      try {
        let result
        if (existingPath) {
          result = await window.electronAPI.saveProjectSilent(existingPath, json)
        } else {
          result = await window.electronAPI.saveProject(defaultName, json)
        }
        if (result.success) {
          set({ lastSaved: new Date().toISOString(), projectPath: result.filePath })
        } else if (result.error) {
          alert(`Save failed: ${result.error}`)
        }
        // result.success === false with no error means user cancelled the dialog — no message needed
      } catch (err) {
        alert(`Save failed: ${err.message}`)
      }
    } else {
      try {
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
      } catch (err) {
        alert(`Save failed: ${err.message}`)
      }
    }
  },

  // "Save As" — always opens a file dialog and updates projectPath on success.
  saveProjectAs: async () => {
    let data, json
    try {
      data = get().getProjectData()
      json = JSON.stringify(data, null, 2)
    } catch (err) {
      let badField = null
      if (data) {
        for (const key of Object.keys(data)) {
          try { JSON.stringify(data[key]) } catch { badField = key; break }
        }
      }
      const hint = badField ? `\n\nProblematic field: "${badField}"` : ''
      alert(`Save failed: could not serialize project data.${hint}\n\n${err.message}`)
      return
    }

    if (json.length > 50 * 1024 * 1024) {
      alert('Warning: Project file exceeds 50MB due to embedded images. Consider removing some images.')
    }

    const defaultName = `${data.projectName.replace(/[^a-z0-9]/gi, '_')}.shotlist`

    if (window.electronAPI) {
      try {
        const result = await window.electronAPI.saveProject(defaultName, json)
        if (result.success) {
          set({ lastSaved: new Date().toISOString(), projectPath: result.filePath })
        } else if (result.error) {
          alert(`Save failed: ${result.error}`)
        }
      } catch (err) {
        alert(`Save failed: ${err.message}`)
      }
    } else {
      try {
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
      } catch (err) {
        alert(`Save failed: ${err.message}`)
      }
    }
  },

  loadProject: (data) => {
    const {
      projectName, columnCount, defaultFocalLength,
      theme, autoSave, useDropdowns,
    } = data

    const loadedCustomColumns = data.customColumns || []
    const loadedCustomDropdownOptions = data.customDropdownOptions || {}

    const mapShot = (s, sceneIntOrExt, sceneDayNight) => ({
      id: s.id || `shot_${Date.now()}_${++shotCounter}`,
      cameraName: s.cameraName || 'Camera 1',
      focalLength: s.focalLength || '85mm',
      color: s.color || DEFAULT_COLOR,
      image: s.image || null,
      specs: s.specs || { size: '', type: '', move: '', equip: '' },
      notes: s.notes || '',
      subject: s.subject || '',
      checked: s.checked || false,
      // Per-shot I/E and D/N: use saved value if present, else inherit from scene (migration)
      intOrExt: s.intOrExt !== undefined ? s.intOrExt : (sceneIntOrExt || ''),
      dayNight: s.dayNight !== undefined ? s.dayNight : (sceneDayNight || ''),
      scriptTime: s.scriptTime || '',
      setupTime: s.setupTime || '',
      predictedTakes: s.predictedTakes || '',
      shootTime: s.shootTime || '',
      takeNumber: s.takeNumber || '',
      // Preserve any extra fields (e.g. custom columns)
      ...Object.fromEntries(
        Object.entries(s).filter(([k]) => k.startsWith('custom_'))
      ),
    })

    let scenes
    if (data.scenes && Array.isArray(data.scenes)) {
      // New multi-scene format (v2)
      scenes = data.scenes.map(scene => ({
        id: scene.id || `scene_${Date.now()}_${++sceneIdCounter}`,
        sceneLabel: scene.sceneLabel || 'SCENE 1',
        location: scene.location || 'LOCATION',
        intOrExt: scene.intOrExt || 'INT',
        dayNight: scene.dayNight || 'DAY',
        cameras: scene.cameras || [{ name: scene.cameraName || 'Camera 1', body: scene.cameraBody || 'fx30' }],
        pageNotes: scene.pageNotes || '',
        shots: (scene.shots || []).map(s => mapShot(s, scene.intOrExt, scene.dayNight)),
      }))
    } else {
      // Old single-scene format (v1) – migrate
      scenes = [createScene({
        id: 'scene_1',
        sceneLabel: data.sceneLabel || 'SCENE 1',
        location: data.location || 'LOCATION',
        intOrExt: data.intOrExt || 'INT',
        dayNight: data.dayNight || 'DAY',
        cameras: [{ name: data.cameraName || 'Camera 1', body: data.cameraBody || 'fx30' }],
        pageNotes: data.pageNotes || '',
        shots: (data.shots || []).map(s => mapShot(s, data.intOrExt, data.dayNight)),
      })]
    }

    const loadedSchedule = Array.isArray(data.schedule)
      ? data.schedule.map(day => ({
          id: day.id || `day_${Date.now()}_${++dayIdCounter}`,
          date: day.date || '',
          startTime: day.startTime || '',
          basecamp: day.basecamp || '',
          shotBlocks: (day.shotBlocks || []).map(b => {
            if (b.type === 'break') {
              return {
                id: b.id || `block_${Date.now()}_${++blockIdCounter}`,
                type: 'break',
                breakName: b.breakName || 'Break',
                breakDuration: b.breakDuration || 0,
              }
            }
            return {
              id: b.id || `block_${Date.now()}_${++blockIdCounter}`,
              shotId: b.shotId || '',
              estimatedShootTime: b.estimatedShootTime || '',
              estimatedSetupTime: b.estimatedSetupTime || '',
              shootingLocation: b.shootingLocation || '',
              castMembers: b.castMembers || [],
            }
          }),
        }))
      : []

    set({
      projectName: projectName || 'Untitled Shotlist',
      columnCount: columnCount || 4,
      defaultFocalLength: defaultFocalLength || '85mm',
      theme: theme || 'light',
      autoSave: autoSave !== undefined ? autoSave : true,
      useDropdowns: useDropdowns !== undefined ? useDropdowns : true,
      shotlistColumnConfig: (() => {
        const saved = data.shotlistColumnConfig
        if (!saved || !Array.isArray(saved) || saved.length === 0) return DEFAULT_COLUMN_CONFIG
        // Migrate legacy __intExt__ → __int__ + __dn__
        let migrated = []
        let didMigrate = false
        for (const c of saved) {
          if (c.key === '__intExt__') {
            migrated.push({ key: '__int__', visible: c.visible })
            migrated.push({ key: '__dn__', visible: c.visible })
            didMigrate = true
          } else {
            migrated.push(c)
          }
        }
        const base = didMigrate ? migrated : saved
        // Append any built-in columns not yet in saved config
        const savedKeys = new Set(base.map(c => c.key))
        const newBuiltin = DEFAULT_COLUMN_CONFIG.filter(c => !savedKeys.has(c.key))
        // Append any custom columns from saved data not yet in config
        const customInConfig = loadedCustomColumns
          .filter(c => !savedKeys.has(c.key))
          .map(c => ({ key: c.key, visible: true }))
        const all = [...base, ...newBuiltin, ...customInConfig]
        return all
      })(),
      customColumns: loadedCustomColumns,
      customDropdownOptions: loadedCustomDropdownOptions,
      scenes,
      schedule: loadedSchedule,
      scheduleColumnConfig: (() => {
        const saved = data.scheduleColumnConfig
        if (!saved || !Array.isArray(saved) || saved.length === 0) return DEFAULT_SCHEDULE_COLUMN_CONFIG
        // Append any new columns added since the project was saved
        const savedKeys = new Set(saved.map(c => c.key))
        const newCols = DEFAULT_SCHEDULE_COLUMN_CONFIG.filter(c => !savedKeys.has(c.key))
        return [...saved, ...newCols]
      })(),
      lastSaved: new Date().toISOString(),
    })
  },

  openProject: async () => {
    if (window.electronAPI) {
      const result = await window.electronAPI.openProject()
      if (!result.success) return
      try {
        const data = JSON.parse(result.data)
        get().loadProject(data)
        const fileName = result.filePath.split(/[\\/]/).pop()
        const recent = get().recentProjects.filter(r => r.path !== result.filePath)
        const totalShots = (data.scenes || [{ shots: data.shots || [] }])
          .reduce((a, s) => a + (s.shots || []).length, 0)
        const newRecent = [
          { name: fileName, path: result.filePath, date: new Date().toISOString(), shots: totalShots },
          ...recent,
        ].slice(0, 10)
        set({ recentProjects: newRecent, projectPath: result.filePath })
        localStorage.setItem('recentProjects', JSON.stringify(newRecent))
      } catch {
        alert('Failed to load project: Invalid file format')
      }
    } else {
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
            const totalShots = (data.scenes || [{ shots: data.shots || [] }])
              .reduce((a, s) => a + (s.shots || []).length, 0)
            const newRecent = [
              { name: file.name, path: file.name, date: new Date().toISOString(), shots: totalShots },
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
      const totalShots = (data.scenes || [{ shots: data.shots || [] }])
        .reduce((a, s) => a + (s.shots || []).length, 0)
      const newRecent = [
        { name: fileName, path: filePath, date: new Date().toISOString(), shots: totalShots },
        ...recent,
      ].slice(0, 10)
      set({ recentProjects: newRecent, projectPath: filePath })
      localStorage.setItem('recentProjects', JSON.stringify(newRecent))
    } catch {
      alert('Failed to load project: Invalid file format')
    }
  },

  newProject: () => {
    const name = prompt('Project name:', 'Untitled Shotlist')
    if (name === null) return
    const scene = createScene({ id: 'scene_1', sceneLabel: 'SCENE 1', location: 'LOCATION' })
    set({
      projectName: name,
      scenes: [scene],
      schedule: [],
      projectPath: null,
      lastSaved: null,
    })
  },

  // ── Auto-save ────────────────────────────────────────────────────────

  _autoSaveTimeout: null,
  _scheduleAutoSave: () => {
    const state = get()
    if (!state.autoSave) return
    if (state._autoSaveTimeout) clearTimeout(state._autoSaveTimeout)
    const timeout = setTimeout(() => {
      try {
        const data = get().getProjectData()
        localStorage.setItem('autosave', JSON.stringify(data))
        localStorage.setItem('autosave_time', new Date().toISOString())
      } catch {
        // Silently skip — the user will see an error on the next manual save.
      }
    }, 60000)
    set({ _autoSaveTimeout: timeout })
  },

  CARD_COLORS,
}))

export default useStore
