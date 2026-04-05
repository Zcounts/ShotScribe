import {
  createScreenplayElement,
  ensureEditableScreenplayElements,
  estimateScreenplayPagination,
  splitScreenplayElementsIntoSceneChunks,
} from '../../utils/screenplay.js'
import {
  BREAKDOWN_ANNOTATION_KIND,
  migrateLegacyBreakdownTagsToAnnotations,
  migrateLegacyShotLinksToAnnotations,
  normalizeScriptAnnotations as normalizeAnnotationEntities,
} from './breakdownAnnotations.js'

export const SCRIPT_ENGINE_PROSEMIRROR = 'prosemirror'
export const SCRIPT_DOC_VERSION = 1
export const SCRIPT_DERIVATION_VERSION = 1

const LEGACY_TO_PM_NODE_TYPE = {
  heading: 'scene_heading',
  action: 'action',
  character: 'character',
  dialogue: 'dialogue',
  parenthetical: 'parenthetical',
  transition: 'transition',
  centered: 'centered',
  shot: 'action',
  section: 'action',
}

const PM_TO_LEGACY_BLOCK_TYPE = {
  scene_heading: 'heading',
  action: 'action',
  character: 'character',
  dialogue: 'dialogue',
  parenthetical: 'parenthetical',
  transition: 'transition',
  centered: 'centered',
  production_note: 'action',
  shot_note: 'action',
}

const DEFAULT_SCRIPT_DOCUMENT_SETTINGS = {
  page: {
    widthPx: 816,
    heightPx: 1056,
    marginTopPx: 96,
    marginRightPx: 96,
    marginBottomPx: 96,
    marginLeftPx: 144,
  },
  blockStyles: {},
}

function normalizeDocumentSettings(settings = {}) {
  return {
    ...DEFAULT_SCRIPT_DOCUMENT_SETTINGS,
    ...settings,
    page: {
      ...DEFAULT_SCRIPT_DOCUMENT_SETTINGS.page,
      ...(settings.page || {}),
    },
    blockStyles: {
      ...DEFAULT_SCRIPT_DOCUMENT_SETTINGS.blockStyles,
      ...(settings.blockStyles || {}),
    },
  }
}

const TIME_OF_DAY_KEYWORDS = [
  'CONTINUOUS DAY', 'CONTINUOUS NIGHT', 'CONTINUOUS',
  'LATER', 'DAY', 'NIGHT', 'DAWN', 'DUSK',
  'MORNING', 'AFTERNOON', 'EVENING', 'MAGIC HOUR',
]

const TOD_MAP = {
  'CONTINUOUS DAY': 'CONTINUOUS',
  'CONTINUOUS NIGHT': 'CONTINUOUS',
  CONTINUOUS: 'CONTINUOUS',
  LATER: 'LATER',
  DAY: 'DAY',
  NIGHT: 'NIGHT',
  DAWN: 'DAWN',
  DUSK: 'DUSK',
  MORNING: 'DAY',
  AFTERNOON: 'DAY',
  EVENING: 'DUSK',
  'MAGIC HOUR': 'DUSK',
}

