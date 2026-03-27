import { SCREENPLAY_LAYOUT } from './screenplay'

const ALIGNMENTS = ['left', 'center', 'right', 'justify']

const defaultBlock = {
  marginLeftPx: 0,
  marginRightPx: 0,
  firstLineIndentPx: 0,
  spacingBeforePx: 0,
  spacingAfterPx: 0,
  paddingLeftPx: 0,
  paddingRightPx: 0,
  lineHeightPx: SCREENPLAY_LAYOUT.typography.lineHeightPx,
  align: 'left',
  maxWidthPx: null,
  fontSizePx: SCREENPLAY_LAYOUT.typography.fontSizePx,
  letterSpacingPx: 0,
}

const PAGE_DEFAULTS = {
  widthPx: 816,
  heightPx: 1056,
  marginTopPx: 96,
  marginRightPx: 96,
  marginBottomPx: 96,
  marginLeftPx: 144,
}

function blockFromAbsolute(leftOffsetPx, widthPx, align = 'left') {
  const contentWidthPx = PAGE_DEFAULTS.widthPx - PAGE_DEFAULTS.marginLeftPx - PAGE_DEFAULTS.marginRightPx
  const relativeLeft = Math.max(0, leftOffsetPx - PAGE_DEFAULTS.marginLeftPx)
  const relativeRight = Math.max(0, contentWidthPx - relativeLeft - widthPx)
  return {
    ...defaultBlock,
    marginLeftPx: relativeLeft,
    marginRightPx: relativeRight,
    align,
  }
}

export const DEFAULT_SCRIPT_DOCUMENT_SETTINGS = {
  page: PAGE_DEFAULTS,
  blockStyles: {
    heading: blockFromAbsolute(144, 576, 'left'),
    action: blockFromAbsolute(144, 576, 'left'),
    section: blockFromAbsolute(144, 576, 'center'),
    character: blockFromAbsolute(402, 252, 'left'),
    parenthetical: blockFromAbsolute(326, 236, 'left'),
    dialogue: blockFromAbsolute(278, 356, 'left'),
    transition: blockFromAbsolute(144, 576, 'right'),
    shot: blockFromAbsolute(144, 576, 'left'),
    centered: blockFromAbsolute(144, 576, 'center'),
  },
}

export const SCRIPT_STYLE_TYPE_MAP = {
  heading: 'heading',
  action: 'action',
  section: 'section',
  character: 'character',
  parenthetical: 'parenthetical',
  dialogue: 'dialogue',
  transition: 'transition',
  shot: 'shot',
  centered: 'centered',
}

export function normalizeDocumentSettings(settings = {}) {
  const incomingPage = settings.page || {}
  const incomingStyles = settings.blockStyles || {}
  const blockStyles = Object.fromEntries(
    Object.keys(DEFAULT_SCRIPT_DOCUMENT_SETTINGS.blockStyles).map((key) => {
      const base = DEFAULT_SCRIPT_DOCUMENT_SETTINGS.blockStyles[key]
      const next = { ...base, ...(incomingStyles[key] || {}) }
      if (!ALIGNMENTS.includes(next.align)) next.align = base.align
      return [key, next]
    }),
  )
  return {
    page: {
      ...DEFAULT_SCRIPT_DOCUMENT_SETTINGS.page,
      ...incomingPage,
    },
    blockStyles,
  }
}

export function getBlockStyleForType(documentSettings, blockType) {
  const normalized = normalizeDocumentSettings(documentSettings)
  const mappedType = SCRIPT_STYLE_TYPE_MAP[blockType] || 'action'
  return normalized.blockStyles[mappedType] || normalized.blockStyles.action
}

export function resetBlockStyle(documentSettings, blockType) {
  const normalized = normalizeDocumentSettings(documentSettings)
  const mappedType = SCRIPT_STYLE_TYPE_MAP[blockType] || 'action'
  return {
    ...normalized,
    blockStyles: {
      ...normalized.blockStyles,
      [mappedType]: { ...DEFAULT_SCRIPT_DOCUMENT_SETTINGS.blockStyles[mappedType] },
    },
  }
}
