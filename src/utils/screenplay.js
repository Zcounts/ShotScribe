const HEADING_RE = /^(INT\.?|EXT\.?|INT\/EXT\.?|I\/E\.?)/i

const DPI = 96
const INCH = DPI
const TARGET_LINES_PER_PAGE = 54

export const SCREENPLAY_LAYOUT = {
  page: {
    widthPx: 8.5 * INCH,
    heightPx: 11 * INCH,
    marginsPx: {
      top: 1 * INCH,
      right: 1 * INCH,
      bottom: 1.05 * INCH,
      left: 1.5 * INCH,
    },
  },
  typography: {
    fontFamily: '"Courier Prime", "Courier New", Courier, monospace',
    fontSizePx: 16,
    lineHeightPx: ((11 - 1 - 1.05) * INCH) / TARGET_LINES_PER_PAGE,
  },
  elementColumnsIn: {
    heading: { left: 0, width: 6.0 },
    action: { left: 0, width: 6.0 },
    character: { left: 2.6, width: 2.0 },
    parenthetical: { left: 1.8, width: 2.0 },
    dialogue: { left: 1.0, width: 3.5 },
    transition: { left: 4.5, width: 1.5 },
  },
  spacing: {
    heading: { before: 0, after: 1 },
    action: { before: 0, after: 0 },
    character: { before: 1, after: 0 },
    parenthetical: { before: 0, after: 0 },
    dialogue: { before: 0, after: 0 },
    transition: { before: 1, after: 1 },
    blank: { before: 0, after: 0 },
    pairAfter: {
      dialogue: { action: 1 },
      parenthetical: { action: 1 },
    },
  },
  pagination: {
    minLinesAfterHeading: 3,
    minDialogueLinesAfterCharacter: 2,
    minDialogueLinesAtPageTop: 2,
  },
  pageNumber: {
    topPx: 0.5 * INCH,
    rightPx: 1 * INCH,
    fontSizePx: 16,
  },
}

const CONTENT_HEIGHT_PX = SCREENPLAY_LAYOUT.page.heightPx
  - SCREENPLAY_LAYOUT.page.marginsPx.top
  - SCREENPLAY_LAYOUT.page.marginsPx.bottom

const CHAR_WIDTH_PX = SCREENPLAY_LAYOUT.typography.fontSizePx * 0.6

const elementColumnsPx = Object.fromEntries(
  Object.entries(SCREENPLAY_LAYOUT.elementColumnsIn).map(([type, cfg]) => ([
    type,
    {
      leftPx: cfg.left * INCH,
      widthPx: cfg.width * INCH,
    },
  ])),
)

export const SCREENPLAY_FORMAT = {
  pageLines: Math.floor(CONTENT_HEIGHT_PX / SCREENPLAY_LAYOUT.typography.lineHeightPx),
  charsPerLine: Object.fromEntries(
    Object.entries(elementColumnsPx).map(([type, cfg]) => [type, Math.max(1, Math.floor(cfg.widthPx / CHAR_WIDTH_PX))]),
  ),
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

export function getElementPrintLayout(type) {
  return elementColumnsPx[type] || elementColumnsPx.action
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

    elements.forEach((el, idx) => {
      const prevType = idx > 0 ? elements[idx - 1]?.type : null
      const nextType = elements[idx + 1]?.type
      const spacingRule = SCREENPLAY_LAYOUT.spacing[el.type] || SCREENPLAY_LAYOUT.spacing.action
      if (spacingRule.before > 0 && prevType && prevType !== 'blank') totalLineUnits += spacingRule.before

      if (el.type === 'blank') {
        totalLineUnits += 1
        return
      }

      const width = SCREENPLAY_FORMAT.charsPerLine[el.type] || SCREENPLAY_FORMAT.charsPerLine.action
      totalLineUnits += wrapCount(el.text, width)

      if (spacingRule.after > 0) {
        if (nextType && nextType !== 'blank') totalLineUnits += spacingRule.after
      }

      const pairSpacing = SCREENPLAY_LAYOUT.spacing.pairAfter?.[el.type]?.[nextType] ?? 0
      if (pairSpacing > 0) totalLineUnits += pairSpacing
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
