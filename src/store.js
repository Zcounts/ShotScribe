import { create } from 'zustand'
import { arrayMove } from '@dnd-kit/sortable'
import { computeEstimate, computeConfidence, parseSlugline } from './utils/scriptParser'
import { ensureEditableScreenplayElements, estimateScreenplayPagination, splitScreenplayElementsIntoSceneChunks } from './utils/screenplay'
import { DEFAULT_SCRIPT_DOCUMENT_SETTINGS, normalizeDocumentSettings } from './utils/scriptDocumentFormatting'
import { computeCastSceneMetrics, resolveLinkedScriptSceneId } from './utils/callsheetMetrics'
import {
  SHORTCUT_DEFAULTS,
  getActiveBindings,
  loadShortcutBindings,
  normalizeShortcutBinding,
  saveShortcutBindings,
} from './shortcuts'
import {
  DEFAULT_STORYBOARD_DISPLAY_CONFIG,
  normalizeStoryboardDisplayConfig,
} from './storyboardDisplayConfig'
import {
  DEFAULT_CASTCREW_DISPLAY_CONFIG,
  normalizeCastCrewDisplayConfig,
} from './castCrewDisplayConfig'
import { devPerfLog } from './utils/devPerf'
import { platformService } from './services/platformService'
import { runtimeConfig } from './config/runtimeConfig'
import { logTelemetry } from './utils/telemetry'
import {
  isSessionMetricsEnabled,
  recordDomainCommit,
  recordSnapshotHydrationDeferred,
  recordSnapshotHydrationTriggered,
  recordSnapshotWrite,
} from './utils/sessionMetrics'
import { createCloudProjectAdapter, createProjectRepository } from './data/repository'
import { buildConvexSafeSnapshotPayload } from './data/repository/cloudSnapshotPayload'
import { detectUnmigratedLocalAssetsFromProjectData } from './utils/localAssetPreflight'
import {
  normalizeScriptDocumentState,
  SCRIPT_DERIVATION_VERSION,
  SCRIPT_DOC_VERSION,
  SCRIPT_ENGINE_PROSEMIRROR,
} from './features/scriptDocument/legacyBridge'
import {
  deriveScriptAdapterOutputs,
  SCRIPT_DERIVATION_DEBOUNCE_MS,
} from './features/scriptDocument/derivationPipeline'
import {
  addBreakdownAnnotation,
  removeBreakdownAnnotation,
  removeShotLinkAnnotationByShotId,
  upsertShotLinkAnnotation,
} from './features/scriptDocument/breakdownAnnotations'

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

export const CALLSHEET_COLUMN_DEFINITIONS = {
  advancedSchedule: [
    { key: 'sceneNumber', label: 'Scene #' },
    { key: 'sluglineScene', label: 'Slugline / Scene' },
    { key: 'location', label: 'Location' },
    { key: 'intExt', label: 'I/E' },
    { key: 'dayNight', label: 'D/N' },
    { key: 'start', label: 'Start' },
    { key: 'end', label: 'End' },
    { key: 'pages', label: 'Pages' },
    { key: 'shots', label: 'Shots' },
    { key: 'notes', label: 'Notes' },
  ],
  castList: [
    { key: 'actor', label: 'Actor' },
    { key: 'character', label: 'Character' },
    { key: 'sceneCount', label: 'SC(Day) Scenes' },
    { key: 'pageCount', label: 'PG(Day) Pages' },
    { key: 'pickupTime', label: 'Pickup - Day' },
    { key: 'makeupCall', label: 'Makeup - Day' },
    { key: 'setCall', label: 'Set - Day' },
    { key: 'contact', label: 'Contact' },
  ],
  crewList: [
    { key: 'name', label: 'Name' },
    { key: 'role', label: 'Department / Role' },
    { key: 'callTime', label: 'Call Time - Day' },
    { key: 'notes', label: 'Notes - Day' },
    { key: 'contact', label: 'Contact' },
  ],
}

const CALLSHEET_PRIMARY_COLUMN_BY_SECTION = {
  advancedSchedule: 'sluglineScene',
  castList: 'actor',
  crewList: 'name',
}

export const DEFAULT_CALLSHEET_COLUMN_CONFIG = Object.fromEntries(
  Object.entries(CALLSHEET_COLUMN_DEFINITIONS).map(([sectionKey, columns]) => ([
    sectionKey,
    columns.map(column => ({
      key: column.key,
      visible: true,
    })),
  ]))
)

function normalizeCallsheetColumnConfig(config) {
  const savedConfig = (typeof config === 'object' && config !== null) ? config : {}
  return Object.fromEntries(
    Object.entries(CALLSHEET_COLUMN_DEFINITIONS).map(([sectionKey, columns]) => {
      const savedRows = Array.isArray(savedConfig[sectionKey]) ? savedConfig[sectionKey] : []
      const visibleByKey = new Map(savedRows.map(row => [row?.key, !!row?.visible]))
      const primaryKey = CALLSHEET_PRIMARY_COLUMN_BY_SECTION[sectionKey]
      return [sectionKey, columns.map(column => ({
        key: column.key,
        visible: column.key === primaryKey ? true : (visibleByKey.has(column.key) ? visibleByKey.get(column.key) : true),
      }))]
    })
  )
}

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
const OVERWRITE_TRACE_PREFIX = '[OVERWRITE_TRACE]'
const OVERWRITE_TRACE_BUFFER_KEY = '__SS_OVERWRITE_TRACE__'
const OVERWRITE_TRACE_HEAD_KEY = '__SS_TRACE_LATEST_HEAD__'
const OVERWRITE_REVERT_SEEN_KEY = '__SS_TRACE_REVERT_SEEN__'
const OVERWRITE_TRACE_EVENT_NAME = '__SS_OVERWRITE_TRACE_EVENT__'

function isOverwriteTraceEnabled() {
  if (import.meta.env.DEV) return true
  if (typeof window === 'undefined') return false
  try {
    const params = new URLSearchParams(window.location?.search || '')
    if (params.get('ssCloudDebug') === '1') return true
    return window.localStorage?.getItem('ssCloudDebug') === '1'
  } catch {
    return false
  }
}

function getCompactTraceStack() {
  const stack = new Error().stack || ''
  return stack.split('\n').slice(1, 7).map(line => line.trim()).join(' | ')
}

function getShotImageMapFromScenes(scenes = []) {
  const map = new Map()
  ;(Array.isArray(scenes) ? scenes : []).forEach((scene) => {
    ;(scene?.shots || []).forEach((shot) => {
      const shotId = String(shot?.id || '')
      if (!shotId) return
      map.set(shotId, {
        image: shot?.image || null,
        thumb: shot?.imageAsset?.thumb || null,
      })
    })
  })
  return map
}

function summarizeShotImageDiff(beforeScenes = [], afterScenes = []) {
  const beforeMap = getShotImageMapFromScenes(beforeScenes)
  const afterMap = getShotImageMapFromScenes(afterScenes)
  const allIds = new Set([...beforeMap.keys(), ...afterMap.keys()])
  const imageChanged = []
  const imageAssetChanged = []
  const thumbSamples = []
  for (const shotId of allIds) {
    const before = beforeMap.get(shotId) || { image: null, thumb: null }
    const after = afterMap.get(shotId) || { image: null, thumb: null }
    if (before.image !== after.image) imageChanged.push(shotId)
    if (before.thumb !== after.thumb) imageAssetChanged.push(shotId)
    if (thumbSamples.length < 5 && (before.image !== after.image || before.thumb !== after.thumb)) {
      thumbSamples.push({
        shotId,
        beforeImage: before.image,
        afterImage: after.image,
        beforeThumb: before.thumb,
        afterThumb: after.thumb,
      })
    }
  }
  return {
    imageChangedCount: imageChanged.length,
    imageAssetChangedCount: imageAssetChanged.length,
    imageChangedShotIds: imageChanged.slice(0, 10),
    imageAssetChangedShotIds: imageAssetChanged.slice(0, 10),
    thumbSamples,
  }
}

function emitOverwriteTrace(event, payload = {}) {
  if (!isOverwriteTraceEnabled()) return
  const entry = {
    event,
    ts: new Date().toISOString(),
    ...payload,
  }
  if (typeof window !== 'undefined') {
    const list = Array.isArray(window[OVERWRITE_TRACE_BUFFER_KEY]) ? window[OVERWRITE_TRACE_BUFFER_KEY] : []
    list.push(entry)
    window[OVERWRITE_TRACE_BUFFER_KEY] = list.slice(-400)
    try {
      window.dispatchEvent(new CustomEvent(OVERWRITE_TRACE_EVENT_NAME, { detail: entry }))
    } catch {}
  }
  // eslint-disable-next-line no-console
  console.info(OVERWRITE_TRACE_PREFIX, entry)
}

function getOverwriteStateContext(state = {}, extra = {}) {
  const latestHeadSnapshotId = typeof window !== 'undefined'
    ? String(window[OVERWRITE_TRACE_HEAD_KEY] || '')
    : ''
  return {
    projectId: state?.projectRef?.type === 'cloud' ? state?.projectRef?.projectId || null : null,
    snapshotId: state?.projectRef?.snapshotId || null,
    cloudDirtyRevision: state?._cloudDirtyRevision ?? null,
    lastAckedSnapshotId: state?._lastAckedSnapshotId ?? null,
    latestSnapshotHeadId: latestHeadSnapshotId || null,
    hasPendingRemoteSnapshot: Boolean(state?.pendingRemoteSnapshot),
    pendingRemoteSnapshotId: state?.pendingRemoteSnapshot?.snapshotId
      ? String(state.pendingRemoteSnapshot.snapshotId)
      : null,
    syncStatus: state?.saveSyncState?.status || null,
    ...extra,
  }
}

function maybeEmitStoryboardRevertDetected({ diff, sourceLabel, stateContext, stack }) {
  if (!isOverwriteTraceEnabled()) return
  if (!diff?.imageChangedCount && !diff?.imageAssetChangedCount) return
  const shouldFlag = String(stateContext?.syncStatus || '') === 'synced_to_cloud'
    || Boolean(stateContext?.lastAckedSnapshotId)
  if (!shouldFlag) return
  const signature = `${sourceLabel}|${diff.imageChangedShotIds.join(',')}|${diff.imageAssetChangedShotIds.join(',')}`
  if (typeof window !== 'undefined') {
    const seen = window[OVERWRITE_REVERT_SEEN_KEY] instanceof Set
      ? window[OVERWRITE_REVERT_SEEN_KEY]
      : new Set()
    if (seen.has(signature)) return
    seen.add(signature)
    window[OVERWRITE_REVERT_SEEN_KEY] = seen
  }
  emitOverwriteTrace('STORYBOARD_REVERT_DETECTED', {
    sourceLabel,
    changedShotIds: Array.from(new Set([...(diff.imageChangedShotIds || []), ...(diff.imageAssetChangedShotIds || [])])).slice(0, 10),
    imageChangedCount: diff.imageChangedCount,
    imageAssetChangedCount: diff.imageAssetChangedCount,
    thumbSamples: diff.thumbSamples,
    stack,
    ...stateContext,
  })
}

function cloneUndoSnapshot(snapshot) {
  return JSON.parse(JSON.stringify(snapshot))
}

function stripHeavyImageData(snapshot) {
  if (!snapshot || !Array.isArray(snapshot.scenes)) return snapshot
  return {
    ...snapshot,
    scenes: snapshot.scenes.map(scene => ({
      ...scene,
      shots: (scene.shots || []).map((shot) => {
        if (!shot?.imageAsset) return shot
        return {
          ...shot,
          imageAsset: {
            ...shot.imageAsset,
            full: null,
          },
        }
      }),
    })),
  }
}

function buildUndoComparisonToken(snapshot) {
  const light = {
    ...snapshot,
    scenes: (snapshot?.scenes || []).map(scene => ({
      ...scene,
      shots: (scene.shots || []).map((shot) => ({
        ...shot,
        image: typeof shot.image === 'string' ? `img:${shot.image.length}` : shot.image,
        imageAsset: shot.imageAsset
          ? {
              ...shot.imageAsset,
              thumb: typeof shot.imageAsset.thumb === 'string' ? `thumb:${shot.imageAsset.thumb.length}` : null,
              full: null,
            }
          : null,
      })),
    })),
  }
  return JSON.stringify(light)
}