function parseSlugline(rawText) {
  let text = String(rawText || '').trim().toUpperCase()
  let sceneNumber = null
  const sceneNumMatch = text.match(/#([^#]+)#/)
  if (sceneNumMatch) {
    sceneNumber = sceneNumMatch[1].trim()
    text = text.replace(/#[^#]+#/g, '').trim()
  }

  let intExt = null
  if (/^INT\.?\/EXT\.?\s/i.test(text) || /^I\/E\.?\s/i.test(text)) {
    intExt = 'INT/EXT'
    text = text.replace(/^(INT\.?\/EXT\.?|I\/E\.?)\s+/i, '')
  } else if (/^INT\.?\s/i.test(text) || /^INTERIOR\s/i.test(text)) {
    intExt = 'INT'
    text = text.replace(/^(INT\.?|INTERIOR)\s+/i, '')
  } else if (/^EXT\.?\s/i.test(text) || /^EXTERIOR\s/i.test(text)) {
    intExt = 'EXT'
    text = text.replace(/^(EXT\.?|EXTERIOR)\s+/i, '')
  }

  let dayNight = null
  let location = text
  const normalizeSlugSegment = segment => (
    String(segment || '')
      .trim()
      .toUpperCase()
      .replace(/^[([{]+/, '')
      .replace(/[)\]}.,:;!?]+$/g, '')
      .trim()
  )
  const dashParts = text.split(' - ').map(part => part.trim()).filter(Boolean)
  if (dashParts.length >= 2) {
    for (let idx = dashParts.length - 1; idx >= 0; idx -= 1) {
      const normalizedPart = normalizeSlugSegment(dashParts[idx])
      let matchedKeyword = null
      for (const kw of TIME_OF_DAY_KEYWORDS) {
        if (normalizedPart === kw || normalizedPart.startsWith(`${kw} `) || normalizedPart.startsWith(`${kw}/`)) {
          matchedKeyword = kw
          break
        }
      }
      if (!matchedKeyword) continue
      dayNight = TOD_MAP[matchedKeyword] || null
      const nextParts = dashParts.filter((_, partIdx) => partIdx !== idx)
      location = nextParts.join(' - ').trim()
      break
    }
  }

  if (!dayNight) {
    const slashMatch = location.match(/\s-\s(DAY|NIGHT|DAWN|DUSK|CONTINUOUS|LATER)\/(DAY|NIGHT|DAWN|DUSK)$/i)
    if (slashMatch) {
      dayNight = slashMatch[1].toUpperCase()
      location = location.replace(/\s-\s(DAY|NIGHT|DAWN|DUSK|CONTINUOUS|LATER)\/(DAY|NIGHT|DAWN|DUSK)$/i, '').trim()
    }
  }

  return { intExt, location, dayNight, sceneNumber }
}

function createBridgeId(prefix = 'id') {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

function extractNodeText(node) {
  if (!node || typeof node !== 'object') return ''
  if (Array.isArray(node.content)) {
    return node.content
      .map((child) => {
        if (!child || typeof child !== 'object') return ''
        if (child.type === 'text') return String(child.text || '')
        return extractNodeText(child)
      })
      .join('')
  }
  return ''
}

function makeTextContent(text) {
  const value = String(text || '')
  if (!value) return []
  return [{ type: 'text', text: value }]
}

function toPmNodeFromElement(scene, element, index) {
  const pmType = LEGACY_TO_PM_NODE_TYPE[element?.type] || 'action'
  const text = String(element?.text || '')
  const elementId = element?.id || createBridgeId('sp')
  return {
    type: pmType,
    attrs: {
      id: `pm_${scene.id || 'scene'}_${elementId}_${index}`,
      sourceSceneId: scene.id || null,
      sourceElementId: elementId,
    },
    content: makeTextContent(text),
  }
}

function deriveScriptSceneFromElements(baseScene = {}, elements = []) {
  const normalizedElements = ensureEditableScreenplayElements(elements)
  const joinedText = normalizedElements.map((element) => String(element.text || '')).join('\n')
  const headingElement = normalizedElements.find((element) => element.type === 'heading' && String(element.text || '').trim())
  const headingText = headingElement ? String(headingElement.text || '').trim().toUpperCase() : ''
  const parsedHeading = headingText ? parseSlugline(headingText) : {}

  const characterNames = []
  const seenCharacters = new Set()
  normalizedElements.forEach((element) => {
    if (element.type !== 'character') return
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
    ...baseScene,
    screenplayElements: normalizedElements,
    screenplayText: joinedText,
    actionText: normalizedElements
      .filter(element => element.type === 'action')
      .map(element => String(element.text || '').trim())
      .filter(Boolean)
      .join('\n'),
    dialogueCount: normalizedElements.filter(element => element.type === 'dialogue').length,
    characters: characterNames,
    slugline: headingText || baseScene.slugline || '',
    customHeader: headingText || baseScene.customHeader || '',
    intExt: parsedHeading.intExt ?? baseScene.intExt ?? null,
    dayNight: parsedHeading.dayNight ?? baseScene.dayNight ?? null,
    location: parsedHeading.location ?? baseScene.location ?? '',
    sceneNumber: baseScene.sceneNumber != null ? String(baseScene.sceneNumber) : '',
  }
}

function sceneMetadataFromLegacy(scene) {
  if (!scene) return null
  return {
    sceneLabel: scene.sceneNumber ? `SCENE ${scene.sceneNumber}` : 'SCENE',
    slugline: scene.slugline || '',
    location: scene.location || '',
    intOrExt: scene.intExt || '',
    dayNight: scene.dayNight || '',
    color: scene.color || null,
  }
}

function chunksFromPmContent(content = []) {
  const chunks = []
  let current = { elements: [], sourceSceneId: null }

  content.forEach((node, index) => {
    const type = PM_TO_LEGACY_BLOCK_TYPE[node?.type] || 'action'
    const text = extractNodeText(node)
    const nextElement = createScreenplayElement(type, text)
    const isHeading = type === 'heading' && String(text || '').trim().length > 0
    if (isHeading && current.elements.length > 0) {
      chunks.push(current)
      current = { elements: [], sourceSceneId: null }
    }

    current.elements.push({
      ...nextElement,
      id: node?.attrs?.sourceElementId || nextElement.id,
      type,
      text,
    })

    if (!current.sourceSceneId) {
      current.sourceSceneId = node?.attrs?.sourceSceneId || null
    }

    if (index === content.length - 1 && current.elements.length > 0) {
      chunks.push(current)
    }
  })

  return chunks.length > 0 ? chunks : [{ elements: ensureEditableScreenplayElements([]), sourceSceneId: null }]
}

export function convertLegacyScriptScenesToProseMirrorDocument(scriptScenes = [], options = {}) {
  const scenes = Array.isArray(scriptScenes) ? scriptScenes : []
  const blockNodes = []

  scenes.forEach((scene) => {
    const sceneElements = ensureEditableScreenplayElements(scene?.screenplayElements)
    sceneElements.forEach((element, index) => {
      blockNodes.push(toPmNodeFromElement(scene || {}, element, index))
    })
  })

  const layout = normalizeDocumentSettings(options?.documentSettings || DEFAULT_SCRIPT_DOCUMENT_SETTINGS)

  return {
    scriptEngine: SCRIPT_ENGINE_PROSEMIRROR,
    scriptDocVersion: SCRIPT_DOC_VERSION,
    scriptDerivationVersion: SCRIPT_DERIVATION_VERSION,
    scriptDocument: {
      type: 'doc',
      content: blockNodes,
    },
    scriptAnnotations: normalizeAnnotationEntities(options?.scriptAnnotations),
    scriptLayout: layout,
  }
}

export function convertProseMirrorDocumentToLegacyCompatibility({
  scriptDocument,
  previousScriptScenes = [],
  scriptSettings = null,
  scriptAnnotations = null,
} = {}) {
  const normalizedDoc = (scriptDocument && scriptDocument.type === 'doc' && Array.isArray(scriptDocument.content))
    ? scriptDocument
    : { type: 'doc', content: [] }

  const chunks = chunksFromPmContent(normalizedDoc.content)
  const byId = new Map((Array.isArray(previousScriptScenes) ? previousScriptScenes : []).map(scene => [scene.id, scene]))

  const rebuilt = chunks.map((chunk, index) => {
    const fallbackBase = Array.isArray(previousScriptScenes) ? previousScriptScenes[index] : null
    const sourceBase = chunk.sourceSceneId ? byId.get(chunk.sourceSceneId) : null
    const baseScene = sourceBase || fallbackBase || {
      id: chunk.sourceSceneId || createBridgeId('sc'),
      sceneNumber: fallbackBase?.sceneNumber != null ? String(fallbackBase.sceneNumber) : '',
      linkedShotIds: fallbackBase?.linkedShotIds || [],
      notes: fallbackBase?.notes || '',
      importSource: fallbackBase?.importSource || 'Script Document',
      color: fallbackBase?.color || null,
    }

    return deriveScriptSceneFromElements(baseScene, chunk.elements)
  })

  const pagination = estimateScreenplayPagination(rebuilt, {
    scenePaginationMode: scriptSettings?.scenePaginationMode || 'natural',
  })

  const scriptScenes = rebuilt.map((scene) => ({
    ...scene,
    sceneNumber: scene.sceneNumber != null ? String(scene.sceneNumber) : '',
    pageCount: pagination.byScene[scene.id]?.pageCount ?? scene.pageCount ?? null,
    pageStart: pagination.byScene[scene.id]?.startPage ?? scene.pageStart ?? null,
    pageEnd: pagination.byScene[scene.id]?.endPage ?? scene.pageEnd ?? null,
  }))

  const sceneMetadataByScriptSceneId = Object.fromEntries(
    scriptScenes.map(scene => [scene.id, sceneMetadataFromLegacy(scene)]),
  )

  const normalizedAnnotations = normalizeAnnotationEntities(scriptAnnotations)
  const breakdownTags = normalizedAnnotations.order
    .map((id) => normalizedAnnotations.byId[id])
    .filter(annotation => annotation?.kind === BREAKDOWN_ANNOTATION_KIND || annotation?.kind === 'breakdown')
    .map((annotation) => ({
      id: annotation.id,
      sceneId: annotation.sceneIdAtCreate || null,
      start: annotation?.anchor?.from ?? null,
      end: annotation?.anchor?.to ?? null,
      text: annotation?.anchor?.quote || '',
      name: annotation.name || annotation.label || '',
      quantity: annotation.quantity || 1,
      category: annotation.category || 'Notes',
      createdAt: annotation.createdAt || new Date().toISOString(),
    }))

  return {
    scriptScenes,
    compatibility: {
      sceneMetadataByScriptSceneId,
      breakdownTags,
    },
  }
}

export function normalizeScriptDocumentState({
  scriptDocument,
  scriptDocVersion,
  scriptDerivationVersion,
  scriptEngine,
  scriptScenes = [],
  scriptSettings = null,
  scriptAnnotations = null,
  storyboardScenes = [],
  scriptLayout,
  preferLegacyScriptScenes = false,
  legacyBreakdownTags = null,
} = {}) {
  const annotationsWithLegacyBreakdown = migrateLegacyBreakdownTagsToAnnotations({
    legacyBreakdownTags: legacyBreakdownTags || scriptSettings?.breakdownTags || [],
    scriptAnnotations,
  })
  const annotationsWithLegacy = migrateLegacyShotLinksToAnnotations({
    storyboardScenes,
    scriptAnnotations: annotationsWithLegacyBreakdown,
  })

  if (preferLegacyScriptScenes && Array.isArray(scriptScenes) && scriptScenes.length > 0) {
    const converted = convertLegacyScriptScenesToProseMirrorDocument(scriptScenes, {
      documentSettings: scriptLayout,
      scriptAnnotations: annotationsWithLegacy,
    })
    const compatibility = convertProseMirrorDocumentToLegacyCompatibility({
      scriptDocument: converted.scriptDocument,
      previousScriptScenes: scriptScenes,
      scriptSettings,
      scriptAnnotations: converted.scriptAnnotations,
    })
    return {
      scriptEngine: SCRIPT_ENGINE_PROSEMIRROR,
      scriptDocVersion: SCRIPT_DOC_VERSION,
      scriptDerivationVersion: SCRIPT_DERIVATION_VERSION,
      scriptDocument: converted.scriptDocument,
      scriptAnnotations: converted.scriptAnnotations,
      scriptLayout: converted.scriptLayout,
      scriptScenes: compatibility.scriptScenes,
      compatibility: compatibility.compatibility,
      migratedFromLegacyScriptScenes: true,
    }
  }

  const hasDoc = !!(scriptDocument && scriptDocument.type === 'doc' && Array.isArray(scriptDocument.content))

  if (!hasDoc) {
    const converted = convertLegacyScriptScenesToProseMirrorDocument(scriptScenes, {
      documentSettings: scriptLayout,
      scriptAnnotations: annotationsWithLegacy,
    })
    const compatibility = convertProseMirrorDocumentToLegacyCompatibility({
      scriptDocument: converted.scriptDocument,
      previousScriptScenes: scriptScenes,
      scriptSettings,
      scriptAnnotations: converted.scriptAnnotations,
    })
    return {
      scriptEngine: SCRIPT_ENGINE_PROSEMIRROR,
      scriptDocVersion: SCRIPT_DOC_VERSION,
      scriptDerivationVersion: SCRIPT_DERIVATION_VERSION,
      scriptDocument: converted.scriptDocument,
      scriptAnnotations: converted.scriptAnnotations,
      scriptLayout: converted.scriptLayout,
      scriptScenes: compatibility.scriptScenes,
      compatibility: compatibility.compatibility,
      migratedFromLegacyScriptScenes: true,
    }
  }

  const compatibility = convertProseMirrorDocumentToLegacyCompatibility({
    scriptDocument,
    previousScriptScenes: scriptScenes,
    scriptSettings,
    scriptAnnotations: annotationsWithLegacy,
  })

  return {
    scriptEngine: scriptEngine || SCRIPT_ENGINE_PROSEMIRROR,
    scriptDocVersion: Number.isFinite(scriptDocVersion) ? scriptDocVersion : SCRIPT_DOC_VERSION,
    scriptDerivationVersion: Number.isFinite(scriptDerivationVersion) ? scriptDerivationVersion : SCRIPT_DERIVATION_VERSION,
    scriptDocument,
    scriptAnnotations: normalizeAnnotationEntities(annotationsWithLegacy),
    scriptLayout: normalizeDocumentSettings(scriptLayout || DEFAULT_SCRIPT_DOCUMENT_SETTINGS),
    scriptScenes: compatibility.scriptScenes,
    compatibility: compatibility.compatibility,
    migratedFromLegacyScriptScenes: false,
  }
}

export function splitLegacySceneByHeadings(screenplayElements = []) {
  return splitScreenplayElementsIntoSceneChunks(screenplayElements)
}
