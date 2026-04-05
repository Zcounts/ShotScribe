import { DEFAULT_SCRIPT_DOCUMENT_SETTINGS, getBlockStyleForType, normalizeDocumentSettings } from '../../utils/scriptDocumentFormatting.js'

const SCREENPLAY_CHAR_WIDTH_RATIO = 0.6
const BLOCK_VERTICAL_PADDING = 2

export function getNodeText(node) {
  if (!node || typeof node !== 'object' || !Array.isArray(node.content)) return ''
  return node.content
    .map((child) => {
      if (!child || typeof child !== 'object') return ''
      if (child.type === 'text') return String(child.text || '')
      return getNodeText(child)
    })
    .join('')
}

function blockTypeForNode(nodeType) {
  if (nodeType === 'scene_heading') return 'heading'
  if (nodeType === 'production_note') return 'action'
  if (nodeType === 'shot_note') return 'action'
  return nodeType || 'action'
}

export function computeCharsPerLine(blockStyle, pageContentWidthPx) {
  const availableWidth = Math.max(1, pageContentWidthPx - blockStyle.marginLeftPx - blockStyle.marginRightPx - blockStyle.paddingLeftPx - blockStyle.paddingRightPx)
  const charWidth = Math.max(1, blockStyle.fontSizePx * SCREENPLAY_CHAR_WIDTH_RATIO)
  return Math.max(1, Math.floor(availableWidth / charWidth))
}

export function wrapLineCount(text, charsPerLine) {
  const lines = String(text || '').split(/\r?\n/)
  return lines.reduce((sum, line) => sum + Math.max(1, Math.ceil(Math.max(1, line.length) / charsPerLine)), 0)
}

export function paginateScriptDocument({
  scriptDocument,
  documentSettings = DEFAULT_SCRIPT_DOCUMENT_SETTINGS,
  scenePaginationMode = 'natural',
} = {}) {
  const normalizedSettings = normalizeDocumentSettings(documentSettings)
  const pageSettings = normalizedSettings.page
  const pageContentWidthPx = Math.max(120, pageSettings.widthPx - pageSettings.marginLeftPx - pageSettings.marginRightPx)
  const pageContentHeightPx = Math.max(120, pageSettings.heightPx - pageSettings.marginTopPx - pageSettings.marginBottomPx)

  const nodes = (scriptDocument && scriptDocument.type === 'doc' && Array.isArray(scriptDocument.content))
    ? scriptDocument.content
    : []

  const blocks = nodes.map((node, nodeIndex) => {
    const blockType = blockTypeForNode(node?.type)
    const blockStyle = getBlockStyleForType(normalizedSettings, blockType)
    const text = getNodeText(node)
    const charsPerLine = computeCharsPerLine(blockStyle, pageContentWidthPx)
    const lineUnits = wrapLineCount(text, charsPerLine)
    const blockHeightPx = (lineUnits * blockStyle.lineHeightPx) + (BLOCK_VERTICAL_PADDING * 2)
    return {
      id: node?.attrs?.id || `pm_block_${nodeIndex}`,
      nodeIndex,
      nodeType: node?.type || 'action',
      blockType,
      text,
      lineUnits,
      blockHeightPx,
      style: blockStyle,
      isSceneStart: blockType === 'heading',
    }
  })

  const pages = []
  let currentPage = { id: 'p_1', number: 1, blocks: [], usedHeightPx: 0 }

  blocks.forEach((block) => {
    const forceSceneBreak = scenePaginationMode === 'newPagePerScene' && block.isSceneStart && currentPage.blocks.length > 0
    if (forceSceneBreak) {
      pages.push(currentPage)
      currentPage = { id: `p_${pages.length + 1}`, number: pages.length + 1, blocks: [], usedHeightPx: 0 }
    }

    if (currentPage.usedHeightPx + block.blockHeightPx > pageContentHeightPx && currentPage.blocks.length) {
      pages.push(currentPage)
      currentPage = { id: `p_${pages.length + 1}`, number: pages.length + 1, blocks: [], usedHeightPx: 0 }
    }

    currentPage.blocks.push(block)
    currentPage.usedHeightPx += block.blockHeightPx
  })

  if (currentPage.blocks.length || pages.length === 0) {
    pages.push(currentPage)
  }

  return {
    pages,
    blocks,
    settings: normalizedSettings,
    pageContentWidthPx,
    pageContentHeightPx,
  }
}
