const HEADING_RE = /^(INT\.?|EXT\.?|INT\/EXT\.?|I\/E\.?)/i

export const SCREENPLAY_FORMAT = {
  pageLines: 55,
  charsPerLine: {
    heading: 63,
    action: 63,
    character: 38,
    dialogue: 35,
    parenthetical: 28,
    transition: 24,
  },
}

export const SCENE_PAGINATION_MODES = {
  CONTINUE: 'natural',
  NEW_PAGE: 'newPagePerScene',
}

function wrapCount(text, maxChars) {
  const value = String(text || '').trim()
  if (!value) return 1
  return value
    .split(/\r?\n/)
    .reduce((sum, segment) => sum + Math.max(1, Math.ceil(segment.length / maxChars)), 0)
}

export function parseScreenplayText(text) {
  const lines = String(text || '').split(/\r?\n/)
  const elements = []
  let expectingDialogue = false

  for (const rawLine of lines) {
    const line = rawLine.replace(/\t/g, '  ')
    const trimmed = line.trim()

    if (!trimmed) {
      expectingDialogue = false
      elements.push({ type: 'blank', text: '' })
      continue
    }

    if (HEADING_RE.test(trimmed) || /^\d+[A-Z]?\s+/.test(trimmed)) {
      expectingDialogue = false
      elements.push({ type: 'heading', text: trimmed.toUpperCase() })
      continue
    }

    if (/^[A-Z0-9 '\-.()]+$/.test(trimmed) && trimmed.length <= 42 && !trimmed.includes(':')) {
      expectingDialogue = true
      elements.push({ type: 'character', text: trimmed.toUpperCase() })
      continue
    }

    if (/^\(.+\)$/.test(trimmed) && expectingDialogue) {
      elements.push({ type: 'parenthetical', text: trimmed })
      continue
    }

    if (trimmed.endsWith('TO:') || (/^[A-Z ]+:$/.test(trimmed) && trimmed.length <= 30)) {
      expectingDialogue = false
      elements.push({ type: 'transition', text: trimmed.toUpperCase() })
      continue
    }

    if (expectingDialogue) {
      elements.push({ type: 'dialogue', text: line.trim() })
    } else {
      elements.push({ type: 'action', text: line.trim() })
    }
  }

  return elements
}

export function getSceneScreenplayElements(scene) {
  if (Array.isArray(scene?.screenplayElements) && scene.screenplayElements.length > 0) {
    return scene.screenplayElements
  }
  return parseScreenplayText(scene?.screenplayText || scene?.actionText || '')
}

export function estimateScreenplayPagination(scenes = [], options = {}) {
  const scenePaginationMode = options.scenePaginationMode || SCENE_PAGINATION_MODES.CONTINUE
  let totalLineUnits = 0
  const byScene = {}

  scenes.forEach(scene => {
    if (scenePaginationMode === SCENE_PAGINATION_MODES.NEW_PAGE && totalLineUnits > 0) {
      const usedOnPage = totalLineUnits % SCREENPLAY_FORMAT.pageLines
      if (usedOnPage > 0) totalLineUnits += (SCREENPLAY_FORMAT.pageLines - usedOnPage)
    }

    const elements = getSceneScreenplayElements(scene)
    const startLineUnits = totalLineUnits

    elements.forEach(el => {
      if (el.type === 'blank') {
        totalLineUnits += 1
        return
      }
      const width = SCREENPLAY_FORMAT.charsPerLine[el.type] || SCREENPLAY_FORMAT.charsPerLine.action
      totalLineUnits += wrapCount(el.text, width)
      totalLineUnits += 0.15
    })

    const sceneUnits = Math.max(1, totalLineUnits - startLineUnits)
    const startPage = Math.max(1, Math.floor(startLineUnits / SCREENPLAY_FORMAT.pageLines) + 1)
    const endPage = Math.max(startPage, Math.ceil(totalLineUnits / SCREENPLAY_FORMAT.pageLines))
    const scenePageCount = Number(((sceneUnits / SCREENPLAY_FORMAT.pageLines)).toFixed(2))

    byScene[scene.id] = {
      sceneId: scene.id,
      startPage,
      endPage,
      pageCount: scenePageCount,
      lineUnits: sceneUnits,
    }
  })

  return {
    totalPages: Math.max(1, Number((totalLineUnits / SCREENPLAY_FORMAT.pageLines).toFixed(2))),
    byScene,
  }
}
