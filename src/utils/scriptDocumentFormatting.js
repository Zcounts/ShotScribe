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

export const DEFAULT_SCRIPT_DOCUMENT_SETTINGS = {
  page: {
    widthPx: SCREENPLAY_LAYOUT.page.widthPx,
    heightPx: SCREENPLAY_LAYOUT.page.heightPx,
    marginTopPx: SCREENPLAY_LAYOUT.page.marginsPx.top,
    marginRightPx: SCREENPLAY_LAYOUT.page.marginsPx.right,
    marginBottomPx: SCREENPLAY_LAYOUT.page.marginsPx.bottom,
    marginLeftPx: SCREENPLAY_LAYOUT.page.marginsPx.left,
  },
  blockStyles: {
    heading: { ...defaultBlock, align: 'left' },
    action: { ...defaultBlock, align: 'left' },
    section: { ...defaultBlock, align: 'center' },
    character: { ...defaultBlock, marginLeftPx: 258, marginRightPx: 66, align: 'left' },
    parenthetical: { ...defaultBlock, marginLeftPx: 182, marginRightPx: 158, align: 'left' },
    dialogue: { ...defaultBlock, marginLeftPx: 134, marginRightPx: 86, align: 'left' },
    transition: { ...defaultBlock, align: 'right' },
    shot: { ...defaultBlock, align: 'left' },
    centered: { ...defaultBlock, align: 'center' },
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
