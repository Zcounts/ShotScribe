import { create } from 'zustand'
import { arrayMove } from '@dnd-kit/sortable'
import { computeEstimate, computeConfidence, parseSlugline } from './utils/scriptParser'
import { ensureEditableScreenplayElements, estimateScreenplayPagination } from './utils/screenplay'
import { DEFAULT_SCRIPT_DOCUMENT_SETTINGS, normalizeDocumentSettings } from './utils/scriptDocumentFormatting'
import { computeCastSceneMetrics, resolveLinkedScriptSceneId } from './utils/callsheetMetrics'
import {
  SHORTCUT_DEFAULTS,
  getActiveBindings,
  loadShortcutBindings,
  normalizeShortcutBinding,
  saveShortcutBindings,
} from './shortcuts'

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
  { key: 'status',         visible: true },
  { key: 'thumbnail',      visible: false },
  { key: 'displayId',      visible: true },
  { key: 'cast',           visible: true },
  { key: 'specs.type',     visible: true },
  { key: 'focalLength',    visible: true },
  { key: 'specs.equip',    visible: true },
  { key: 'specs.move',     visible: true },
  { key: 'specs.size',     visible: true },
  { key: 'notes',          visible: true },
  { key: 'description',    visible: true },
  { key: 'frameRate',      visible: false },
  { key: 'sound',          visible: false },
  { key: 'props',          visible: false },
  { key: 'setupTime',      visible: false },
  { key: 'shootTime',      visible: false },
  { key: '__int__',        visible: false },
  { key: '__dn__',         visible: false },
  { key: 'scriptTime',     visible: false },
  { key: 'predictedTakes', visible: false },
  { key: 'takeNumber',     visible: false },
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

export const DEFAULT_CALLSHEET_SECTION_CONFIG = [
  { key: 'generalInfo',       visible: true,  label: 'Day Logistics and Emergency' },
  { key: 'advancedSchedule',  visible: true,  label: "Today's Shooting Schedule" },
  { key: 'castList',          visible: true,  label: 'Cast List' },
  { key: 'crewList',          visible: true,  label: 'Crew List' },
  { key: 'locationDetails',   visible: true,  label: 'Location Details' },
  { key: 'additionalNotes',   visible: true,  label: 'Special Instructions' },
  { key: 'nextDayAdvance',    visible: true,  label: 'Next-Day Advance Notes' },
]

const DEFAULT_COLOR = '#4ade80'

let shotCounter = 0
let sceneIdCounter = 0
let dayIdCounter = 0
let blockIdCounter = 0

const SCREENPLAY_SCENE_HEADING_TYPE = 'heading'
const SCREENPLAY_CHARACTER_TYPE = 'character'
const SCREENPLAY_DIALOGUE_TYPE = 'dialogue'
const SCREENPLAY_ACTION_TYPE = 'action'
const UNDO_HISTORY_LIMIT = 120
const UNDO_GROUP_WINDOW_MS = 600

function cloneUndoSnapshot(snapshot) {
  return JSON.parse(JSON.stringify(snapshot))
}

function getUndoableSnapshot(state) {
  return {
    scenes: state.scenes,
    storyboardSceneOrder: state.storyboardSceneOrder,
    scriptScenes: state.scriptScenes,
    schedule: state.schedule,
    callsheets: state.callsheets,
    castRoster: state.castRoster,
    crewRoster: state.crewRoster,
    castCrewNotes: state.castCrewNotes,
    projectName: state.projectName,
    projectEmoji: state.projectEmoji,
    columnCount: state.columnCount,
    defaultFocalLength: state.defaultFocalLength,
    useDropdowns: state.useDropdowns,
    shotlistColumnConfig: state.shotlistColumnConfig,
    scheduleColumnConfig: state.scheduleColumnConfig,
    callsheetSectionConfig: state.callsheetSectionConfig,
    shotlistColumnWidths: state.shotlistColumnWidths,
    customColumns: state.customColumns,
    customDropdownOptions: state.customDropdownOptions,
    scriptSettings: state.scriptSettings,
  }
}

function applyUndoSnapshot(snapshot, state) {
  return {
    ...state,
    ...cloneUndoSnapshot(snapshot),
  }
}

function normalizeStoryboardSceneOrder(order, scenes) {
  const sceneIds = scenes.map(scene => scene.id)
  const validIds = new Set(sceneIds)
  const normalized = []
  const seen = new Set()

  if (Array.isArray(order)) {
    order.forEach((sceneId) => {
      if (!validIds.has(sceneId) || seen.has(sceneId)) return
      seen.add(sceneId)
      normalized.push(sceneId)
    })
  }

  sceneIds.forEach((sceneId) => {
    if (seen.has(sceneId)) return
    seen.add(sceneId)
    normalized.push(sceneId)
  })

  return normalized
}

function deriveScriptSceneFromElements(scene, elements) {
  const normalizedElements = ensureEditableScreenplayElements(elements)
  const joinedText = normalizedElements.map(element => String(element.text || '')).join('\n')
  const headingElement = normalizedElements.find(element => element.type === SCREENPLAY_SCENE_HEADING_TYPE && String(element.text || '').trim())
  const headingText = headingElement ? String(headingElement.text || '').trim().toUpperCase() : ''
  const parsedHeading = headingText ? parseSlugline(headingText) : {}

  const characterNames = []
  const seenCharacters = new Set()
  normalizedElements.forEach(element => {
    if (element.type !== SCREENPLAY_CHARACTER_TYPE) return
    const name = String(element.text || '')
      .replace(/:\s*$/, '')
      .replace(/\s*\([^)]*\)\s*$/, '')
      .trim()
      .toUpperCase()
    if (!name || seenCharacters.has(name)) return
    seenCharacters.add(name)
    characterNames.push(name)
  })

  return {
    ...scene,
    screenplayElements: normalizedElements,
    screenplayText: joinedText,
    actionText: normalizedElements
      .filter(element => element.type === SCREENPLAY_ACTION_TYPE)
      .map(element => String(element.text || '').trim())
      .filter(Boolean)
      .join('\n'),
    dialogueCount: normalizedElements.filter(element => element.type === SCREENPLAY_DIALOGUE_TYPE).length,
    characters: characterNames,
    slugline: headingText || scene.slugline || '',
    customHeader: headingText || scene.customHeader || '',
    intExt: parsedHeading.intExt ?? scene.intExt ?? null,
    dayNight: parsedHeading.dayNight ?? scene.dayNight ?? null,
    location: parsedHeading.location ?? scene.location ?? '',
    sceneNumber: scene.sceneNumber != null ? String(scene.sceneNumber) : '',
  }
}

function normalizeCastEntry(entry = {}) {
  const characterIds = Array.isArray(entry.characterIds)
    ? entry.characterIds.filter(Boolean)
    : (entry.character ? [String(entry.character).trim()] : [])
  return {
    id: entry.id || `cast_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    name: entry.name || '',
    email: entry.email || '',
    phone: entry.phone || '',
    role: entry.role || 'Cast',
    department: entry.department || 'Cast',
    character: entry.character || characterIds[0] || '',
    characterIds,
    notes: entry.notes || '',
    metadata: entry.metadata || {},
  }
}

function normalizePersonKey(value) {
  return String(value || '').trim().toLowerCase()
}

function splitPeople(value) {
  return String(value || '')
    .split(/[,&/]/)
    .map(name => name.trim())
    .filter(Boolean)
}

function normalizeCrewEntry(entry = {}) {
  return {
    id: entry.id || `crew_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    name: entry.name || '',
    email: entry.email || '',
    phone: entry.phone || '',
    role: entry.role || '',
    department: entry.department || 'Production',
    notes: entry.notes || '',
    metadata: entry.metadata || {},
  }
}

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
    description: '',
    cast: '',
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
    sound: '',
    props: '',
    frameRate: '',
    // Script scene link — references a scriptScene id (display-only, not enforced)
    linkedSceneId: null,
    linkedDialogueLine: null,
    linkedDialogueOffset: null,
    linkedScriptRangeStart: null,
    linkedScriptRangeEnd: null,
    ...overrides,
  }
}

function createScene(overrides = {}) {
  sceneIdCounter++
  return {
    id: `scene_${Date.now()}_${sceneIdCounter}`,
    sceneLabel: 'SCENE',
    slugline: '',
    location: 'LOCATION',
    intOrExt: 'INT',
    dayNight: 'DAY',
    cameras: [{ name: 'Camera 1', body: 'fx30' }],
    pageNotes: ['*NOTE: \n*SHOOT ORDER: '],
    pageColors: [],
    linkedScriptSceneId: null,
    shots: [],
    ...overrides,
  }
}

