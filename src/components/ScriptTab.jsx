import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import useStore, { getShotLetter } from '../store'
import ImportScriptModal from './ImportScriptModal'
import { naturalSortSceneNumber } from '../utils/sceneSort'
import {
  createScreenplayElement,
  EDITABLE_SCREENPLAY_TYPES,
  ensureEditableScreenplayElements,
  getSceneScreenplayElements,
  SCENE_PAGINATION_MODES,
} from '../utils/screenplay'
import {
  DEFAULT_SCRIPT_DOCUMENT_SETTINGS,
  getBlockStyleForType,
  normalizeDocumentSettings,
} from '../utils/scriptDocumentFormatting'

const VIEW_OPTIONS = [
  { id: 'write', label: 'Write' },
  { id: 'breakdown', label: 'Breakdown' },
  { id: 'visualize', label: 'Visualize' },
]

const BREAKDOWN_CATEGORIES = [
  'Cast',
  'Props',
  'Costumes/Wardrobe',
  'Makeup',
  'Vehicles',
  'Music',
  'Locations',
  'Notes',
]

const PX_PER_INCH = 96
const PAGE_GAP_PX = 24
const SCREENPLAY_CHAR_WIDTH_RATIO = 0.6
const RULER_HEIGHT_PX = 34
const BLOCK_VERTICAL_PADDING = 2

const PANEL_HEADER_HEIGHT = 36
const SPLITTER_HEIGHT = 10
const DEFAULT_SCENE_PANEL_HEIGHT = 320
const MIN_SCENE_PANEL_HEIGHT = 140
const MIN_VIEW_PANEL_HEIGHT = 120

const SIDEBAR_STORAGE_KEYS = {
  sceneHeight: 'shotscribe:scriptTab:scenePanelHeight',
  sceneCollapsed: 'shotscribe:scriptTab:scenePanelCollapsed',
  viewCollapsed: 'shotscribe:scriptTab:viewPanelCollapsed',
}

function inchesToPx(value) {
  return Math.round((Number(value) || 0) * PX_PER_INCH)
}

function pxToInches(value) {
  return Number((Number(value || 0) / PX_PER_INCH).toFixed(2))
}

function sceneHeader(scene) {
  return scene.slugline || scene.location || `Scene ${scene.sceneNumber || ''}`.trim()
}

function readStoredNumber(key, fallback) {
  if (typeof window === 'undefined') return fallback
  const raw = window.localStorage.getItem(key)
  if (raw == null) return fallback
  const parsed = Number(raw)
  return Number.isFinite(parsed) ? parsed : fallback
}

function readStoredBoolean(key, fallback) {
  if (typeof window === 'undefined') return fallback
  const raw = window.localStorage.getItem(key)
  if (raw == null) return fallback
  return raw === 'true'
}

function InlineInchField({ label, valuePx, onChangePx, min = 0, max = null }) {
  return (
    <label style={{ display: 'grid', gridTemplateColumns: '1fr 74px', gap: 8, alignItems: 'center', marginBottom: 8, fontSize: 12 }}>
      <span>{label}</span>
      <input
        type="number"
        step="0.05"
        min={min != null ? pxToInches(min) : undefined}
        max={max != null ? pxToInches(max) : undefined}
        value={pxToInches(valuePx)}
        onChange={(event) => onChangePx(inchesToPx(event.target.value))}
        style={{ width: '100%', border: '1px solid rgba(100,116,139,0.35)', borderRadius: 5, padding: '4px 6px', fontSize: 12 }}
      />
    </label>
  )
}

function computeCharsPerLine(blockStyle, pageContentWidthPx) {
  const availableWidth = Math.max(1, pageContentWidthPx - blockStyle.marginLeftPx - blockStyle.marginRightPx - blockStyle.paddingLeftPx - blockStyle.paddingRightPx)
  const charWidth = Math.max(1, blockStyle.fontSizePx * SCREENPLAY_CHAR_WIDTH_RATIO)
  return Math.max(1, Math.floor(availableWidth / charWidth))
}

function wrapLineCount(text, charsPerLine) {
  const lines = String(text || '').split(/\r?\n/)
  return lines.reduce((sum, line) => sum + Math.max(1, Math.ceil(Math.max(1, line.length) / charsPerLine)), 0)
}

function normalizeTextForStore(value, type) {
  const next = String(value || '').replace(/\r/g, '')
  if (type === 'heading' || type === 'character' || type === 'transition') {
    return next.toUpperCase()
  }
  return next
}

function classifyLinkType(view, link) {
  if (view === 'breakdown') return 'breakdown'
  if (link.type === 'breakdown') return 'breakdown'
  return 'visualize'
}

function getSelectionOffsetsFromBlock(blockElement) {
  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0) return null
  const range = selection.getRangeAt(0)
  if (!blockElement.contains(range.startContainer) || !blockElement.contains(range.endContainer)) return null

  const preStart = range.cloneRange()
  preStart.selectNodeContents(blockElement)
  preStart.setEnd(range.startContainer, range.startOffset)
  const start = preStart.toString().length

  const preEnd = range.cloneRange()
  preEnd.selectNodeContents(blockElement)
  preEnd.setEnd(range.endContainer, range.endOffset)
  const end = preEnd.toString().length

  if (end <= start) return null
  return { start, end, text: range.toString(), rect: range.getBoundingClientRect() }
}

function getOffsetFromPoint(blockElement, clientX, clientY) {
  let node = null
  let offset = 0

  if (document.caretPositionFromPoint) {
    const caret = document.caretPositionFromPoint(clientX, clientY)
    node = caret?.offsetNode || null
    offset = caret?.offset || 0
  } else if (document.caretRangeFromPoint) {
    const range = document.caretRangeFromPoint(clientX, clientY)
    node = range?.startContainer || null
    offset = range?.startOffset || 0
  }

  if (!node || !blockElement.contains(node)) return null
  const range = document.createRange()
  range.selectNodeContents(blockElement)
  range.setEnd(node, offset)
  return range.toString().length
}

function createRangeForOffsets(blockElement, start, end) {
  const walker = document.createTreeWalker(blockElement, NodeFilter.SHOW_TEXT)
  let currentOffset = 0
  let startNode = null
  let startOffset = 0
  let endNode = null
  let endOffset = 0

  while (walker.nextNode()) {
    const textNode = walker.currentNode
    const len = textNode.textContent?.length || 0
    const nodeStart = currentOffset
    const nodeEnd = currentOffset + len

    if (!startNode && start >= nodeStart && start <= nodeEnd) {
      startNode = textNode
      startOffset = start - nodeStart
    }
    if (!endNode && end >= nodeStart && end <= nodeEnd) {
      endNode = textNode
      endOffset = end - nodeStart
    }

    currentOffset = nodeEnd
    if (startNode && endNode) break
  }

  if (!startNode || !endNode) return null
  const range = document.createRange()
  range.setStart(startNode, startOffset)
  range.setEnd(endNode, endOffset)
  return range
}