function getUndoableSnapshot(state) {
  return stripHeavyImageData({
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
    projectLogline: state.projectLogline,
    projectHeroImage: state.projectHeroImage,
    projectHeroOverlayColor: state.projectHeroOverlayColor,
    columnCount: state.columnCount,
    defaultFocalLength: state.defaultFocalLength,
    useDropdowns: state.useDropdowns,
    shotlistColumnConfig: state.shotlistColumnConfig,
    scheduleColumnConfig: state.scheduleColumnConfig,
    callsheetSectionConfig: state.callsheetSectionConfig,
    callsheetColumnConfig: state.callsheetColumnConfig,
    shotlistColumnWidths: state.shotlistColumnWidths,
    customColumns: state.customColumns,
    customDropdownOptions: state.customDropdownOptions,
    scriptSettings: state.scriptSettings,
    scriptDocument: state.scriptDocument,
    scriptDocumentLive: state.scriptDocumentLive,
    scriptAnnotations: state.scriptAnnotations,
  })
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

function createScriptSceneId() {
  return `sc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

function buildScriptSceneFromChunk(baseScene, chunkElements) {
  return deriveScriptSceneFromElements(baseScene, chunkElements)
}

function normalizeCastEntry(entry = {}) {
  const dedupedCharacterIds = []
  const seenCharacterIds = new Set()
  const pushCharacterId = (value) => {
    const normalized = String(value || '').trim()
    const key = normalizePersonKey(normalized)
    if (!normalized || seenCharacterIds.has(key)) return
    seenCharacterIds.add(key)
    dedupedCharacterIds.push(normalized)
  }

  if (Array.isArray(entry.characterIds)) {
    entry.characterIds.forEach(pushCharacterId)
  }
  pushCharacterId(entry.character)

  const primaryCharacter = String(entry.character || '').trim()
  const normalizedPrimary = primaryCharacter && seenCharacterIds.has(normalizePersonKey(primaryCharacter))
    ? dedupedCharacterIds.find(id => normalizePersonKey(id) === normalizePersonKey(primaryCharacter)) || dedupedCharacterIds[0] || ''
    : dedupedCharacterIds[0] || ''

  return {
    id: entry.id || `cast_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    name: entry.name || '',
    email: entry.email || '',
    phone: entry.phone || '',
    role: entry.role || 'Cast',
    department: entry.department || 'Cast',
    character: normalizedPrimary,
    characterIds: dedupedCharacterIds,
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
  const dedupedRoles = []
  const seenRoles = new Set()
  const pushRole = (value) => {
    const normalized = String(value || '').trim()
    const key = normalizePersonKey(normalized)
    if (!normalized || seenRoles.has(key)) return
    seenRoles.add(key)
    dedupedRoles.push(normalized)
  }

  if (Array.isArray(entry.roles)) {
    entry.roles.forEach(pushRole)
  }
  if (!Array.isArray(entry.roles) && String(entry.role || '').includes(',')) {
    String(entry.role || '').split(',').forEach(pushRole)
  } else {
    pushRole(entry.role)
  }

  return {
    id: entry.id || `crew_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    name: entry.name || '',
    email: entry.email || '',
    phone: entry.phone || '',
    role: dedupedRoles.join(', '),
    roles: dedupedRoles,
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
    imageAsset: null,
    specs: {
      size: '',
      type: '',
      move: '',
      equip: '',
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
    shotAspectRatio: '',
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

function getShotDisplayId(sceneNumber, shotIndex) {
  return `${sceneNumber}${getShotLetter(shotIndex)}`
}

function ensureShotDisplayId(shot, sceneNumber, shotIndex) {
  return shot.displayId || getShotDisplayId(sceneNumber, shotIndex)
}

function getNextShotDisplayId(scene, sceneNumber) {
  const used = new Set((scene.shots || []).map(shot => String(shot.displayId || '').trim()).filter(Boolean))
  let index = 0
  while (index < 2000) {
    const candidate = getShotDisplayId(sceneNumber, index)
    if (!used.has(candidate)) return candidate
    index += 1
  }
  return `${sceneNumber}ZZ`
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
    return platformService.loadRecentProjects()
  } catch {
    // Guard against malformed/unavailable persisted storage causing renderer
    // startup crashes (e.g. SecurityError in some file:// environments).
    try {
      platformService.saveRecentProjects([])
    } catch {
      // Ignore storage cleanup failures; renderer should still boot.
    }
    return []
  }
}

function getTotalShotsFromProjectData(data) {
  return (data.scenes || [{ shots: data.shots || [] }])
    .reduce((a, s) => a + (s.shots || []).length, 0)
}

function buildRecentProjectEntry({ name, path, shots, browserProjectId = null }) {
  return {
    name,
    path,
    date: new Date().toISOString(),
    shots,
    ...(browserProjectId ? { browserProjectId } : {}),
  }
}

function updateRecentProjects(get, set, entry) {
  const matcher = entry.browserProjectId
    ? (r) => r.browserProjectId === entry.browserProjectId
    : (r) => r.path === entry.path
  const recent = get().recentProjects.filter(r => !matcher(r))
  const newRecent = [entry, ...recent].slice(0, 10)
  set({ recentProjects: newRecent })
  platformService.saveRecentProjects(newRecent)
}

function persistBrowserProjectState(get, set, {
  data = null,
  name = null,
  markSaved = false,
} = {}) {
  if (platformService.isDesktop()) return null
  const payload = data || get().getProjectData()
  const browserProjectId = platformService.saveBrowserProjectSnapshot(get().browserProjectId, payload)
  const fallbackName = `${payload.projectName || get().projectName || 'Untitled Shotlist'}.shotlist`
  updateRecentProjects(get, set, buildRecentProjectEntry({
    name: name || fallbackName,
    path: `browser:${browserProjectId}`,
    shots: getTotalShotsFromProjectData(payload),
    browserProjectId,
  }))
  if (markSaved) {
    set({
      lastSaved: new Date().toISOString(),
      hasUnsavedChanges: false,
      browserProjectId,
      saveSyncState: buildSyncState({
        mode: 'local_only',
        status: 'saved_locally',
        message: 'Saved locally on this device',
      }),
    })
  } else if (browserProjectId !== get().browserProjectId) {
    set({ browserProjectId })
  }
  return browserProjectId
}

const CLOUD_SYNC_DEBOUNCE_MS = 8000
const LOCAL_PERSIST_DEBOUNCE_MS = 2500
const DRAFT_COMMIT_MODE = Boolean(runtimeConfig?.sync?.draftCommitModeEnabled)
const CHECKPOINT_REASONS = new Set([
  'manual',
  'lifecycle',
  'collaborator_join',
  'periodic_checkpoint',
  'local_asset_backfill',
  'manual_checkpoint',
])

function buildSyncState({
  mode = 'local_only',
  status = 'saved_locally',
  message = 'Saved locally',
  pendingReason = null,
  lastSyncedAt = null,
  error = null,
  lastAttemptAt = null,
} = {}) {
  return {
    mode,
    status,
    message,
    pendingReason,
    lastSyncedAt,
    error,
    lastAttemptAt,
  }
}

function isInlineStoryboardImageRef(value) {
  if (typeof value !== 'string') return false
  const trimmed = value.trim().toLowerCase()
  if (!trimmed) return false
  return trimmed.startsWith('data:') || trimmed.startsWith('blob:') || trimmed.startsWith('file:')
}

function buildLocalAssetPendingMessage(preflight) {
  const shotCount = Number(preflight?.pendingShotCount || 0)
  const heroCount = Number(preflight?.pendingHeroCount || 0)
  const parts = []
  if (shotCount > 0) parts.push(`${shotCount} shot image${shotCount === 1 ? '' : 's'}`)
  if (heroCount > 0) parts.push('project hero image')
  const assetSummary = parts.length > 0 ? parts.join(' and ') : 'local image assets'
  return `Cloud backup is paused — ${assetSummary} haven't been uploaded yet. Open the project to complete upload, then try again.`
}

function hasPersistedHeroImage(heroImage) {
  if (!heroImage || typeof heroImage !== 'object') return false
  if (typeof heroImage.image === 'string' && heroImage.image.trim()) return true
  if (typeof heroImage?.imageAsset?.thumb === 'string' && heroImage.imageAsset.thumb.trim()) return true
  if (typeof heroImage?.imageAsset?.cloud?.assetId === 'string' && heroImage.imageAsset.cloud.assetId.trim()) return true
  return false
}

function normalizeProjectHeroImage(heroImagePayload) {
  if (!hasPersistedHeroImage(heroImagePayload)) return null
  const image = heroImagePayload?.imageAsset?.thumb || heroImagePayload?.image || null
  const imageAsset = heroImagePayload?.imageAsset
    ? {
        version: heroImagePayload.imageAsset.version || 1,
        mime: heroImagePayload.imageAsset.mime || 'image/webp',
        thumb: heroImagePayload.imageAsset.thumb || image || null,
        full: null,
        meta: heroImagePayload.imageAsset.meta || null,
        cloud: heroImagePayload.imageAsset.cloud || null,
      }
    : null
  return { image, imageAsset }
}

async function materializeCloudImagesForLocalSave({
  payload,
  projectRef,
  cloudImageResolver,
}) {
  if (projectRef?.type !== 'cloud') return payload
  if (typeof cloudImageResolver !== 'function') return payload

  const nextPayload = JSON.parse(JSON.stringify(payload || {}))
  const cache = new Map()
  const resolveAssetDataUrl = async (assetId) => {
    if (!assetId) return null
    const key = String(assetId)
    if (cache.has(key)) return cache.get(key)
    let dataUrl = null
    try {
      dataUrl = await cloudImageResolver(projectRef.projectId, key)
    } catch {
      dataUrl = null
    }
    cache.set(key, dataUrl || null)
    return dataUrl || null
  }

  const heroAssetId = nextPayload?.projectHeroImage?.imageAsset?.cloud?.assetId
  if (heroAssetId) {
    const resolved = await resolveAssetDataUrl(heroAssetId)
    if (typeof resolved === 'string' && resolved.trim()) {
      nextPayload.projectHeroImage.image = resolved
      nextPayload.projectHeroImage.imageAsset = {
        ...(nextPayload.projectHeroImage.imageAsset || {}),
        thumb: resolved,
      }
    }
  }

  for (const scene of (nextPayload?.scenes || [])) {
    for (const shot of (scene?.shots || [])) {
      const assetId = shot?.imageAsset?.cloud?.assetId
      if (!assetId) continue
      const hasInlineThumb = isInlineStoryboardImageRef(shot?.imageAsset?.thumb) || isInlineStoryboardImageRef(shot?.image)
      if (hasInlineThumb) continue
      const resolved = await resolveAssetDataUrl(assetId)
      if (typeof resolved !== 'string' || !resolved.trim()) continue
      shot.image = resolved
      shot.imageAsset = {
        ...(shot.imageAsset || {}),
        thumb: resolved,
      }
    }
  }

  return nextPayload
}

function buildStoryboardDomainToken(state) {
  try {
    return JSON.stringify({
      scenes: state.scenes || [],
      storyboardSceneOrder: state.storyboardSceneOrder || [],
    })
  } catch {
    return ''
  }
}

function buildScriptDomainPayloadFromProjectData(data = {}) {
  return {
    scriptScenes: data.scriptScenes || [],
    importedScripts: data.importedScripts || [],
    scriptSettings: data.scriptSettings || {},
    scriptDocument: data.scriptDocument || { type: 'doc', content: [] },
    scriptDocumentLive: data.scriptDocumentLive || null,
    scriptDocVersion: data.scriptDocVersion || null,
    scriptDerivationVersion: data.scriptDerivationVersion || null,
    scriptEngine: data.scriptEngine || null,
    scriptAnnotations: data.scriptAnnotations || { byId: {}, order: [] },
  }
}

let projectRepository = createProjectRepository()

function devCloudBackupLog(event, details = {}) {
  if (!import.meta.env.DEV) return
  // eslint-disable-next-line no-console
  console.info(`[cloud-backup] ${event}`, details)
}

const useStore = create((set, get) => ({
  // Project metadata
  projectPath: null,
  browserProjectId: null,
  projectRef: { type: 'local', path: null, browserProjectId: null },
  cloudLineage: null, // { originProjectId, lastKnownSnapshotId }
  liveModelVersion: 0,
  lastStoryboardEditAt: 0,
  projectName: 'Untitled Shotlist',
  projectEmoji: '🎬',
  projectLogline: '',
  projectHeroImage: null,
  projectHeroOverlayColor: '#1f1f27',
  lastSaved: null,
  hasUnsavedChanges: false,
  saveSyncState: buildSyncState({
    mode: 'local_only',
    status: 'saved_locally',
    message: 'Saved locally on this device',
  }),
  cloudSyncContext: {
    canSync: false,
    cloudWritesEnabled: false,
    runSnapshotMutation: null,
    runScriptDomainMutation: null,
    currentUserId: null,
    collaborationMode: false,
    hasActiveCollaborators: false,
    syncLiveStoryboardState: null,
  },
  domainDraftState: {
    dirty: {
      storyboard: false,
      script: false,
    },
    lastCommittedAt: {
      storyboard: 0,
      script: 0,
    },
  },
  _cloudSyncTimeout: null,
  _cloudSyncInFlight: false,
  _cloudDirtyRevision: null,
  _lastAckedSnapshotId: null,
  pendingRemoteSnapshot: null, // { projectId, snapshotId, payload, detectedAt, queuedWhileDirtyRevision? }
  // Tracks whether the full snapshot payload has been loaded for the current
  // cloud project. 'deferred' = project opened with metadata only; 'loading' =
  // fetch in flight; 'loaded' = loadProject() has been called with full payload;
  // 'error' = hydration failed (project is still usable via live tables).
  snapshotHydrationState: { status: 'idle', projectId: null },
  cloudRepositoryReady: false,
  cloudImageUploader: null,
  cloudImageResolver: null,
  localAssetBackfillRequestedAt: 0,
  documentSession: 0,
  appMode: runtimeConfig.appMode,

  // Boot-time user and entitlement cache — populated once at app startup by
  // CloudSyncCoordinator, then read by all downstream consumers from here
  // instead of maintaining per-component Convex live subscriptions.
  currentUser: null,
  entitlement: null,
  userDataLoaded: false,

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
  contextMenu: null, // { type: 'shot'|'scene', entityId, x, y } | { type: 'person', personType, personId, x, y }
  personDialog: null, // { type: 'cast'|'crew', id: string|null }
  activeTab: 'home', // 'home' | 'storyboard' | 'shotlist' | 'scenes' | 'script' | 'schedule' | 'callsheet' | 'castcrew'
  shotlistColumnConfig: DEFAULT_COLUMN_CONFIG,
  scheduleColumnConfig: DEFAULT_SCHEDULE_COLUMN_CONFIG,
  callsheetSectionConfig: DEFAULT_CALLSHEET_SECTION_CONFIG,
  callsheetColumnConfig: DEFAULT_CALLSHEET_COLUMN_CONFIG,
  storyboardDisplayConfig: DEFAULT_STORYBOARD_DISPLAY_CONFIG,
  castCrewDisplayConfig: DEFAULT_CASTCREW_DISPLAY_CONFIG,

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
  shotPropertiesDialog: null, // { shotId }
  tabViewState: {
    home: {
      cloudProjectsExpanded: true,
      pendingDeletionExpanded: false,
    },
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
  storyboardImageCache: {}, // { [shotId]: { full, updatedAt } } (runtime-only; excluded from project payload)
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
  scriptEngine: SCRIPT_ENGINE_PROSEMIRROR,
  scriptDocVersion: SCRIPT_DOC_VERSION,
  scriptDerivationVersion: SCRIPT_DERIVATION_VERSION,
  scriptDocument: { type: 'doc', content: [] },
  scriptAnnotations: { byId: {}, order: [] },
  scriptDocumentLive: null,
  scriptDerivedCache: {
    sceneMetadataByScriptSceneId: {},
    breakdownTags: [],
    breakdownAggregates: { total: 0, byScene: {}, byCategory: {} },
    breakdownLists: { perScene: {}, global: {} },
    shotLinkIndexBySceneId: {},
  },
  scriptDerivationState: {
    status: 'idle', // idle | pending | deriving | synced | failed
    lastDerivedAt: null,
    lastReason: null,
    lastError: null,
  },
  _scriptDerivationTimeout: null,

  // ── Script scene actions ──────────────────────────────────────────────

  updateScriptDocumentLive: (nextDocument, { reason = 'script_typing', debounceMs = SCRIPT_DERIVATION_DEBOUNCE_MS } = {}) => {
    const current = get()
    const safeDocument = (nextDocument && nextDocument.type === 'doc' && Array.isArray(nextDocument.content))
      ? nextDocument
      : { type: 'doc', content: [] }

    if (current._scriptDerivationTimeout) {
      clearTimeout(current._scriptDerivationTimeout)
    }

    set({
      scriptDocumentLive: safeDocument,
      hasUnsavedChanges: true,
      scriptDerivationState: {
        ...current.scriptDerivationState,
        status: 'pending',
        lastReason: reason,
        lastError: null,
      },
    })
    get()._updateSaveSyncStateForChange(reason)

    const timeout = setTimeout(() => {
      const latest = get()
      const committedDoc = latest.scriptDocumentLive || safeDocument
      set({ scriptDocument: committedDoc, scriptDocumentLive: null, _scriptDerivationTimeout: null })
      get().deriveScriptDocumentNow({ reason: 'script_document_debounce', persist: true })
    }, Math.max(0, Number(debounceMs) || SCRIPT_DERIVATION_DEBOUNCE_MS))

    set({ _scriptDerivationTimeout: timeout })
  },

  deriveScriptDocumentNow: ({ reason = 'script_document_manual', persist = false } = {}) => {
    const state = get()
    set({
      scriptDerivationState: {
        ...state.scriptDerivationState,
        status: 'deriving',
        lastReason: reason,
        lastError: null,
      },
    })

    try {
      const derived = deriveScriptAdapterOutputs({
        scriptDocument: state.scriptDocumentLive || state.scriptDocument,
        previousScriptScenes: state.scriptScenes,
        scriptSettings: state.scriptSettings,
        scriptAnnotations: state.scriptAnnotations,
        storyboardScenes: state.scenes,
      })

      const derivedAt = new Date().toISOString()
      set((latestState) => ({
        scriptScenes: derived.scriptScenes,
        scriptDerivedCache: {
          sceneMetadataByScriptSceneId: derived.compatibility.sceneMetadataByScriptSceneId || {},
          breakdownTags: derived.compatibility.breakdownTags || [],
          breakdownAggregates: derived.compatibility.breakdownAggregates || { total: 0, byScene: {}, byCategory: {} },
          breakdownLists: derived.compatibility.breakdownLists || { perScene: {}, global: {} },
          shotLinkIndexBySceneId: derived.compatibility.shotLinkIndexBySceneId || {},
        },
        scriptSettings: {
          ...latestState.scriptSettings,
          breakdownTags: derived.compatibility.breakdownTags || [],
        },
        scriptDerivationState: {
          ...latestState.scriptDerivationState,
          status: 'synced',
          lastDerivedAt: derivedAt,
          lastReason: reason,
          lastError: null,
        },
      }))

      if (persist) {
        get()._scheduleAutoSave(reason)
      }

      return { ok: true, derivedAt, sceneCount: derived.scriptScenes.length }
    } catch (error) {
      set((latestState) => ({
        scriptDerivationState: {
          ...latestState.scriptDerivationState,
          status: 'failed',
          lastReason: reason,
          lastError: error?.message || 'script_derivation_failed',
        },
      }))
      return { ok: false, error: error?.message || 'script_derivation_failed' }
    }
  },

  flushScriptDocumentDerivation: ({ reason = 'script_document_flush', persist = false } = {}) => {
    const state = get()
    if (state._scriptDerivationTimeout) {
      clearTimeout(state._scriptDerivationTimeout)
      set({ _scriptDerivationTimeout: null })
    }
    if (state.scriptDocumentLive) {
      set({ scriptDocument: state.scriptDocumentLive, scriptDocumentLive: null })
    }
    return get().deriveScriptDocumentNow({ reason, persist })
  },

  addScriptBreakdownAnnotation: ({
    sceneId = null,
    from,
    to,
    quote = '',
    name = '',
    category = 'Props',
    quantity = 1,
  } = {}) => {
    const state = get()
    const result = addBreakdownAnnotation({
      scriptDocument: state.scriptDocumentLive || state.scriptDocument,
      scriptAnnotations: state.scriptAnnotations,
      annotationInput: { sceneId, from, to, quote, name, category, quantity },
    })
    set({
      scriptDocument: result.scriptDocument,
      scriptAnnotations: result.scriptAnnotations,
      hasUnsavedChanges: true,
    })
    get()._updateSaveSyncStateForChange('breakdown_annotation_add')
    return get().deriveScriptDocumentNow({ reason: 'breakdown_annotation_add', persist: true })
  },

  removeScriptBreakdownAnnotation: (annotationId) => {
    if (!annotationId) return { ok: false, reason: 'missing_annotation_id' }
    const state = get()
    const result = removeBreakdownAnnotation({
      scriptDocument: state.scriptDocumentLive || state.scriptDocument,
      scriptAnnotations: state.scriptAnnotations,
      annotationId,
    })
    set({
      scriptDocument: result.scriptDocument,
      scriptAnnotations: result.scriptAnnotations,
      hasUnsavedChanges: true,
    })
    get()._updateSaveSyncStateForChange('breakdown_annotation_remove')
    return get().deriveScriptDocumentNow({ reason: 'breakdown_annotation_remove', persist: true })
  },

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
    logTelemetry('script_import_result', {
      success: true,
      mode,
      importedSceneCount: Array.isArray(parsedScenes) ? parsedScenes.length : 0,
      source: scriptMeta?.filename || 'unknown',
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
      const targetIndex = state.scriptScenes.findIndex(scene => scene.id === sceneId)
      if (targetIndex === -1) return state

      const targetScene = state.scriptScenes[targetIndex]
      const chunks = splitScreenplayElementsIntoSceneChunks(screenplayElements)

      // Preserve the original scene id for the first chunk whenever possible
      // so downstream links remain stable for unchanged scene content.
      const rebuiltScenes = chunks.map((chunk, chunkIndex) => {
        const baseScene = chunkIndex === 0
          ? targetScene
          : {
              ...targetScene,
              id: createScriptSceneId(),
              sceneNumber: '',
              linkedShotIds: [],
            }
        return buildScriptSceneFromChunk(baseScene, chunk)
      })

      // If the edited scene no longer contains a heading and has a previous
      // scene, merge the text into the previous scene and retire this scene id.
      // This gives a safe "slugline removed" reduction without rebuilding all scenes.
      const firstSceneHeading = rebuiltScenes[0]?.slugline || ''
      const canMergeIntoPrevious = rebuiltScenes.length === 1 && !firstSceneHeading && targetIndex > 0

      let updatedScenes
      let remapFromSceneIds = []
      let remapToSceneId = null

      if (canMergeIntoPrevious) {
        const previousScene = state.scriptScenes[targetIndex - 1]
        const previousElements = ensureEditableScreenplayElements(previousScene.screenplayElements)
        const mergedElements = [...previousElements, ...ensureEditableScreenplayElements(rebuiltScenes[0].screenplayElements)]
        const mergedPrevious = buildScriptSceneFromChunk(previousScene, mergedElements)
        updatedScenes = [
          ...state.scriptScenes.slice(0, targetIndex - 1),
          mergedPrevious,
          ...state.scriptScenes.slice(targetIndex + 1),
        ]
        remapFromSceneIds = [targetScene.id]
        remapToSceneId = previousScene.id
      } else {
        updatedScenes = [
          ...state.scriptScenes.slice(0, targetIndex),
          ...rebuiltScenes,
          ...state.scriptScenes.slice(targetIndex + 1),
        ]
      }

      const pagination = estimateScreenplayPagination(updatedScenes, {
        scenePaginationMode: settings.scenePaginationMode,
      })
      const updatedScene = updatedScenes.find(scene => scene.id === sceneId)
      const remapSet = new Set(remapFromSceneIds)
      return {
        scriptScenes: updatedScenes.map(scene => ({
          ...scene,
          pageCount: pagination.byScene[scene.id]?.pageCount ?? scene.pageCount ?? null,
          pageStart: pagination.byScene[scene.id]?.startPage ?? scene.pageStart ?? null,
          pageEnd: pagination.byScene[scene.id]?.endPage ?? scene.pageEnd ?? null,
          estimatedMinutes: computeEstimate(scene, settings.baseMinutesPerPage),
        })),
        scenes: state.scenes.map(storyScene => {
          const remappedShots = remapSet.size > 0 && remapToSceneId
            ? (storyScene.shots || []).map(shot => (
                remapSet.has(shot.linkedSceneId)
                  ? { ...shot, linkedSceneId: remapToSceneId }
                  : shot
              ))
            : storyScene.shots

          if (remapSet.size > 0 && remapSet.has(storyScene.linkedScriptSceneId) && remapToSceneId) {
            const canonicalScene = updatedScenes.find(scene => scene.id === remapToSceneId)
            return {
              ...storyScene,
              linkedScriptSceneId: remapToSceneId,
              ...(mapScriptSceneToStoryboardMetadata(canonicalScene) || {}),
              shots: remappedShots,
            }
          }
          if (!updatedScene || storyScene.linkedScriptSceneId !== sceneId) {
            if (remappedShots !== storyScene.shots) return { ...storyScene, shots: remappedShots }
            return storyScene
          }
          return {
            ...storyScene,
            ...(mapScriptSceneToStoryboardMetadata(updatedScene) || {}),
            shots: remappedShots,
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
  openSceneDialog: (sceneId) => {
    const state = get()
    const isScriptScene = state.scriptScenes.some(scene => scene.id === sceneId)
    set({ scenePropertiesDialog: { source: isScriptScene ? 'script' : 'storyboard', sceneId } })
  },
  openShotDialog: (shotId) => {
    set({ shotPropertiesDialog: { shotId } })
  },
  closeShotDialog: () => set({ shotPropertiesDialog: null }),
  getShotDialogData: (shotId) => {
    const state = get()
    for (let sceneIdx = 0; sceneIdx < state.scenes.length; sceneIdx += 1) {
      const scene = state.scenes[sceneIdx]
      const shotIdx = (scene.shots || []).findIndex(item => item.id === shotId)
      if (shotIdx === -1) continue
      const shot = scene.shots[shotIdx]
      const canonical = state.getCanonicalStoryboardSceneMetadata(scene.id)
      return {
        shot,
        scene,
        sceneId: scene.id,
        displayId: `${sceneIdx + 1}${getShotLetter(shotIdx)}`,
        sceneTitle: canonical?.titleSlugline || scene.slugline || scene.location || scene.sceneLabel || '',
      }
    }
    return null
  },

  // Link a shot to a script scene (or unlink with null)
  linkShotToScene: (shotId, sceneId, opts = {}) => {
    const nextDialogue = opts.linkedDialogueLine !== undefined ? opts.linkedDialogueLine : null
    const nextOffset = opts.linkedDialogueOffset !== undefined ? opts.linkedDialogueOffset : null
    const nextRangeStart = opts.linkedScriptRangeStart !== undefined ? opts.linkedScriptRangeStart : null
    const nextRangeEnd = opts.linkedScriptRangeEnd !== undefined ? opts.linkedScriptRangeEnd : null
    set((state) => {
      let linkedShot = null
      const nextScenes = state.scenes.map((sc, sceneIdx) => ({
        ...sc,
        shots: sc.shots.map((sh, shotIdx) => {
          if (sh.id !== shotId) return sh
          const nextShot = {
            ...sh,
            linkedSceneId: sceneId,
            linkedDialogueLine: sceneId ? nextDialogue : null,
            linkedDialogueOffset: sceneId ? nextOffset : null,
            linkedScriptRangeStart: sceneId ? nextRangeStart : null,
            linkedScriptRangeEnd: sceneId ? nextRangeEnd : null,
            displayId: sh.displayId || `${sceneIdx + 1}${getShotLetter(shotIdx)}`,
          }
          linkedShot = nextShot
          return nextShot
        }),
      }))

      let nextAnnotations = state.scriptAnnotations
      const hasRange = sceneId && Number.isFinite(nextRangeStart) && Number.isFinite(nextRangeEnd) && nextRangeEnd > nextRangeStart
      if (hasRange) {
        nextAnnotations = upsertShotLinkAnnotation({
          scriptAnnotations: state.scriptAnnotations,
          annotationInput: {
            shotId,
            sceneId,
            from: nextRangeStart,
            to: nextRangeEnd,
            quote: '',
            color: linkedShot?.color || null,
            label: linkedShot?.displayId || '',
          },
        }).scriptAnnotations
      } else {
        nextAnnotations = removeShotLinkAnnotationByShotId({
          scriptAnnotations: state.scriptAnnotations,
          shotId,
        })
      }

      return {
        scenes: nextScenes,
        scriptAnnotations: nextAnnotations,
      }
    })
    get()._updateSaveSyncStateForChange('shot_link_annotation_update')
    get().deriveScriptDocumentNow({ reason: 'shot_link_annotation_update', persist: false })
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
            shotId: found.shot.id,
            cameraName: found.shot.cameraName || '',
            focalLength: found.shot.focalLength || '',
            specs: found.shot.specs || {},
            cast: found.shot.cast || '',
            notes: found.shot.notes,
            subject: found.shot.subject || '',
            description: found.shot.description || '',
            intOrExt: found.shot.intOrExt || found.scene.intOrExt,
            dayNight: found.shot.dayNight || found.scene.dayNight,
            sceneLabel: found.scene.sceneLabel,
            sceneSlugline: scriptScene?.slugline || found.scene.slugline || '',
            sceneTitle: scriptScene?.slugline || found.scene.slugline || found.scene.location || found.scene.sceneLabel || '',
            sceneNotes: scriptScene?.notes || '',
            location: found.scene.location,
            image: found.shot.image || null,
            // Shared time fields — source of truth lives on the shot
            shootTime: found.shot.shootTime || '',
            setupTime: found.shot.setupTime || '',
            scriptTime: found.shot.scriptTime || '',
            predictedTakes: found.shot.predictedTakes || '',
            takeNumber: found.shot.takeNumber || '',
            sound: found.shot.sound || '',
            props: found.shot.props || '',
            frameRate: found.shot.frameRate || '',
            // Script scene link (display only)
            linkedSceneId: resolvedLinkedSceneId,
            linkedSceneData: scriptScene ? {
              sceneNumber: scriptScene.sceneNumber,
              location: scriptScene.location,
              intExt: scriptScene.intExt,
              dayNight: scriptScene.dayNight,
              color: scriptScene.color,
            } : null,
            sceneShotSummaries: found.scene.shots.map((sceneShot, sceneShotIdx) => ({
              id: sceneShot.id,
              cameraName: sceneShot.cameraName || `Camera ${sceneShotIdx + 1}`,
            })),
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
    set(state => {
      const dayIndex = state.schedule.findIndex(d => d.id === dayId)
      if (dayIndex === -1) return state

      const removedDay = state.schedule[dayIndex]
      const nextSchedule = state.schedule.filter(d => d.id !== dayId)
      const fallbackDay = nextSchedule[Math.max(0, dayIndex - 1)] || nextSchedule[dayIndex] || null
      const fallbackDayId = fallbackDay?.id || null

      const nextCallsheets = { ...(state.callsheets || {}) }
      delete nextCallsheets[dayId]

      const nextDayCollapse = { ...(state.scheduleCollapseState?.days || {}) }
      delete nextDayCollapse[dayId]

      const nextBlockCollapse = { ...(state.scheduleCollapseState?.blocks || {}) }
      ;(removedDay?.blocks || []).forEach((block) => {
        if (!block?.id) return
        delete nextBlockCollapse[block.id]
      })

      const prevTabViewState = state.tabViewState || {}
      const nextTabViewState = {
        ...prevTabViewState,
        schedule: {
          ...(prevTabViewState.schedule || {}),
          listActiveDayId: (prevTabViewState.schedule?.listActiveDayId === dayId)
            ? fallbackDayId
            : (prevTabViewState.schedule?.listActiveDayId || null),
        },
        shotlist: {
          ...(prevTabViewState.shotlist || {}),
          selectedDayId: (prevTabViewState.shotlist?.selectedDayId === dayId)
            ? fallbackDayId
            : (prevTabViewState.shotlist?.selectedDayId || null),
        },
        callsheet: {
          ...(prevTabViewState.callsheet || {}),
          selectedDayId: (prevTabViewState.callsheet?.selectedDayId === dayId)
            ? fallbackDayId
            : (prevTabViewState.callsheet?.selectedDayId || null),
        },
      }

      return {
        schedule: nextSchedule,
        callsheets: nextCallsheets,
        scheduleCollapseState: {
          ...state.scheduleCollapseState,
          days: nextDayCollapse,
          blocks: nextBlockCollapse,
        },
        tabViewState: nextTabViewState,
      }
    })
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
      keyContactCrewIds: [],
      castExcludedRosterIds: [],
      crewExcludedRosterIds: [],
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
  setCallsheetColumnConfig: (config) => {
    set({ callsheetColumnConfig: normalizeCallsheetColumnConfig(config) })
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
    set(state => ({
      castRoster: state.castRoster.filter(entry => entry.id !== id),
      callsheets: Object.fromEntries(
        Object.entries(state.callsheets || {}).map(([dayId, callsheet]) => ([
          dayId,
          {
            ...(callsheet || {}),
            cast: (callsheet?.cast || []).filter(row => row?.rosterId !== id),
          },
        ]))
      ),
      personDialog: state.personDialog?.type === 'cast' && state.personDialog?.id === id ? null : state.personDialog,
    }))
    get()._scheduleAutoSave()
  },

  removeCrewRosterEntry: (id) => {
    set(state => ({
      crewRoster: state.crewRoster.filter(entry => entry.id !== id),
      callsheets: Object.fromEntries(
        Object.entries(state.callsheets || {}).map(([dayId, callsheet]) => ([
          dayId,
          {
            ...(callsheet || {}),
            crew: (callsheet?.crew || []).filter(row => row?.rosterId !== id),
          },
        ]))
      ),
      personDialog: state.personDialog?.type === 'crew' && state.personDialog?.id === id ? null : state.personDialog,
    }))
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
      displayId: ensureShotDisplayId(shot, sceneNum, index),
    }))
  },

  // Total shot count across all scenes (for toolbar)
  getTotalShots: () => get().scenes.reduce((acc, s) => acc + s.shots.length, 0),

  // ── Scene actions ────────────────────────────────────────────────────
  _syncLiveStoryboardIfEnabled: async () => {
    const state = get()
    if (DRAFT_COMMIT_MODE) return
    if (state.projectRef?.type !== 'cloud') return
    if (Number(state.liveModelVersion || 0) < 1) return
    if (!state.cloudSyncContext?.canSync || !state.cloudSyncContext?.cloudWritesEnabled) return
    const syncFn = state.cloudSyncContext?.syncLiveStoryboardState
    if (typeof syncFn !== 'function') return
    try {
      await syncFn({
        projectId: state.projectRef.projectId,
        scenes: state.scenes || [],
        storyboardSceneOrder: state.storyboardSceneOrder || [],
      })
    } catch (error) {
      devCloudBackupLog('live_storyboard_sync:failed', {
        projectId: state.projectRef?.projectId || null,
        error: error?.message || 'unknown_error',
      })
    }
  },

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

  addSceneAtStoryboardPosition: (afterSceneId, overrides = {}) => {
    const currentScenes = get().scenes
    const storyboardOrder = get().getStoryboardSceneOrder()
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

    const normalizedOrder = normalizeStoryboardSceneOrder(storyboardOrder, currentScenes)
    const anchorIndex = normalizedOrder.findIndex(id => id === afterSceneId)
    const insertIndex = anchorIndex >= 0 ? anchorIndex + 1 : normalizedOrder.length
    const nextOrder = [...normalizedOrder]
    nextOrder.splice(insertIndex, 0, scene.id)

    set(state => ({
      scenes: [...state.scenes, scene],
      storyboardSceneOrder: nextOrder,
    }))
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
      lastStoryboardEditAt: Date.now(),
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
    const sceneIndex = scenes.findIndex(s => s.id === sceneId)
    if (sceneIndex === -1) return null
    const scene = scenes[sceneIndex]
    const sceneNumber = sceneIndex + 1
    const newShot = createShot({
      cameraName: scene.cameras?.[0]?.name || 'Camera 1',
      focalLength: defaultFocalLength,
      color: DEFAULT_COLOR,
      intOrExt: scene.intOrExt || '',
      dayNight: scene.dayNight || '',
      linkedSceneId: scene.linkedScriptSceneId || null,
      displayId: getNextShotDisplayId(scene, sceneNumber),
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
      scenes: state.scenes.map((scene, sceneIndex) => {
        const idx = scene.shots.findIndex(s => s.id === shotId)
        if (idx === -1) return scene
        shotCounter++
        const original = scene.shots[idx]
        const duplicate = {
          ...original,
          id: `shot_${Date.now()}_${shotCounter}`,
          displayId: getNextShotDisplayId(scene, sceneIndex + 1),
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

  // Storyboard reorder behavior (legacy/original): move shot objects only.
  // Storyboard cards derive display labels from visual order.
  reorderShots: (sceneId, activeId, overId) => {
    set(state => ({
      scenes: state.scenes.map((scene, sceneIndex) => {
        if (scene.id !== sceneId) return scene
        const oldIndex = scene.shots.findIndex(s => s.id === activeId)
        const newIndex = scene.shots.findIndex(s => s.id === overId)
        if (oldIndex === -1 || newIndex === -1) return scene
        const sceneNumber = sceneIndex + 1
        const shotsWithStableDisplayIds = scene.shots.map((shot, shotIndex) => ({
          ...shot,
          displayId: ensureShotDisplayId(shot, sceneNumber, shotIndex),
        }))
        return { ...scene, shots: arrayMove(shotsWithStableDisplayIds, oldIndex, newIndex) }
      }),
    }))
    get()._scheduleAutoSave()
  },

  // Shotlist-only reorder: preserve each shot's displayId while changing row order.
  reorderShotlistShots: (sceneId, activeId, overId) => {
    set(state => ({
      scenes: state.scenes.map((scene, sceneIndex) => {
        if (scene.id !== sceneId) return scene
        const oldIndex = scene.shots.findIndex(s => s.id === activeId)
        const newIndex = scene.shots.findIndex(s => s.id === overId)
        if (oldIndex === -1 || newIndex === -1) return scene
        const sceneNumber = sceneIndex + 1
        const shotsWithStableDisplayIds = scene.shots.map((shot, shotIndex) => ({
          ...shot,
          displayId: ensureShotDisplayId(shot, sceneNumber, shotIndex),
        }))
        return { ...scene, shots: arrayMove(shotsWithStableDisplayIds, oldIndex, newIndex) }
      }),
    }))
    get()._scheduleAutoSave()
  },

  // Shotlist-only reorder: preserve each shot's displayId while changing row order.
  reorderShotlistShots: (sceneId, activeId, overId) => {
    set(state => ({
      scenes: state.scenes.map((scene, sceneIndex) => {
        if (scene.id !== sceneId) return scene
        const oldIndex = scene.shots.findIndex(s => s.id === activeId)
        const newIndex = scene.shots.findIndex(s => s.id === overId)
        if (oldIndex === -1 || newIndex === -1) return scene
        const sceneNumber = sceneIndex + 1
        const shotsWithStableDisplayIds = scene.shots.map((shot, shotIndex) => ({
          ...shot,
          displayId: ensureShotDisplayId(shot, sceneNumber, shotIndex),
        }))
        return { ...scene, shots: arrayMove(shotsWithStableDisplayIds, oldIndex, newIndex) }
      }),
    }))
    get()._scheduleAutoSave()
  },

  moveShotToScene: (shotId, targetSceneId, options = {}) => {
    const { beforeShotId = null } = options || {}
    set(state => {
      const sourceSceneIndex = state.scenes.findIndex(scene => scene.shots.some(shot => shot.id === shotId))
      const targetSceneIndex = state.scenes.findIndex(scene => scene.id === targetSceneId)
      if (sourceSceneIndex === -1 || targetSceneIndex === -1) return state

      const sourceScene = state.scenes[sourceSceneIndex]
      const targetScene = state.scenes[targetSceneIndex]
      const sourceShotIndex = sourceScene.shots.findIndex(shot => shot.id === shotId)
      if (sourceShotIndex === -1) return state

      const shotToMove = {
        ...sourceScene.shots[sourceShotIndex],
        linkedSceneId: targetScene.linkedScriptSceneId || null,
      }

      const nextScenes = state.scenes.map(scene => ({ ...scene, shots: [...scene.shots] }))
      nextScenes[sourceSceneIndex].shots.splice(sourceShotIndex, 1)

      const destinationShots = nextScenes[targetSceneIndex].shots
      const destinationIndex = beforeShotId
        ? destinationShots.findIndex(shot => shot.id === beforeShotId)
        : -1
      if (destinationIndex === -1) {
        destinationShots.push(shotToMove)
      } else {
        destinationShots.splice(destinationIndex, 0, shotToMove)
      }

      return { scenes: nextScenes }
    })
    get()._scheduleAutoSave()
  },

  moveShotToScriptScene: (shotId, targetScriptSceneId) => {
    if (!targetScriptSceneId) return null
    let destinationSceneId = null

    set(state => {
      const sourceSceneIndex = state.scenes.findIndex(scene => scene.shots.some(shot => shot.id === shotId))
      if (sourceSceneIndex === -1) return state
      const sourceScene = state.scenes[sourceSceneIndex]
      const shotIndex = sourceScene.shots.findIndex(shot => shot.id === shotId)
      if (shotIndex === -1) return state
      const shot = sourceScene.shots[shotIndex]

      const scenesWithScriptLink = state.scenes
        .map((scene, index) => ({ scene, index }))
        .filter(entry => entry.scene.linkedScriptSceneId === targetScriptSceneId)
      const targetSceneEntry = scenesWithScriptLink[scenesWithScriptLink.length - 1] || null

      const nextScenes = state.scenes.map(scene => ({ ...scene, shots: [...scene.shots] }))
      nextScenes[sourceSceneIndex].shots.splice(shotIndex, 1)

      const movedShot = { ...shot, linkedSceneId: targetScriptSceneId }
      if (targetSceneEntry) {
        nextScenes[targetSceneEntry.index].shots.push(movedShot)
        destinationSceneId = targetSceneEntry.scene.id
        return { scenes: nextScenes }
      }

      const scriptScene = state.scriptScenes.find(scene => scene.id === targetScriptSceneId) || null
      const newScene = createScene({
        sceneLabel: scriptScene?.sceneNumber ? `SCENE ${scriptScene.sceneNumber}` : `SCENE ${nextScenes.length + 1}`,
        linkedScriptSceneId: targetScriptSceneId,
        location: scriptScene?.location || 'LOCATION',
        slugline: scriptScene?.slugline || '',
        intOrExt: scriptScene?.intExt || 'INT',
        dayNight: scriptScene?.dayNight || 'DAY',
        shots: [movedShot],
      })
      destinationSceneId = newScene.id
      return { scenes: [...nextScenes, newScene] }
    })

    if (destinationSceneId) {
      get()._scheduleAutoSave()
    }
    return destinationSceneId
  },

  updateShot: (shotId, updates) => {
    set(state => ({
      scenes: state.scenes.map(s => ({
        ...s,
        shots: s.shots.map(sh => sh.id === shotId ? { ...sh, ...updates } : sh),
      })),
      lastStoryboardEditAt: Date.now(),
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
      lastStoryboardEditAt: Date.now(),
    }))
    get()._scheduleAutoSave()
  },

  updateShotNotes: (shotId, notes) => {
    set(state => ({
      scenes: state.scenes.map(s => ({
        ...s,
        shots: s.shots.map(sh => sh.id === shotId ? { ...sh, notes } : sh),
      })),
      lastStoryboardEditAt: Date.now(),
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

  updateShotImage: (shotId, imagePayload) => {
    const isLegacyPayload = typeof imagePayload === 'string' || imagePayload == null
    const thumb = isLegacyPayload
      ? (imagePayload || null)
      : (imagePayload?.thumb || imagePayload?.imageAsset?.thumb || imagePayload?.image || null)
    const full = isLegacyPayload ? null : (imagePayload?.full || imagePayload?.imageAsset?.full || null)
    const meta = isLegacyPayload ? null : (imagePayload?.meta || imagePayload?.imageAsset?.meta || null)
    const cloud = isLegacyPayload ? null : (imagePayload?.cloud || imagePayload?.imageAsset?.cloud || null)
    const mime = isLegacyPayload ? 'image/webp' : (imagePayload?.mime || imagePayload?.imageAsset?.mime || 'image/webp')
    set(state => ({
      storyboardImageCache: {
        ...state.storyboardImageCache,
        ...(full ? { [shotId]: { full, updatedAt: Date.now() } } : {}),
      },
      scenes: state.scenes.map(s => ({
        ...s,
        shots: s.shots.map((sh) => {
          if (sh.id !== shotId) return sh
          return {
            ...sh,
            image: thumb,
            imageAsset: isLegacyPayload
              ? (sh.imageAsset || null)
              : {
                  version: 1,
                  mime,
                  thumb,
                  full: null,
                  meta,
                  cloud: cloud || null,
                },
          }
        }),
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
  setProjectName: (name) => {
    set({ projectName: name })
    get()._scheduleAutoSave('project_name')
  },
  setProjectEmoji: (emoji) => {
    set({ projectEmoji: emoji || '🎬' })
    get()._scheduleAutoSave()
  },
  setProjectLogline: (logline) => {
    set({ projectLogline: logline || '' })
    get()._scheduleAutoSave('project_logline')
  },
  setProjectHeroImage: (heroImagePayload) => {
    set({ projectHeroImage: normalizeProjectHeroImage(heroImagePayload) })
    get()._scheduleAutoSave('project_hero_image')
  },
  clearProjectHeroImage: () => {
    set({ projectHeroImage: null })
    get()._scheduleAutoSave('project_hero_image')
  },
  setProjectHeroOverlayColor: (overlayColor) => {
    set({ projectHeroOverlayColor: overlayColor || '#1f1f27' })
    get()._scheduleAutoSave('project_hero_overlay')
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
  updateStoryboardDisplayConfig: (patch) => {
    set(state => ({
      storyboardDisplayConfig: normalizeStoryboardDisplayConfig({
        ...state.storyboardDisplayConfig,
        ...(patch || {}),
      }),
    }))
    get()._scheduleAutoSave()
  },
  updateCastCrewDisplayConfig: (patch) => {
    set(state => ({
      castCrewDisplayConfig: normalizeCastCrewDisplayConfig({
        ...state.castCrewDisplayConfig,
        ...(patch || {}),
      }),
    }))
    get()._scheduleAutoSave()
  },
  resetTabViewState: () => set({
    tabViewState: {
      home: {
        cloudProjectsExpanded: true,
        pendingDeletionExpanded: false,
      },
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

  showContextMenu: (entityType, entityId, x, y) => set({ contextMenu: { type: entityType, entityId, x, y } }),
  showPersonContextMenu: (personType, personId, x, y) => set({ contextMenu: { type: 'person', personType, personId, x, y } }),
  hideContextMenu: () => set({ contextMenu: null }),
  openPersonDialog: (type, id = null) => set({ personDialog: { type, id } }),
  closePersonDialog: () => set({ personDialog: null }),

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

    // Mark the project dirty so that the beforeunload guard fires correctly
    // if the user tries to leave after undoing past a save point.
    get()._scheduleAutoSave('undo')

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

    // Mark dirty for the same reason as undo above.
    get()._scheduleAutoSave('redo')

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
    const startedAt = performance.now()
    const {
      projectName, projectEmoji, projectLogline, projectHeroImage, projectHeroOverlayColor, columnCount, defaultFocalLength,
      theme, autoSave, useDropdowns, scenes, shotlistColumnConfig,
      customColumns, customDropdownOptions, schedule, scheduleColumnConfig,
      shotlistColumnWidths, callsheets, callsheetSectionConfig, callsheetColumnConfig,
      castRoster, crewRoster,
      castCrewNotes,
      scriptScenes, importedScripts, scriptSettings,
      scriptEngine, scriptDocVersion, scriptDerivationVersion, scriptDocument, scriptDocumentLive, scriptAnnotations,
      shortcutBindings,
      storyboardSceneOrder,
      storyboardDisplayConfig,
      castCrewDisplayConfig,
      tabViewState,
      cloudLineage,
    } = get()
    const normalizedScriptState = normalizeScriptDocumentState({
      scriptEngine,
      scriptDocVersion,
      scriptDerivationVersion,
      scriptDocument: scriptDocumentLive || scriptDocument,
      scriptScenes,
      scriptSettings,
      scriptAnnotations,
      storyboardScenes: scenes,
      scriptLayout: scriptSettings?.documentSettings,
      preferLegacyScriptScenes: !scriptDocumentLive,
    })
    const payload = {
      version: 2,
      projectName,
      projectEmoji: projectEmoji || '🎬',
      projectLogline: projectLogline || '',
      projectHeroImage: normalizeProjectHeroImage(projectHeroImage),
      projectHeroOverlayColor: projectHeroOverlayColor || '#1f1f27',
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
      storyboardDisplayConfig: normalizeStoryboardDisplayConfig(storyboardDisplayConfig),
      castCrewDisplayConfig: normalizeCastCrewDisplayConfig(castCrewDisplayConfig),
      cloudLineage: (cloudLineage?.originProjectId
        ? {
            originProjectId: String(cloudLineage.originProjectId),
            lastKnownSnapshotId: cloudLineage.lastKnownSnapshotId ? String(cloudLineage.lastKnownSnapshotId) : null,
          }
        : null),
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
            image: s.imageAsset?.thumb || s.image,
            imageAsset: s.imageAsset ? {
              version: s.imageAsset.version || 1,
              mime: s.imageAsset.mime || 'image/webp',
              thumb: s.imageAsset.thumb || s.image || null,
              full: null,
              meta: s.imageAsset.meta || null,
              cloud: s.imageAsset.cloud || null,
            } : null,
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
            shotAspectRatio: s.shotAspectRatio || '',
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
          color: scene.color || null,
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
      callsheetColumnConfig: normalizeCallsheetColumnConfig(callsheetColumnConfig),
      castRoster: (castRoster || []).map(normalizeCastEntry),
      crewRoster: (crewRoster || []).map(normalizeCrewEntry),
      castCrewNotes: castCrewNotes || '',
      scriptEngine: normalizedScriptState.scriptEngine,
      scriptDocVersion: normalizedScriptState.scriptDocVersion,
      scriptDerivationVersion: normalizedScriptState.scriptDerivationVersion,
      // NOTE(payload-bloat): scriptDocument and scriptScenes both persist for
      // compatibility right now; this duplicates screenplay content and should
      // be deduped in a future, script-safe migration pass.
      scriptDocument: normalizedScriptState.scriptDocument,
      scriptAnnotations: normalizedScriptState.scriptAnnotations,
      // Script import state
      scriptScenes: (normalizedScriptState.scriptScenes || []).map(s => ({
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
      scenesTabPreferences: {
        ...(tabViewState?.scenes || {}),
      },
      exportedAt: new Date().toISOString(),
    }
    devPerfLog('store:getProjectData', {
      scenes: scenes.length,
      ms: Math.round((performance.now() - startedAt) * 100) / 100,
    })
    return payload
  },

  // "Save" — overwrites the current file silently if a path is known;
  // falls back to a Save As dialog when the project has never been saved.
  saveProject: async () => {
    let data, json
    try {
      data = get().getProjectData()
      data = await materializeCloudImagesForLocalSave({
        payload: data,
        projectRef: get().projectRef,
        cloudImageResolver: get().cloudImageResolver,
      })
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

    if (platformService.isDesktop()) {
      try {
        let result
        if (existingPath) {
          result = await platformService.saveProjectSilent(existingPath, json)
        } else {
          result = await platformService.saveProject(defaultName, json)
        }
        if (result.success) {
          set({
            lastSaved: new Date().toISOString(),
            projectPath: result.filePath,
            hasUnsavedChanges: false,
            projectRef: { type: 'local', path: result.filePath, browserProjectId: null },
            saveSyncState: buildSyncState({
              mode: 'local_only',
              status: 'saved_locally',
              message: 'Saved locally on this device',
            }),
          })
          logTelemetry('project_export_result', { success: true, mode: 'save', platform: 'desktop', hasPath: !!result.filePath })
        } else if (result.error) {
          logTelemetry('project_export_result', { success: false, mode: 'save', platform: 'desktop', error: result.error })
          alert(`Save failed: ${result.error}`)
        }
        // result.success === false with no error means user cancelled the dialog — no message needed
      } catch (err) {
        logTelemetry('project_export_result', { success: false, mode: 'save', platform: 'desktop', error: err?.message || 'unknown' })
        alert(`Save failed: ${err.message}`)
      }
    } else {
      try {
        await platformService.saveProject(defaultName, json)
        const browserProjectId = persistBrowserProjectState(get, set, { data, name: defaultName, markSaved: true })
        set({
          projectRef: { type: 'local', path: null, browserProjectId: browserProjectId || get().browserProjectId || null },
          saveSyncState: buildSyncState({
            mode: 'local_only',
            status: 'saved_locally',
            message: 'Saved locally on this device',
          }),
        })
        logTelemetry('project_export_result', { success: true, mode: 'save', platform: 'browser' })
      } catch (err) {
        logTelemetry('project_export_result', { success: false, mode: 'save', platform: 'browser', error: err?.message || 'unknown' })
        alert(`Save failed: ${err.message}`)
      }
    }
  },

  // "Save As" — always opens a file dialog and updates projectPath on success.
  saveProjectAs: async () => {
    let data, json
    try {
      data = get().getProjectData()
      data = await materializeCloudImagesForLocalSave({
        payload: data,
        projectRef: get().projectRef,
        cloudImageResolver: get().cloudImageResolver,
      })
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

    if (platformService.isDesktop()) {
      try {
        const result = await platformService.saveProject(defaultName, json)
        if (result.success) {
          set({
            lastSaved: new Date().toISOString(),
            projectPath: result.filePath,
            hasUnsavedChanges: false,
            projectRef: { type: 'local', path: result.filePath, browserProjectId: null },
            saveSyncState: buildSyncState({
              mode: 'local_only',
              status: 'saved_locally',
              message: 'Saved locally on this device',
            }),
          })
          logTelemetry('project_export_result', { success: true, mode: 'save_as', platform: 'desktop', hasPath: !!result.filePath })
        } else if (result.error) {
          logTelemetry('project_export_result', { success: false, mode: 'save_as', platform: 'desktop', error: result.error })
          alert(`Save failed: ${result.error}`)
        }
      } catch (err) {
        logTelemetry('project_export_result', { success: false, mode: 'save_as', platform: 'desktop', error: err?.message || 'unknown' })
        alert(`Save failed: ${err.message}`)
      }
    } else {
      try {
        await platformService.saveProject(defaultName, json)
        const browserProjectId = persistBrowserProjectState(get, set, { data, name: defaultName, markSaved: true })
        set({
          projectRef: { type: 'local', path: null, browserProjectId: browserProjectId || get().browserProjectId || null },
          saveSyncState: buildSyncState({
            mode: 'local_only',
            status: 'saved_locally',
            message: 'Saved locally on this device',
          }),
        })
        logTelemetry('project_export_result', { success: true, mode: 'save_as', platform: 'browser' })
      } catch (err) {
        logTelemetry('project_export_result', { success: false, mode: 'save_as', platform: 'browser', error: err?.message || 'unknown' })
        alert(`Save failed: ${err.message}`)
      }
    }
  },

  loadProject: (data, traceMeta = {}) => {
    const beforeState = get()
    const sourceLabel = traceMeta?.sourceLabel || 'other_load_project'
    const stack = traceMeta?.stack || getCompactTraceStack()
    emitOverwriteTrace('LOAD_PROJECT_ENTER', getOverwriteStateContext(beforeState, {
      sourceLabel,
      functionName: 'loadProject',
      overwritePathLabel: sourceLabel,
      incomingSnapshotId: traceMeta?.snapshotId || null,
      stack,
    }))
    emitOverwriteTrace('SHOT_IMAGE_DIFF_BEFORE_APPLY', {
      sourceLabel,
      functionName: 'loadProject',
      ...summarizeShotImageDiff(beforeState?.scenes || [], data?.scenes || []),
      ...getOverwriteStateContext(beforeState, {
        incomingSnapshotId: traceMeta?.snapshotId || null,
      }),
    })
    const {
      projectName, projectEmoji, projectLogline, projectHeroImage, projectHeroOverlayColor, columnCount, defaultFocalLength,
      theme, autoSave, useDropdowns,
    } = data
    const loadedCloudLineage = (typeof data.cloudLineage === 'object' && data.cloudLineage?.originProjectId)
      ? {
          originProjectId: String(data.cloudLineage.originProjectId),
          lastKnownSnapshotId: data.cloudLineage.lastKnownSnapshotId ? String(data.cloudLineage.lastKnownSnapshotId) : null,
        }
      : null

    const loadedCustomColumns = data.customColumns || []
    const loadedCustomDropdownOptions = data.customDropdownOptions || {}

    const mapShot = (s, sceneIntOrExt, sceneDayNight) => ({
      id: s.id || `shot_${Date.now()}_${++shotCounter}`,
      cameraName: s.cameraName || 'Camera 1',
      focalLength: s.focalLength || '85mm',
      color: s.color || DEFAULT_COLOR,
      image: s.imageAsset?.thumb || s.image || null,
      imageAsset: s.imageAsset
        ? {
            version: s.imageAsset.version || 1,
            mime: s.imageAsset.mime || 'image/webp',
            thumb: s.imageAsset.thumb || s.image || null,
            full: null,
            meta: s.imageAsset.meta || null,
            cloud: s.imageAsset.cloud || null,
          }
        : (s.image
            ? {
                version: 1,
                mime: 'image/*',
                thumb: s.image,
                full: null,
                meta: null,
              }
            : null),
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
      shotAspectRatio: s.shotAspectRatio || '',
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
        color: scene.color || null,
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

    scenes = scenes.map(scene => ({
      ...scene,
      shots: (scene.shots || []).map(shot => ({
        ...shot,
        linkedSceneId: scene.linkedScriptSceneId || shot.linkedSceneId || null,
      })),
    }))

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

    const loadedScenesTabPreferences = (typeof data.scenesTabPreferences === 'object' && data.scenesTabPreferences !== null)
      ? data.scenesTabPreferences
      : {}
    const normalizedScriptState = normalizeScriptDocumentState({
      scriptEngine: data.scriptEngine,
      scriptDocVersion: data.scriptDocVersion,
      scriptDerivationVersion: data.scriptDerivationVersion,
      scriptDocument: data.scriptDocument,
      scriptScenes: Array.isArray(data.scriptScenes) ? data.scriptScenes : [],
      scriptSettings: data.scriptSettings || null,
      scriptAnnotations: data.scriptAnnotations,
      storyboardScenes: scenes,
      scriptLayout: data.scriptSettings?.documentSettings,
    })
    const loadedDerivedScript = deriveScriptAdapterOutputs({
      scriptDocument: normalizedScriptState.scriptDocument,
      previousScriptScenes: normalizedScriptState.scriptScenes,
      scriptSettings: data.scriptSettings || null,
      scriptAnnotations: normalizedScriptState.scriptAnnotations,
      storyboardScenes: scenes,
    })

    set({
      projectName: projectName || 'Untitled Shotlist',
      projectEmoji: projectEmoji || '🎬',
      projectLogline: typeof projectLogline === 'string' ? projectLogline : '',
      projectHeroImage: normalizeProjectHeroImage(projectHeroImage),
      projectHeroOverlayColor: typeof projectHeroOverlayColor === 'string' && projectHeroOverlayColor.trim()
        ? projectHeroOverlayColor
        : '#1f1f27',
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
        const fallbackScriptScene = Array.isArray(normalizedScriptState.scriptScenes) ? normalizedScriptState.scriptScenes[idx] : null
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
      storyboardDisplayConfig: normalizeStoryboardDisplayConfig(data.storyboardDisplayConfig),
      castCrewDisplayConfig: normalizeCastCrewDisplayConfig(data.castCrewDisplayConfig),
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
      callsheetColumnConfig: normalizeCallsheetColumnConfig(data.callsheetColumnConfig),
      // Script import state — default to empty for older project files
      scriptScenes: Array.isArray(normalizedScriptState.scriptScenes)
        ? normalizedScriptState.scriptScenes.map(s => {
          const derived = deriveScriptSceneFromElements(
            { ...s, sceneNumber: s?.sceneNumber != null ? String(s.sceneNumber) : '' },
            s.screenplayElements,
          )
          // Restore manually saved field values over values re-derived from the
          // raw screenplay elements, so manual Scene Properties edits survive reload.
          return {
            ...derived,
            ...(s.slugline !== undefined && { slugline: s.slugline }),
            ...(s.intExt !== undefined && { intExt: s.intExt }),
            ...(s.dayNight !== undefined && { dayNight: s.dayNight }),
            ...(s.location !== undefined && { location: s.location }),
            ...(Array.isArray(s.characters) && { characters: s.characters }),
          }
        })
        : [],
      scriptEngine: normalizedScriptState.scriptEngine,
      scriptDocVersion: normalizedScriptState.scriptDocVersion,
      scriptDerivationVersion: normalizedScriptState.scriptDerivationVersion,
      scriptDocument: normalizedScriptState.scriptDocument,
      scriptAnnotations: normalizedScriptState.scriptAnnotations,
      scriptDocumentLive: null,
      scriptDerivedCache: {
        sceneMetadataByScriptSceneId: loadedDerivedScript.compatibility?.sceneMetadataByScriptSceneId || {},
        breakdownTags: loadedDerivedScript.compatibility?.breakdownTags || [],
        breakdownAggregates: loadedDerivedScript.compatibility?.breakdownAggregates || { total: 0, byScene: {}, byCategory: {} },
        breakdownLists: loadedDerivedScript.compatibility?.breakdownLists || { perScene: {}, global: {} },
        shotLinkIndexBySceneId: loadedDerivedScript.compatibility?.shotLinkIndexBySceneId || {},
      },
      scriptDerivationState: {
        status: 'synced',
        lastDerivedAt: new Date().toISOString(),
        lastReason: normalizedScriptState.migratedFromLegacyScriptScenes ? 'legacy_migration' : 'load_project',
        lastError: null,
      },
      _scriptDerivationTimeout: null,
      importedScripts: Array.isArray(data.importedScripts) ? data.importedScripts : [],
      scriptSettings: {
        baseMinutesPerPage: 5,
        autoSuggestTags: true,
        showConfidenceIndicators: true,
        defaultSceneColor: null,
        scenePaginationMode: 'natural',
        ...(data.scriptSettings || {}),
        documentSettings: normalizeDocumentSettings(normalizedScriptState.scriptLayout || data?.scriptSettings?.documentSettings),
        breakdownTags: loadedDerivedScript.compatibility?.breakdownTags || data?.scriptSettings?.breakdownTags || [],
      },
      shortcutBindings: getActiveBindings(data.shortcutBindings || loadShortcutBindings() || SHORTCUT_DEFAULTS),
      lastSaved: new Date().toISOString(),
      hasUnsavedChanges: false,
      saveSyncState: buildSyncState({
        mode: 'local_only',
        status: 'saved_locally',
        message: 'Saved locally on this device',
      }),
      pendingRemoteSnapshot: null,
      _cloudDirtyRevision: null,
      _lastAckedSnapshotId: null,
      cloudLineage: loadedCloudLineage,
      liveModelVersion: 0,
      browserProjectId: platformService.isDesktop() ? null : get().browserProjectId,
      projectRef: {
        type: 'local',
        path: platformService.isDesktop() ? get().projectPath : null,
        browserProjectId: platformService.isDesktop() ? null : get().browserProjectId,
      },
      activeTab: 'script',
      contextMenu: null,
      personDialog: null,
      documentSession: get().documentSession + 1,
      tabViewState: {
        home: {
          cloudProjectsExpanded: true,
          pendingDeletionExpanded: false,
        },
        script: {},
        scenes: {
          sceneViewMode: loadedScenesTabPreferences.sceneViewMode || 'compactGrid',
          sceneColumnCount: Number(loadedScenesTabPreferences.sceneColumnCount) || 4,
          sortBy: loadedScenesTabPreferences.sortBy || 'sceneNumber',
          sortDirection: loadedScenesTabPreferences.sortDirection || 'asc',
          groupBy: loadedScenesTabPreferences.groupBy || 'none',
          activeScript: loadedScenesTabPreferences.activeScript ?? null,
          metadataVisibility: {
            showLocation: loadedScenesTabPreferences.metadataVisibility?.showLocation ?? true,
            showIntExtDayNight: loadedScenesTabPreferences.metadataVisibility?.showIntExtDayNight ?? true,
            showCastCount: loadedScenesTabPreferences.metadataVisibility?.showCastCount ?? true,
            showScheduleBadge: loadedScenesTabPreferences.metadataVisibility?.showScheduleBadge ?? true,
            showStoryboardThumb: loadedScenesTabPreferences.metadataVisibility?.showStoryboardThumb ?? true,
          },
          sidebarPanelCollapsed: {
            viewOptions: loadedScenesTabPreferences.sidebarPanelCollapsed?.viewOptions ?? false,
            sceneOrganization: loadedScenesTabPreferences.sidebarPanelCollapsed?.sceneOrganization ?? false,
            importedScripts: loadedScenesTabPreferences.sidebarPanelCollapsed?.importedScripts ?? false,
          },
          scrollTop: typeof loadedScenesTabPreferences.scrollTop === 'number' ? loadedScenesTabPreferences.scrollTop : 0,
        },
        storyboard: {},
        shotlist: {},
        castcrew: {},
        schedule: {},
        callsheet: {},
      },
      undoPast: [],
      undoFuture: [],
      undoLastRecordedAt: 0,
      storyboardImageCache: {},
    })
    saveShortcutBindings(get().shortcutBindings)
    const afterState = get()
    const afterDiff = summarizeShotImageDiff(beforeState?.scenes || [], afterState?.scenes || [])
    emitOverwriteTrace('SHOT_IMAGE_DIFF_AFTER_APPLY', {
      sourceLabel,
      functionName: 'loadProject',
      ...afterDiff,
      ...getOverwriteStateContext(afterState, {
        incomingSnapshotId: traceMeta?.snapshotId || null,
      }),
    })
    emitOverwriteTrace('LOAD_PROJECT_EXIT', getOverwriteStateContext(afterState, {
      sourceLabel,
      functionName: 'loadProject',
      overwritePathLabel: sourceLabel,
      incomingSnapshotId: traceMeta?.snapshotId || null,
      stack,
    }))
    maybeEmitStoryboardRevertDetected({
      diff: afterDiff,
      sourceLabel,
      stateContext: getOverwriteStateContext(afterState, {
        incomingSnapshotId: traceMeta?.snapshotId || null,
      }),
      stack,
    })
  },

  openProject: async () => {
    const result = await platformService.openProject()
    if (!result.success) return
    try {
      const data = JSON.parse(result.data)
      get().loadProject(data)
      if (platformService.isDesktop()) {
        const fileName = result.filePath.split(/[\\/]/).pop()
        set({
          projectPath: result.filePath,
          browserProjectId: null,
          projectRef: { type: 'local', path: result.filePath, browserProjectId: null },
        })
        updateRecentProjects(get, set, buildRecentProjectEntry({
          name: fileName,
          path: result.filePath,
          shots: getTotalShotsFromProjectData(data),
        }))
        logTelemetry('project_import_result', { success: true, platform: 'desktop', source: result.filePath })
      } else {
        set({ projectPath: null })
        const browserProjectId = persistBrowserProjectState(get, set, { data, name: result.filePath, markSaved: true })
        set({ projectRef: { type: 'local', path: null, browserProjectId: browserProjectId || get().browserProjectId || null } })
        logTelemetry('project_import_result', { success: true, platform: 'browser', source: result.filePath || 'picker' })
      }
    } catch {
      logTelemetry('project_import_result', {
        success: false,
        platform: platformService.isDesktop() ? 'desktop' : 'browser',
        error: 'invalid_file_format',
      })
      alert('Failed to load project: Invalid file format')
    }
  },

  openProjectFromPath: async (filePath) => {
    if (!platformService.isDesktop()) return
    const result = await platformService.openProjectFromPath(filePath)
    if (!result.success) {
      alert(`Could not open file: ${result.error || 'File not found'}`)
      return
    }
    try {
      const data = JSON.parse(result.data)
      get().loadProject(data)
      const fileName = filePath.split(/[\\/]/).pop()
      set({
        projectPath: filePath,
        browserProjectId: null,
        projectRef: { type: 'local', path: filePath, browserProjectId: null },
      })
      updateRecentProjects(get, set, buildRecentProjectEntry({
        name: fileName,
        path: filePath,
        shots: getTotalShotsFromProjectData(data),
      }))
      logTelemetry('project_open_recent_result', { success: true, platform: 'desktop', source: filePath })
    } catch {
      logTelemetry('project_open_recent_result', { success: false, platform: 'desktop', source: filePath, error: 'invalid_file_format' })
      alert('Failed to load project: Invalid file format')
    }
  },

  openRecentProject: async (recentProject) => {
    if (!recentProject) return
    if (platformService.isDesktop()) {
      if (recentProject.path) {
        await get().openProjectFromPath(recentProject.path)
      } else {
        await get().openProject()
      }
      return
    }
    const browserProjectId = recentProject.browserProjectId
      || (typeof recentProject.path === 'string' && recentProject.path.startsWith('browser:')
        ? recentProject.path.slice('browser:'.length)
        : null)
    const data = platformService.loadBrowserProjectSnapshot(browserProjectId)
    if (!data) {
      alert('Could not reopen this browser project. Please import a .shotlist file instead.')
      return
    }
    try {
      get().loadProject(data)
      set({
        browserProjectId,
        projectPath: null,
        projectRef: { type: 'local', path: null, browserProjectId },
      })
      updateRecentProjects(get, set, buildRecentProjectEntry({
        name: recentProject.name || `${data.projectName || 'Untitled Shotlist'}.shotlist`,
        path: `browser:${browserProjectId}`,
        shots: getTotalShotsFromProjectData(data),
        browserProjectId,
      }))
    } catch {
      alert('Failed to load project: Invalid file format')
    }
  },

  newProject: () => {
    const name = prompt('Project name:', 'Untitled Shotlist')
    if (name === null) return
    const scene = createScene({ id: 'scene_1', sceneLabel: 'SCENE 1', location: 'LOCATION' })
    const browserProjectId = platformService.isDesktop() ? null : platformService.ensureBrowserProjectId()
    set({
      projectName: name,
      projectEmoji: '🎬',
      projectLogline: '',
      projectHeroImage: null,
      projectHeroOverlayColor: '#1f1f27',
      scenes: [scene],
      storyboardSceneOrder: [],
      storyboardDisplayConfig: DEFAULT_STORYBOARD_DISPLAY_CONFIG,
      castCrewDisplayConfig: DEFAULT_CASTCREW_DISPLAY_CONFIG,
      schedule: [],
      callsheets: {},
      callsheetSectionConfig: DEFAULT_CALLSHEET_SECTION_CONFIG,
      callsheetColumnConfig: DEFAULT_CALLSHEET_COLUMN_CONFIG,
      castRoster: [],
      crewRoster: [],
      castCrewNotes: '',
      scriptScenes: [],
      scriptEngine: SCRIPT_ENGINE_PROSEMIRROR,
      scriptDocVersion: SCRIPT_DOC_VERSION,
      scriptDerivationVersion: SCRIPT_DERIVATION_VERSION,
      scriptDocument: { type: 'doc', content: [] },
      scriptAnnotations: { byId: {}, order: [] },
      scriptDocumentLive: null,
      scriptDerivedCache: {
        sceneMetadataByScriptSceneId: {},
        breakdownTags: [],
        breakdownAggregates: { total: 0, byScene: {}, byCategory: {} },
        breakdownLists: { perScene: {}, global: {} },
        shotLinkIndexBySceneId: {},
      },
      scriptDerivationState: {
        status: 'idle',
        lastDerivedAt: null,
        lastReason: null,
        lastError: null,
      },
      _scriptDerivationTimeout: null,
      importedScripts: [],
      projectPath: null,
      browserProjectId,
      projectRef: { type: 'local', path: null, browserProjectId },
      cloudLineage: null,
      lastSaved: null,
      hasUnsavedChanges: false,
      saveSyncState: buildSyncState({
        mode: 'local_only',
        status: 'saved_locally',
        message: 'Saved locally on this device',
      }),
      activeTab: 'script',
      contextMenu: null,
      personDialog: null,
      documentSession: get().documentSession + 1,
      tabViewState: {
        home: {
          cloudProjectsExpanded: true,
          pendingDeletionExpanded: false,
        },
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
      storyboardImageCache: {},
    })
    if (!platformService.isDesktop()) {
      persistBrowserProjectState(get, set, {
        name: `${name.replace(/[^a-z0-9]/gi, '_') || 'Untitled_Shotlist'}.shotlist`,
        markSaved: false,
      })
    }
  },

  createCloudProjectFromLocal: async ({
    cloudRepository = projectRepository.cloud,
    ownerUserId,
    accountProfile,
  }) => {
    if (!cloudRepository) {
      throw new Error('Cloud repository is not configured')
    }
    if (!ownerUserId) {
      throw new Error('ownerUserId is required')
    }
    if (!accountProfile || accountProfile.planTier !== 'paid') {
      throw new Error('Cloud projects require a paid account')
    }

    const payload = get().getProjectData()
    const localAssetPreflight = detectUnmigratedLocalAssetsFromProjectData(payload)
    const payloadWithCloudAssets = JSON.parse(JSON.stringify(payload || {}))
    const uploader = get().cloudImageUploader
    const uploadCache = new Map()
    const migratedShots = new Map()
    let localImagesToMigrate = 0

    for (const scene of (payloadWithCloudAssets.scenes || [])) {
      for (const shot of (scene?.shots || [])) {
        const hasCloudAsset = typeof shot?.imageAsset?.cloud?.assetId === 'string' && shot.imageAsset.cloud.assetId.trim().length > 0
        if (hasCloudAsset) continue
        const sourceRef = shot?.imageAsset?.thumb || shot?.image || null
        if (!isInlineStoryboardImageRef(sourceRef)) continue
        localImagesToMigrate += 1
      }
    }

    devCloudBackupLog('local_conversion:start', {
      ownerUserId,
      sceneCount: Array.isArray(payload?.scenes) ? payload.scenes.length : 0,
      shotCount: Array.isArray(payload?.scenes)
        ? payload.scenes.reduce((sum, scene) => sum + ((scene?.shots || []).length), 0)
        : 0,
      localImagesToMigrate,
    })

    if (localAssetPreflight.pendingHeroCount > 0) {
      throw new Error(buildLocalAssetPendingMessage(localAssetPreflight))
    }
    if (localImagesToMigrate > 0 && typeof uploader !== 'function') {
      throw new Error(buildLocalAssetPendingMessage(localAssetPreflight))
    }

    const lineageProjectId = payload?.cloudLineage?.originProjectId
      || get().cloudLineage?.originProjectId
      || null

    let cloudProject = null
    let createdProject = false
    if (lineageProjectId) {
      try {
        const existingProject = await cloudRepository.getProject(lineageProjectId)
        if (existingProject) {
          cloudProject = existingProject
          devCloudBackupLog('local_conversion:reconnected_project', { projectId: cloudProject.id })
        }
      } catch (error) {
        if (import.meta.env.DEV) {
          console.warn('[cloud-backup] cloud lineage project lookup failed; creating new cloud project', {
            projectId: lineageProjectId,
            message: error?.message || 'unknown_error',
          })
        }
      }
    }
    if (!cloudProject) {
      cloudProject = await cloudRepository.createProject({
        ownerUserId,
        name: payload.projectName || get().projectName || 'Untitled Shotlist',
        emoji: payload.projectEmoji || get().projectEmoji || '🎬',
      })
      createdProject = true
      devCloudBackupLog('local_conversion:project_created', { projectId: cloudProject.id })
    }

    let snapshot
    try {
      for (const scene of (payloadWithCloudAssets.scenes || [])) {
        for (const shot of (scene?.shots || [])) {
          const shotId = shot?.id
          if (!shotId) continue
          const hasCloudAsset = typeof shot?.imageAsset?.cloud?.assetId === 'string' && shot.imageAsset.cloud.assetId.trim().length > 0
          if (hasCloudAsset) continue
          const sourceRef = shot?.imageAsset?.thumb || shot?.image || null
          if (!isInlineStoryboardImageRef(sourceRef)) continue

          let uploaded = uploadCache.get(sourceRef) || null
          if (!uploaded) {
            uploaded = await uploader(cloudProject.id, {
              shotId,
              sourceRef,
              meta: shot?.imageAsset?.meta || null,
            })
            uploadCache.set(sourceRef, uploaded)
          }
          if (!uploaded?.imageAsset?.cloud?.assetId) {
            throw new Error('Cloud image migration failed before project conversion completed.')
          }

          shot.image = uploaded?.imageAsset?.thumb || uploaded?.image || null
          shot.imageAsset = uploaded?.imageAsset
            ? {
                ...shot.imageAsset,
                ...uploaded.imageAsset,
                cloud: uploaded.imageAsset.cloud || null,
              }
            : shot.imageAsset
          migratedShots.set(shotId, {
            image: shot.image,
            imageAsset: shot.imageAsset,
          })
        }
      }

      snapshot = await cloudRepository.createSnapshot({
        projectId: cloudProject.id,
        createdByUserId: ownerUserId,
        source: 'local_conversion',
        payload: payloadWithCloudAssets,
      })
      devCloudBackupLog('local_conversion:snapshot_result', {
        projectId: cloudProject.id,
        snapshotId: snapshot?.id || null,
        conflict: !!snapshot?.conflict,
      })
      if (!snapshot?.id) {
        throw new Error(snapshot?.conflict ? 'Cloud snapshot conflicted before first version was committed.' : 'Cloud snapshot was not created.')
      }
    } catch (error) {
      if (createdProject && cloudRepository?.deleteProjectIfSnapshotless) {
        try {
          const cleanupResult = await cloudRepository.deleteProjectIfSnapshotless(cloudProject.id)
          devCloudBackupLog('local_conversion:cleanup_result', {
            projectId: cloudProject.id,
            cleanupResult,
          })
        } catch (cleanupError) {
          if (import.meta.env.DEV) {
            console.error('[cloud-backup] failed to cleanup snapshotless cloud project', cleanupError)
          }
        }
      }
      if (import.meta.env.DEV) {
        console.error('[cloud-backup] create snapshot failed during local conversion', error)
      }
      throw new Error(
        'Cloud backup couldn’t be enabled for this project yet. We cleaned up the failed cloud draft. Please try again.'
      )
    }

    emitOverwriteTrace('SHOT_IMAGE_DIFF_BEFORE_APPLY', {
      sourceLabel,
      functionName: 'applyLiveStoryboardState',
      ...summarizeShotImageDiff(beforeState?.scenes || [], orderedScenes),
      ...getOverwriteStateContext(beforeState),
    })
    set({
      scenes: get().scenes.map((scene) => ({
        ...scene,
        shots: (scene?.shots || []).map((shot) => {
          const migrated = migratedShots.get(shot.id)
          if (!migrated) return shot
          return {
            ...shot,
            image: migrated.image,
            imageAsset: migrated.imageAsset,
          }
        }),
      })),
      projectRef: {
        type: 'cloud',
        projectId: cloudProject.id,
        snapshotId: snapshot.id,
      },
      cloudLineage: {
        originProjectId: cloudProject.id,
        lastKnownSnapshotId: snapshot.id,
      },
      saveSyncState: buildSyncState({
        mode: 'cloud_solo',
        status: 'synced_to_cloud',
        message: 'Saved on device · backed up to cloud',
        lastSyncedAt: new Date().toISOString(),
      }),
    })
    const conversionAfterState = get()
    const conversionDiff = summarizeShotImageDiff(conversionBeforeScenes, conversionAfterState.scenes || [])
    emitOverwriteTrace('SHOT_IMAGE_DIFF_AFTER_APPLY', {
      sourceLabel: 'local_to_cloud_conversion',
      functionName: 'createCloudProjectFromLocal',
      ...conversionDiff,
      ...getOverwriteStateContext(conversionAfterState, {
        projectId: cloudProject?.id || null,
        incomingSnapshotId: snapshot?.id ? String(snapshot.id) : null,
      }),
    })
    emitOverwriteTrace('OVERWRITE_PATH_EXIT', getOverwriteStateContext(conversionAfterState, {
      sourceLabel: 'local_to_cloud_conversion',
      functionName: 'createCloudProjectFromLocal',
      projectId: cloudProject?.id || null,
      incomingSnapshotId: snapshot?.id ? String(snapshot.id) : null,
    }))
    get().acknowledgeCloudSnapshot(String(snapshot.id))
    return { project: cloudProject, snapshot }
  },

  setCloudRepositoryAdapter: ({ runMutation = null, runQuery = null } = {}) => {
    const cloudRepository = createCloudProjectAdapter({ runMutation, runQuery })
    projectRepository = createProjectRepository({ cloud: cloudRepository })
    set({ cloudRepositoryReady: !!cloudRepository })
  },

  setCloudImageUploader: (uploader = null) => {
    set({ cloudImageUploader: typeof uploader === 'function' ? uploader : null })
  },

  setCloudImageResolver: (resolver = null) => {
    set({ cloudImageResolver: typeof resolver === 'function' ? resolver : null })
  },

  openCloudProject: async ({ cloudRepository = projectRepository.cloud, projectId }) => {
    if (!cloudRepository) {
      throw new Error('Cloud repository is not configured')
    }
    if (!projectId) {
      throw new Error('projectId is required')
    }

    devCloudBackupLog('open:start', { projectId })

    // Fetch only the lightweight project metadata row — NOT the full snapshot.
    // Full snapshot hydration is deferred and triggered by CloudSyncCoordinator
    // once the cloud repository adapter is ready. This makes the open path
    // respond in ~50ms (one metadata read) rather than ~300–2000ms (metadata +
    // full payload fetch). Storyboard data comes from live tables; other
    // surfaces trigger hydration on first navigation.
    const cloudProject = typeof cloudRepository.getProject === 'function'
      ? await cloudRepository.getProject(projectId)
      : null

    devCloudBackupLog('open:loaded_metadata', {
      projectId,
      liveModelVersion: cloudProject?.liveModelVersion,
    })

    // Initialize a clean project state from metadata only. Surface data
    // (scenes/shots) will be populated by live table subscriptions for
    // liveModelVersion >= 1, or by snapshot hydration for legacy projects.
    const scene = createScene({ id: 'scene_1', sceneLabel: 'SCENE 1', location: 'LOCATION' })
    emitOverwriteTrace('OVERWRITE_PATH_ENTER', getOverwriteStateContext(get(), {
      sourceLabel: 'initial_cloud_load',
      functionName: 'openCloudProject',
      projectId,
      stack: getCompactTraceStack(),
    }))
    const beforeScenes = get().scenes || []
    emitOverwriteTrace('SHOT_IMAGE_DIFF_BEFORE_APPLY', {
      sourceLabel: 'initial_cloud_load',
      functionName: 'openCloudProject',
      ...summarizeShotImageDiff(beforeScenes, [scene]),
      ...getOverwriteStateContext(get(), { projectId }),
    })
    set({
      projectPath: null,
      browserProjectId: null,
      projectRef: {
        type: 'cloud',
        projectId,
        snapshotId: null, // populated once hydrateProjectSnapshot resolves
      },
      projectName: cloudProject?.name || 'Untitled',
      projectEmoji: cloudProject?.emoji || '🎬',
      projectLogline: '',
      projectHeroImage: null,
      projectHeroOverlayColor: '#1f1f27',
      scenes: [scene],
      storyboardSceneOrder: [],
      schedule: [],
      callsheets: {},
      castRoster: [],
      crewRoster: [],
      castCrewNotes: '',
      scriptScenes: [],
      importedScripts: [],
      scriptDocument: { type: 'doc', content: [] },
      scriptAnnotations: { byId: {}, order: [] },
      cloudLineage: {
        originProjectId: projectId,
        lastKnownSnapshotId: cloudProject?.latestSnapshotId || null,
      },
      liveModelVersion: Number(cloudProject?.liveModelVersion || 0),
      hasUnsavedChanges: false,
      lastSaved: null,
      saveSyncState: buildSyncState({
        mode: 'cloud_solo',
        status: 'synced_to_cloud',
        message: 'Saved on device · backed up to cloud',
        lastSyncedAt: new Date().toISOString(),
      }),
      pendingRemoteSnapshot: null,
      _cloudDirtyRevision: null,
      _lastAckedSnapshotId: cloudProject?.latestSnapshotId ? String(cloudProject.latestSnapshotId) : null,
      snapshotHydrationState: { status: 'deferred', projectId },
      undoPast: [],
      undoFuture: [],
      undoLastRecordedAt: 0,
      storyboardImageCache: {},
      documentSession: get().documentSession + 1,
    })
    const afterOpenState = get()
    const openDiff = summarizeShotImageDiff(beforeScenes, afterOpenState.scenes || [])
    emitOverwriteTrace('SHOT_IMAGE_DIFF_AFTER_APPLY', {
      sourceLabel: 'initial_cloud_load',
      functionName: 'openCloudProject',
      ...openDiff,
      ...getOverwriteStateContext(afterOpenState, { projectId }),
    })
    emitOverwriteTrace('OVERWRITE_PATH_EXIT', getOverwriteStateContext(afterOpenState, {
      sourceLabel: 'initial_cloud_load',
      functionName: 'openCloudProject',
      projectId,
    }))

    // Persist across browser refresh so the same cloud project reopens
    // automatically when the user refreshes the page.
    try { sessionStorage.setItem('ss_active_cloud_project_id', projectId) } catch {}

    if (isSessionMetricsEnabled) recordSnapshotHydrationDeferred()
  },

  setLiveModelVersion: (version = 0) => {
    set({ liveModelVersion: Math.max(0, Number(version) || 0) })
  },

  // Fetches and applies the full snapshot payload for the current cloud project.
  // Called by CloudSyncCoordinator after openCloudProject sets
  // snapshotHydrationState to 'deferred'. Uses the same preserve-then-restore
  // pattern as applyIncomingCloudSnapshot so activeTab and projectRef are not
  // clobbered by the loadProject call.
  hydrateProjectSnapshot: async ({ cloudRepository = projectRepository.cloud } = {}) => {
    const state = get()
    if (state.snapshotHydrationState?.status !== 'deferred') {
      return { skipped: true, reason: 'not_deferred' }
    }
    const projectId = state.snapshotHydrationState.projectId
    if (!projectId || state.projectRef?.type !== 'cloud' || state.projectRef.projectId !== projectId) {
      return { skipped: true, reason: 'project_mismatch' }
    }
    if (!cloudRepository) {
      return { skipped: true, reason: 'no_repository' }
    }
    // If the snapshot was already applied by another path (e.g. an incoming
    // collaborator snapshot that arrived during the deferred window), just mark
    // as loaded rather than re-fetching.
    if (state.projectRef.snapshotId !== null) {
      set({ snapshotHydrationState: { status: 'loaded', projectId } })
      return { skipped: true, reason: 'already_hydrated' }
    }

    set({ snapshotHydrationState: { status: 'loading', projectId } })
    devCloudBackupLog('hydrate:start', { projectId })

    try {
      const snapshot = await cloudRepository.getLatestSnapshot(projectId)
      if (!snapshot?.payload) {
        devCloudBackupLog('hydrate:missing_snapshot', { projectId })
        set({ snapshotHydrationState: { status: 'error', projectId } })
        return { ok: false, reason: 'no_snapshot' }
      }
      devCloudBackupLog('hydrate:loaded_snapshot', { projectId, snapshotId: snapshot.id })

      // Verify the project has not changed while the fetch was in flight.
      const currentState = get()
      if (currentState.projectRef?.type !== 'cloud' || currentState.projectRef.projectId !== projectId) {
        return { skipped: true, reason: 'project_changed_during_hydration' }
      }

      // Preserve navigation state — loadProject resets activeTab to 'script'
      // and projectRef to local, same as with collaborator snapshot application.
      const preservedProjectRef = currentState.projectRef
      const preservedActiveTab = currentState.activeTab
      emitOverwriteTrace('OVERWRITE_PATH_ENTER', getOverwriteStateContext(currentState, {
        sourceLabel: 'hydrate_project_snapshot',
        functionName: 'hydrateProjectSnapshot',
        projectId,
        incomingSnapshotId: snapshot?.id ? String(snapshot.id) : null,
        stack: getCompactTraceStack(),
      }))
      if (currentState._cloudDirtyRevision !== null) {
        set((latestState) => ({
          pendingRemoteSnapshot: {
            projectId,
            snapshotId: String(snapshot.id),
            payload: snapshot.payload,
            detectedAt: new Date().toISOString(),
            queuedWhileDirtyRevision: currentState._cloudDirtyRevision,
          },
          saveSyncState: buildSyncState({
            mode: latestState.cloudSyncContext?.collaborationMode ? 'cloud_collab' : 'cloud_solo',
            status: 'remote_update_pending',
            message: 'Remote collaborator changes are available',
            pendingReason: 'snapshot_hydration_pending',
            lastSyncedAt: latestState.saveSyncState.lastSyncedAt,
          }),
          snapshotHydrationState: { status: 'loaded', projectId },
        }))
        return { ok: true, deferred: true, snapshotId: snapshot.id }
      }

      get().loadProject(snapshot.payload, {
        sourceLabel: 'hydrate_project_snapshot',
        projectId,
        snapshotId: snapshot?.id ? String(snapshot.id) : null,
        stack: getCompactTraceStack(),
      })

      const syncedAt = new Date().toISOString()
      set((latestState) => ({
        projectRef: { ...preservedProjectRef, snapshotId: snapshot.id },
        cloudLineage: {
          originProjectId: projectId,
          lastKnownSnapshotId: snapshot.id,
        },
        activeTab: preservedActiveTab,
        hasUnsavedChanges: false,
        lastSaved: syncedAt,
        saveSyncState: buildSyncState({
          mode: latestState.cloudSyncContext?.collaborationMode ? 'cloud_collab' : 'cloud_solo',
          status: 'synced_to_cloud',
          message: 'Saved on device · backed up to cloud',
          lastSyncedAt: syncedAt,
        }),
        _cloudDirtyRevision: null,
        _lastAckedSnapshotId: String(snapshot.id),
        snapshotHydrationState: { status: 'loaded', projectId },
      }))
      get().acknowledgeCloudSnapshot(String(snapshot.id))
      emitOverwriteTrace('OVERWRITE_PATH_EXIT', getOverwriteStateContext(get(), {
        sourceLabel: 'hydrate_project_snapshot',
        functionName: 'hydrateProjectSnapshot',
        projectId,
        incomingSnapshotId: snapshot?.id ? String(snapshot.id) : null,
      }))

      if (isSessionMetricsEnabled) recordSnapshotHydrationTriggered()
      return { ok: true, snapshotId: snapshot.id }
    } catch (error) {
      // Only update state if we're still on the same project.
      const currentState = get()
      if (currentState.snapshotHydrationState?.projectId === projectId) {
        set({ snapshotHydrationState: { status: 'error', projectId } })
      }
      devCloudBackupLog('hydrate:error', { projectId, error: error?.message })
      throw error
    }
  },

  applyLiveStoryboardState: ({ scenes = [], shots = [] } = {}, traceMeta = {}) => {
    if (!Array.isArray(scenes) || !Array.isArray(shots)) return { applied: false }
    const beforeState = get()
    const sourceLabel = traceMeta?.sourceLabel || 'other_applyLiveStoryboardState'
    const stack = traceMeta?.stack || getCompactTraceStack()
    emitOverwriteTrace('OVERWRITE_PATH_ENTER', getOverwriteStateContext(beforeState, {
      sourceLabel,
      functionName: 'applyLiveStoryboardState',
      overwritePathLabel: sourceLabel,
      stack,
    }))
    const shotsByScene = new Map()
    shots
      .slice()
      .sort((a, b) => Number(a.order || 0) - Number(b.order || 0))
      .forEach((shot) => {
        const sceneId = String(shot.sceneId || '')
        if (!sceneId) return
        if (!shotsByScene.has(sceneId)) shotsByScene.set(sceneId, [])
        const customFields = (shot.customFields && typeof shot.customFields === 'object') ? shot.customFields : {}
        shotsByScene.get(sceneId).push({
          id: shot.shotId,
          cameraName: shot.cameraName || 'Camera 1',
          focalLength: shot.focalLength || '',
          color: shot.color || null,
          image: shot.image || null,
          imageAsset: shot.imageAsset || null,
          specs: shot.specs || { size: '', type: '', move: '', equip: '' },
          notes: shot.notes || '',
          subject: shot.subject || '',
          description: shot.description || '',
          cast: shot.cast || '',
          checked: !!shot.checked,
          intOrExt: shot.intOrExt || '',
          dayNight: shot.dayNight || '',
          scriptTime: shot.scriptTime || '',
          setupTime: shot.setupTime || '',
          shotAspectRatio: shot.shotAspectRatio || '',
          predictedTakes: shot.predictedTakes || '',
          shootTime: shot.shootTime || '',
          takeNumber: shot.takeNumber || '',
          sound: shot.sound || '',
          props: shot.props || '',
          frameRate: shot.frameRate || '',
          linkedSceneId: shot.linkedSceneId || null,
          linkedDialogueLine: shot.linkedDialogueLine || null,
          linkedDialogueOffset: shot.linkedDialogueOffset ?? null,
          linkedScriptRangeStart: shot.linkedScriptRangeStart ?? null,
          linkedScriptRangeEnd: shot.linkedScriptRangeEnd ?? null,
          ...customFields,
        })
      })

    const orderedScenes = scenes
      .slice()
      .sort((a, b) => Number(a.order || 0) - Number(b.order || 0))
      .map((scene) => ({
        id: scene.sceneId,
        sceneLabel: scene.sceneLabel || '',
        slugline: scene.slugline || '',
        location: scene.location || '',
        intOrExt: scene.intOrExt || '',
        dayNight: scene.dayNight || '',
        color: scene.color || null,
        linkedScriptSceneId: scene.linkedScriptSceneId || null,
        pageNotes: Array.isArray(scene.pageNotes) ? scene.pageNotes : [''],
        pageColors: Array.isArray(scene.pageColors) ? scene.pageColors : [],
        shots: shotsByScene.get(String(scene.sceneId)) || [],
      }))

    const order = orderedScenes.map((scene) => scene.id)
    set({
      scenes: orderedScenes,
      storyboardSceneOrder: order,
      hasUnsavedChanges: false,
    })
    const afterState = get()
    const liveDiff = summarizeShotImageDiff(beforeState?.scenes || [], afterState?.scenes || [])
    emitOverwriteTrace('SHOT_IMAGE_DIFF_AFTER_APPLY', {
      sourceLabel,
      functionName: 'applyLiveStoryboardState',
      ...liveDiff,
      ...getOverwriteStateContext(afterState),
    })
    emitOverwriteTrace('OVERWRITE_PATH_EXIT', getOverwriteStateContext(afterState, {
      sourceLabel,
      functionName: 'applyLiveStoryboardState',
      overwritePathLabel: sourceLabel,
      stack,
    }))
    maybeEmitStoryboardRevertDetected({
      diff: liveDiff,
      sourceLabel,
      stateContext: getOverwriteStateContext(afterState),
      stack,
    })
    return { applied: true }
  },

  setCloudSnapshotId: (snapshotId) => {
    set((state) => {
      if (state.projectRef?.type !== 'cloud') return state
      return {
      projectRef: {
        ...state.projectRef,
        snapshotId: snapshotId || null,
      },
      cloudLineage: state.cloudLineage?.originProjectId
        ? {
            ...state.cloudLineage,
            lastKnownSnapshotId: snapshotId || null,
          }
        : state.cloudLineage,
    }
  })
  },

  applyIncomingCloudSnapshot: ({ projectId, snapshotId, payload }) => {
    const entryState = get()
    emitOverwriteTrace('OVERWRITE_PATH_ENTER', getOverwriteStateContext(entryState, {
      sourceLabel: 'incoming_cloud_snapshot',
      functionName: 'applyIncomingCloudSnapshot',
      projectId,
      incomingSnapshotId: snapshotId ? String(snapshotId) : null,
      stack: getCompactTraceStack(),
    }))
    if (!projectId || !snapshotId || !payload) {
      emitOverwriteTrace('OVERWRITE_PATH_EXIT', getOverwriteStateContext(get(), {
        sourceLabel: 'incoming_cloud_snapshot',
        functionName: 'applyIncomingCloudSnapshot',
        projectId: projectId || null,
        incomingSnapshotId: snapshotId ? String(snapshotId) : null,
        exitReason: 'invalid_snapshot',
      }))
      return { applied: false, reason: 'invalid_snapshot' }
    }
    const state = get()
    if (state.projectRef?.type !== 'cloud' || state.projectRef.projectId !== projectId) {
      emitOverwriteTrace('OVERWRITE_PATH_EXIT', getOverwriteStateContext(get(), {
        sourceLabel: 'incoming_cloud_snapshot',
        functionName: 'applyIncomingCloudSnapshot',
        projectId,
        incomingSnapshotId: String(snapshotId),
        exitReason: 'different_project',
      }))
      return { applied: false, reason: 'different_project' }
    }
    if (state.projectRef.snapshotId === snapshotId || state._lastAckedSnapshotId === snapshotId) {
      emitOverwriteTrace('OVERWRITE_PATH_EXIT', getOverwriteStateContext(get(), {
        sourceLabel: 'incoming_cloud_snapshot',
        functionName: 'applyIncomingCloudSnapshot',
        projectId,
        incomingSnapshotId: String(snapshotId),
        exitReason: 'already_current',
      }))
      return { applied: false, reason: 'already_current' }
    }
    if (state._cloudDirtyRevision !== null || state._cloudSyncInFlight) {
      set((latestState) => ({
        pendingRemoteSnapshot: {
          projectId,
          snapshotId,
          payload,
          detectedAt: new Date().toISOString(),
          queuedWhileDirtyRevision: state._cloudDirtyRevision,
        },
        saveSyncState: buildSyncState({
          mode: latestState.cloudSyncContext?.collaborationMode ? 'cloud_collab' : 'cloud_solo',
          status: 'remote_update_pending',
          message: 'Remote collaborator changes are available',
          pendingReason: 'remote_update_pending',
          lastSyncedAt: latestState.saveSyncState.lastSyncedAt,
        }),
      }))
      emitOverwriteTrace('OVERWRITE_PATH_EXIT', getOverwriteStateContext(get(), {
        sourceLabel: 'incoming_cloud_snapshot',
        functionName: 'applyIncomingCloudSnapshot',
        projectId,
        incomingSnapshotId: snapshotId ? String(snapshotId) : null,
        exitReason: 'queued_pending_remote_snapshot',
      }))
      return { applied: false, reason: 'local_changes_pending' }
    }

    // Preserve workspace navigation before loadProject resets it.
    // loadProject always resets projectRef to { type: 'local' } and activeTab to
    // 'script', which would kick the collaborator off their current tab and
    // silently drop cloud mode. Capture both before the call so we can restore
    // them unconditionally afterward.
    const preservedProjectRef = state.projectRef
    const preservedActiveTab = state.activeTab

    get().loadProject(payload, {
      sourceLabel: 'incoming_cloud_snapshot',
      projectId,
      snapshotId: snapshotId ? String(snapshotId) : null,
      stack: getCompactTraceStack(),
    })

    const syncedAt = new Date().toISOString()
    set((latestState) => ({
      // Restore cloud identity unconditionally — loadProject always writes
      // { type: 'local' }, so the old "check latestState.type === 'cloud'"
      // guard always evaluated to false and left projectRef as local.
      projectRef: { ...preservedProjectRef, snapshotId },
      cloudLineage: latestState.cloudLineage?.originProjectId
        ? {
            ...latestState.cloudLineage,
            lastKnownSnapshotId: snapshotId,
          }
        : latestState.cloudLineage,
      // Stay on whichever tab the user was on; never kick them back to Script.
      activeTab: preservedActiveTab,
      hasUnsavedChanges: false,
      lastSaved: syncedAt,
      saveSyncState: buildSyncState({
        mode: latestState.cloudSyncContext?.collaborationMode ? 'cloud_collab' : 'cloud_solo',
        status: 'synced_to_cloud',
        message: 'Saved on device · synced with collaborator changes',
        lastSyncedAt: syncedAt,
      }),
      pendingRemoteSnapshot: null,
      _lastAckedSnapshotId: String(snapshotId),
      _cloudDirtyRevision: null,
      // If a snapshot arrived during the deferred hydration window (e.g. from a
      // collaborator push), mark hydration as complete so hydrateProjectSnapshot
      // does not fire a duplicate fetch afterward.
      snapshotHydrationState: latestState.snapshotHydrationState?.status === 'deferred'
        || latestState.snapshotHydrationState?.status === 'loading'
        ? { status: 'loaded', projectId }
        : latestState.snapshotHydrationState,
    }))
    emitOverwriteTrace('OVERWRITE_PATH_EXIT', getOverwriteStateContext(get(), {
      sourceLabel: 'incoming_cloud_snapshot',
      functionName: 'applyIncomingCloudSnapshot',
      projectId,
      incomingSnapshotId: snapshotId ? String(snapshotId) : null,
      exitReason: 'applied',
    }))
    return { applied: true }
  },

  applyPendingRemoteSnapshot: () => {
    const pending = get().pendingRemoteSnapshot
    if (!pending) return { applied: false, reason: 'none_pending' }
    emitOverwriteTrace('OVERWRITE_PATH_ENTER', getOverwriteStateContext(get(), {
      sourceLabel: 'pending_remote_snapshot',
      functionName: 'applyPendingRemoteSnapshot',
      projectId: pending.projectId || null,
      incomingSnapshotId: pending.snapshotId ? String(pending.snapshotId) : null,
      stack: getCompactTraceStack(),
    }))
    const result = get().applyIncomingCloudSnapshot({
      projectId: pending.projectId,
      snapshotId: pending.snapshotId,
      payload: pending.payload,
    })
    emitOverwriteTrace('OVERWRITE_PATH_EXIT', getOverwriteStateContext(get(), {
      sourceLabel: 'pending_remote_snapshot',
      functionName: 'applyPendingRemoteSnapshot',
      projectId: pending.projectId || null,
      incomingSnapshotId: pending.snapshotId ? String(pending.snapshotId) : null,
      applied: Boolean(result?.applied),
      exitReason: result?.reason || null,
    }))
    return result
  },

  clearPendingRemoteSnapshot: () => {
    set({ pendingRemoteSnapshot: null })
  },
  acknowledgeCloudSnapshot: (snapshotId) => {
    const ackId = snapshotId ? String(snapshotId) : null
    if (!ackId) return { ok: false, reason: 'invalid_snapshot_id' }

    set((state) => {
      const pending = state.pendingRemoteSnapshot
      const pendingSnapshotId = pending?.snapshotId ? String(pending.snapshotId) : null
      const shouldClearPending = pendingSnapshotId === ackId
      return {
        _cloudDirtyRevision: null,
        _lastAckedSnapshotId: ackId,
        pendingRemoteSnapshot: shouldClearPending ? null : state.pendingRemoteSnapshot,
      }
    })

    set({ pendingRemoteSnapshot: null })
    return { ok: true, acknowledged: ackId, appliedPending: false, discardedPending: true }
  },

  disableCloudBackupForCurrentProject: () => {
    const state = get()
    if (state.projectRef?.type !== 'cloud') return { ok: false, reason: 'not_cloud_project' }
    if (state._cloudSyncTimeout) {
      clearTimeout(state._cloudSyncTimeout)
    }
    // Clear the sessionStorage entry so a subsequent browser refresh doesn't
    // try to reopen the project that the user has just detached from the cloud.
    try { sessionStorage.removeItem('ss_active_cloud_project_id') } catch {}

    set({
      projectRef: {
        type: 'local',
        path: platformService.isDesktop() ? state.projectPath : null,
        browserProjectId: state.browserProjectId || null,
      },
      cloudLineage: state.cloudLineage?.originProjectId
        ? {
            ...state.cloudLineage,
            lastKnownSnapshotId: state.projectRef?.snapshotId || state.cloudLineage.lastKnownSnapshotId || null,
          }
        : state.cloudLineage,
      _cloudSyncTimeout: null,
      _cloudSyncInFlight: false,
      pendingRemoteSnapshot: null,
      _cloudDirtyRevision: null,
      _lastAckedSnapshotId: null,
      liveModelVersion: 0,
      saveSyncState: buildSyncState({
        mode: 'local_only',
        status: state.hasUnsavedChanges ? 'unsaved_changes' : 'saved_locally',
        message: state.hasUnsavedChanges
          ? 'Cloud backup off · local changes not yet saved'
          : 'Cloud backup off · saving locally on this device',
      }),
    })
    return { ok: true }
  },

  // ── Auto-save ────────────────────────────────────────────────────────

  _autoSaveTimeout: null,
  flushBrowserPersistence: ({ data = null, name = null, markSaved = false } = {}) => {
    if (platformService.isDesktop()) return null
    try {
      return persistBrowserProjectState(get, set, { data, name, markSaved })
    } catch {
      return null
    }
  },
  _updateSaveSyncStateForChange: (reason = 'edit') => {
    const state = get()
    if (state.projectRef?.type !== 'cloud') {
      set({
        saveSyncState: buildSyncState({
          mode: 'local_only',
          status: 'unsaved_changes',
          message: 'Changes not yet saved',
          lastSyncedAt: state.saveSyncState.lastSyncedAt,
        }),
      })
      return
    }
    const canCloudSync = Boolean(state.cloudSyncContext?.canSync && state.cloudSyncContext?.cloudWritesEnabled)
    if (!canCloudSync) {
      set({
        saveSyncState: buildSyncState({
          mode: 'cloud_blocked',
          status: 'saved_locally',
          message: 'Saved on device · cloud backup unavailable',
          pendingReason: reason,
          lastSyncedAt: state.saveSyncState.lastSyncedAt,
        }),
      })
      return
    }
    if (state.pendingRemoteSnapshot) {
      set({
        saveSyncState: buildSyncState({
          mode: state.cloudSyncContext.collaborationMode ? 'cloud_collab' : 'cloud_solo',
          status: 'remote_update_pending',
          message: 'Remote collaborator changes are available',
          pendingReason: reason,
          lastSyncedAt: state.saveSyncState.lastSyncedAt,
        }),
      })
      return
    }
    set({
      saveSyncState: buildSyncState({
        mode: state.cloudSyncContext.collaborationMode ? 'cloud_collab' : 'cloud_solo',
        status: 'unsaved_changes',
        message: 'Not yet saved · uploading soon',
        pendingReason: reason,
        lastSyncedAt: state.saveSyncState.lastSyncedAt,
      }),
    })
  },
  markDomainDirty: (domain) => {
    if (domain !== 'storyboard' && domain !== 'script') return
    set((state) => {
      if (state.domainDraftState?.dirty?.[domain]) return state
      return {
        domainDraftState: {
          ...state.domainDraftState,
          dirty: {
            ...state.domainDraftState.dirty,
            [domain]: true,
          },
        },
      }
    })
  },
  clearDomainDirty: (domain) => {
    if (domain !== 'storyboard' && domain !== 'script') return
    set((state) => ({
      domainDraftState: {
        ...state.domainDraftState,
        dirty: {
          ...state.domainDraftState.dirty,
          [domain]: false,
        },
      },
    }))
  },
  commitDomain: async (domain, { reason = 'domain_commit' } = {}) => {
    if (domain !== 'storyboard' && domain !== 'script') return { skipped: true, reason: 'unsupported_domain' }
    const state = get()
    if (state.projectRef?.type !== 'cloud') return { skipped: true, reason: 'not_cloud_project' }
    if (!state.cloudSyncContext?.canSync || !state.cloudSyncContext?.cloudWritesEnabled) return { skipped: true, reason: 'sync_blocked' }
    if (!state.domainDraftState?.dirty?.[domain]) return { skipped: true, reason: 'domain_clean' }

    if (domain === 'storyboard') {
      const syncFn = state.cloudSyncContext?.syncLiveStoryboardState
      if (typeof syncFn !== 'function') return { skipped: true, reason: 'missing_domain_sync' }
      const tokenBeforeCommit = buildStoryboardDomainToken(state)
      try {
        await syncFn({
          projectId: state.projectRef.projectId,
          scenes: state.scenes || [],
          storyboardSceneOrder: state.storyboardSceneOrder || [],
        })
        const committedAt = Date.now()
        set((latest) => ({
          domainDraftState: {
            ...latest.domainDraftState,
            dirty: {
              ...latest.domainDraftState.dirty,
              storyboard: false,
            },
            lastCommittedAt: {
              ...latest.domainDraftState.lastCommittedAt,
              storyboard: committedAt,
            },
          },
          saveSyncState: buildSyncState({
            mode: latest.cloudSyncContext.collaborationMode ? 'cloud_collab' : 'cloud_solo',
            status: 'saved_locally',
            message: 'Saved on device · uploading soon',
            pendingReason: reason,
            lastSyncedAt: latest.saveSyncState.lastSyncedAt,
          }),
        }))
        if (tokenBeforeCommit) recordDomainCommit()
        return { ok: true, domain, committedAt }
      } catch (error) {
        return { ok: false, reason: 'domain_commit_failed', error: error?.message || 'domain_commit_failed' }
      }
    }

    const runScriptDomainMutation = state.cloudSyncContext?.runScriptDomainMutation
    const currentUserId = state.cloudSyncContext?.currentUserId
    if (!currentUserId || typeof runScriptDomainMutation !== 'function') {
      return { skipped: true, reason: 'missing_script_domain_sync' }
    }
    try {
      const latest = get()
      const scriptPayload = buildScriptDomainPayloadFromProjectData(latest.getProjectData())
      const result = await runScriptDomainMutation({
        projectId: latest.projectRef.projectId,
        createdByUserId: currentUserId,
        scriptPayload,
        expectedLatestSnapshotId: latest.projectRef.snapshotId || undefined,
      })
      if (!result?.ok) return { ok: false, reason: result?.reason || 'script_commit_failed' }
      const committedAt = Date.now()
      set((nextState) => ({
        projectRef: nextState.projectRef?.type === 'cloud'
          ? { ...nextState.projectRef, snapshotId: String(result.snapshotId) }
          : nextState.projectRef,
        cloudLineage: nextState.cloudLineage?.originProjectId
          ? {
              ...nextState.cloudLineage,
              lastKnownSnapshotId: String(result.snapshotId),
            }
          : nextState.cloudLineage,
        domainDraftState: {
          ...nextState.domainDraftState,
          dirty: {
            ...nextState.domainDraftState.dirty,
            script: false,
          },
          lastCommittedAt: {
            ...nextState.domainDraftState.lastCommittedAt,
            script: committedAt,
          },
        },
      }))
      get().acknowledgeCloudSnapshot(String(result.snapshotId))
      recordDomainCommit()
      return { ok: true, domain, committedAt, snapshotId: result.snapshotId }
    } catch (error) {
      return { ok: false, reason: 'domain_commit_failed', error: error?.message || 'domain_commit_failed' }
    }
  },
  _scheduleCloudSync: (reason = 'edit') => {
    const state = get()
    if (state.projectRef?.type !== 'cloud') return
    if (!state.cloudSyncContext?.canSync || !state.cloudSyncContext?.cloudWritesEnabled) return
    if (state._cloudSyncTimeout) clearTimeout(state._cloudSyncTimeout)
    const timeout = setTimeout(() => {
      get().flushCloudSync({ reason })
    }, CLOUD_SYNC_DEBOUNCE_MS)
    set((latestState) => ({
      _cloudSyncTimeout: timeout,
      _cloudDirtyRevision: reason === 'context_updated'
        ? latestState._cloudDirtyRevision
        : (latestState._cloudDirtyRevision == null ? 1 : Number(latestState._cloudDirtyRevision) + 1),
    }))
  },
  setCloudSyncContext: ({
    canSync = false,
    cloudWritesEnabled = false,
    runSnapshotMutation = null,
    runScriptDomainMutation = null,
    currentUserId = null,
    collaborationMode = false,
    hasActiveCollaborators = false,
    syncLiveStoryboardState = null,
  } = {}) => {
    set({
      cloudSyncContext: {
        canSync: !!canSync,
        cloudWritesEnabled: !!cloudWritesEnabled,
        runSnapshotMutation: runSnapshotMutation || null,
        runScriptDomainMutation: runScriptDomainMutation || null,
        currentUserId: currentUserId ? String(currentUserId) : null,
        collaborationMode: !!collaborationMode,
        hasActiveCollaborators: !!hasActiveCollaborators,
        syncLiveStoryboardState: typeof syncLiveStoryboardState === 'function' ? syncLiveStoryboardState : null,
      },
    })
    const state = get()
    if (state.projectRef?.type !== 'cloud') return
    if (!state.cloudSyncContext.canSync || !state.cloudSyncContext.cloudWritesEnabled) {
      set({
        saveSyncState: buildSyncState({
          mode: 'cloud_blocked',
          status: 'saved_locally',
          message: 'Saved on device · cloud backup unavailable',
          lastSyncedAt: state.saveSyncState.lastSyncedAt,
        }),
      })
      return
    }
    get()._scheduleCloudSync('context_updated')
  },
  setCurrentUser: (user) => set({ currentUser: user !== undefined ? user : null }),
  setEntitlement: (entitlement) => set({ entitlement: entitlement !== undefined ? entitlement : null }),
  setUserDataLoaded: (loaded) => set({ userDataLoaded: !!loaded }),
  flushCloudSync: async ({ reason = 'manual' } = {}) => {
    const state = get()
    if (state.projectRef?.type !== 'cloud') return { skipped: true, reason: 'not_cloud_project' }
    // Guard: do not save the placeholder blank state that openCloudProject sets
    // while snapshot hydration is still pending. The full project data has not
    // been loaded yet, so saving would overwrite the real cloud snapshot with an
    // empty payload.
    const hydrationStatus = state.snapshotHydrationState?.status
    if (hydrationStatus === 'deferred' || hydrationStatus === 'loading') {
      return { skipped: true, reason: 'snapshot_hydration_pending' }
    }
    if (!state.cloudSyncContext?.canSync || !state.cloudSyncContext?.cloudWritesEnabled) {
      return { skipped: true, reason: 'sync_blocked' }
    }
    if (state._cloudSyncInFlight) return { skipped: true, reason: 'sync_in_flight' }
    if (state.pendingRemoteSnapshot) {
      set((nextState) => ({
        saveSyncState: buildSyncState({
          mode: nextState.cloudSyncContext.collaborationMode ? 'cloud_collab' : 'cloud_solo',
          status: 'cloud_sync_conflict',
          message: 'Save blocked · reload collaborator updates first',
          pendingReason: 'remote_update_pending',
          error: 'A newer collaborator snapshot is waiting. Reload remote changes before saving.',
          lastSyncedAt: nextState.saveSyncState.lastSyncedAt,
        }),
      }))
      return { ok: false, reason: 'remote_update_pending' }
    }
    const runSnapshotMutation = state.cloudSyncContext?.runSnapshotMutation
    const currentUserId = state.cloudSyncContext?.currentUserId
    if (!currentUserId || typeof runSnapshotMutation !== 'function') {
      return { skipped: true, reason: 'missing_sync_context' }
    }
    const shouldWriteCheckpointSnapshot = !DRAFT_COMMIT_MODE || CHECKPOINT_REASONS.has(reason)
    if (!shouldWriteCheckpointSnapshot) {
      const dirtyDomains = get().domainDraftState?.dirty || {}
      const results = []
      if (dirtyDomains.storyboard) {
        results.push(await get().commitDomain('storyboard', { reason }))
      }
      if (dirtyDomains.script) {
        results.push(await get().commitDomain('script', { reason }))
      }
      return { ok: results.some((entry) => entry?.ok), results }
    }
    if (state._cloudSyncTimeout) {
      clearTimeout(state._cloudSyncTimeout)
      set({ _cloudSyncTimeout: null })
    }

    set({
      _cloudSyncInFlight: true,
      saveSyncState: buildSyncState({
        mode: state.cloudSyncContext.collaborationMode ? 'cloud_collab' : 'cloud_solo',
        status: 'syncing_to_cloud',
        message: 'Uploading to cloud…',
        pendingReason: reason,
        lastSyncedAt: state.saveSyncState.lastSyncedAt,
        lastAttemptAt: new Date().toISOString(),
      }),
    })
    try {
      const latest = get()
      const latestProjectData = latest.getProjectData()
      const localAssetPreflight = detectUnmigratedLocalAssetsFromProjectData(latestProjectData)
      if (localAssetPreflight.totalPendingCount > 0) {
        const pendingMessage = buildLocalAssetPendingMessage(localAssetPreflight)
        set((nextState) => ({
          _cloudSyncInFlight: false,
          localAssetBackfillRequestedAt: localAssetPreflight.pendingShotCount > 0
            ? Date.now()
            : nextState.localAssetBackfillRequestedAt,
          saveSyncState: buildSyncState({
            mode: nextState.cloudSyncContext.collaborationMode ? 'cloud_collab' : 'cloud_solo',
            status: 'cloud_blocked_local_assets',
            message: pendingMessage,
            pendingReason: reason,
            error: pendingMessage,
            lastSyncedAt: nextState.saveSyncState.lastSyncedAt,
          }),
        }))
        return {
          ok: false,
          reason: 'local_assets_pending',
          pendingShotCount: localAssetPreflight.pendingShotCount,
          pendingHeroCount: localAssetPreflight.pendingHeroCount,
          error: pendingMessage,
        }
      }
      const safePayload = buildConvexSafeSnapshotPayload(latestProjectData)
      const payloadBytes = isSessionMetricsEnabled
        ? (() => {
          try {
            return new TextEncoder().encode(JSON.stringify(safePayload ?? null)).length
          } catch {
            return 0
          }
        })()
        : 0
      const result = await runSnapshotMutation({
        projectId: latest.projectRef.projectId,
        createdByUserId: currentUserId,
        source: reason === 'manual' ? 'manual_save' : 'autosave',
        payload: safePayload,
        expectedLatestSnapshotId: latest.projectRef.snapshotId || undefined,
        conflictStrategy: 'fail_on_conflict',
      })
      if (!result?.ok) {
        if (result?.reason === 'version_conflict') {
          set((nextState) => ({
            _cloudSyncInFlight: false,
            saveSyncState: buildSyncState({
              mode: nextState.cloudSyncContext.collaborationMode ? 'cloud_collab' : 'cloud_solo',
              status: 'cloud_sync_conflict',
              message: 'Save blocked · newer collaborator version detected',
              pendingReason: reason,
              error: 'Another collaborator saved first. Reload latest cloud snapshot before retrying.',
              lastSyncedAt: nextState.saveSyncState.lastSyncedAt,
            }),
          }))
          return { ok: false, reason: 'version_conflict', latestSnapshotId: result?.latestSnapshotId || null }
        }
        throw new Error(result?.reason || 'sync_failed')
      }
      const syncedAt = new Date().toISOString()
      recordSnapshotWrite(payloadBytes)
      set((nextState) => ({
        _cloudSyncInFlight: false,
        hasUnsavedChanges: false,
        lastSaved: syncedAt,
        projectRef: nextState.projectRef?.type === 'cloud'
          ? { ...nextState.projectRef, snapshotId: String(result.snapshotId) }
          : nextState.projectRef,
        cloudLineage: nextState.cloudLineage?.originProjectId
          ? {
              ...nextState.cloudLineage,
              lastKnownSnapshotId: String(result.snapshotId),
            }
          : nextState.cloudLineage,
        saveSyncState: buildSyncState({
          mode: nextState.cloudSyncContext.collaborationMode ? 'cloud_collab' : 'cloud_solo',
          status: 'synced_to_cloud',
          message: 'Saved on device · backed up to cloud',
          lastSyncedAt: syncedAt,
        }),
        domainDraftState: {
          ...nextState.domainDraftState,
          dirty: {
            ...nextState.domainDraftState.dirty,
            storyboard: false,
            script: false,
          },
          lastCommittedAt: {
            ...nextState.domainDraftState.lastCommittedAt,
            storyboard: Date.now(),
            script: nextState.domainDraftState.lastCommittedAt.script,
          },
        },
        pendingRemoteSnapshot: null,
        _cloudDirtyRevision: null,
        _lastAckedSnapshotId: String(result.snapshotId),
      }))
      get().acknowledgeCloudSnapshot(String(result.snapshotId))
      return { ok: true, snapshotId: result.snapshotId }
    } catch (error) {
      devCloudBackupLog('sync:failed', {
        reason,
        projectId: state.projectRef?.type === 'cloud' ? state.projectRef.projectId : null,
        error: error?.message || 'Cloud backup failed',
      })
      set((nextState) => ({
        _cloudSyncInFlight: false,
        saveSyncState: buildSyncState({
          mode: nextState.cloudSyncContext.collaborationMode ? 'cloud_collab' : 'cloud_solo',
          status: 'cloud_sync_failed',
          message: 'Saved on device · cloud backup failed',
          pendingReason: reason,
          error: error?.message || 'Cloud backup failed',
          lastSyncedAt: nextState.saveSyncState.lastSyncedAt,
        }),
      }))
      return { ok: false, error: error?.message || 'Cloud backup failed' }
    }
  },
  _scheduleAutoSave: (reason = 'edit') => {
    set({ hasUnsavedChanges: true })
    get()._updateSaveSyncStateForChange(reason)
    if (DRAFT_COMMIT_MODE && get().projectRef?.type === 'cloud') {
      const activeTab = get().activeTab
      if (activeTab === 'script') get().markDomainDirty('script')
      else get().markDomainDirty('storyboard')
    }
    get()._scheduleCloudSync(reason)
    get()._syncLiveStoryboardIfEnabled()
    const state = get()
    if (!state.autoSave) return
    if (state._autoSaveTimeout) clearTimeout(state._autoSaveTimeout)
    const timeout = setTimeout(() => {
      try {
        const startedAt = performance.now()
        const data = get().getProjectData()
        platformService.saveAutosave(data)
        if (!platformService.isDesktop()) {
          persistBrowserProjectState(get, set, { data })
        }
        const persistedAt = new Date().toISOString()
        set((currentState) => {
          if (!currentState.hasUnsavedChanges) return {}
          if (currentState.projectRef?.type !== 'cloud') {
            return {
              hasUnsavedChanges: false,
              lastSaved: persistedAt,
              saveSyncState: buildSyncState({
                mode: 'local_only',
                status: 'saved_locally',
                message: 'Saved locally on this device',
                lastSyncedAt: currentState.saveSyncState.lastSyncedAt,
              }),
            }
          }
          const canCloudSync = Boolean(currentState.cloudSyncContext?.canSync && currentState.cloudSyncContext?.cloudWritesEnabled)
          if (!canCloudSync) {
            return {
              hasUnsavedChanges: false,
              lastSaved: persistedAt,
              saveSyncState: buildSyncState({
                mode: 'cloud_blocked',
                status: 'saved_locally',
                message: 'Saved on device · cloud backup unavailable',
                pendingReason: reason,
                lastSyncedAt: currentState.saveSyncState.lastSyncedAt,
              }),
            }
          }
          return {
            hasUnsavedChanges: false,
            lastSaved: persistedAt,
            saveSyncState: buildSyncState({
              mode: currentState.cloudSyncContext.collaborationMode ? 'cloud_collab' : 'cloud_solo',
              status: 'saved_locally',
              message: 'Saved on device · uploading soon',
              pendingReason: reason,
              lastSyncedAt: currentState.saveSyncState.lastSyncedAt,
            }),
          }
        })
        devPerfLog('store:autosave-timeout', {
          ms: Math.round((performance.now() - startedAt) * 100) / 100,
        })
      } catch {
        // Silently skip — the user will see an error on the next manual save.
      }
    }, LOCAL_PERSIST_DEBOUNCE_MS)
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
  const startedAt = performance.now()
  const previousSerialized = buildUndoComparisonToken(previousSnapshot)
  const nextSerialized = buildUndoComparisonToken(nextSnapshot)
  devPerfLog('store:undo-compare', {
    ms: Math.round((performance.now() - startedAt) * 100) / 100,
  })
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
