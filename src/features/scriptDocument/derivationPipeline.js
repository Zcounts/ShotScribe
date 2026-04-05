import { convertProseMirrorDocumentToLegacyCompatibility } from './legacyBridge.js'
import { deriveBreakdownListsFromAnnotations } from './breakdownAnnotations.js'

export const SCRIPT_DERIVATION_DEBOUNCE_MS = 320

function normalizeBreakdownTags(tags = []) {
  return Array.isArray(tags) ? tags.filter(Boolean) : []
}

export function buildBreakdownAggregates(breakdownTags = []) {
  const tags = normalizeBreakdownTags(breakdownTags)
  const byScene = {}
  const byCategory = {}

  tags.forEach((tag) => {
    const sceneId = tag.sceneId || '__unscoped__'
    const category = tag.category || 'Notes'
    byScene[sceneId] = byScene[sceneId] || { total: 0, byCategory: {} }
    byScene[sceneId].total += 1
    byScene[sceneId].byCategory[category] = (byScene[sceneId].byCategory[category] || 0) + 1
    byCategory[category] = (byCategory[category] || 0) + 1
  })

  return {
    total: tags.length,
    byScene,
    byCategory,
  }
}

export function buildShotLinkIndexByScene(storyboardScenes = []) {
  const scenes = Array.isArray(storyboardScenes) ? storyboardScenes : []
  const result = {}

  scenes.forEach((storyScene, storySceneIndex) => {
    ;(storyScene.shots || []).forEach((shot, shotIndex) => {
      if (!shot?.linkedSceneId) return
      const start = Number.isFinite(shot.linkedScriptRangeStart) ? shot.linkedScriptRangeStart : null
      const end = Number.isFinite(shot.linkedScriptRangeEnd) ? shot.linkedScriptRangeEnd : null
      if (start == null || end == null || end <= start) return
      if (!result[shot.linkedSceneId]) result[shot.linkedSceneId] = []
      result[shot.linkedSceneId].push({
        id: `shot_link_${shot.id}`,
        shotId: shot.id,
        start,
        end,
        color: shot.color || '#E84040',
        label: shot.displayId || `${storySceneIndex + 1}${shotIndex + 1}`,
      })
    })
  })

  Object.keys(result).forEach((sceneId) => {
    result[sceneId] = result[sceneId].sort((a, b) => a.start - b.start)
  })

  return result
}

export function deriveScriptAdapterOutputs({
  scriptDocument,
  previousScriptScenes = [],
  scriptSettings = null,
  scriptAnnotations = null,
  storyboardScenes = [],
} = {}) {
  const compatibilityResult = convertProseMirrorDocumentToLegacyCompatibility({
    scriptDocument,
    previousScriptScenes,
    scriptSettings,
    scriptAnnotations,
  })

  const breakdownTags = compatibilityResult?.compatibility?.breakdownTags || []
  const sceneMetadataByScriptSceneId = compatibilityResult?.compatibility?.sceneMetadataByScriptSceneId || {}
  const breakdownAggregates = buildBreakdownAggregates(breakdownTags)
  const breakdownLists = deriveBreakdownListsFromAnnotations({
    scriptAnnotations,
    scriptScenes: compatibilityResult.scriptScenes || [],
  })
  const shotLinkIndexBySceneId = buildShotLinkIndexByScene(storyboardScenes)

  return {
    scriptScenes: compatibilityResult.scriptScenes || [],
    compatibility: {
      sceneMetadataByScriptSceneId,
      breakdownTags,
      breakdownAggregates,
      breakdownLists,
      shotLinkIndexBySceneId,
    },
  }
}

export function createScriptDerivationDebouncer({
  delayMs = SCRIPT_DERIVATION_DEBOUNCE_MS,
  onDerive,
  scheduler = {
    set: (fn, ms) => setTimeout(fn, ms),
    clear: (id) => clearTimeout(id),
  },
} = {}) {
  let timeoutId = null
  let lastPayload = null

  const run = async () => {
    const payload = lastPayload
    timeoutId = null
    lastPayload = null
    if (typeof onDerive === 'function') {
      await onDerive(payload)
    }
  }

  return {
    schedule(payload) {
      lastPayload = payload
      if (timeoutId) scheduler.clear(timeoutId)
      timeoutId = scheduler.set(() => {
        run().catch(() => {})
      }, delayMs)
    },
    async flush() {
      if (timeoutId) {
        scheduler.clear(timeoutId)
        timeoutId = null
      }
      if (lastPayload == null) return
      await run()
    },
    cancel() {
      if (timeoutId) scheduler.clear(timeoutId)
      timeoutId = null
      lastPayload = null
    },
    isPending() {
      return !!timeoutId
    },
  }
}