function ScriptEditableBlock({ block, blockStyle, isSelected, onFocusBlock, onCommit, onKeyDown, onRegisterHeading }) {
  const ref = useRef(null)
  const [draftText, setDraftText] = useState(block.blockText || '')
  const composingRef = useRef(false)

  useEffect(() => {
    if (!ref.current) return
    if (document.activeElement === ref.current || composingRef.current) return
    const nextText = block.blockText || ''
    if (ref.current.textContent !== nextText) {
      ref.current.textContent = nextText
    }
    setDraftText(nextText)
  }, [block.blockText])



  useEffect(() => {
    if (!onRegisterHeading) return
    onRegisterHeading(ref.current)
    return () => onRegisterHeading(null)
  }, [onRegisterHeading])

  const sharedStyle = {
    marginLeft: `${blockStyle.marginLeftPx}px`,
    marginRight: `${blockStyle.marginRightPx}px`,
    paddingTop: `${BLOCK_VERTICAL_PADDING}px`,
    paddingBottom: `${BLOCK_VERTICAL_PADDING}px`,
    minHeight: `${blockStyle.lineHeightPx}px`,
    fontFamily: '"Courier Prime", "Courier New", Courier, monospace',
    fontSize: `${blockStyle.fontSizePx}px`,
    lineHeight: `${blockStyle.lineHeightPx}px`,
    textAlign: blockStyle.align || 'left',
    letterSpacing: `${blockStyle.letterSpacingPx}px`,
    whiteSpace: 'pre-wrap',
    textTransform: ['heading', 'character', 'transition'].includes(block.blockType) ? 'uppercase' : 'none',
    borderRadius: 4,
    border: isSelected ? '1px solid rgba(37,99,235,0.45)' : '1px solid transparent',
    background: isSelected ? 'rgba(37,99,235,0.04)' : 'transparent',
    outline: 'none',
  }

  return (
    <div
      ref={ref}
      data-scene-id={block.sceneId}
      data-block-id={block.blockId}
      data-scene-heading={block.isHeading ? 'true' : undefined}
      contentEditable
      suppressContentEditableWarning
      spellCheck
      onFocus={onFocusBlock}
      onCompositionStart={() => {
        composingRef.current = true
      }}
      onCompositionEnd={(event) => {
        composingRef.current = false
        const value = event.currentTarget.textContent || ''
        setDraftText(value)
      }}
      onInput={(event) => {
        setDraftText(event.currentTarget.textContent || '')
      }}
      onBlur={() => {
        onCommit(draftText)
      }}
      onKeyDown={onKeyDown}
      style={sharedStyle}
    />
  )
}