function getStoryboardCanonicalScriptScene(state, storyboardScene) {
  if (!storyboardScene?.linkedScriptSceneId) return null
  return state.scriptScenes.find(scene => scene.id === storyboardScene.linkedScriptSceneId) || null
}

function mapScriptSceneToStoryboardMetadata(scriptScene) {
  if (!scriptScene) return null
  return {
    sceneLabel: scriptScene.sceneNumber ? `SCENE ${scriptScene.sceneNumber}` : 'SCENE',
    slugline: scriptScene.slugline || '',
    location: scriptScene.location || '',
    intOrExt: scriptScene.intExt || '',
    dayNight: scriptScene.dayNight || '',
    color: scriptScene.color || null,
  }
}

// Valid shot letters: A-Z excluding I (confused with 1), O (confused with 0), S (confused with 5)
export const VALID_SHOT_LETTERS = 'ABCDEFGHJKLMNPQRTUVWXYZ' // 23 letters

export function getShotLetter(index) {
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

function loadRecentProjects() {
  try {
    const raw = localStorage.getItem('recentProjects')
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    // Guard against malformed/unavailable persisted storage causing renderer
    // startup crashes (e.g. SecurityError in some file:// environments).
    try {
      localStorage.removeItem('recentProjects')
    } catch {
      // Ignore storage cleanup failures; renderer should still boot.
    }
    return []
  }
}

const useStore = create((set, get) => ({
  // Project metadata
  projectPath: null,
  projectName: 'Untitled Shotlist',
  projectEmoji: '🎬',
  lastSaved: null,
  hasUnsavedChanges: false,
  documentSession: 0,

  // Scenes (multi-scene support)
  scenes: [initialScene],
  storyboardSceneOrder: [],

  // Global settings
  columnCount: 4,
  defaultFocalLength: '85mm',
  theme: 'light',
  autoSave: true,
  useDropdowns: true,

  // Recent projects
  recentProjects: loadRecentProjects(),

  // Schedule — array of shooting days, each with a list of shot blocks that
  // reference shots by ID so they stay linked to the storyboard/shotlist.
  // Shape: [{ id, date, shotBlocks: [{ id, shotId, estimatedShootTime,
  //           estimatedSetupTime, shootingLocation, castMembers }] }]
  schedule: [],

  // Callsheets — keyed by schedule day id.
  // Each entry stores callsheet-specific fields for one shooting day.
  // Call time and basecamp are read from schedule (bidirectional sync).
  // Shape: { [dayId]: { shootLocation, nearestHospital, emergencyContacts,
  //   weather, cast: [], crew: [], locationAddress, parkingNotes,
  //   directions, mapsLink, additionalNotes } }
  callsheets: {},

  // Global cast/crew rosters — shared across all callsheets in the project.
  // Cast roster entry:  { id, name, character }
  // Crew roster entry:  { id, name, department, role }
  castRoster: [],
  crewRoster: [],
  castCrewNotes: '',

  // UI state
  settingsOpen: false,
  contextMenu: null, // { shotId, sceneId, x, y }
  activeTab: 'script', // 'storyboard' | 'shotlist' | 'scenes' | 'script' | 'schedule' | 'callsheet' | 'castcrew'
  shotlistColumnConfig: DEFAULT_COLUMN_CONFIG,
  scheduleColumnConfig: DEFAULT_SCHEDULE_COLUMN_CONFIG,
  callsheetSectionConfig: DEFAULT_CALLSHEET_SECTION_CONFIG,

  // Per-column width overrides for the shotlist table (key → px width).
  // Saved with the project so widths are restored on reload.
  shotlistColumnWidths: {},

  // Schedule tab collapse state — persists through tab switches (in-memory only,
  // not written to the project file).
  // days: { [dayId]: bool }   true = collapsed
  // blocks: { [blockId]: bool } true = collapsed
  scheduleCollapseState: { days: {}, blocks: {} },
  scriptFocusRequest: null, // { sceneId, shotId, at }
  scenePropertiesDialog: null, // { source: 'storyboard'|'script', sceneId }
  tabViewState: {
    script: {},
    scenes: {},
    storyboard: {},
    shotlist: {},
    castcrew: {},
    schedule: {},
    callsheet: {},
  },

  // Custom columns and dropdown options
  customColumns: [], // [{ key, label, fieldType: 'text'|'dropdown' }]
  customDropdownOptions: {}, // { fieldKey: ['option1', 'option2', ...] }
  shortcutBindings: loadShortcutBindings(),
  undoPast: [],
  undoFuture: [],
  undoLastRecordedAt: 0,

  // ── Script import state ───────────────────────────────────────────────
  // Script-imported scenes (separate from storyboard scenes)
  scriptScenes: [],  // ScriptScene[] — see utils/scriptParser.js for shape
  importedScripts: [], // { id, filename, importedAt, sceneCount }[]
  scriptSettings: {
    baseMinutesPerPage: 5,    // 1 page ≈ N minutes (user-configurable)
    autoSuggestTags: true,    // suggest complexity tags based on heuristics
    showConfidenceIndicators: true, // show ●●● indicators
    defaultSceneColor: null,  // default color for new scenes (null = no color)
    scenePaginationMode: 'natural', // natural | newPagePerScene
    documentSettings: DEFAULT_SCRIPT_DOCUMENT_SETTINGS,
  },

  // ── Script scene actions ──────────────────────────────────────────────

  importScriptScenes: (parsedScenes, scriptMeta, mode = 'replace') => {
    set(state => {
      const scriptId = scriptMeta.id || `script_${Date.now()}`
      const timestamp = new Date().toISOString()
      const settings = state.scriptSettings

      // Enrich scenes with estimated minutes and confidence
      const pagination = estimateScreenplayPagination(parsedScenes)
      const enriched = parsedScenes.map(scene => {
        const normalizedScene = deriveScriptSceneFromElements(scene, scene.screenplayElements || [])
        const estimated = computeEstimate(normalizedScene, settings.baseMinutesPerPage)
        return {
          ...normalizedScene,
          sceneNumber: normalizedScene.sceneNumber != null ? String(normalizedScene.sceneNumber) : '',
          pageCount: pagination.byScene[scene.id]?.pageCount ?? normalizedScene.pageCount ?? null,
          pageStart: pagination.byScene[scene.id]?.startPage ?? normalizedScene.pageStart ?? null,
          pageEnd: pagination.byScene[scene.id]?.endPage ?? normalizedScene.pageEnd ?? null,
          estimatedMinutes: estimated,
        }
      })

      const newScript = {
        id: scriptId,
        filename: scriptMeta.filename || 'Unknown',
        importedAt: timestamp,
        sceneCount: parsedScenes.length,
      }

      if (mode === 'replace') {
        // Replace all scenes that came from this script
        const otherScenes = state.scriptScenes.filter(s => s.importSource !== scriptMeta.filename)
        const otherScripts = state.importedScripts.filter(s => s.filename !== scriptMeta.filename)
        const mergedScriptScenes = [...otherScenes, ...enriched]
        return {
          scriptScenes: mergedScriptScenes,
          importedScripts: [...otherScripts, newScript],
          scenes: state.scenes.map((storyScene, idx) => {
            if (storyScene.linkedScriptSceneId) return storyScene
            const fallback = mergedScriptScenes[idx]
            if (!fallback?.id) return storyScene
            return {
              ...storyScene,
              linkedScriptSceneId: fallback.id,
              ...(mapScriptSceneToStoryboardMetadata(fallback) || {}),
            }
          }),
        }
      } else {
        // Merge — add new scenes, keep existing
        // Deduplicate by slugline to avoid exact duplicates
        const existingSlugs = new Set(state.scriptScenes.map(s => s.slugline))
        const newScenes = enriched.filter(s => !existingSlugs.has(s.slugline))
        const scriptExists = state.importedScripts.find(s => s.filename === scriptMeta.filename)
        const updatedScripts = scriptExists
          ? state.importedScripts.map(s => s.filename === scriptMeta.filename ? newScript : s)
          : [...state.importedScripts, newScript]
        const mergedScriptScenes = [...state.scriptScenes, ...newScenes]
        return {
          scriptScenes: mergedScriptScenes,
          importedScripts: updatedScripts,
          scenes: state.scenes.map((storyScene, idx) => {
            if (storyScene.linkedScriptSceneId) return storyScene
            const fallback = mergedScriptScenes[idx]
            if (!fallback?.id) return storyScene
            return {
              ...storyScene,
              linkedScriptSceneId: fallback.id,
              ...(mapScriptSceneToStoryboardMetadata(fallback) || {}),
            }
          }),
        }
      }
    })
    get()._scheduleAutoSave()
  },

  updateScriptScene: (sceneId, updates) => {
    set(state => {
      const settings = state.scriptSettings
      const nextScenes = state.scriptScenes.map(s => {
          if (s.id !== sceneId) return s
          const normalizedUpdates = { ...updates }
          if ('sceneNumber' in normalizedUpdates) {
            normalizedUpdates.sceneNumber = normalizedUpdates.sceneNumber != null ? String(normalizedUpdates.sceneNumber) : ''
          }
          const updated = { ...s, ...normalizedUpdates }
          // Recompute estimate when relevant fields change
          if ('complexityTags' in normalizedUpdates || 'pageCount' in normalizedUpdates) {
            updated.estimatedMinutes = computeEstimate(updated, settings.baseMinutesPerPage)
          }
          return updated
        })
      const pagination = estimateScreenplayPagination(nextScenes)
      const updatedScriptScene = nextScenes.find(s => s.id === sceneId)
      return {
        scriptScenes: nextScenes.map(scene => ({
          ...scene,
          pageCount: pagination.byScene[scene.id]?.pageCount ?? scene.pageCount ?? null,
          pageStart: pagination.byScene[scene.id]?.startPage ?? scene.pageStart ?? null,
          pageEnd: pagination.byScene[scene.id]?.endPage ?? scene.pageEnd ?? null,
        })),
        scenes: !updatedScriptScene
          ? state.scenes
          : state.scenes.map(storyScene => {
            if (storyScene.linkedScriptSceneId !== sceneId) return storyScene
            return {
              ...storyScene,
              ...(mapScriptSceneToStoryboardMetadata(updatedScriptScene) || {}),
            }
          }),
      }
    })
    get()._scheduleAutoSave()
  },

  updateScriptSceneScreenplay: (sceneId, screenplayElements) => {
    set(state => {
      const settings = state.scriptSettings
      const updatedScenes = state.scriptScenes.map(scene => (
        scene.id === sceneId
          ? deriveScriptSceneFromElements(scene, screenplayElements)
          : scene
      ))
      const pagination = estimateScreenplayPagination(updatedScenes, {
        scenePaginationMode: settings.scenePaginationMode,
      })
      const updatedScene = updatedScenes.find(scene => scene.id === sceneId)
      return {
        scriptScenes: updatedScenes.map(scene => ({
          ...scene,
          pageCount: pagination.byScene[scene.id]?.pageCount ?? scene.pageCount ?? null,
          pageStart: pagination.byScene[scene.id]?.startPage ?? scene.pageStart ?? null,
          pageEnd: pagination.byScene[scene.id]?.endPage ?? scene.pageEnd ?? null,
          estimatedMinutes: computeEstimate(scene, settings.baseMinutesPerPage),
        })),
        scenes: !updatedScene
          ? state.scenes
          : state.scenes.map(storyScene => {
            if (storyScene.linkedScriptSceneId !== sceneId) return storyScene
            return {
              ...storyScene,
              ...(mapScriptSceneToStoryboardMetadata(updatedScene) || {}),
            }
          }),
      }
    })
    get()._scheduleAutoSave()
  },

  deleteScriptScene: (sceneId) => {
    set(state => ({
      scriptScenes: state.scriptScenes.filter(s => s.id !== sceneId),
      scenes: state.scenes.map(sc => ({
        ...sc,
        linkedScriptSceneId: sc.linkedScriptSceneId === sceneId ? null : sc.linkedScriptSceneId,
        shots: sc.shots.map(sh =>
          sh.linkedSceneId === sceneId ? { ...sh, linkedSceneId: null } : sh
        ),
      })),
      // Clear linkedSceneId from any shots that linked to this scene
    }))
    get()._scheduleAutoSave()
  },

  reorderScriptScenes: (activeId, overId) => {
    set(state => {
      const oldIdx = state.scriptScenes.findIndex(s => s.id === activeId)
      const newIdx = state.scriptScenes.findIndex(s => s.id === overId)
      if (oldIdx === -1 || newIdx === -1) return state
      return { scriptScenes: arrayMove(state.scriptScenes, oldIdx, newIdx) }
    })
    get()._scheduleAutoSave()
  },

  deleteImportedScript: (scriptId) => {
    set(state => {
      const script = state.importedScripts.find(s => s.id === scriptId)
      if (!script) return state
      return {
        importedScripts: state.importedScripts.filter(s => s.id !== scriptId),
        scriptScenes: state.scriptScenes.filter(s => s.importSource !== script.filename),
        // Clear broken links from storyboard scenes and shots
        scenes: state.scenes.map(sc => ({
          ...sc,
          linkedScriptSceneId: (
            sc.linkedScriptSceneId
            && state.scriptScenes.find(ss => ss.id === sc.linkedScriptSceneId && ss.importSource === script.filename)
          ) ? null : sc.linkedScriptSceneId,
          shots: sc.shots.map(sh =>
            state.scriptScenes.find(ss => ss.id === sh.linkedSceneId && ss.importSource === script.filename)
              ? { ...sh, linkedSceneId: null }
              : sh
          ),
        })),
      }
    })
    get()._scheduleAutoSave()
  },

  setScriptSettings: (updates) => {
    set(state => {
      const newSettings = { ...state.scriptSettings, ...updates }
      const shouldRecomputeEstimates = 'baseMinutesPerPage' in updates
      const shouldRecomputePagination = 'scenePaginationMode' in updates
      if (shouldRecomputeEstimates || shouldRecomputePagination) {
        const pagination = estimateScreenplayPagination(state.scriptScenes, {
          scenePaginationMode: newSettings.scenePaginationMode,
        })
        const enriched = state.scriptScenes.map(scene => {
          const next = { ...scene }
          if (shouldRecomputeEstimates) {
            next.estimatedMinutes = computeEstimate(scene, newSettings.baseMinutesPerPage)
          }
          if (shouldRecomputePagination) {
            next.pageCount = pagination.byScene[scene.id]?.pageCount ?? scene.pageCount ?? null
            next.pageStart = pagination.byScene[scene.id]?.startPage ?? scene.pageStart ?? null
            next.pageEnd = pagination.byScene[scene.id]?.endPage ?? scene.pageEnd ?? null
          }
          return next
        })
        return { scriptSettings: newSettings, scriptScenes: enriched }
      }
      return { scriptSettings: newSettings }
    })
    get()._scheduleAutoSave()
  },

  openScenePropertiesDialog: (source, sceneId) => {
    set({ scenePropertiesDialog: { source, sceneId } })
  },
  closeScenePropertiesDialog: () => set({ scenePropertiesDialog: null }),

  // Link a shot to a script scene (or unlink with null)
  linkShotToScene: (shotId, sceneId, opts = {}) => {
    const nextDialogue = opts.linkedDialogueLine !== undefined ? opts.linkedDialogueLine : null
    const nextOffset = opts.linkedDialogueOffset !== undefined ? opts.linkedDialogueOffset : null
    const nextRangeStart = opts.linkedScriptRangeStart !== undefined ? opts.linkedScriptRangeStart : null
    const nextRangeEnd = opts.linkedScriptRangeEnd !== undefined ? opts.linkedScriptRangeEnd : null
    set(state => ({
      scenes: state.scenes.map(sc => ({
        ...sc,
        shots: sc.shots.map(sh =>
          sh.id === shotId
            ? {
                ...sh,
                linkedSceneId: sceneId,
                linkedDialogueLine: sceneId ? nextDialogue : null,
                linkedDialogueOffset: sceneId ? nextOffset : null,
                linkedScriptRangeStart: sceneId ? nextRangeStart : null,
                linkedScriptRangeEnd: sceneId ? nextRangeEnd : null,
              }
            : sh
        ),
      })),
    }))
    get()._scheduleAutoSave()
  },

  // Returns a map of sceneId → count of linked shots (across all storyboard scenes)
  getSceneLinkCounts: () => {
    const { scenes } = get()
    const counts = {}
    scenes.forEach(sc => {
      sc.shots.forEach(sh => {
        if (sh.linkedSceneId) {
          counts[sh.linkedSceneId] = (counts[sh.linkedSceneId] || 0) + 1
        }
      })
    })
    return counts
  },

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
      blocks: day.blocks.map(block => {
        if (block.type !== 'shot' && block.shotId === undefined) return block
        const found = shotMap.get(block.shotId)
        // Look up linked script scene (if any), with fallback to the parent storyboard scene link.
        const resolvedLinkedSceneId = found
          ? resolveLinkedScriptSceneId(found.shot, found.scene)
          : null
        const scriptScene = resolvedLinkedSceneId
          ? get().scriptScenes.find(ss => ss.id === resolvedLinkedSceneId)
          : null

        const castRosterEntries = found ? get().getCastRosterByShot(found.shot, found.scene) : []
        return {
          ...block,
          // Null when the referenced shot has been deleted
          shotData: found ? {
            displayId: found.displayId,
            cast: found.shot.cast || '',
            notes: found.shot.notes,
            intOrExt: found.shot.intOrExt || found.scene.intOrExt,
            dayNight: found.shot.dayNight || found.scene.dayNight,
            sceneLabel: found.scene.sceneLabel,
            location: found.scene.location,
            image: found.shot.image || null,
            // Shared time fields — source of truth lives on the shot
            shootTime: found.shot.shootTime || '',
            setupTime: found.shot.setupTime || '',
            scriptTime: found.shot.scriptTime || '',
            // Script scene link (display only)
            linkedSceneId: resolvedLinkedSceneId,
            linkedSceneData: scriptScene ? {
              sceneNumber: scriptScene.sceneNumber,
              location: scriptScene.location,
              intExt: scriptScene.intExt,
              dayNight: scriptScene.dayNight,
              color: scriptScene.color,
            } : null,
            castRosterEntries,
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
      primaryLocation: '',
      basecamp: '',
      blocks: [],
      ...overrides,
    }
    set(state => ({
      schedule: [...state.schedule, day],
      scheduleCollapseState: {
        ...state.scheduleCollapseState,
        days: { ...state.scheduleCollapseState.days, [day.id]: false },
      },
    }))
    get()._scheduleAutoSave()
    return day.id
  },

  addBreakBlock: (dayId, name = 'Break', durationMins = 0) => {
    blockIdCounter++
    const block = {
      id: `block_${Date.now()}_${blockIdCounter}`,
      type: 'break',
      label: name,
      duration: durationMins,
    }
    set(state => ({
      schedule: state.schedule.map(d =>
        d.id === dayId ? { ...d, blocks: [...d.blocks, block] } : d
      ),
      scheduleCollapseState: {
        ...state.scheduleCollapseState,
        blocks: { ...state.scheduleCollapseState.blocks, [block.id]: true },
      },
    }))
    get()._scheduleAutoSave()
    return block.id
  },

  // Add a special (non-shot) block: type = 'move' | 'meal' | 'travel'
  addSpecialBlock: (dayId, type, overrides = {}) => {
    blockIdCounter++
    const defaultNames = { move: 'Company Move', meal: 'Meal', travel: 'Travel' }
    const block = {
      id: `block_${Date.now()}_${blockIdCounter}`,
      type,
      label: overrides.label || overrides.blockName || defaultNames[type] || type,
      duration: overrides.duration ?? overrides.blockDuration ?? 0,
      ...(type === 'move' ? { location: overrides.location || overrides.blockLocation || '' } : {}),
    }
    set(state => ({
      schedule: state.schedule.map(d =>
        d.id === dayId ? { ...d, blocks: [...d.blocks, block] } : d
      ),
      scheduleCollapseState: {
        ...state.scheduleCollapseState,
        blocks: { ...state.scheduleCollapseState.blocks, [block.id]: true },
      },
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
      type: 'shot',
      shotId,
      estimatedShootTime: '',
      estimatedSetupTime: '',
      shootingLocation: '',
      castMembers: [],
    }
    set(state => ({
      schedule: state.schedule.map(d =>
        d.id === dayId ? { ...d, blocks: [...d.blocks, block] } : d
      ),
      scheduleCollapseState: {
        ...state.scheduleCollapseState,
        blocks: { ...state.scheduleCollapseState.blocks, [block.id]: true },
      },
    }))
    get()._scheduleAutoSave()
    return block.id
  },

  removeShotBlock: (dayId, blockId) => {
    set(state => ({
      schedule: state.schedule.map(d =>
        d.id === dayId
          ? { ...d, blocks: d.blocks.filter(b => b.id !== blockId) }
          : d
      ),
    }))
    get()._scheduleAutoSave()
  },

  updateShotBlock: (dayId, blockId, updates) => {
    set(state => ({
      schedule: state.schedule.map(d =>
        d.id === dayId
          ? { ...d, blocks: d.blocks.map(b => b.id === blockId ? { ...b, ...updates } : b) }
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
  // dayUpdates: [{ id: dayId, blocks: block[] }]
  applyScheduleDrag: (dayUpdates) => {
    set(state => ({
      schedule: state.schedule.map(d => {
        const update = dayUpdates.find(u => u.id === d.id)
        return update ? { ...d, blocks: update.blocks } : d
      }),
    }))
    get()._scheduleAutoSave()
  },

  // ── Callsheet actions ────────────────────────────────────────────────

  // Returns a callsheet for a day, merging defaults with stored data.
  getCallsheet: (dayId) => {
    const { callsheets } = get()
    return {
      shootLocation: '',
      nearestHospital: '',
      emergencyContacts: '',
      weather: '',
      cast: [],
      crew: [],
      locationAddress: '',
      parkingNotes: '',
      directions: '',
      mapsLink: '',
      additionalNotes: '',
      ...(callsheets[dayId] || {}),
    }
  },

  updateCallsheet: (dayId, updates) => {
    set(state => ({
      callsheets: {
        ...state.callsheets,
        [dayId]: { ...(state.callsheets[dayId] || {}), ...updates },
      },
    }))
    get()._scheduleAutoSave()
  },

  setCallsheetSectionConfig: (config) => {
    set({ callsheetSectionConfig: config })
    get()._scheduleAutoSave()
  },
  setCastCrewNotes: (notes) => {
    set({ castCrewNotes: notes })
    get()._scheduleAutoSave()
  },

  // ── Cast/Crew Roster actions ──────────────────────────────────────────

  // Upsert a cast member into the global roster (matched by id or name+character).
  upsertCastRosterEntry: (entry) => {
    set(state => {
      const normalized = normalizeCastEntry(entry)
      const existing = state.castRoster.findIndex(r => r.id === normalized.id)
      if (existing !== -1) {
        const next = [...state.castRoster]
        next[existing] = normalizeCastEntry({ ...next[existing], ...normalized })
        return { castRoster: next }
      }
      // Check for same name+character to avoid duplicates when re-adding
      const normalizedNameKey = normalizePersonKey(normalized.name)
      const normalizedCharacterKey = normalizePersonKey(normalized.character)
      const byName = state.castRoster.findIndex(r =>
        normalizePersonKey(r.name) === normalizedNameKey &&
        normalizePersonKey(r.character) === normalizedCharacterKey
      )
      if (byName !== -1) {
        const next = [...state.castRoster]
        next[byName] = normalizeCastEntry({ ...next[byName], ...normalized })
        return { castRoster: next }
      }
      return { castRoster: [...state.castRoster, normalized] }
    })
    get()._scheduleAutoSave()
  },

  // Upsert a crew member into the global roster (matched by id or name+role).
  upsertCrewRosterEntry: (entry) => {
    set(state => {
      const normalized = normalizeCrewEntry(entry)
      const existing = state.crewRoster.findIndex(r => r.id === normalized.id)
      if (existing !== -1) {
        const next = [...state.crewRoster]
        next[existing] = normalizeCrewEntry({ ...next[existing], ...normalized })
        return { crewRoster: next }
      }
      const normalizedNameKey = normalizePersonKey(normalized.name)
      const normalizedRoleKey = normalizePersonKey(normalized.role)
      const byName = state.crewRoster.findIndex(r =>
        normalizePersonKey(r.name) === normalizedNameKey &&
        normalizePersonKey(r.role) === normalizedRoleKey
      )
      if (byName !== -1) {
        const next = [...state.crewRoster]
        next[byName] = normalizeCrewEntry({ ...next[byName], ...normalized })
        return { crewRoster: next }
      }
      return { crewRoster: [...state.crewRoster, normalized] }
    })
    get()._scheduleAutoSave()
  },

  removeCastRosterEntry: (id) => {
    set(state => ({ castRoster: state.castRoster.filter(entry => entry.id !== id) }))
    get()._scheduleAutoSave()
  },

  removeCrewRosterEntry: (id) => {
    set(state => ({ crewRoster: state.crewRoster.filter(entry => entry.id !== id) }))
    get()._scheduleAutoSave()
  },

  getScriptCharacterCatalog: () => {
    const characters = new Map()
    get().scriptScenes.forEach(scene => {
      ;(scene.characters || []).forEach(name => {
        const key = String(name || '').trim()
        if (!key) return
        const existing = characters.get(key) || { id: key, name: key, sceneIds: new Set() }
        existing.sceneIds.add(scene.id)
        characters.set(key, existing)
      })
    })
    return Array.from(characters.values()).map(item => ({ ...item, sceneIds: Array.from(item.sceneIds) }))
  },

  getCastRosterByCharacterNames: (characterNames = []) => {
    const roster = get().castRoster || []
    const linkedCharKeys = new Set(
      (characterNames || [])
        .map(normalizePersonKey)
        .filter(Boolean)
    )
    if (linkedCharKeys.size === 0) return []

    return roster.filter(entry => {
      const keys = [entry.character, ...(entry.characterIds || [])]
        .map(normalizePersonKey)
        .filter(Boolean)
      return keys.some(key => linkedCharKeys.has(key))
    })
  },

  getCastRosterByShot: (shot, storyboardScene = null) => {
    if (!shot) return []
    const { scriptScenes, getCastRosterByCharacterNames } = get()
    const linkedScriptSceneId = resolveLinkedScriptSceneId(shot, storyboardScene)
    const scriptScene = linkedScriptSceneId
      ? scriptScenes.find(scene => scene.id === linkedScriptSceneId)
      : null

    const characterNames = new Set()
    ;(scriptScene?.characters || []).forEach(name => {
      const trimmed = String(name || '').trim()
      if (trimmed) characterNames.add(trimmed)
    })

    splitPeople(shot.cast).forEach(name => {
      const trimmed = String(name || '').trim()
      if (trimmed) characterNames.add(trimmed)
    })

    return getCastRosterByCharacterNames(Array.from(characterNames))
  },

  getDayCastRosterEntries: (dayId) => {
    const { schedule, scenes, getCastRosterByShot } = get()
    const day = schedule.find(d => d.id === dayId)
    if (!day) return []

    const shotMap = new Map()
    scenes.forEach(scene => {
      scene.shots.forEach(shot => {
        shotMap.set(shot.id, { shot, scene })
      })
    })

    const byId = new Map()
    ;(day.blocks || []).forEach(block => {
      if (!block?.shotId) return
      const shotContext = shotMap.get(block.shotId)
      if (!shotContext) return
      const rosterEntries = getCastRosterByShot(shotContext.shot, shotContext.scene)
      rosterEntries.forEach(entry => {
        if (!byId.has(entry.id)) byId.set(entry.id, entry)
      })
    })
    return Array.from(byId.values())
  },

  getCastSceneMetrics: (castId, dayId = null) => {
    const { castRoster, scriptScenes, schedule, getScheduleWithShots } = get()
    const cast = castRoster.find(entry => entry.id === castId)
    if (!cast) return { sceneCount: 0, pageCount: 0, sceneIds: [] }
    const linkedChars = new Set(
      [...(cast.characterIds || []), cast.character]
        .map(normalizePersonKey)
        .filter(Boolean)
    )
    if (linkedChars.size === 0) return { sceneCount: 0, pageCount: 0, sceneIds: [] }

    const allSceneIds = new Set(
      scriptScenes
        .filter(scene => (scene.characters || []).some(char => linkedChars.has(normalizePersonKey(char))))
        .map(scene => scene.id)
    )

    let filteredSceneIds = allSceneIds
    if (dayId) {
      const day = getScheduleWithShots().find(d => d.id === dayId) || schedule.find(d => d.id === dayId)
      const daySceneIds = new Set(
        (day?.blocks || [])
          .map(block => block?.shotData?.linkedSceneId || null)
          .filter(Boolean)
      )
      filteredSceneIds = new Set([...allSceneIds].filter(id => daySceneIds.has(id)))
    }
    return computeCastSceneMetrics({
      castCharacterKeys: linkedChars,
      scriptScenes,
      allowedSceneIds: filteredSceneIds,
      normalizeCharacterKey: normalizePersonKey,
    })
  },

  // ── Scene helpers ────────────────────────────────────────────────────

  getScene: (sceneId) => get().scenes.find(s => s.id === sceneId),

  getStoryboardSceneOrder: () => {
    const state = get()
    return normalizeStoryboardSceneOrder(state.storyboardSceneOrder, state.scenes)
  },

  getStoryboardScenes: () => {
    const state = get()
    const order = normalizeStoryboardSceneOrder(state.storyboardSceneOrder, state.scenes)
    const byId = new Map(state.scenes.map(scene => [scene.id, scene]))
    return order.map(sceneId => byId.get(sceneId)).filter(Boolean)
  },

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
    const scriptScenes = get().scriptScenes
    const usedScriptSceneIds = new Set(currentScenes.map(s => s.linkedScriptSceneId).filter(Boolean))
    const nextSuggestedScriptScene = scriptScenes.find(s => !usedScriptSceneIds.has(s.id)) || scriptScenes[0] || null
    const scene = createScene({
      sceneLabel: `SCENE ${sceneNum}`,
      linkedScriptSceneId: nextSuggestedScriptScene?.id || null,
      location: nextSuggestedScriptScene?.location || undefined,
      intOrExt: nextSuggestedScriptScene?.intExt || undefined,
      dayNight: nextSuggestedScriptScene?.dayNight || undefined,
      ...overrides,
    })
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
          blocks: day.blocks.filter(b => !deletedShotIds.has(b.shotId)),
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

  reorderStoryboardScenes: (activeId, overId) => {
    set(state => {
      const order = normalizeStoryboardSceneOrder(state.storyboardSceneOrder, state.scenes)
      const oldIndex = order.findIndex(id => id === activeId)
      const newIndex = order.findIndex(id => id === overId)
      if (oldIndex === -1 || newIndex === -1) return state
      return { storyboardSceneOrder: arrayMove(order, oldIndex, newIndex) }
    })
    get()._scheduleAutoSave()
  },

  getCanonicalStoryboardSceneMetadata: (sceneId) => {
    const state = get()
    const storyboardScene = state.scenes.find(scene => scene.id === sceneId)
    if (!storyboardScene) return null
    const scriptScene = getStoryboardCanonicalScriptScene(state, storyboardScene)
    return {
      sceneId: storyboardScene.id,
      linkedScriptSceneId: storyboardScene.linkedScriptSceneId || null,
      scriptSceneId: scriptScene?.id || null,
      sceneNumber: scriptScene?.sceneNumber ?? storyboardScene.sceneLabel ?? '',
      titleSlugline: scriptScene?.slugline ?? storyboardScene.slugline ?? '',
      location: scriptScene?.location ?? storyboardScene.location ?? '',
      intOrExt: scriptScene?.intExt ?? storyboardScene.intOrExt ?? '',
      dayNight: scriptScene?.dayNight ?? storyboardScene.dayNight ?? '',
      color: scriptScene?.color ?? storyboardScene.color ?? null,
      characters: scriptScene?.characters ?? [],
    }
  },

  updateCanonicalStoryboardSceneMetadata: (sceneId, updates) => {
    const state = get()
    const storyboardScene = state.scenes.find(scene => scene.id === sceneId)
    if (!storyboardScene) return
    const linkedScriptScene = getStoryboardCanonicalScriptScene(state, storyboardScene)

    if (linkedScriptScene) {
      const scriptUpdates = {
        ...(('sceneNumber' in updates) ? { sceneNumber: updates.sceneNumber } : {}),
        ...(('titleSlugline' in updates) ? { slugline: updates.titleSlugline || '' } : {}),
        ...(('location' in updates) ? { location: updates.location || '' } : {}),
        ...(('intOrExt' in updates) ? { intExt: updates.intOrExt || '' } : {}),
        ...(('dayNight' in updates) ? { dayNight: updates.dayNight || '' } : {}),
        ...(('color' in updates) ? { color: updates.color || null } : {}),
      }
      get().updateScriptScene(linkedScriptScene.id, scriptUpdates)
      return
    }

    const sceneUpdates = {
      ...(('sceneNumber' in updates) ? { sceneLabel: updates.sceneNumber } : {}),
      ...(('titleSlugline' in updates) ? { slugline: updates.titleSlugline || '' } : {}),
      ...(('location' in updates) ? { location: updates.location } : {}),
      ...(('intOrExt' in updates) ? { intOrExt: updates.intOrExt } : {}),
      ...(('dayNight' in updates) ? { dayNight: updates.dayNight } : {}),
      ...(('color' in updates) ? { color: updates.color } : {}),
    }
    get().updateScene(sceneId, sceneUpdates)
  },

  linkStoryboardSceneToScriptScene: (storyboardSceneId, scriptSceneId) => {
    set(state => {
      const scriptScene = scriptSceneId
        ? state.scriptScenes.find(s => s.id === scriptSceneId)
        : null
      return {
        scenes: state.scenes.map(scene => {
          if (scene.id !== storyboardSceneId) return scene
          if (!scriptSceneId) return { ...scene, linkedScriptSceneId: null }
          return {
            ...scene,
            linkedScriptSceneId: scriptSceneId,
            ...(mapScriptSceneToStoryboardMetadata(scriptScene) || {}),
          }
        }),
      }
    })
    get()._scheduleAutoSave()
  },

  // ── Shot actions (most work by shotId, searching across all scenes) ──

  addShot: (sceneId) => {
    const { scenes, defaultFocalLength } = get()
    const scene = scenes.find(s => s.id === sceneId)
    if (!scene) return null
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
    return newShot.id
  },

  addShotWithOverrides: (sceneId, overrides = {}) => {
    const shotId = get().addShot(sceneId)
    if (!shotId) return null
    if (overrides && Object.keys(overrides).length > 0) {
      get().updateShot(shotId, overrides)
    }
    return shotId
  },

  deleteShot: (shotId) => {
    set(state => ({
      scenes: state.scenes.map(s => ({
        ...s,
        shots: s.shots.filter(sh => sh.id !== shotId),
      })),
      // Also remove any schedule blocks that reference the deleted shot
      schedule: state.schedule.map(day => ({
        ...day,
        blocks: day.blocks.filter(b => b.shotId !== shotId),
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
  setProjectEmoji: (emoji) => {
    set({ projectEmoji: emoji || '🎬' })
    get()._scheduleAutoSave()
  },

  // ── UI actions ───────────────────────────────────────────────────────

  toggleSettings: () => set(state => ({ settingsOpen: !state.settingsOpen })),
  closeSettings: () => set({ settingsOpen: false }),
  setActiveTab: (tab) => set({ activeTab: tab }),
  setTabViewState: (tab, patch) => {
    set(state => ({
      tabViewState: {
        ...state.tabViewState,
        [tab]: {
          ...(state.tabViewState?.[tab] || {}),
          ...(patch || {}),
        },
      },
    }))
  },
  resetTabViewState: () => set({
    tabViewState: {
      script: {},
      scenes: {},
      storyboard: {},
      shotlist: {},
      castcrew: {},
      schedule: {},
      callsheet: {},
    },
  }),
  requestScriptFocus: (sceneId, shotId = null) => set({
    scriptFocusRequest: { sceneId, shotId, at: Date.now() },
    activeTab: 'script',
  }),
  clearScriptFocusRequest: () => set({ scriptFocusRequest: null }),
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

  setShortcutBinding: (actionId, binding, opts = {}) => {
    const normalized = normalizeShortcutBinding(binding)
    if (!normalized) return { ok: false, reason: 'invalid' }

    const { replaceActionId = null } = opts
    const nextBindings = { ...get().shortcutBindings }
    const conflictingAction = Object.keys(nextBindings).find(existingAction => (
      existingAction !== actionId
      && existingAction !== replaceActionId
      && nextBindings[existingAction] === normalized
    ))

    if (conflictingAction) {
      return { ok: false, reason: 'conflict', conflictActionId: conflictingAction }
    }

    if (replaceActionId && replaceActionId !== actionId) {
      nextBindings[replaceActionId] = SHORTCUT_DEFAULTS[replaceActionId]
    }

    nextBindings[actionId] = normalized
    const hydrated = getActiveBindings(nextBindings)
    set({ shortcutBindings: hydrated })
    saveShortcutBindings(hydrated)
    return { ok: true }
  },

  resetShortcutBinding: (actionId) => {
    const nextBindings = getActiveBindings({
      ...get().shortcutBindings,
      [actionId]: SHORTCUT_DEFAULTS[actionId],
    })
    set({ shortcutBindings: nextBindings })
    saveShortcutBindings(nextBindings)
  },

  resetAllShortcutBindings: () => {
    const defaults = { ...SHORTCUT_DEFAULTS }
    set({ shortcutBindings: defaults })
    saveShortcutBindings(defaults)
  },

  executeCommand: async (actionId) => {
    const commands = {
      undo: () => get().undo(),
      redo: () => get().redo(),
      saveProject: () => get().saveProject(),
      saveProjectAs: () => get().saveProjectAs(),
    }
    const command = commands[actionId]
    if (!command) return false
    await command()
    return true
  },

  undo: () => {
    const { undoPast, undoFuture } = get()
    if (!undoPast.length) return false
    const previousSnapshot = undoPast[undoPast.length - 1]
    const currentSnapshot = getUndoableSnapshot(get())

    set(state => applyUndoSnapshot(previousSnapshot, {
      ...state,
      undoPast: undoPast.slice(0, -1),
      undoFuture: [cloneUndoSnapshot(currentSnapshot), ...undoFuture],
      undoLastRecordedAt: Date.now(),
    }))

    return true
  },

  redo: () => {
    const { undoPast, undoFuture } = get()
    if (!undoFuture.length) return false
    const nextSnapshot = undoFuture[0]
    const currentSnapshot = getUndoableSnapshot(get())

    set(state => applyUndoSnapshot(nextSnapshot, {
      ...state,
      undoPast: [...undoPast, cloneUndoSnapshot(currentSnapshot)].slice(-UNDO_HISTORY_LIMIT),
      undoFuture: undoFuture.slice(1),
      undoLastRecordedAt: Date.now(),
    }))

    return true
  },

  // ── Shotlist column widths ────────────────────────────────────────────
  setShotlistColumnWidth: (key, width) => {
    set(state => ({
      shotlistColumnWidths: { ...state.shotlistColumnWidths, [key]: width },
    }))
    get()._scheduleAutoSave()
  },

  // ── Schedule collapse state ───────────────────────────────────────────
  setDayCollapsed: (dayId, collapsed) => {
    set(state => ({
      scheduleCollapseState: {
        ...state.scheduleCollapseState,
        days: { ...state.scheduleCollapseState.days, [dayId]: collapsed },
      },
    }))
  },

  setBlockCollapsed: (blockId, collapsed) => {
    set(state => ({
      scheduleCollapseState: {
        ...state.scheduleCollapseState,
        blocks: { ...state.scheduleCollapseState.blocks, [blockId]: collapsed },
      },
    }))
  },

  setDayBlocksCollapsed: (blockIds, collapsed) => {
    set(state => {
      const next = { ...state.scheduleCollapseState.blocks }
      blockIds.forEach(id => { next[id] = collapsed })
      return { scheduleCollapseState: { ...state.scheduleCollapseState, blocks: next } }
    })
  },

  // Batch-collapse or batch-expand all shooting days at once
  setAllDaysCollapsed: (dayIds, collapsed) => {
    set(state => {
      const next = { ...state.scheduleCollapseState.days }
      dayIds.forEach(id => { next[id] = collapsed })
      return { scheduleCollapseState: { ...state.scheduleCollapseState, days: next } }
    })
  },

  // ── Save / Load ──────────────────────────────────────────────────────

  getProjectData: () => {
    const {
      projectName, projectEmoji, columnCount, defaultFocalLength,
      theme, autoSave, useDropdowns, scenes, shotlistColumnConfig,
      customColumns, customDropdownOptions, schedule, scheduleColumnConfig,
      shotlistColumnWidths, callsheets, callsheetSectionConfig,
      castRoster, crewRoster,
      castCrewNotes,
      scriptScenes, importedScripts, scriptSettings,
      shortcutBindings,
      storyboardSceneOrder,
    } = get()
    return {
      version: 2,
      projectName,
      projectEmoji: projectEmoji || '🎬',
      columnCount,
      defaultFocalLength,
      theme,
      autoSave,
      useDropdowns,
      shotlistColumnConfig,
      scheduleColumnConfig,
      shotlistColumnWidths: shotlistColumnWidths || {},
      customColumns,
      customDropdownOptions,
      storyboardSceneOrder: normalizeStoryboardSceneOrder(storyboardSceneOrder, scenes),
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
            description: s.description || s.subject || '',
            cast: s.cast || '',
            checked: s.checked,
            intOrExt: s.intOrExt,
            dayNight: s.dayNight,
            scriptTime: s.scriptTime,
            setupTime: s.setupTime,
            predictedTakes: s.predictedTakes,
            shootTime: s.shootTime,
            takeNumber: s.takeNumber,
            sound: s.sound || '',
            props: s.props || '',
            frameRate: s.frameRate || '',
            linkedSceneId: s.linkedSceneId || null,
            linkedDialogueLine: s.linkedDialogueLine || null,
            linkedDialogueOffset: s.linkedDialogueOffset ?? null,
            linkedScriptRangeStart: s.linkedScriptRangeStart ?? null,
            linkedScriptRangeEnd: s.linkedScriptRangeEnd ?? null,
          }
          for (const key of Object.keys(s)) {
            if (key.startsWith('custom_')) shot[key] = s[key]
          }
          return shot
        })
        return {
          id: scene.id,
          sceneLabel: scene.sceneLabel,
          slugline: scene.slugline || '',
          location: scene.location,
          intOrExt: scene.intOrExt,
          dayNight: scene.dayNight,
          cameras: scene.cameras,
          linkedScriptSceneId: scene.linkedScriptSceneId || null,
          // pageNotes is stored as an array (one entry per storyboard page)
          pageNotes: Array.isArray(scene.pageNotes) ? scene.pageNotes : [scene.pageNotes || ''],
          pageColors: Array.isArray(scene.pageColors) ? scene.pageColors : [],
          shots,
        }
      }),
      // Schedule blocks are also reconstructed explicitly for the same reason.
      schedule: schedule.map(day => ({
        id: day.id,
        date: day.date,
        startTime: day.startTime,
        primaryLocation: day.primaryLocation || '',
        basecamp: day.basecamp,
        blocks: (day.blocks || day.shotBlocks || []).map(b => {
          if (b.type === 'break') {
            return { id: b.id, type: b.type, label: b.label || b.breakName || 'Break', duration: b.duration ?? b.breakDuration ?? 0 }
          }
          if (b.type === 'move' || b.type === 'meal' || b.type === 'travel') {
            return {
              id: b.id,
              type: b.type,
              label: b.label || b.blockName || b.type,
              duration: b.duration ?? b.blockDuration ?? 0,
              ...(b.type === 'move' ? { location: b.location || b.blockLocation || '' } : {}),
            }
          }
          return {
            id: b.id,
            type: 'shot',
            shotId: b.shotId,
            estimatedShootTime: b.estimatedShootTime,
            estimatedSetupTime: b.estimatedSetupTime,
            shootingLocation: b.shootingLocation,
            castMembers: Array.isArray(b.castMembers) ? [...b.castMembers] : [],
          }
        }),
      })),
      callsheets: callsheets || {},
      callsheetSectionConfig: callsheetSectionConfig || DEFAULT_CALLSHEET_SECTION_CONFIG,
      castRoster: (castRoster || []).map(normalizeCastEntry),
      crewRoster: (crewRoster || []).map(normalizeCrewEntry),
      castCrewNotes: castCrewNotes || '',
      // Script import state
      scriptScenes: (scriptScenes || []).map(s => ({
        id: s.id,
        sceneNumber: s.sceneNumber != null ? String(s.sceneNumber) : '',
        slugline: s.slugline,
        intExt: s.intExt,
        dayNight: s.dayNight,
        location: s.location,
        customHeader: s.customHeader,
        characters: s.characters || [],
        actionText: s.actionText || '',
        screenplayText: s.screenplayText || '',
        screenplayElements: ensureEditableScreenplayElements(s.screenplayElements),
        dialogueCount: s.dialogueCount || 0,
        pageCount: s.pageCount ?? null,
        pageStart: s.pageStart ?? null,
        pageEnd: s.pageEnd ?? null,
        complexityTags: s.complexityTags || [],
        estimatedMinutes: s.estimatedMinutes ?? null,
        linkedShotIds: s.linkedShotIds || [],
        notes: s.notes || '',
        importSource: s.importSource || '',
        color: s.color || null,
      })),
      importedScripts: importedScripts || [],
      scriptSettings: scriptSettings || {
        baseMinutesPerPage: 5,
        autoSuggestTags: true,
        showConfidenceIndicators: true,
        defaultSceneColor: null,
        scenePaginationMode: 'natural',
        documentSettings: DEFAULT_SCRIPT_DOCUMENT_SETTINGS,
      },
      shortcutBindings: getActiveBindings(shortcutBindings || SHORTCUT_DEFAULTS),
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
          set({ lastSaved: new Date().toISOString(), projectPath: result.filePath, hasUnsavedChanges: false })
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
        set({ lastSaved: new Date().toISOString(), hasUnsavedChanges: false })
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
          set({ lastSaved: new Date().toISOString(), projectPath: result.filePath, hasUnsavedChanges: false })
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
        set({ lastSaved: new Date().toISOString(), hasUnsavedChanges: false })
      } catch (err) {
        alert(`Save failed: ${err.message}`)
      }
    }
  },

  loadProject: (data) => {
    const {
      projectName, projectEmoji, columnCount, defaultFocalLength,
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
      description: s.description || s.subject || '',
      cast: s.cast || '',
      checked: s.checked || false,
      // Per-shot I/E and D/N: use saved value if present, else inherit from scene (migration)
      intOrExt: s.intOrExt !== undefined ? s.intOrExt : (sceneIntOrExt || ''),
      dayNight: s.dayNight !== undefined ? s.dayNight : (sceneDayNight || ''),
      scriptTime: s.scriptTime || '',
      setupTime: s.setupTime || '',
      predictedTakes: s.predictedTakes || '',
      shootTime: s.shootTime || '',
      takeNumber: s.takeNumber || '',
      sound: s.sound || '',
      props: s.props || '',
      frameRate: s.frameRate || '',
      linkedSceneId: s.linkedSceneId || null,
      linkedDialogueLine: s.linkedDialogueLine || null,
      linkedDialogueOffset: s.linkedDialogueOffset ?? null,
      linkedScriptRangeStart: s.linkedScriptRangeStart ?? null,
      linkedScriptRangeEnd: s.linkedScriptRangeEnd ?? null,
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
        slugline: scene.slugline || '',
        location: scene.location || 'LOCATION',
        intOrExt: scene.intOrExt || 'INT',
        dayNight: scene.dayNight || 'DAY',
        cameras: scene.cameras || [{ name: scene.cameraName || 'Camera 1', body: scene.cameraBody || 'fx30' }],
        linkedScriptSceneId: scene.linkedScriptSceneId || null,
        // Migrate string pageNotes (legacy) to array format
        pageNotes: Array.isArray(scene.pageNotes)
          ? scene.pageNotes
          : [scene.pageNotes || ''],
        pageColors: Array.isArray(scene.pageColors) ? scene.pageColors : [],
        shots: (scene.shots || []).map(s => mapShot(s, scene.intOrExt, scene.dayNight)),
      }))
    } else {
      // Old single-scene format (v1) – migrate
      scenes = [createScene({
        id: 'scene_1',
        sceneLabel: data.sceneLabel || 'SCENE 1',
        slugline: data.slugline || '',
        location: data.location || 'LOCATION',
        intOrExt: data.intOrExt || 'INT',
        dayNight: data.dayNight || 'DAY',
        cameras: [{ name: data.cameraName || 'Camera 1', body: data.cameraBody || 'fx30' }],
        pageNotes: Array.isArray(data.pageNotes) ? data.pageNotes : [data.pageNotes || ''],
        pageColors: Array.isArray(data.pageColors) ? data.pageColors : [],
        shots: (data.shots || []).map(s => mapShot(s, data.intOrExt, data.dayNight)),
      })]
    }

    const loadedSchedule = Array.isArray(data.schedule)
      ? data.schedule.map(day => ({
          id: day.id || `day_${Date.now()}_${++dayIdCounter}`,
          date: day.date || '',
          startTime: day.startTime || '',
          primaryLocation: day.primaryLocation || day.shootLocation || '',
          basecamp: day.basecamp || '',
          // Accept both new 'blocks' format and legacy 'shotBlocks' format
          blocks: (day.blocks || day.shotBlocks || []).map(b => {
            if (b.type === 'break') {
              return {
                id: b.id || `block_${Date.now()}_${++blockIdCounter}`,
                type: 'break',
                // Accept new 'label'/'duration' or legacy 'breakName'/'breakDuration'
                label: b.label || b.breakName || 'Break',
                duration: b.duration ?? b.breakDuration ?? 0,
              }
            }
            if (b.type === 'move' || b.type === 'meal' || b.type === 'travel') {
              const defaultNames = { move: 'Company Move', meal: 'Meal', travel: 'Travel' }
              return {
                id: b.id || `block_${Date.now()}_${++blockIdCounter}`,
                type: b.type,
                // Accept new 'label'/'duration'/'location' or legacy 'blockName'/'blockDuration'/'blockLocation'
                label: b.label || b.blockName || defaultNames[b.type] || b.type,
                duration: b.duration ?? b.blockDuration ?? 0,
                ...(b.type === 'move' ? { location: b.location || b.blockLocation || '' } : {}),
              }
            }
            return {
              id: b.id || `block_${Date.now()}_${++blockIdCounter}`,
              type: 'shot',
              shotId: b.shotId || '',
              estimatedShootTime: b.estimatedShootTime || '',
              estimatedSetupTime: b.estimatedSetupTime || '',
              shootingLocation: b.shootingLocation || '',
              castMembers: b.castMembers || [],
            }
          }),
        }))
      : []
    const loadedCollapseState = {
      days: Object.fromEntries(loadedSchedule.map(day => [day.id, false])),
      blocks: Object.fromEntries(
        loadedSchedule.flatMap(day => (day.blocks || []).map(block => [block.id, true]))
      ),
    }

    set({
      projectName: projectName || 'Untitled Shotlist',
      projectEmoji: projectEmoji || '🎬',
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
        // Migrate legacy keys
        const migratedCast = base.map(c => {
          if (c.key === 'subject') return { ...c, key: 'cast' }
          if (c.key === 'checked') return { ...c, key: 'status' }
          if (c.key === 'image') return { ...c, key: 'thumbnail' }
          return c
        })
        // Append any built-in columns not yet in saved config
        const savedKeys = new Set(migratedCast.map(c => c.key))
        const newBuiltin = DEFAULT_COLUMN_CONFIG.filter(c => !savedKeys.has(c.key))
        // Append any custom columns from saved data not yet in config
        const customInConfig = loadedCustomColumns
          .filter(c => !savedKeys.has(c.key))
          .map(c => ({ key: c.key, visible: true }))
        const all = [...migratedCast, ...newBuiltin, ...customInConfig]
        return all
      })(),
      customColumns: loadedCustomColumns,
      customDropdownOptions: loadedCustomDropdownOptions,
      scenes: scenes.map((scene, idx) => {
        if (scene.linkedScriptSceneId) return scene
        const fallbackScriptScene = Array.isArray(data.scriptScenes) ? data.scriptScenes[idx] : null
        if (!fallbackScriptScene?.id) return scene
        return {
          ...scene,
          linkedScriptSceneId: fallbackScriptScene.id,
          location: fallbackScriptScene.location || scene.location,
          intOrExt: fallbackScriptScene.intExt || scene.intOrExt,
          dayNight: fallbackScriptScene.dayNight || scene.dayNight,
          sceneLabel: fallbackScriptScene.sceneNumber ? `SCENE ${fallbackScriptScene.sceneNumber}` : scene.sceneLabel,
        }
      }),
      storyboardSceneOrder: normalizeStoryboardSceneOrder(data.storyboardSceneOrder, scenes),
      schedule: loadedSchedule,
      scheduleCollapseState: loadedCollapseState,
      scheduleColumnConfig: (() => {
        const saved = data.scheduleColumnConfig
        if (!saved || !Array.isArray(saved) || saved.length === 0) return DEFAULT_SCHEDULE_COLUMN_CONFIG
        // Append any new columns added since the project was saved
        const savedKeys = new Set(saved.map(c => c.key))
        const newCols = DEFAULT_SCHEDULE_COLUMN_CONFIG.filter(c => !savedKeys.has(c.key))
        return [...saved, ...newCols]
      })(),
      shotlistColumnWidths: (typeof data.shotlistColumnWidths === 'object' && data.shotlistColumnWidths !== null)
        ? data.shotlistColumnWidths
        : {},
      callsheets: (typeof data.callsheets === 'object' && data.callsheets !== null)
        ? data.callsheets
        : {},
      castRoster: Array.isArray(data.castRoster) ? data.castRoster.map(normalizeCastEntry) : [],
      crewRoster: Array.isArray(data.crewRoster) ? data.crewRoster.map(normalizeCrewEntry) : [],
      castCrewNotes: typeof data.castCrewNotes === 'string' ? data.castCrewNotes : '',
      callsheetSectionConfig: (() => {
        const saved = data.callsheetSectionConfig
        if (!saved || !Array.isArray(saved) || saved.length === 0) return DEFAULT_CALLSHEET_SECTION_CONFIG
        const savedKeys = new Set(saved.map(c => c.key))
        const newSections = DEFAULT_CALLSHEET_SECTION_CONFIG.filter(c => !savedKeys.has(c.key))
        return [...saved, ...newSections]
      })(),
      // Script import state — default to empty for older project files
      scriptScenes: Array.isArray(data.scriptScenes)
        ? data.scriptScenes.map(s => deriveScriptSceneFromElements(
          { ...s, sceneNumber: s?.sceneNumber != null ? String(s.sceneNumber) : '' },
          s.screenplayElements,
        ))
        : [],
      importedScripts: Array.isArray(data.importedScripts) ? data.importedScripts : [],
      scriptSettings: {
        baseMinutesPerPage: 5,
        autoSuggestTags: true,
        showConfidenceIndicators: true,
        defaultSceneColor: null,
        scenePaginationMode: 'natural',
        ...(data.scriptSettings || {}),
        documentSettings: normalizeDocumentSettings(data?.scriptSettings?.documentSettings),
      },
      shortcutBindings: getActiveBindings(data.shortcutBindings || loadShortcutBindings() || SHORTCUT_DEFAULTS),
      lastSaved: new Date().toISOString(),
      hasUnsavedChanges: false,
      activeTab: 'script',
      documentSession: get().documentSession + 1,
      tabViewState: {
        script: {},
        scenes: {},
        storyboard: {},
        shotlist: {},
        castcrew: {},
        schedule: {},
        callsheet: {},
      },
      undoPast: [],
      undoFuture: [],
      undoLastRecordedAt: 0,
    })
    saveShortcutBindings(get().shortcutBindings)
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
      projectEmoji: '🎬',
      scenes: [scene],
      storyboardSceneOrder: [],
      schedule: [],
      callsheets: {},
      castRoster: [],
      crewRoster: [],
      castCrewNotes: '',
      scriptScenes: [],
      importedScripts: [],
      projectPath: null,
      lastSaved: null,
      activeTab: 'script',
      documentSession: get().documentSession + 1,
      tabViewState: {
        script: {},
        scenes: {},
        storyboard: {},
        shotlist: {},
        castcrew: {},
        schedule: {},
        callsheet: {},
      },
      undoPast: [],
      undoFuture: [],
      undoLastRecordedAt: 0,
    })
  },

  // ── Auto-save ────────────────────────────────────────────────────────

  _autoSaveTimeout: null,
  _scheduleAutoSave: () => {
    set({ hasUnsavedChanges: true })
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

let isApplyingUndoState = false

useStore.subscribe((state, previousState) => {
  if (isApplyingUndoState) return

  const stateChangedByUndo =
    state.undoPast !== previousState.undoPast
    || state.undoFuture !== previousState.undoFuture
    || state.undoLastRecordedAt !== previousState.undoLastRecordedAt

  if (stateChangedByUndo) return

  const previousSnapshot = getUndoableSnapshot(previousState)
  const nextSnapshot = getUndoableSnapshot(state)
  const previousSerialized = JSON.stringify(previousSnapshot)
  const nextSerialized = JSON.stringify(nextSnapshot)
  if (previousSerialized === nextSerialized) return

  const now = Date.now()
  const shouldGroup = now - (state.undoLastRecordedAt || 0) <= UNDO_GROUP_WINDOW_MS

  isApplyingUndoState = true
  useStore.setState(currentState => ({
    undoPast: shouldGroup
      ? currentState.undoPast
      : [...currentState.undoPast, cloneUndoSnapshot(previousSnapshot)].slice(-UNDO_HISTORY_LIMIT),
    undoFuture: [],
    undoLastRecordedAt: now,
  }))
  isApplyingUndoState = false
})

const baseUndo = useStore.getState().undo
const baseRedo = useStore.getState().redo

useStore.setState({
  undo: () => {
    isApplyingUndoState = true
    const result = baseUndo()
    isApplyingUndoState = false
    return result
  },
  redo: () => {
    isApplyingUndoState = true
    const result = baseRedo()
    isApplyingUndoState = false
    return result
  },
})

export default useStore
