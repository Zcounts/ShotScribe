const HEADING_RE = /^(INT\.?|EXT\.?|INT\/EXT\.?|I\/E\.?)/i
const TRANSITION_RE = /^(FADE IN|FADE OUT|CUT TO|DISSOLVE TO|SMASH CUT TO|MATCH CUT(?: FORWARD)? TO|WIPE TO|BACK TO|JUMP CUT TO|INTERCUT)\b/i
let screenplayElementCounter = 0

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
    section: { left: 0, width: 6.0 },
    character: { left: 2.6, width: 2.0 },
    parenthetical: { left: 1.8, width: 2.0 },
    dialogue: { left: 1.0, width: 3.5 },
    transition: { left: 4.5, width: 1.5 },
  },
  spacing: {
    heading: { before: 0, after: 1 },
    action: { before: 0, after: 0 },
    section: { before: 1, after: 1 },
    character: { before: 1, after: 0 },
    parenthetical: { before: 0, after: 0 },
    dialogue: { before: 0, after: 0 },
    transition: { before: 1, after: 1 },
    blank: { before: 0, after: 0 },
    pairAfter: {
      dialogue: { action: 2 },
      parenthetical: { action: 2 },
    },
  },
  pagination: {
    minLinesAfterHeading: 3,
    minDialogueLinesAfterCharacter: 2,
    minDialogueLinesAtPageTop: 2,
    minLinesAfterTransition: 2,
    minLinesAfterSection: 1,
    minActionLinesAfterDialogue: 2,
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

  const previousContentElement = () => {
    for (let idx = elements.length - 1; idx >= 0; idx -= 1) {
      if (elements[idx]?.type !== 'blank') return elements[idx]
    }
    return null
  }

  const isUppercaseHeavy = (value) => {
    const letters = value.match(/[A-Za-z]/g) || []
    if (!letters.length) return false
    const uppercaseLetters = value.match(/[A-Z]/g) || []
    return uppercaseLetters.length / letters.length >= 0.85
  }

  const isParentheticalLine = (value) => /^\([^()]{1,60}\)$/.test(value.trim())

  const isTransitionLine = (value) => {
    const trimmed = value.trim()
    if (!trimmed) return false
    if (TRANSITION_RE.test(trimmed)) return true
    return isUppercaseHeavy(trimmed) && (trimmed.endsWith(' TO') || trimmed.endsWith(' TO:'))
  }

  const isSectionMarkerLine = (value) => {
    const trimmed = value.trim()
    if (!trimmed) return false
    if (/^[-=_*#~]{3,}$/.test(trimmed)) return true
    if (!isUppercaseHeavy(trimmed) || trimmed.length > 50) return false
    return /^(ACT|SEQUENCE|PART|EPISODE|PROLOGUE|EPILOGUE|MONTAGE|END MONTAGE)\b/.test(trimmed)
  }

  const nextNonEmptyLine = (fromIndex) => {
    for (let idx = fromIndex + 1; idx < lines.length; idx += 1) {
      const next = lines[idx].trim()
      if (next) return next
    }
    return ''
  }

  const isLikelyCharacterCue = (value, lineIndex) => {
    const trimmed = value.trim()
    if (!trimmed || trimmed.length > 42) return false
    if (HEADING_RE.test(trimmed) || isTransitionLine(trimmed) || isSectionMarkerLine(trimmed)) return false

    const cueBase = trimmed
      .replace(/:\s*$/, '')
      .replace(/\s*\([^)]*\)\s*$/, '')
      .trim()

    if (!cueBase || cueBase.length < 2) return false
    if (!/^[A-Z][A-Z0-9\s'.-]*$/.test(cueBase)) return false
    if (!isUppercaseHeavy(cueBase)) return false

    const next = nextNonEmptyLine(lineIndex)
    if (!next || HEADING_RE.test(next) || isTransitionLine(next)) return false

    if (trimmed.endsWith(':')) return true
    if (isParentheticalLine(next)) return true
    if (/[a-z]/.test(next) || /[.?!…]$/.test(next)) return true

    const prev = previousContentElement()
    return prev?.type === 'dialogue' || prev?.type === 'parenthetical' || prev?.type === 'character'
  }

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const rawLine = lines[lineIndex]
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

    if (isTransitionLine(trimmed)) {
      expectingDialogue = false
      elements.push({ type: 'transition', text: trimmed.toUpperCase() })
      continue
    }

    if (isSectionMarkerLine(trimmed)) {
      expectingDialogue = false
      elements.push({ type: 'section', text: trimmed.toUpperCase() })
      continue
    }

    if (isLikelyCharacterCue(trimmed, lineIndex)) {
      expectingDialogue = true
      elements.push({ type: 'character', text: trimmed.replace(/:\s*$/, '').toUpperCase() })
      continue
    }

    if (isParentheticalLine(trimmed) && expectingDialogue) {
      elements.push({ type: 'parenthetical', text: trimmed })
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

export const EDITABLE_SCREENPLAY_TYPES = [
  { value: 'heading', label: 'Scene Heading' },
  { value: 'action', label: 'Action' },
  { value: 'character', label: 'Character' },
  { value: 'dialogue', label: 'Dialogue' },
  { value: 'parenthetical', label: 'Parenthetical' },
  { value: 'transition', label: 'Transition' },
]

export const EDITABLE_SCREENPLAY_TYPE_SET = new Set(EDITABLE_SCREENPLAY_TYPES.map(type => type.value))

export function createScreenplayElement(type = 'action', text = '') {
  screenplayElementCounter += 1
  return {
    id: `sp_${Date.now()}_${screenplayElementCounter}`,
    type: EDITABLE_SCREENPLAY_TYPE_SET.has(type) ? type : 'action',
    text: String(text || ''),
  }
}

export function ensureEditableScreenplayElements(elements = []) {
  const normalized = Array.isArray(elements)
    ? elements
        .filter(Boolean)
        .map((element) => {
          const type = EDITABLE_SCREENPLAY_TYPE_SET.has(element?.type) ? element.type : 'action'
          return {
            id: element?.id || createScreenplayElement(type).id,
            type,
            text: String(element?.text || ''),
          }
        })
    : []

  if (normalized.length > 0) return normalized
  return [createScreenplayElement('action', '')]
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