export default function ScriptTab() {
  const scriptScenes = useStore(s => s.scriptScenes)
  const storyboardScenes = useStore(s => s.scenes)
  const scriptSettings = useStore(s => s.scriptSettings)
  const setScriptSettings = useStore(s => s.setScriptSettings)
  const updateScriptSceneScreenplay = useStore(s => s.updateScriptSceneScreenplay)
  const importScriptScenes = useStore(s => s.importScriptScenes)
  const openShotDialog = useStore(s => s.openShotDialog)
  const linkShotToScene = useStore(s => s.linkShotToScene)

  const [view, setView] = useState('write')
  const [activeSceneId, setActiveSceneId] = useState(null)
  const [selectedBlock, setSelectedBlock] = useState(null)
  const [activePanel, setActivePanel] = useState('page')
  const [showImportModal, setShowImportModal] = useState(false)

  const [isViewPanelCollapsed, setIsViewPanelCollapsed] = useState(() => readStoredBoolean(SIDEBAR_STORAGE_KEYS.viewCollapsed, false))
  const [isScenePanelCollapsed, setIsScenePanelCollapsed] = useState(() => readStoredBoolean(SIDEBAR_STORAGE_KEYS.sceneCollapsed, false))
  const [scenePanelHeight, setScenePanelHeight] = useState(() => readStoredNumber(SIDEBAR_STORAGE_KEYS.sceneHeight, DEFAULT_SCENE_PANEL_HEIGHT))

  const [selectionDraft, setSelectionDraft] = useState(null)
  const [breakdownDraft, setBreakdownDraft] = useState({ name: '', quantity: 1, category: BREAKDOWN_CATEGORIES[1], tagAllMentions: false })
  const [overlayRects, setOverlayRects] = useState([])

  const documentScrollerRef = useRef(null)
  const pageCanvasRef = useRef(null)
  const sidebarStackRef = useRef(null)
  const sceneHeadingRefs = useRef({})

  const orderedScenes = useMemo(() => [...scriptScenes].sort(naturalSortSceneNumber), [scriptScenes])
  const documentSettings = useMemo(
    () => normalizeDocumentSettings(scriptSettings?.documentSettings || DEFAULT_SCRIPT_DOCUMENT_SETTINGS),
    [scriptSettings?.documentSettings],
  )

  useEffect(() => {
    if (!activeSceneId && orderedScenes.length) {
      setActiveSceneId(orderedScenes[0].id)
    }
  }, [activeSceneId, orderedScenes])

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(SIDEBAR_STORAGE_KEYS.sceneHeight, String(scenePanelHeight))
  }, [scenePanelHeight])

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(SIDEBAR_STORAGE_KEYS.sceneCollapsed, String(isScenePanelCollapsed))
  }, [isScenePanelCollapsed])

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(SIDEBAR_STORAGE_KEYS.viewCollapsed, String(isViewPanelCollapsed))
  }, [isViewPanelCollapsed])

  useEffect(() => {
    setSelectionDraft(null)
    if (view !== 'write') {
      setSelectedBlock(null)
      setActivePanel(null)
      return
    }
    if (!activePanel) {
      setActivePanel('page')
    }
  }, [view])

  const pageSettings = documentSettings.page
  const pageContentWidthPx = Math.max(120, pageSettings.widthPx - pageSettings.marginLeftPx - pageSettings.marginRightPx)
  const pageContentHeightPx = Math.max(120, pageSettings.heightPx - pageSettings.marginTopPx - pageSettings.marginBottomPx)

  const screenplayByScene = useMemo(() => {
    const mapped = {}
    orderedScenes.forEach(scene => {
      mapped[scene.id] = ensureEditableScreenplayElements(getSceneScreenplayElements(scene))
    })
    return mapped
  }, [orderedScenes])

  const breakdownTags = Array.isArray(scriptSettings?.breakdownTags) ? scriptSettings.breakdownTags : []

  const shotLinksByScene = useMemo(() => {
    const result = {}
    storyboardScenes.forEach((storyScene, sceneIndex) => {
      ;(storyScene.shots || []).forEach((shot, shotIndex) => {
        if (!shot.linkedSceneId) return
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
          label: shot.displayId || `${sceneIndex + 1}${getShotLetter(shotIndex)}`,
          type: 'visualize',
        })
      })
    })

    Object.keys(result).forEach(sceneId => {
      result[sceneId] = result[sceneId].sort((a, b) => a.start - b.start)
    })

    return result
  }, [storyboardScenes])

  const breakdownByScene = useMemo(() => {
    const result = {}
    breakdownTags.forEach(tag => {
      if (!tag.sceneId || !Number.isFinite(tag.start) || !Number.isFinite(tag.end) || tag.end <= tag.start) return
      if (!result[tag.sceneId]) result[tag.sceneId] = []
      result[tag.sceneId].push({ ...tag, type: 'breakdown' })
    })
    Object.keys(result).forEach(sceneId => {
      result[sceneId] = result[sceneId].sort((a, b) => a.start - b.start)
    })
    return result
  }, [breakdownTags])

  const documentModel = useMemo(() => {
    const rowsPerPage = Math.max(1, Math.floor(pageContentHeightPx / documentSettings.blockStyles.action.lineHeightPx))
    const blocks = []

    orderedScenes.forEach(scene => {
      let sceneOffset = 0
      const sceneBlocks = screenplayByScene[scene.id] || []

      sceneBlocks.forEach((block, blockIndex) => {
        const blockStyle = getBlockStyleForType(documentSettings, block.type)
        const charsPerLine = computeCharsPerLine(blockStyle, pageContentWidthPx)
        const lineUnits = wrapLineCount(block.text, charsPerLine)
        blocks.push({
          sceneId: scene.id,
          blockId: block.id,
          blockType: block.type,
          blockText: block.text,
          blockIndex,
          sceneCharStart: sceneOffset,
          sceneCharEnd: sceneOffset + String(block.text || '').length,
          lineUnits,
          lineHeightPx: blockStyle.lineHeightPx,
          isSceneStart: blockIndex === 0,
          isHeading: block.type === 'heading' || blockIndex === 0,
        })
        sceneOffset += String(block.text || '').length + 1
      })
    })

    const pages = []
    let currentPage = { id: 'p_1', number: 1, blocks: [], usedLineUnits: 0 }

    blocks.forEach(block => {
      if (
        scriptSettings.scenePaginationMode === SCENE_PAGINATION_MODES.NEW_PAGE
        && block.isSceneStart
        && currentPage.blocks.length
      ) {
        pages.push(currentPage)
        currentPage = { id: `p_${pages.length + 1}`, number: pages.length + 1, blocks: [], usedLineUnits: 0 }
      }

      if (currentPage.usedLineUnits + block.lineUnits > rowsPerPage && currentPage.blocks.length) {
        pages.push(currentPage)
        currentPage = { id: `p_${pages.length + 1}`, number: pages.length + 1, blocks: [], usedLineUnits: 0 }
      }

      currentPage.blocks.push(block)
      currentPage.usedLineUnits += block.lineUnits
    })

    if (currentPage.blocks.length || pages.length === 0) pages.push(currentPage)

    return {
      rowsPerPage,
      pages,
      blocks,
    }
  }, [documentSettings, orderedScenes, pageContentHeightPx, pageContentWidthPx, screenplayByScene, scriptSettings.scenePaginationMode])

  const breakdownCountByCategory = useMemo(() => {
    const counts = {}
    BREAKDOWN_CATEGORIES.forEach(category => {
      counts[category] = 0
    })
    breakdownTags.forEach(tag => {
      const category = tag.category || 'Notes'
      counts[category] = (counts[category] || 0) + 1
    })
    return counts
  }, [breakdownTags])

  const currentSceneShots = useMemo(() => {
    if (!activeSceneId) return []
    const rows = []
    storyboardScenes.forEach((storyScene, storySceneIndex) => {
      ;(storyScene.shots || []).forEach((shot, shotIdx) => {
        if (shot.linkedSceneId !== activeSceneId && storyScene.linkedScriptSceneId !== activeSceneId) return
        rows.push({
          id: shot.id,
          label: shot.displayId || `${storySceneIndex + 1}${getShotLetter(shotIdx)}`,
          description: shot.description || shot.subject || 'Untitled shot',
          color: shot.color || '#e11d48',
          linkedSceneId: shot.linkedSceneId,
          linkedScriptRangeStart: shot.linkedScriptRangeStart,
          linkedScriptRangeEnd: shot.linkedScriptRangeEnd,
        })
      })
    })
    return rows
  }, [activeSceneId, storyboardScenes])

  const selectedScene = orderedScenes.find(scene => scene.id === selectedBlock?.sceneId)
  const selectedBlockData = selectedScene
    ? (screenplayByScene[selectedScene.id] || []).find(block => block.id === selectedBlock?.blockId)
    : null
  const selectedStyleType = selectedBlockData?.type || 'action'
  const selectedStyle = getBlockStyleForType(documentSettings, selectedStyleType)

  const updateDocumentSettings = useCallback((updater) => {
    const current = normalizeDocumentSettings(scriptSettings?.documentSettings || DEFAULT_SCRIPT_DOCUMENT_SETTINGS)
    const nextValue = typeof updater === 'function' ? updater(current) : updater
    setScriptSettings({ documentSettings: normalizeDocumentSettings(nextValue) })
  }, [scriptSettings?.documentSettings, setScriptSettings])

  const updateSceneBlocks = useCallback((sceneId, updater) => {
    const scene = orderedScenes.find(entry => entry.id === sceneId)
    if (!scene) return
    const current = ensureEditableScreenplayElements(getSceneScreenplayElements(scene))
    const next = typeof updater === 'function' ? updater(current) : updater
    updateScriptSceneScreenplay(sceneId, ensureEditableScreenplayElements(next))
  }, [orderedScenes, updateScriptSceneScreenplay])

  const cycleType = useCallback((sceneId, blockId, direction) => {
    const order = EDITABLE_SCREENPLAY_TYPES.map(option => option.value)
    updateSceneBlocks(sceneId, blocks => {
      const index = blocks.findIndex(block => block.id === blockId)
      if (index === -1) return blocks
      const currentIdx = Math.max(0, order.indexOf(blocks[index].type))
      const nextIdx = (currentIdx + direction + order.length) % order.length
      const updated = [...blocks]
      updated[index] = { ...updated[index], type: order[nextIdx] }
      return updated
    })
  }, [updateSceneBlocks])

  const nextTypeForEnter = useCallback((type) => {
    if (type === 'character' || type === 'parenthetical') return 'dialogue'
    if (type === 'dialogue') return 'action'
    return type
  }, [])

  const insertBlockAfter = useCallback((sceneId, blockId, type) => {
    const newBlock = createScreenplayElement(type, '')
    updateSceneBlocks(sceneId, blocks => {
      const index = blocks.findIndex(block => block.id === blockId)
      if (index === -1) return blocks
      const updated = [...blocks]
      updated.splice(index + 1, 0, newBlock)
      return updated
    })
    setSelectedBlock({ sceneId, blockId: newBlock.id })
  }, [updateSceneBlocks])

  const mergeWithPrevious = useCallback((sceneId, blockId) => {
    updateSceneBlocks(sceneId, blocks => {
      const index = blocks.findIndex(block => block.id === blockId)
      if (index <= 0) return blocks
      const updated = [...blocks]
      const previous = updated[index - 1]
      const current = updated[index]
      updated[index - 1] = { ...previous, text: `${previous.text || ''}${current.text || ''}` }
      updated.splice(index, 1)
      setSelectedBlock({ sceneId, blockId: previous.id })
      return updated
    })
  }, [updateSceneBlocks])

  const updateBlockText = useCallback((sceneId, blockId, type, text) => {
    const normalizedText = normalizeTextForStore(text, type)
    updateSceneBlocks(sceneId, blocks => blocks.map(block => (block.id === blockId ? { ...block, text: normalizedText } : block)))
  }, [updateSceneBlocks])

  const saveBreakdownTags = useCallback((next) => {
    setScriptSettings({ breakdownTags: next })
  }, [setScriptSettings])

  const handleCreateBreakdownTag = useCallback(() => {
    if (!selectionDraft || view !== 'breakdown') return
    const cleanedName = String(breakdownDraft.name || '').trim() || selectionDraft.text
    const quantity = Math.max(1, Number(breakdownDraft.quantity) || 1)
    const category = breakdownDraft.category || 'Props'

    const nextTag = {
      id: `bd_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      sceneId: selectionDraft.sceneId,
      start: selectionDraft.start,
      end: selectionDraft.end,
      text: selectionDraft.text,
      name: cleanedName,
      quantity,
      category,
      createdAt: new Date().toISOString(),
    }

    let next = [...breakdownTags, nextTag]
    if (breakdownDraft.tagAllMentions && cleanedName) {
      const needle = cleanedName.toLowerCase()
      const sceneText = (screenplayByScene[selectionDraft.sceneId] || []).map(block => block.text || '').join('\n').toLowerCase()
      let idx = sceneText.indexOf(needle)
      while (idx !== -1) {
        const matchEnd = idx + cleanedName.length
        const has = next.some(tag => tag.sceneId === selectionDraft.sceneId && tag.start === idx && tag.end === matchEnd)
        if (!has) {
          next.push({ ...nextTag, id: `bd_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`, start: idx, end: matchEnd, text: cleanedName })
        }
        idx = sceneText.indexOf(needle, idx + needle.length)
      }
    }

    saveBreakdownTags(next)
    setSelectionDraft(null)
  }, [breakdownDraft, breakdownTags, saveBreakdownTags, screenplayByScene, selectionDraft, view])

  const deleteBreakdownTag = useCallback((tagId) => {
    if (!tagId) return
    saveBreakdownTags(breakdownTags.filter(tag => tag.id !== tagId))
  }, [breakdownTags, saveBreakdownTags])

  const createManualScript = useCallback(() => {
    const now = Date.now()
    importScriptScenes([
      {
        id: `sc_manual_${now}`,
        sceneNumber: '1',
        slugline: 'INT. WRITER ROOM - DAY',
        intExt: 'INT',
        dayNight: 'DAY',
        location: 'WRITER ROOM',
        customHeader: 'INT. WRITER ROOM - DAY',
        characters: [],
        actionText: '',
        screenplayText: 'INT. WRITER ROOM - DAY',
        screenplayElements: [createScreenplayElement('heading', 'INT. WRITER ROOM - DAY'), createScreenplayElement('action', '')],
        dialogueCount: 0,
        pageCount: null,
        confidence: 'medium',
        linkedShotIds: [],
        notes: '',
        importSource: 'Manual',
      },
    ], {
      id: `manual_${now}`,
      filename: 'Manual Script',
    }, 'merge')
  }, [importScriptScenes])

  const handleBlockKeyDown = useCallback((event, block) => {
    if (view !== 'write') return
    const element = event.currentTarget

    if (event.key === 'Tab') {
      event.preventDefault()
      cycleType(block.sceneId, block.blockId, event.shiftKey ? -1 : 1)
      return
    }

    if (event.key === 'Enter') {
      event.preventDefault()
      insertBlockAfter(block.sceneId, block.blockId, nextTypeForEnter(block.blockType))
      return
    }

    if (event.key === 'Backspace') {
      const selection = window.getSelection()
      const atStart = selection && selection.rangeCount > 0 && selection.anchorOffset === 0 && selection.focusOffset === 0
      const empty = String(element.textContent || '').length === 0
      if (atStart && empty) {
        event.preventDefault()
        mergeWithPrevious(block.sceneId, block.blockId)
      }
    }
  }, [cycleType, insertBlockAfter, mergeWithPrevious, nextTypeForEnter, view])

  const resolveStackHeights = useCallback(() => {
    const stackHeight = sidebarStackRef.current?.clientHeight || 0
    const available = Math.max(0, stackHeight - SPLITTER_HEIGHT)
    if (available === 0) {
      return { viewHeight: 0, sceneHeight: 0 }
    }

    const collapsedViewHeight = PANEL_HEADER_HEIGHT
    const collapsedSceneHeight = PANEL_HEADER_HEIGHT

    if (isViewPanelCollapsed && isScenePanelCollapsed) {
      return { viewHeight: collapsedViewHeight, sceneHeight: Math.max(collapsedSceneHeight, available - collapsedViewHeight) }
    }

    if (isViewPanelCollapsed) {
      return { viewHeight: collapsedViewHeight, sceneHeight: Math.max(collapsedSceneHeight, available - collapsedViewHeight) }
    }

    if (isScenePanelCollapsed) {
      return { sceneHeight: collapsedSceneHeight, viewHeight: Math.max(MIN_VIEW_PANEL_HEIGHT, available - collapsedSceneHeight) }
    }

    const maxScene = Math.max(MIN_SCENE_PANEL_HEIGHT, available - MIN_VIEW_PANEL_HEIGHT)
    const clampedSceneHeight = Math.max(MIN_SCENE_PANEL_HEIGHT, Math.min(maxScene, scenePanelHeight))
    return {
      sceneHeight: clampedSceneHeight,
      viewHeight: available - clampedSceneHeight,
    }
  }, [isScenePanelCollapsed, isViewPanelCollapsed, scenePanelHeight])

  const startScenePanelResize = useCallback((event) => {
    if (isScenePanelCollapsed || isViewPanelCollapsed) return
    event.preventDefault()

    const stackHeight = sidebarStackRef.current?.clientHeight || 0
    const available = Math.max(0, stackHeight - SPLITTER_HEIGHT)
    const maxScene = Math.max(MIN_SCENE_PANEL_HEIGHT, available - MIN_VIEW_PANEL_HEIGHT)
    const startY = event.clientY
    const startHeight = scenePanelHeight

    const onMove = (moveEvent) => {
      const delta = startY - moveEvent.clientY
      const next = Math.max(MIN_SCENE_PANEL_HEIGHT, Math.min(maxScene, startHeight + delta))
      setScenePanelHeight(next)
    }

    const onUp = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [isScenePanelCollapsed, isViewPanelCollapsed, scenePanelHeight])

  const jumpToScene = useCallback((sceneId) => {
    setActiveSceneId(sceneId)
    const target = sceneHeadingRefs.current[sceneId]
    const container = documentScrollerRef.current
    if (!target || !container) return
    const targetTop = target.getBoundingClientRect().top - container.getBoundingClientRect().top + container.scrollTop - 12
    container.scrollTo({ top: Math.max(0, targetTop), behavior: 'smooth' })
  }, [])

  const handlePageMouseUp = useCallback((event) => {
    if (view === 'write') return
    const blockElement = event.target.closest('[data-scene-id][data-block-id]')
    if (!blockElement) {
      setSelectionDraft(null)
      return
    }

    const local = getSelectionOffsetsFromBlock(blockElement)
    if (!local) {
      setSelectionDraft(null)
      return
    }

    const sceneId = blockElement.getAttribute('data-scene-id')
    const blockId = blockElement.getAttribute('data-block-id')
    const block = documentModel.blocks.find(entry => entry.sceneId === sceneId && entry.blockId === blockId)
    if (!block) return

    const sceneStart = block.sceneCharStart + local.start
    const sceneEnd = block.sceneCharStart + local.end
    if (sceneEnd <= sceneStart) return

    setActiveSceneId(sceneId)
    setSelectionDraft({
      sceneId,
      start: sceneStart,
      end: sceneEnd,
      text: local.text,
      top: local.rect.top + window.scrollY + 8,
      left: local.rect.left + window.scrollX,
    })

    if (view === 'breakdown') {
      setBreakdownDraft(prev => ({ ...prev, name: local.text }))
    }
  }, [documentModel.blocks, view])

  const handleReadBlockDoubleClick = useCallback((event, block) => {
    if (view !== 'visualize') return
    const blockElement = event.currentTarget
    const localOffset = getOffsetFromPoint(blockElement, event.clientX, event.clientY)
    if (localOffset == null) return
    const absoluteOffset = block.sceneCharStart + localOffset
    const link = (shotLinksByScene[block.sceneId] || []).find(item => absoluteOffset >= item.start && absoluteOffset <= item.end)
    if (!link?.shotId) return
    openShotDialog(link.shotId)
  }, [openShotDialog, shotLinksByScene, view])

  const handleReadBlockContextMenu = useCallback((event, block) => {
    if (view !== 'breakdown') return
    const blockElement = event.currentTarget
    const localOffset = getOffsetFromPoint(blockElement, event.clientX, event.clientY)
    if (localOffset == null) return
    const absoluteOffset = block.sceneCharStart + localOffset
    const link = (breakdownByScene[block.sceneId] || []).find(item => absoluteOffset >= item.start && absoluteOffset <= item.end)
    if (!link?.id) return
    event.preventDefault()
    deleteBreakdownTag(link.id)
  }, [breakdownByScene, deleteBreakdownTag, view])

  const handleLinkSelectionToShot = useCallback((shotId) => {
    if (!selectionDraft || !shotId || view !== 'visualize') return
    linkShotToScene(shotId, selectionDraft.sceneId, {
      linkedScriptRangeStart: selectionDraft.start,
      linkedScriptRangeEnd: selectionDraft.end,
    })
    setSelectionDraft(null)
  }, [linkShotToScene, selectionDraft, view])

  useEffect(() => {
    if (view === 'write') {
      setOverlayRects([])
      return
    }

    const container = pageCanvasRef.current
    const scroller = documentScrollerRef.current
    if (!container || !scroller) return

    const computeOverlays = () => {
      const containerRect = container.getBoundingClientRect()
      const linksByScene = view === 'breakdown' ? breakdownByScene : shotLinksByScene
      const nextRects = []

      documentModel.blocks.forEach((block) => {
        const blockElement = container.querySelector(`[data-scene-id="${block.sceneId}"][data-block-id="${block.blockId}"]`)
        if (!blockElement) return
        const blockLinks = (linksByScene[block.sceneId] || []).filter(link => link.end > block.sceneCharStart && link.start < block.sceneCharEnd)
        if (!blockLinks.length) return

        blockLinks.forEach((link) => {
          const localStart = Math.max(0, link.start - block.sceneCharStart)
          const localEnd = Math.min(String(block.blockText || '').length, link.end - block.sceneCharStart)
          if (localEnd <= localStart) return
          const range = createRangeForOffsets(blockElement, localStart, localEnd)
          if (!range) return

          Array.from(range.getClientRects()).forEach((rect, index) => {
            if (rect.width === 0 || rect.height === 0) return
            nextRects.push({
              id: `${link.id}_${index}_${rect.top}_${rect.left}`,
              type: classifyLinkType(view, link),
              top: rect.top - containerRect.top + scroller.scrollTop,
              left: rect.left - containerRect.left + scroller.scrollLeft,
              width: rect.width,
              height: rect.height,
              color: link.color || '#f59e0b',
            })
          })
        })
      })

      setOverlayRects(nextRects)
    }

    computeOverlays()
    scroller.addEventListener('scroll', computeOverlays)
    window.addEventListener('resize', computeOverlays)
    return () => {
      scroller.removeEventListener('scroll', computeOverlays)
      window.removeEventListener('resize', computeOverlays)
    }
  }, [breakdownByScene, documentModel.blocks, shotLinksByScene, view])

  if (orderedScenes.length === 0) {
    return (
      <>
        <div style={{ height: '100%', display: 'grid', placeItems: 'center' }}>
          <div className="app-surface-card" style={{ width: 420, padding: 20, textAlign: 'center' }}>
            <h2 style={{ marginTop: 0, fontSize: 22 }}>Start your script</h2>
            <p style={{ color: '#475569', marginBottom: 16 }}>The Script tab is document-first. Write directly on paginated pages.</p>
            <div style={{ display: 'flex', justifyContent: 'center', gap: 10 }}>
              <button className="toolbar-btn" onClick={() => setShowImportModal(true)}>Upload Script</button>
              <button className="toolbar-btn" onClick={createManualScript}>Write Script</button>
            </div>
          </div>
        </div>
        {showImportModal && <ImportScriptModal onClose={() => setShowImportModal(false)} />}
      </>
    )
  }

  const { viewHeight, sceneHeight } = resolveStackHeights()

  return (
    <>
      <div style={{ display: 'flex', height: '100%' }}>
        <div style={{ width: 290, borderRight: '1px solid rgba(148,163,184,0.3)', background: '#f8fafc', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '10px 12px', borderBottom: '1px solid rgba(148,163,184,0.25)' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#475569', marginBottom: 8 }}>SCRIPT</div>
            <div style={{ display: 'flex', gap: 6 }}>
              {VIEW_OPTIONS.map(option => (
                <button
                  key={option.id}
                  onClick={() => setView(option.id)}
                  style={{
                    border: '1px solid rgba(100,116,139,0.35)',
                    borderRadius: 999,
                    padding: '5px 10px',
                    fontSize: 12,
                    background: view === option.id ? 'rgba(30,41,59,0.1)' : '#fff',
                  }}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <div ref={sidebarStackRef} style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
            <div style={{ height: viewHeight, minHeight: PANEL_HEADER_HEIGHT, borderBottom: '1px solid rgba(148,163,184,0.2)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              <button
                onClick={() => setIsViewPanelCollapsed(value => !value)}
                style={{
                  height: PANEL_HEADER_HEIGHT,
                  width: '100%',
                  border: 'none',
                  borderBottom: '1px solid rgba(148,163,184,0.15)',
                  padding: '8px 12px',
                  textAlign: 'left',
                  fontSize: 12,
                  fontWeight: 700,
                  background: '#eef2ff',
                }}
              >
                {isViewPanelCollapsed ? '▸ View Panel' : `▾ ${VIEW_OPTIONS.find(option => option.id === view)?.label} Panel`}
              </button>

              {!isViewPanelCollapsed && (
                <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 12 }}>
                  {view === 'write' && (
                    <>
                      <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                        <button className="toolbar-btn" onClick={() => setActivePanel(activePanel === 'page' ? null : 'page')}>Page Setup</button>
                        <button className="toolbar-btn" onClick={() => setActivePanel(activePanel === 'styles' ? null : 'styles')}>Element Styles</button>
                      </div>
                      <div style={{ fontSize: 12, color: '#475569' }}>
                        Page {pxToInches(pageSettings.widthPx)}" × {pxToInches(pageSettings.heightPx)}"<br />
                        Margins {pxToInches(pageSettings.marginTopPx)}" / {pxToInches(pageSettings.marginRightPx)}" / {pxToInches(pageSettings.marginBottomPx)}" / {pxToInches(pageSettings.marginLeftPx)}"
                      </div>
                    </>
                  )}

                  {view === 'breakdown' && (
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: '#334155', marginBottom: 8 }}>Breakdown Categories</div>
                      {BREAKDOWN_CATEGORIES.map(category => (
                        <div key={category} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '4px 0' }}>
                          <span>{category}</span>
                          <span style={{ color: '#64748b' }}>{breakdownCountByCategory[category] || 0}</span>
                        </div>
                      ))}
                      <div style={{ marginTop: 10, fontSize: 11, color: '#64748b' }}>
                        Select script text to create a category tag.
                      </div>
                    </div>
                  )}

                  {view === 'visualize' && (
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: '#334155', marginBottom: 8 }}>Scene-linked shots</div>
                      {currentSceneShots.length === 0 && <div style={{ fontSize: 12, color: '#64748b' }}>No shots linked to this scene.</div>}
                      {currentSceneShots.map(shot => (
                        <div key={shot.id} style={{ border: '1px solid rgba(148,163,184,0.35)', borderRadius: 6, padding: 8, marginBottom: 6, background: '#fff' }}>
                          <div style={{ fontSize: 12, fontWeight: 700, color: '#0f172a' }}>{shot.label}</div>
                          <div style={{ fontSize: 11, color: '#475569' }}>{shot.description}</div>
                          <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>
                            {Number.isFinite(shot.linkedScriptRangeStart) && Number.isFinite(shot.linkedScriptRangeEnd)
                              ? `Linked range: ${shot.linkedScriptRangeStart} → ${shot.linkedScriptRangeEnd}`
                              : 'No linked range'}
                          </div>
                        </div>
                      ))}
                      <div style={{ marginTop: 10, fontSize: 11, color: '#64748b' }}>
                        Select script text and choose a shot to link.
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div
              onMouseDown={startScenePanelResize}
              title={isScenePanelCollapsed || isViewPanelCollapsed ? 'Expand panels to resize' : 'Drag to resize panels'}
              style={{
                height: SPLITTER_HEIGHT,
                cursor: isScenePanelCollapsed || isViewPanelCollapsed ? 'default' : 'row-resize',
                borderBottom: '1px solid rgba(148,163,184,0.2)',
                background: 'repeating-linear-gradient(90deg, rgba(100,116,139,0.2), rgba(100,116,139,0.2) 8px, transparent 8px, transparent 16px)',
              }}
            />

            <div style={{ height: sceneHeight, minHeight: PANEL_HEADER_HEIGHT, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              <button
                onClick={() => setIsScenePanelCollapsed(value => !value)}
                style={{
                  height: PANEL_HEADER_HEIGHT,
                  width: '100%',
                  border: 'none',
                  borderBottom: '1px solid rgba(148,163,184,0.2)',
                  padding: '8px 12px',
                  textAlign: 'left',
                  fontSize: 12,
                  fontWeight: 700,
                  background: '#eef2ff',
                }}
              >
                {isScenePanelCollapsed ? '▸ Scenes' : '▾ Scenes'}
              </button>
              {!isScenePanelCollapsed && (
                <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
                  {orderedScenes.map(scene => {
                    const isActive = activeSceneId === scene.id
                    const linkCount = (shotLinksByScene[scene.id] || []).length
                    return (
                      <button
                        key={scene.id}
                        onClick={() => jumpToScene(scene.id)}
                        style={{
                          width: '100%',
                          textAlign: 'left',
                          border: 'none',
                          borderBottom: '1px solid rgba(148,163,184,0.16)',
                          padding: '10px 12px',
                          background: isActive ? 'rgba(37,99,235,0.08)' : 'transparent',
                          cursor: 'pointer',
                        }}
                      >
                        <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#64748b' }}>SC {scene.sceneNumber || '—'}</div>
                        <div style={{ fontSize: 12, color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{sceneHeader(scene)}</div>
                        <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>{linkCount} linked shot ranges</div>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          <div className="app-surface-card" style={{ borderRadius: 0, borderLeft: 'none', borderRight: 'none', display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px' }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#334155' }}>{VIEW_OPTIONS.find(item => item.id === view)?.label} View</span>
            <select
              value={scriptSettings.scenePaginationMode || SCENE_PAGINATION_MODES.CONTINUE}
              onChange={(event) => setScriptSettings({ scenePaginationMode: event.target.value })}
              style={{ border: '1px solid rgba(100,116,139,0.35)', borderRadius: 5, padding: '4px 6px', fontSize: 12 }}
            >
              <option value={SCENE_PAGINATION_MODES.CONTINUE}>Natural pagination</option>
              <option value={SCENE_PAGINATION_MODES.NEW_PAGE}>New page per scene</option>
            </select>
          </div>

          <div ref={documentScrollerRef} style={{ flex: 1, overflowY: 'auto', padding: '12px 0 24px' }} onMouseUp={handlePageMouseUp}>
            <div ref={pageCanvasRef} style={{ position: 'relative', display: 'flex', justifyContent: 'center', alignItems: 'flex-start', gap: 14 }}>
              <div>
                <div
                  style={{
                    width: pageSettings.widthPx,
                    height: RULER_HEIGHT_PX,
                    border: '1px solid rgba(148,163,184,0.45)',
                    background: '#f8fafc',
                    borderRadius: 5,
                    position: 'relative',
                    overflow: 'hidden',
                  }}
                >
                  {Array.from({ length: Math.floor(pageSettings.widthPx / (PX_PER_INCH / 4)) + 1 }).map((_, idx) => {
                    const x = idx * (PX_PER_INCH / 4)
                    const isInch = idx % 4 === 0
                    return (
                      <div key={idx} style={{ position: 'absolute', left: x, bottom: 0 }}>
                        <div style={{ width: 1, height: isInch ? 12 : 7, background: 'rgba(51,65,85,0.45)' }} />
                        {isInch && <div style={{ fontSize: 9, color: '#64748b', marginLeft: 2 }}>{idx / 4}</div>}
                      </div>
                    )
                  })}
                </div>

                <div style={{ height: 10 }} />

                <div style={{ display: 'flex', flexDirection: 'column', gap: PAGE_GAP_PX }}>
                  {documentModel.pages.map(page => (
                    <div
                      key={page.id}
                      className="app-panel-shadow"
                      style={{
                        width: pageSettings.widthPx,
                        height: pageSettings.heightPx,
                        background: '#fff',
                        border: '1px solid rgba(148,163,184,0.4)',
                        position: 'relative',
                        boxSizing: 'border-box',
                        paddingTop: pageSettings.marginTopPx,
                        paddingRight: pageSettings.marginRightPx,
                        paddingBottom: pageSettings.marginBottomPx,
                        paddingLeft: pageSettings.marginLeftPx,
                        overflow: 'hidden',
                      }}
                    >
                      <div style={{ display: 'flex', flexDirection: 'column', minHeight: pageContentHeightPx }}>
                        {page.blocks.map((block) => {
                          const blockStyle = getBlockStyleForType(documentSettings, block.blockType)
                          const isSelected = selectedBlock?.sceneId === block.sceneId && selectedBlock?.blockId === block.blockId

                          if (view === 'write') {
                            return (
                              <ScriptEditableBlock
                                key={`${block.sceneId}:${block.blockId}`}
                                block={block}
                                blockStyle={blockStyle}
                                isSelected={isSelected}
                                onFocusBlock={() => {
                                  setSelectedBlock({ sceneId: block.sceneId, blockId: block.blockId })
                                  setActiveSceneId(block.sceneId)
                                }}
                                onCommit={(text) => updateBlockText(block.sceneId, block.blockId, block.blockType, text)}
                                onKeyDown={(event) => handleBlockKeyDown(event, block)}
                                onRegisterHeading={(node) => {
                                  if (!block.isHeading) return
                                  if (!node) {
                                    if (sceneHeadingRefs.current[block.sceneId]) delete sceneHeadingRefs.current[block.sceneId]
                                    return
                                  }
                                  if (!sceneHeadingRefs.current[block.sceneId]) sceneHeadingRefs.current[block.sceneId] = node
                                }}
                              />
                            )
                          }

                          return (
                            <div
                              key={`${block.sceneId}:${block.blockId}`}
                              data-scene-id={block.sceneId}
                              data-block-id={block.blockId}
                              data-scene-heading={block.isHeading ? 'true' : undefined}
                              ref={(node) => {
                                if (!block.isHeading) return
                                if (!node) {
                                  if (sceneHeadingRefs.current[block.sceneId]) {
                                    delete sceneHeadingRefs.current[block.sceneId]
                                  }
                                  return
                                }
                                if (!sceneHeadingRefs.current[block.sceneId]) {
                                  sceneHeadingRefs.current[block.sceneId] = node
                                }
                              }}
                              style={{
                                marginLeft: `${blockStyle.marginLeftPx}px`,
                                marginRight: `${blockStyle.marginRightPx}px`,
                                paddingTop: `${BLOCK_VERTICAL_PADDING}px`,
                                paddingBottom: `${BLOCK_VERTICAL_PADDING}px`,
                                minHeight: `${blockStyle.lineHeightPx}px`,
                                fontFamily: '"Courier Prime", "Courier New", Courier, monospace',
                                fontSize: `${blockStyle.fontSizePx}px`,
                                lineHeight: `${blockStyle.lineHeightPx}px`,
                                textAlign: blockStyle.align || 'left',
                                letterSpacing: `${blockStyle.letterSpacingPx}px`,
                                whiteSpace: 'pre-wrap',
                                textTransform: ['heading', 'character', 'transition'].includes(block.blockType) ? 'uppercase' : 'none',
                                borderRadius: 4,
                                border: isSelected ? '1px solid rgba(37,99,235,0.45)' : '1px solid transparent',
                                background: isSelected ? 'rgba(37,99,235,0.04)' : 'transparent',
                                cursor: 'text',
                                userSelect: 'text',
                                position: 'relative',
                              }}
                              onClick={() => {
                                setSelectedBlock({ sceneId: block.sceneId, blockId: block.blockId })
                                setActiveSceneId(block.sceneId)
                              }}
                              onDoubleClick={(event) => handleReadBlockDoubleClick(event, block)}
                              onContextMenu={(event) => handleReadBlockContextMenu(event, block)}
                            >
                              {block.blockText || ' '}
                            </div>
                          )
                        })}
                      </div>

                      <div style={{ position: 'absolute', right: 12, top: 10, fontSize: 11, color: '#64748b' }}>{page.number}</div>
                    </div>
                  ))}
                </div>
              </div>

              {view !== 'write' && (
                <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
                  {overlayRects.map(rect => (
                    <div
                      key={rect.id}
                      style={{
                        position: 'absolute',
                        top: rect.top,
                        left: rect.left,
                        width: rect.width,
                        height: rect.height,
                        borderRadius: 2,
                        background: rect.type === 'breakdown' ? 'rgba(245, 158, 11, 0.2)' : `${rect.color}2E`,
                        boxShadow: rect.type === 'breakdown' ? 'inset 0 -1px rgba(217, 119, 6, 0.9)' : `inset 0 -1px ${rect.color}`,
                      }}
                    />
                  ))}
                </div>
              )}

              {view === 'write' && activePanel === 'page' && (
                <div style={{ width: 286, background: '#fff', border: '1px solid rgba(148,163,184,0.45)', borderRadius: 10, padding: 12 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Page Setup (inches)</div>
                  <InlineInchField label="Width" valuePx={pageSettings.widthPx} onChangePx={(value) => updateDocumentSettings(prev => ({ ...prev, page: { ...prev.page, widthPx: value } }))} />
                  <InlineInchField label="Height" valuePx={pageSettings.heightPx} onChangePx={(value) => updateDocumentSettings(prev => ({ ...prev, page: { ...prev.page, heightPx: value } }))} />
                  <InlineInchField label="Top" valuePx={pageSettings.marginTopPx} onChangePx={(value) => updateDocumentSettings(prev => ({ ...prev, page: { ...prev.page, marginTopPx: value } }))} />
                  <InlineInchField label="Right" valuePx={pageSettings.marginRightPx} onChangePx={(value) => updateDocumentSettings(prev => ({ ...prev, page: { ...prev.page, marginRightPx: value } }))} />
                  <InlineInchField label="Bottom" valuePx={pageSettings.marginBottomPx} onChangePx={(value) => updateDocumentSettings(prev => ({ ...prev, page: { ...prev.page, marginBottomPx: value } }))} />
                  <InlineInchField label="Left" valuePx={pageSettings.marginLeftPx} onChangePx={(value) => updateDocumentSettings(prev => ({ ...prev, page: { ...prev.page, marginLeftPx: value } }))} />
                </div>
              )}

              {view === 'write' && activePanel === 'styles' && (
                <div style={{ width: 286, background: '#fff', border: '1px solid rgba(148,163,184,0.45)', borderRadius: 10, padding: 12 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Element Style ({selectedStyleType})</div>
                  <InlineInchField label="Left indent" valuePx={selectedStyle.marginLeftPx} onChangePx={(value) => updateDocumentSettings(prev => ({
                    ...prev,
                    blockStyles: {
                      ...prev.blockStyles,
                      [selectedStyleType]: { ...prev.blockStyles[selectedStyleType], marginLeftPx: value },
                    },
                  }))} />
                  <InlineInchField label="Right indent" valuePx={selectedStyle.marginRightPx} onChangePx={(value) => updateDocumentSettings(prev => ({
                    ...prev,
                    blockStyles: {
                      ...prev.blockStyles,
                      [selectedStyleType]: { ...prev.blockStyles[selectedStyleType], marginRightPx: value },
                    },
                  }))} />
                  <InlineInchField label="First-line" valuePx={selectedStyle.firstLineIndentPx} onChangePx={(value) => updateDocumentSettings(prev => ({
                    ...prev,
                    blockStyles: {
                      ...prev.blockStyles,
                      [selectedStyleType]: { ...prev.blockStyles[selectedStyleType], firstLineIndentPx: value },
                    },
                  }))} />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {selectionDraft && view === 'breakdown' && (
        <div style={{ position: 'fixed', top: selectionDraft.top, left: selectionDraft.left, zIndex: 50, width: 300, background: '#fff', border: '1px solid rgba(148,163,184,0.45)', borderRadius: 10, boxShadow: '0 10px 28px rgba(15,23,42,0.16)' }}>
          <div style={{ padding: 10, borderBottom: '1px solid rgba(148,163,184,0.2)', fontSize: 12, fontWeight: 700 }}>
            Tag Selection ({selectionDraft.text.slice(0, 32)})
          </div>
          <div style={{ padding: 10 }}>
            <label style={{ display: 'block', fontSize: 11, color: '#475569', marginBottom: 4 }}>Element name</label>
            <input value={breakdownDraft.name} onChange={(event) => setBreakdownDraft(prev => ({ ...prev, name: event.target.value }))} style={{ width: '100%', border: '1px solid rgba(100,116,139,0.35)', borderRadius: 6, padding: '6px 8px', marginBottom: 8, fontSize: 12 }} />
            <label style={{ display: 'block', fontSize: 11, color: '#475569', marginBottom: 4 }}>Quantity</label>
            <input type="number" min={1} value={breakdownDraft.quantity} onChange={(event) => setBreakdownDraft(prev => ({ ...prev, quantity: event.target.value }))} style={{ width: '100%', border: '1px solid rgba(100,116,139,0.35)', borderRadius: 6, padding: '6px 8px', marginBottom: 8, fontSize: 12 }} />
            <label style={{ display: 'block', fontSize: 11, color: '#475569', marginBottom: 4 }}>Category</label>
            <select value={breakdownDraft.category} onChange={(event) => setBreakdownDraft(prev => ({ ...prev, category: event.target.value }))} style={{ width: '100%', border: '1px solid rgba(100,116,139,0.35)', borderRadius: 6, padding: '6px 8px', marginBottom: 8, fontSize: 12 }}>
              {BREAKDOWN_CATEGORIES.map(category => <option key={category} value={category}>{category}</option>)}
            </select>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, marginBottom: 10 }}>
              <input type="checkbox" checked={breakdownDraft.tagAllMentions} onChange={(event) => setBreakdownDraft(prev => ({ ...prev, tagAllMentions: event.target.checked }))} />
              Tag all mentions in scene
            </label>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button className="toolbar-btn" onClick={() => setSelectionDraft(null)}>Cancel</button>
              <button className="toolbar-btn" onClick={handleCreateBreakdownTag}>Add Tag</button>
            </div>
          </div>
        </div>
      )}

      {selectionDraft && view === 'visualize' && (
        <div style={{ position: 'fixed', top: selectionDraft.top, left: selectionDraft.left, zIndex: 50, width: 280, background: '#fff', border: '1px solid rgba(148,163,184,0.45)', borderRadius: 10, boxShadow: '0 10px 28px rgba(15,23,42,0.16)' }}>
          <div style={{ padding: 10, borderBottom: '1px solid rgba(148,163,184,0.2)', fontSize: 12, fontWeight: 700 }}>
            Link selection to shot
          </div>
          <div style={{ padding: 10, maxHeight: 220, overflowY: 'auto' }}>
            {currentSceneShots.length === 0 && <div style={{ fontSize: 12, color: '#64748b' }}>No shots available for this scene.</div>}
            {currentSceneShots.map(shot => (
              <button
                key={shot.id}
                onClick={() => handleLinkSelectionToShot(shot.id)}
                style={{ width: '100%', textAlign: 'left', border: '1px solid rgba(148,163,184,0.35)', borderRadius: 6, background: '#fff', marginBottom: 6, padding: '6px 8px' }}
              >
                <div style={{ fontSize: 12, fontWeight: 700 }}>{shot.label}</div>
                <div style={{ fontSize: 11, color: '#64748b' }}>{shot.description}</div>
              </button>
            ))}
          </div>
          <div style={{ padding: 10, borderTop: '1px solid rgba(148,163,184,0.2)', textAlign: 'right' }}>
            <button className="toolbar-btn" onClick={() => setSelectionDraft(null)}>Close</button>
          </div>
        </div>
      )}

      {showImportModal && <ImportScriptModal onClose={() => setShowImportModal(false)} />}
    </>
  )
}
