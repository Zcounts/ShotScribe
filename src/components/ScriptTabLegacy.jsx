import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as convexReact from 'convex/react'
import { useMutation, useQuery } from 'convex/react'
import { Lock, Pilcrow, Ruler, Save, Settings2, Unlock } from 'lucide-react'
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
import headingIcon from '../../assets/script icons/heading.svg'
import actionIcon from '../../assets/script icons/action.svg'
import characterIcon from '../../assets/script icons/character.svg'
import dialogueIcon from '../../assets/script icons/Dialogue.svg'
import parentheticalIcon from '../../assets/script icons/parentheses.svg'
import transitionIcon from '../../assets/script icons/arrow-right.svg'
import centeredIcon from '../../assets/script icons/align-center.svg'
import writeIcon from '../../assets/script icons/write.svg'
import breakdownIcon from '../../assets/script icons/breakdown.svg'
import visualizeIcon from '../../assets/script icons/visualize.svg'
import { Car, Clapperboard, MapPin, Mic2, NotebookPen, Package, Shirt, UserRound } from 'lucide-react'
import LeftSidebarResources from './LeftSidebarResources'
import { collectCloudAssetIdsFromProjectData } from '../services/assetService'
import { buildConvexSafeSnapshotPayload } from '../data/repository/cloudSnapshotPayload'
import useCloudAccessPolicy from '../features/billing/useCloudAccessPolicy'
import useResponsiveViewport from '../hooks/useResponsiveViewport'
import ScriptDocumentPaginationSurface, {
  updateNodeType as updateScriptDocumentNodeType,
} from '../features/scriptDocument/ScriptDocumentPaginationSurface'
import { useConvexQueryDiagnosticsSafe } from '../utils/convexDiagnostics'

const canUseConvexHook = typeof convexReact.useConvex === 'function'

const VIEW_OPTIONS = [
  { id: 'write', label: 'Write', icon: writeIcon },
  { id: 'breakdown', label: 'Breakdown', icon: breakdownIcon },
  { id: 'visualize', label: 'Visualize', icon: visualizeIcon },
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

const BREAKDOWN_CATEGORY_COLORS = {
  Cast: '#0ea5e9',
  Props: '#f97316',
  'Costumes/Wardrobe': '#8b5cf6',
  Makeup: '#ec4899',
  Vehicles: '#22c55e',
  Music: '#eab308',
  Locations: '#14b8a6',
  Notes: '#94a3b8',
}

const BREAKDOWN_CATEGORY_ICONS = {
  Cast: UserRound,
  Props: Package,
  'Costumes/Wardrobe': Shirt,
  Makeup: Clapperboard,
  Vehicles: Car,
  Music: Mic2,
  Locations: MapPin,
  Notes: NotebookPen,
}

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
  inspectorSections: 'shotscribe:scriptTab:inspectorSections',
}

const WRITE_OPTIONS_DEFAULTS = {
  boldSlugline: true,
  boldCharacter: true,
}

const BLOCK_TYPE_OPTIONS = [
  { value: 'heading', label: 'Scene Heading / Slugline' },
  { value: 'action', label: 'Action' },
  { value: 'character', label: 'Character' },
  { value: 'dialogue', label: 'Dialogue' },
  { value: 'parenthetical', label: 'Parenthetical' },
  { value: 'transition', label: 'Transition' },
  { value: 'centered', label: 'Centered Text' },
]

const BLOCK_TYPE_ICON_MAP = {
  heading: headingIcon,
  action: actionIcon,
  character: characterIcon,
  dialogue: dialogueIcon,
  parenthetical: parentheticalIcon,
  transition: transitionIcon,
  centered: centeredIcon,
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

function readStoredObject(key, fallback) {
  if (typeof window === 'undefined') return fallback
  const raw = window.localStorage.getItem(key)
  if (raw == null) return fallback
  try {
    return { ...fallback, ...(JSON.parse(raw) || {}) }
  } catch {
    return fallback
  }
}

function CompactInchField({ icon, label, valuePx, onChangePx, min = 0, max = null }) {
  return (
    <label className="script-compact-inch-field">
      <span className="script-compact-inch-label">
        <span className="script-compact-inch-icon" aria-hidden="true">{icon}</span>
        {label}
      </span>
      <input
        className="ss-input"
        type="number"
        step="0.05"
        min={min != null ? pxToInches(min) : undefined}
        max={max != null ? pxToInches(max) : undefined}
        value={pxToInches(valuePx)}
        onChange={(event) => onChangePx(inchesToPx(event.target.value))}
      />
    </label>
  )
}

function BlockTypeIconSelector({ value, onChange, disabled = false }) {
  return (
    <div className="script-block-type-selector" role="radiogroup" aria-label="Current line / block type">
      {BLOCK_TYPE_OPTIONS.map((option) => {
        const selected = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={option.label}
            title={option.label}
            disabled={disabled}
            className={`script-block-type-btn ${selected ? 'is-selected' : ''}`}
            onMouseDown={(event) => {
              event.preventDefault()
            }}
            onClick={() => onChange(option.value)}
          >
            <img src={BLOCK_TYPE_ICON_MAP[option.value]} alt="" aria-hidden="true" />
          </button>
        )
      })}
    </div>
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

function textFromScriptNode(node) {
  if (!node || typeof node !== 'object' || !Array.isArray(node.content)) return ''
  return node.content
    .map((child) => (child?.type === 'text' ? String(child.text || '') : ''))
    .join('')
}

function blockTypeFromNodeType(nodeType) {
  if (nodeType === 'scene_heading') return 'heading'
  return nodeType || 'action'
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

function withAlpha(hexColor, alpha) {
  const hex = String(hexColor || '').replace('#', '')
  if (!/^[0-9A-Fa-f]{6}$/.test(hex)) return `rgba(245, 158, 11, ${alpha})`
  const r = parseInt(hex.slice(0, 2), 16)
  const g = parseInt(hex.slice(2, 4), 16)
  const b = parseInt(hex.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
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

function ScriptEditableBlock({ block, blockStyle, isSelected, fontWeight, onFocusBlock, onCommit, onKeyDown, onRegisterHeading, readOnly = false }) {
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
    fontWeight,
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
      data-block-type={block.blockType}
      data-scene-heading={block.isHeading ? 'true' : undefined}
      contentEditable={!readOnly}
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

export default function ScriptTabLegacy({ useUnifiedEditorCore = false } = {}) {
  const scriptScenes = useStore(s => s.scriptScenes)
  const storyboardScenes = useStore(s => s.scenes)
  const scriptSettings = useStore(s => s.scriptSettings)
  const setScriptSettings = useStore(s => s.setScriptSettings)
  const updateScriptSceneScreenplay = useStore(s => s.updateScriptSceneScreenplay)
  const importScriptScenes = useStore(s => s.importScriptScenes)
  const importedScripts = useStore(s => s.importedScripts)
  const deleteImportedScript = useStore(s => s.deleteImportedScript)
  const openShotDialog = useStore(s => s.openShotDialog)
  const linkShotToScene = useStore(s => s.linkShotToScene)
  const derivedShotLinksByScene = useStore(s => s.derivedScriptData?.compatibility?.shotLinkIndexBySceneId || {})
  const projectRef = useStore(s => s.projectRef)
  const cloudSyncContext = useStore(s => s.cloudSyncContext)
  const getProjectData = useStore(s => s.getProjectData)
  const setCloudSnapshotId = useStore(s => s.setCloudSnapshotId)
  const scriptDocument = useStore(s => s.scriptDocument)
  const scriptDocumentLive = useStore(s => s.scriptDocumentLive)
  const updateScriptDocumentLive = useStore(s => s.updateScriptDocumentLive)
  const deriveScriptDocumentNow = useStore(s => s.deriveScriptDocumentNow)
  const convex = canUseConvexHook ? convexReact.useConvex() : null

  const cloudProjectId = projectRef?.type === 'cloud' ? projectRef.projectId : null
  const currentSnapshotId = projectRef?.type === 'cloud' ? projectRef.snapshotId : null
  const [polledHasCollaborators, setPolledHasCollaborators] = useState(false)
  const storeHasCollaborators = Boolean(cloudSyncContext?.hasActiveCollaborators)
  const hasActiveCollaborators = Boolean(storeHasCollaborators || polledHasCollaborators)
  const presenceArgs = cloudProjectId && hasActiveCollaborators ? { projectId: cloudProjectId } : 'skip'
  const locksArgs = cloudProjectId && hasActiveCollaborators ? { projectId: cloudProjectId } : 'skip'
  const presenceRows = useQuery('presence:listProjectPresence', presenceArgs)
  const locks = useQuery('screenplayLocks:listProjectLocks', locksArgs)
  const heartbeatPresence = useMutation('presence:heartbeat')
  const acquireSceneLock = useMutation('screenplayLocks:acquireSceneLock')
  const releaseSceneLock = useMutation('screenplayLocks:releaseSceneLock')
  const createSnapshot = useMutation('projectSnapshots:createSnapshot')
  const pruneOrphanedAssets = useMutation('assets:pruneOrphanedAssets')
  const cloudAccessPolicy = useCloudAccessPolicy()
  useConvexQueryDiagnosticsSafe({
    component: 'ScriptTabLegacy',
    queryName: 'presence:listProjectPresence',
    args: presenceArgs,
    result: presenceRows,
    active: presenceArgs !== 'skip',
  })
  useConvexQueryDiagnosticsSafe({
    component: 'ScriptTabLegacy',
    queryName: 'screenplayLocks:listProjectLocks',
    args: locksArgs,
    result: locks,
    active: locksArgs !== 'skip',
  })

  const [view, setView] = useState('write')
  const [activeSceneId, setActiveSceneId] = useState(null)
  const [selectedBlock, setSelectedBlock] = useState(null)
  const [showImportModal, setShowImportModal] = useState(false)
  const { isDesktopDown } = useResponsiveViewport()
  const [mobileLeftOpen, setMobileLeftOpen] = useState(false)
  const [mobileRightOpen, setMobileRightOpen] = useState(false)
  const [desktopRightOpen, setDesktopRightOpen] = useState(true)
  const [scriptDeleteConfirm, setScriptDeleteConfirm] = useState(null)
  const [collabNotice, setCollabNotice] = useState('')
  const [isSavingSnapshot, setIsSavingSnapshot] = useState(false)
  const [unifiedSelectedNode, setUnifiedSelectedNode] = useState({ nodeIndex: null, blockType: 'action' })
  const baseMinutesPerPage = Number.isFinite(scriptSettings?.baseMinutesPerPage) && scriptSettings.baseMinutesPerPage > 0
    ? scriptSettings.baseMinutesPerPage
    : 5
  const [baseMinutesInput, setBaseMinutesInput] = useState(() => String(baseMinutesPerPage))

  const [isViewPanelCollapsed, setIsViewPanelCollapsed] = useState(() => readStoredBoolean(SIDEBAR_STORAGE_KEYS.viewCollapsed, false))
  const [isScenePanelCollapsed, setIsScenePanelCollapsed] = useState(() => readStoredBoolean(SIDEBAR_STORAGE_KEYS.sceneCollapsed, false))
  const [scenePanelHeight, setScenePanelHeight] = useState(() => readStoredNumber(SIDEBAR_STORAGE_KEYS.sceneHeight, DEFAULT_SCENE_PANEL_HEIGHT))

  const [selectionDraft, setSelectionDraft] = useState(null)
  const [breakdownDraft, setBreakdownDraft] = useState({ name: '', quantity: 1, category: BREAKDOWN_CATEGORIES[1], tagAllMentions: false })
  const [activeBreakdownCategory, setActiveBreakdownCategory] = useState(null)
  const [overlayFragmentsByBlock, setOverlayFragmentsByBlock] = useState({})

  useEffect(() => {
    setBaseMinutesInput(String(baseMinutesPerPage))
  }, [baseMinutesPerPage])

  const commitBaseMinutesInput = useCallback(() => {
    const parsed = parseFloat(baseMinutesInput)
    if (Number.isFinite(parsed) && parsed > 0) {
      setScriptSettings({ baseMinutesPerPage: parsed })
      setBaseMinutesInput(String(parsed))
      return
    }
    setBaseMinutesInput(String(baseMinutesPerPage))
  }, [baseMinutesInput, baseMinutesPerPage, setScriptSettings])
  const [inspectorSections, setInspectorSections] = useState(() => readStoredObject(SIDEBAR_STORAGE_KEYS.inspectorSections, {
    scriptEstimation: true,
    scenePagination: true,
    paginationMode: true,
    writeOptions: true,
    pageStyles: true,
    pageStylesTab: 'page',
  }))
  const [scriptInspectorMode, setScriptInspectorMode] = useState('estimation')
  const [formatInspectorMode, setFormatInspectorMode] = useState('all')

  const documentScrollerRef = useRef(null)
  const pageCanvasRef = useRef(null)
  const sidebarStackRef = useRef(null)
  const sceneHeadingRefs = useRef({})
  const pendingCaretPlacementRef = useRef(null)

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
    if (typeof window === 'undefined') return
    window.localStorage.setItem(SIDEBAR_STORAGE_KEYS.inspectorSections, JSON.stringify(inspectorSections))
  }, [inspectorSections])

  useEffect(() => {
    setSelectionDraft(null)
    if (view !== 'write') {
      setSelectedBlock(null)
      return
    }
  }, [view])

  useEffect(() => {
    if (cloudProjectId && !cloudAccessPolicy.canEditCloudProject && view === 'write') {
      setView('visualize')
    }
  }, [cloudAccessPolicy.canEditCloudProject, cloudProjectId, view])

  useEffect(() => {
    if (!convex || typeof convex.query !== 'function') {
      setPolledHasCollaborators(false)
      return undefined
    }
    if (!cloudProjectId) {
      setPolledHasCollaborators(false)
      return undefined
    }
    if (storeHasCollaborators) {
      setPolledHasCollaborators(true)
      return undefined
    }
    let cancelled = false
    const poll = () => {
      convex.query('presence:listProjectPresence', { projectId: cloudProjectId })
        .then((rows) => {
          if (cancelled) return
          const hasOthers = Array.isArray(rows) && rows.some((row) => (
            String(row?.userId || '') !== String(cloudSyncContext?.currentUserId || '')
          ))
          setPolledHasCollaborators(hasOthers)
        })
        .catch(() => {})
    }
    poll()
    const timer = window.setInterval(poll, 30000)
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') poll()
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      cancelled = true
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [cloudProjectId, cloudSyncContext?.currentUserId, convex, storeHasCollaborators])

  useEffect(() => {
    if (!cloudProjectId || !hasActiveCollaborators) return
    const tick = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return
      recordPresenceHeartbeat()
      heartbeatPresence({
        projectId: cloudProjectId,
        sceneId: activeSceneId || undefined,
        mode: view === 'write' ? 'editing' : 'viewing',
      }).catch(() => {})
    }
    tick()
    const timer = window.setInterval(tick, 6000)
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') tick()
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [activeSceneId, cloudProjectId, hasActiveCollaborators, heartbeatPresence, view])

  useEffect(() => {
    if (!cloudProjectId || hasActiveCollaborators) return
    recordCollabSubscriptionSuspended()
  }, [cloudProjectId, hasActiveCollaborators])

  useEffect(() => {
    if (!isDesktopDown) {
      setMobileLeftOpen(false)
      setMobileRightOpen(false)
    }
  }, [isDesktopDown])

  useEffect(() => {
    if (!isDesktopDown) return undefined
    const handleKeyDown = (event) => {
      if (event.key !== 'Escape') return
      setMobileLeftOpen(false)
      setMobileRightOpen(false)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isDesktopDown])

  useEffect(() => {
    const handleToggleRightSidebar = () => {
      if (isDesktopDown) {
        setMobileRightOpen(value => !value)
        return
      }
      setDesktopRightOpen(value => !value)
    }
    window.addEventListener('shotscribe:toggle-script-right-sidebar', handleToggleRightSidebar)
    return () => window.removeEventListener('shotscribe:toggle-script-right-sidebar', handleToggleRightSidebar)
  }, [isDesktopDown])

  const pageSettings = documentSettings.page
  const writeOptions = { ...WRITE_OPTIONS_DEFAULTS, ...(scriptSettings?.writeOptions || {}) }
  const scriptDocumentRef = scriptDocumentLive || scriptDocument
  const shouldUseUnifiedWriteSurface = useUnifiedEditorCore && view === 'write'
  const shouldUseUnifiedReadSurface = useUnifiedEditorCore && view !== 'write'
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

  const shotLinksByScene = derivedShotLinksByScene

  const breakdownByScene = useMemo(() => {
    const result = {}
    breakdownTags.forEach(tag => {
      if (!tag.sceneId || !Number.isFinite(tag.start) || !Number.isFinite(tag.end) || tag.end <= tag.start) return
      if (!result[tag.sceneId]) result[tag.sceneId] = []
      const category = tag.category || 'Notes'
      result[tag.sceneId].push({
        ...tag,
        category,
        color: BREAKDOWN_CATEGORY_COLORS[category] || BREAKDOWN_CATEGORY_COLORS.Notes,
        type: 'breakdown',
      })
    })
    Object.keys(result).forEach(sceneId => {
      result[sceneId] = result[sceneId].sort((a, b) => a.start - b.start)
    })
    return result
  }, [breakdownTags])

  const documentModel = useMemo(() => {
    const blocks = []
    if (shouldUseUnifiedReadSurface) {
      const nodes = Array.isArray(scriptDocumentRef?.content) ? scriptDocumentRef.content : []
      const sceneOffsetById = {}
      const sceneBlockCountById = {}
      const fallbackSceneId = orderedScenes[0]?.id || null

      nodes.forEach((node, nodeIndex) => {
        const sceneId = node?.attrs?.sourceSceneId || fallbackSceneId
        if (!sceneId) return
        const blockType = blockTypeFromNodeType(node?.type)
        const blockText = textFromScriptNode(node)
        const blockStyle = getBlockStyleForType(documentSettings, blockType)
        const charsPerLine = computeCharsPerLine(blockStyle, pageContentWidthPx)
        const lineUnits = wrapLineCount(blockText, charsPerLine)
        const blockHeightPx = (lineUnits * blockStyle.lineHeightPx) + (BLOCK_VERTICAL_PADDING * 2)
        const sceneCharStart = sceneOffsetById[sceneId] || 0
        const blockIndex = sceneBlockCountById[sceneId] || 0
        blocks.push({
          sceneId,
          blockId: node?.attrs?.sourceElementId || node?.attrs?.id || `pm_block_${nodeIndex}`,
          blockType,
          blockText,
          blockIndex,
          sceneCharStart,
          sceneCharEnd: sceneCharStart + String(blockText || '').length,
          lineUnits,
          blockHeightPx,
          lineHeightPx: blockStyle.lineHeightPx,
          isSceneStart: blockIndex === 0,
          isHeading: blockType === 'heading' || blockIndex === 0,
        })
        sceneOffsetById[sceneId] = sceneCharStart + String(blockText || '').length + 1
        sceneBlockCountById[sceneId] = blockIndex + 1
      })
    } else {
      orderedScenes.forEach(scene => {
        let sceneOffset = 0
        const sceneBlocks = screenplayByScene[scene.id] || []

        sceneBlocks.forEach((block, blockIndex) => {
          const blockStyle = getBlockStyleForType(documentSettings, block.type)
          const charsPerLine = computeCharsPerLine(blockStyle, pageContentWidthPx)
          const lineUnits = wrapLineCount(block.text, charsPerLine)
          const blockHeightPx = (lineUnits * blockStyle.lineHeightPx) + (BLOCK_VERTICAL_PADDING * 2)
          blocks.push({
            sceneId: scene.id,
            blockId: block.id,
            blockType: block.type,
            blockText: block.text,
            blockIndex,
            sceneCharStart: sceneOffset,
            sceneCharEnd: sceneOffset + String(block.text || '').length,
            lineUnits,
            blockHeightPx,
            lineHeightPx: blockStyle.lineHeightPx,
            isSceneStart: blockIndex === 0,
            isHeading: block.type === 'heading' || blockIndex === 0,
          })
          sceneOffset += String(block.text || '').length + 1
        })
      })
    }

    const pages = []
    let currentPage = { id: 'p_1', number: 1, blocks: [], usedHeightPx: 0 }

    blocks.forEach(block => {
      if (
        scriptSettings.scenePaginationMode === SCENE_PAGINATION_MODES.NEW_PAGE
        && block.isSceneStart
        && currentPage.blocks.length
      ) {
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

    if (currentPage.blocks.length || pages.length === 0) pages.push(currentPage)

    return {
      pages,
      blocks,
    }
  }, [documentSettings, orderedScenes, pageContentHeightPx, pageContentWidthPx, screenplayByScene, scriptDocumentRef, scriptSettings.scenePaginationMode, shouldUseUnifiedReadSurface])

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
  const selectedStyleType = useUnifiedEditorCore
    ? (unifiedSelectedNode.blockType || 'action')
    : (selectedBlockData?.type || 'action')
  const selectedStyle = getBlockStyleForType(documentSettings, selectedStyleType)
  const currentUserId = cloudSyncContext?.currentUserId ? String(cloudSyncContext.currentUserId) : null
  const lockBySceneId = useMemo(() => {
    const map = {}
    ;(locks || []).forEach((lock) => {
      map[lock.sceneId] = lock
    })
    return map
  }, [locks])
  const activeSceneLock = activeSceneId ? lockBySceneId[activeSceneId] : null
  const activeLockOwnedByCurrentUser = !!(activeSceneLock && currentUserId && String(activeSceneLock.holderUserId) === String(currentUserId))
  const isWriteBlockedByLock = view === 'write' && !!(activeSceneLock && !activeLockOwnedByCurrentUser)
  const activePresence = useMemo(
    () => (presenceRows || []).filter((row) => String(row.userId) !== String(currentUserId || '')),
    [currentUserId, presenceRows],
  )

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

  const setBlockType = useCallback((sceneId, blockId, nextType) => {
    updateSceneBlocks(sceneId, blocks => blocks.map(block => (
      block.id === blockId ? { ...block, type: nextType } : block
    )))
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
    pendingCaretPlacementRef.current = { sceneId, blockId: newBlock.id, offset: 0 }
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

  const toggleWriteOption = useCallback((key, checked) => {
    setScriptSettings({
      writeOptions: {
        ...writeOptions,
        [key]: checked,
      },
    })
  }, [setScriptSettings, writeOptions])

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
    if (view !== 'write' || isWriteBlockedByLock) return
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
  }, [cycleType, insertBlockAfter, isWriteBlockedByLock, mergeWithPrevious, nextTypeForEnter, view])

  const handleAcquireActiveSceneLock = useCallback(async () => {
    if (!cloudProjectId || !activeSceneId) return
    if (!cloudAccessPolicy.canEditCloudProject) {
      setCollabNotice('Cloud collaboration is read-only while billing is inactive.')
      return
    }
    const result = await acquireSceneLock({ projectId: cloudProjectId, sceneId: activeSceneId })
    if (!result?.ok) {
      setCollabNotice(`Scene is locked by ${result?.holderName || 'another collaborator'}.`)
      return
    }
    setCollabNotice('Scene lock acquired.')
  }, [acquireSceneLock, activeSceneId, cloudAccessPolicy.canEditCloudProject, cloudProjectId])

  const handleReleaseActiveSceneLock = useCallback(async () => {
    if (!cloudProjectId || !activeSceneId) return
    await releaseSceneLock({ projectId: cloudProjectId, sceneId: activeSceneId })
    setCollabNotice('Scene lock released.')
  }, [activeSceneId, cloudProjectId, releaseSceneLock])

  const handleSaveScreenplaySnapshot = useCallback(async () => {
    if (!cloudProjectId || !currentUserId) return
    if (!cloudAccessPolicy.canEditCloudProject) {
      setCollabNotice('Cloud saves are blocked while billing is inactive. You can still view this project.')
      return
    }
    setIsSavingSnapshot(true)
    try {
      const payload = getProjectData()
      const safePayload = buildConvexSafeSnapshotPayload(payload)
      const result = await createSnapshot({
        projectId: cloudProjectId,
        createdByUserId: currentUserId,
        source: 'manual_save',
        payload: safePayload,
        conflictStrategy: 'fail_on_conflict',
        ...(currentSnapshotId ? { expectedLatestSnapshotId: currentSnapshotId } : {}),
      })
      if (!result?.ok) {
        setCollabNotice('Save blocked: remote changes were detected. Restore or reload latest snapshot before retrying.')
        return
      }
      const keepAssetIds = collectCloudAssetIdsFromProjectData(payload)
      await pruneOrphanedAssets({ projectId: cloudProjectId, keepAssetIds })
      setCloudSnapshotId(String(result.snapshotId))
      setCollabNotice('Screenplay snapshot saved.')
    } finally {
      setIsSavingSnapshot(false)
    }
  }, [cloudAccessPolicy.canEditCloudProject, cloudProjectId, createSnapshot, currentSnapshotId, currentUserId, getProjectData, pruneOrphanedAssets, setCloudSnapshotId])

  const handleUnifiedSetBlockType = useCallback((nextType) => {
    const nodeIndex = unifiedSelectedNode?.nodeIndex
    if (!useUnifiedEditorCore || !Number.isInteger(nodeIndex) || !nextType) return
    const documentRef = scriptDocumentLive || scriptDocument
    const nextDocument = updateScriptDocumentNodeType(documentRef, nodeIndex, nextType)
    updateScriptDocumentLive(nextDocument, { reason: 'script_document_surface_block_type_select' })
    setUnifiedSelectedNode({ nodeIndex, blockType: nextType })
    deriveScriptDocumentNow({ reason: 'script_document_surface_block_type_select', persist: true })
  }, [deriveScriptDocumentNow, scriptDocument, scriptDocumentLive, unifiedSelectedNode, updateScriptDocumentLive, useUnifiedEditorCore])

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

  const selectFullBlockForMode = useCallback((block, blockElement, anchorEvent = null) => {
    if (!block || !blockElement || view === 'write') return
    const text = String(block.blockText || '').trim()
    if (!text) {
      setSelectionDraft(null)
      return
    }
    const blockRect = blockElement.getBoundingClientRect()
    const top = (anchorEvent?.clientY ?? blockRect.top) + window.scrollY + 8
    const left = (anchorEvent?.clientX ?? blockRect.left) + window.scrollX
    setActiveSceneId(block.sceneId)
    setSelectionDraft({
      sceneId: block.sceneId,
      start: block.sceneCharStart,
      end: block.sceneCharEnd,
      text,
      top,
      left,
    })
    if (view === 'breakdown') {
      setBreakdownDraft(prev => ({ ...prev, name: text }))
    }
  }, [view])

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
    if (view !== 'breakdown' && view !== 'visualize') return
    event.preventDefault()
    selectFullBlockForMode(block, event.currentTarget, event)
  }, [selectFullBlockForMode, view])

  const handleDocumentSurfaceContextMenu = useCallback((event) => {
    if (view !== 'breakdown' && view !== 'visualize') return
    const blockElement = event.target.closest?.('[data-scene-id][data-block-id]') || null
    event.preventDefault()
    if (!blockElement) return
    const sceneId = blockElement.getAttribute('data-scene-id')
    const blockId = blockElement.getAttribute('data-block-id')
    const block = documentModel.blocks.find(entry => entry.sceneId === sceneId && entry.blockId === blockId)
    if (!block) return
    selectFullBlockForMode(block, blockElement, event)
  }, [documentModel.blocks, selectFullBlockForMode, view])

  const handleLinkSelectionToShot = useCallback((shotId) => {
    if (!selectionDraft || !shotId || view !== 'visualize') return
    linkShotToScene(shotId, selectionDraft.sceneId, {
      linkedScriptRangeStart: selectionDraft.start,
      linkedScriptRangeEnd: selectionDraft.end,
    })
    setSelectionDraft(null)
  }, [linkShotToScene, selectionDraft, view])

  useEffect(() => {
    if (view !== 'write') return
    const pending = pendingCaretPlacementRef.current
    if (!pending || !pageCanvasRef.current) return
    const node = pageCanvasRef.current.querySelector(
      `[data-scene-id="${pending.sceneId}"][data-block-id="${pending.blockId}"][contenteditable="true"]`,
    )
    if (!node) return
    node.focus()
    const selection = window.getSelection()
    if (!selection) return
    const range = document.createRange()
    range.selectNodeContents(node)
    range.collapse(true)
    selection.removeAllRanges()
    selection.addRange(range)
    pendingCaretPlacementRef.current = null
  }, [documentModel.pages, view])

  useEffect(() => {
    if (view === 'write') {
      setOverlayFragmentsByBlock({})
      return
    }

    const container = pageCanvasRef.current
    if (!container) return

    const computeOverlays = () => {
      const linksByScene = view === 'breakdown' ? breakdownByScene : shotLinksByScene
      const nextFragmentsByBlock = {}
      const shotColorById = {}
      storyboardScenes.forEach((scene) => {
        ;(scene.shots || []).forEach((shot) => {
          if (!shot?.id) return
          shotColorById[shot.id] = shot.color || '#f59e0b'
        })
      })

      documentModel.blocks.forEach((block) => {
        const blockElement = container.querySelector(`[data-scene-id="${block.sceneId}"][data-block-id="${block.blockId}"]`)
        if (!blockElement) return
        const blockRect = blockElement.getBoundingClientRect()
        const blockLinks = (linksByScene[block.sceneId] || []).filter((link) => {
          if (!(link.end > block.sceneCharStart && link.start < block.sceneCharEnd)) return false
          if (view !== 'breakdown' || !activeBreakdownCategory) return true
          return (link.category || 'Notes') === activeBreakdownCategory
        })
        if (!blockLinks.length) return

        blockLinks.forEach((link) => {
          const localStart = Math.max(0, link.start - block.sceneCharStart)
          const localEnd = Math.min(String(block.blockText || '').length, link.end - block.sceneCharStart)
          if (localEnd <= localStart) return
          const range = createRangeForOffsets(blockElement, localStart, localEnd)
          if (!range) return

          Array.from(range.getClientRects()).forEach((rect, index) => {
            if (rect.width === 0 || rect.height === 0) return
            const blockKey = `${block.sceneId}:${block.blockId}`
            if (!nextFragmentsByBlock[blockKey]) nextFragmentsByBlock[blockKey] = []
            nextFragmentsByBlock[blockKey].push({
              id: `${link.id}_${index}_${rect.top}_${rect.left}`,
              type: classifyLinkType(view, link),
              top: rect.top - blockRect.top,
              left: rect.left - blockRect.left,
              width: rect.width,
              height: rect.height,
              color: link.color || shotColorById[link.shotId] || '#f59e0b',
            })
          })
        })
      })

      setOverlayFragmentsByBlock(nextFragmentsByBlock)
    }

    const scheduleCompute = () => {
      window.requestAnimationFrame(computeOverlays)
    }

    scheduleCompute()
    const scroller = documentScrollerRef.current
    scroller?.addEventListener('scroll', scheduleCompute, { passive: true })
    window.addEventListener('resize', scheduleCompute)
    return () => {
      scroller?.removeEventListener('scroll', scheduleCompute)
      window.removeEventListener('resize', scheduleCompute)
    }
  }, [activeBreakdownCategory, breakdownByScene, documentModel.blocks, shotLinksByScene, storyboardScenes, view])

  if (orderedScenes.length === 0) {
    return (
      <>
        <div style={{ height: '100%', display: 'grid', placeItems: 'center' }}>
          <div className="app-surface-card" style={{ width: 'min(420px, calc(100vw - 28px))', padding: 20, textAlign: 'center' }}>
            <h2 style={{ marginTop: 0, fontSize: 22 }}>Start your script</h2>
            <p style={{ color: '#475569', marginBottom: 16 }}>The Script tab is document-first. Write directly on paginated pages.</p>
            <div style={{ display: 'flex', justifyContent: 'center', gap: 10 }}>
              <button className="toolbar-btn" onClick={() => setShowImportModal(true)}>Upload Script</button>
              <button className="toolbar-btn" onClick={createManualScript}>Write Script</button>
            </div>
          </div>
        </div>
        {showImportModal && <ImportScriptModal isOpen={showImportModal} onClose={() => setShowImportModal(false)} />}
      </>
    )
  }

  const { viewHeight, sceneHeight } = resolveStackHeights()

  return (
    <>
      <div className="script-tab-shell" data-compact={isDesktopDown ? 'true' : 'false'} style={{ display: 'flex', height: '100%', position: 'relative' }}>
        {isDesktopDown && (
          <div className="script-compact-controls">
            <button className="ss-btn outline" onClick={() => setMobileLeftOpen(true)} style={{ minHeight: 34 }}>Script Panel</button>
            <button className="ss-btn outline" onClick={() => setMobileRightOpen(true)} style={{ minHeight: 34 }}>Inspector</button>
          </div>
        )}
        {isDesktopDown && (mobileLeftOpen || mobileRightOpen) ? (
          <div
            className="script-sidebar-mobile-scrim"
            onClick={() => {
              setMobileLeftOpen(false)
              setMobileRightOpen(false)
            }}
          />
        ) : null}
        <div className={`script-sidebar script-sidebar-left ${isDesktopDown ? 'script-sidebar-mobile-left' : ''} ${mobileLeftOpen ? 'is-mobile-open' : ''}`}>
          <div className="script-sidebar-top">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#b6c5dd' }}>SCRIPT</div>
              {isDesktopDown ? (
                <button className="toolbar-btn" onClick={() => setMobileLeftOpen(false)} style={{ minHeight: 28, padding: '2px 8px' }}>
                  Close
                </button>
              ) : null}
            </div>
            <div className="schedule-view-switcher" role="group" aria-label="Script mode">
              {VIEW_OPTIONS.map(option => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => {
                    if (option.id === 'write' && cloudProjectId && !cloudAccessPolicy.canEditCloudProject) {
                      setCollabNotice('Write mode is disabled while this cloud project is read-only due to inactive billing.')
                      return
                    }
                    setView(option.id)
                  }}
                  className={`ss-btn outline icon-toggle schedule-view-switcher-btn ${view === option.id ? 'is-active' : ''}`}
                  aria-label={option.label}
                  title={option.label}
                  aria-pressed={view === option.id}
                  disabled={option.id === 'write' && cloudProjectId && !cloudAccessPolicy.canEditCloudProject}
                >
                  <img src={option.icon} alt="" aria-hidden="true" />
                </button>
              ))}
            </div>
            <div className="script-sidebar-utility-panel">
              <div className="script-sidebar-utility-heading">Script Document</div>
              <div className="script-sidebar-utility-status">
                {cloudProjectId
                  ? (!cloudAccessPolicy.canEditCloudProject
                    ? 'Read-only cloud mode: billing inactive.'
                    : (isWriteBlockedByLock ? `Locked by ${activeSceneLock?.holderName || 'another collaborator'}.` : 'Collaboration safety active.'))
                  : 'Collaboration safety active.'}
                {collabNotice ? ` ${collabNotice}` : ''}
              </div>
              <div className="script-sidebar-utility-actions">
                <button
                  className="script-icon-btn"
                  onClick={handleSaveScreenplaySnapshot}
                  disabled={!cloudProjectId || isSavingSnapshot || !cloudAccessPolicy.canEditCloudProject}
                  aria-label={isSavingSnapshot ? 'Saving snapshot' : 'Save Snapshot'}
                  title={isSavingSnapshot ? 'Saving snapshot' : 'Save Snapshot'}
                >
                  <Save size={14} aria-hidden="true" />
                </button>
                <button
                  className="script-icon-btn"
                  onClick={handleAcquireActiveSceneLock}
                  disabled={!cloudProjectId || !cloudAccessPolicy.canEditCloudProject}
                  aria-label="Lock scene"
                  title="Lock scene"
                >
                  <Lock size={14} aria-hidden="true" />
                </button>
                <button
                  className="script-icon-btn"
                  onClick={handleReleaseActiveSceneLock}
                  disabled={!cloudProjectId || !cloudAccessPolicy.canEditCloudProject}
                  aria-label="Unlock"
                  title="Unlock"
                >
                  <Unlock size={14} aria-hidden="true" />
                </button>
              </div>
            </div>
          </div>

          <div ref={sidebarStackRef} style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
            <div style={{ height: viewHeight, minHeight: PANEL_HEADER_HEIGHT, borderBottom: '1px solid rgba(148,163,184,0.2)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              <button
                onClick={() => setIsViewPanelCollapsed(value => !value)}
                className="script-pane-header-btn"
                style={{ height: PANEL_HEADER_HEIGHT, width: '100%' }}
              >
                {isViewPanelCollapsed ? '▸ View Panel' : `▾ ${VIEW_OPTIONS.find(option => option.id === view)?.label} Panel`}
              </button>

              {!isViewPanelCollapsed && (
                <div className="script-sidebar-scroll">
                  {view === 'write' && (
                    <>
                      <label style={{ display: 'block', fontSize: 11, color: '#9fb0d1', marginBottom: 4 }}>Current line / block type</label>
                      <BlockTypeIconSelector
                        value={selectedStyleType}
                        onChange={(nextType) => {
                          if (useUnifiedEditorCore) {
                            handleUnifiedSetBlockType(nextType)
                            return
                          }
                          if (!selectedBlock) return
                          setBlockType(selectedBlock.sceneId, selectedBlock.blockId, nextType)
                        }}
                        disabled={useUnifiedEditorCore ? !Number.isInteger(unifiedSelectedNode?.nodeIndex) : !selectedBlock}
                      />

                    </>
                  )}

                  {view === 'breakdown' && (
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: '#dbe5f5', marginBottom: 8 }}>Breakdown Categories</div>
                      <button
                        type="button"
                        className={`script-breakdown-category-row ${activeBreakdownCategory == null ? 'is-active' : ''}`}
                        onClick={() => setActiveBreakdownCategory(null)}
                        style={{ marginBottom: 4 }}
                      >
                        <span className="script-breakdown-category-label">
                          <span className="script-breakdown-category-dot" style={{ background: '#cbd5e1' }} />
                          All categories
                        </span>
                        <span style={{ color: '#a7b5cf' }}>{breakdownTags.length}</span>
                      </button>
                      {BREAKDOWN_CATEGORIES.map((category) => {
                        const CategoryIcon = BREAKDOWN_CATEGORY_ICONS[category]
                        return (
                          <button
                            key={category}
                            type="button"
                            className={`script-breakdown-category-row ${activeBreakdownCategory === category ? 'is-active' : ''}`}
                            onClick={() => setActiveBreakdownCategory(category)}
                          >
                            <span className="script-breakdown-category-label">
                              <CategoryIcon size={13} strokeWidth={1.8} />
                              <span className="script-breakdown-category-dot" style={{ background: BREAKDOWN_CATEGORY_COLORS[category] }} />
                              {category}
                            </span>
                            <span style={{ color: '#a7b5cf' }}>{breakdownCountByCategory[category] || 0}</span>
                          </button>
                        )
                      })}
                      <div style={{ marginTop: 10, fontSize: 11, color: '#9fb0d1' }}>
                        Select script text to create a category tag.
                      </div>
                    </div>
                  )}

                  {view === 'visualize' && (
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: '#dbe5f5', marginBottom: 8 }}>Scene-linked shots</div>
                      {currentSceneShots.length === 0 && <div style={{ fontSize: 12, color: '#9fb0d1' }}>No shots linked to this scene.</div>}
                      {currentSceneShots.map(shot => (
                        <div key={shot.id} style={{ border: '1px solid rgba(148,163,184,0.35)', borderRadius: 6, padding: 8, marginBottom: 6, background: 'rgba(255,255,255,0.08)' }}>
                          <div style={{ fontSize: 12, fontWeight: 700, color: '#e8eefb' }}>{shot.label}</div>
                          <div style={{ fontSize: 11, color: '#c8d4e9' }}>{shot.description}</div>
                          <div style={{ fontSize: 11, color: '#9fb0d1', marginTop: 4 }}>
                            {Number.isFinite(shot.linkedScriptRangeStart) && Number.isFinite(shot.linkedScriptRangeEnd)
                              ? `Linked range: ${shot.linkedScriptRangeStart} → ${shot.linkedScriptRangeEnd}`
                              : 'No linked range'}
                          </div>
                        </div>
                      ))}
                      <div style={{ marginTop: 10, fontSize: 11, color: '#9fb0d1' }}>
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
                className="script-pane-header-btn"
                style={{ height: PANEL_HEADER_HEIGHT, width: '100%' }}
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
                        data-entity-type="scene"
                        data-entity-id={scene.id}
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
                        <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#9fb0d1' }}>SC {scene.sceneNumber || '—'}</div>
                        <div style={{ fontSize: 12, color: '#e8eefb', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{sceneHeader(scene)}</div>
                        <div style={{ fontSize: 11, color: '#9fb0d1', marginTop: 2 }}>
                          {linkCount} linked shot ranges
                          {lockBySceneId[scene.id] && ` · 🔒 ${lockBySceneId[scene.id].holderName || 'Locked'}`}
                          {activePresence.some((row) => row.sceneId === scene.id) && ` · 👀 ${activePresence.filter((row) => row.sceneId === scene.id).length}`}
                        </div>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
          <LeftSidebarResources />
        </div>

        <div style={{ flex: 1, minWidth: 0, display: 'flex' }}>
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
            <div
              ref={documentScrollerRef}
              style={{ flex: 1, overflowY: 'auto', overflowX: isDesktopDown ? 'auto' : 'hidden', padding: '12px 0 24px' }}
              onMouseUp={shouldUseUnifiedWriteSurface ? undefined : handlePageMouseUp}
              onContextMenu={handleDocumentSurfaceContextMenu}
            >
              {shouldUseUnifiedWriteSurface ? (
                <ScriptDocumentPaginationSurface
                  readOnly={isWriteBlockedByLock}
                  writeOptions={writeOptions}
                  onActiveBlockTypeChange={(blockType) => {
                    setUnifiedSelectedNode(prev => ({ ...prev, blockType: blockType || 'action' }))
                  }}
                  onActiveNodeChange={({ nodeIndex, blockType }) => {
                    setUnifiedSelectedNode({
                      nodeIndex: Number.isInteger(nodeIndex) ? nodeIndex : null,
                      blockType: blockType || 'action',
                    })
                  }}
                />
              ) : (
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
                              const blockFontWeight = (writeOptions.boldSlugline && block.blockType === 'heading')
                                || (writeOptions.boldCharacter && block.blockType === 'character')
                                ? 700
                                : 400

                              if (view === 'write') {
                                return (
                                  <ScriptEditableBlock
                                    key={`${block.sceneId}:${block.blockId}`}
                                    block={block}
                                    blockStyle={blockStyle}
                                    isSelected={isSelected}
                                    fontWeight={blockFontWeight}
                                    onFocusBlock={() => {
                                      setSelectedBlock({ sceneId: block.sceneId, blockId: block.blockId })
                                      setActiveSceneId(block.sceneId)
                                    }}
                                    onCommit={(text) => updateBlockText(block.sceneId, block.blockId, block.blockType, text)}
                                    onKeyDown={(event) => handleBlockKeyDown(event, block)}
                                    readOnly={isWriteBlockedByLock}
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
                                  data-block-type={block.blockType}
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
                                    fontWeight: blockFontWeight,
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
                                  onMouseUp={(event) => {
                                    if (event.detail === 3) {
                                      event.preventDefault()
                                      selectFullBlockForMode(block, event.currentTarget, event)
                                    }
                                  }}
                                  onDoubleClick={(event) => handleReadBlockDoubleClick(event, block)}
                                  onContextMenu={(event) => handleReadBlockContextMenu(event, block)}
                                >
                                  {block.blockText || ' '}
                                  {view !== 'write' && (overlayFragmentsByBlock[`${block.sceneId}:${block.blockId}`] || []).map(fragment => (
                                    <div
                                      key={fragment.id}
                                      style={{
                                        position: 'absolute',
                                        top: fragment.top,
                                        left: fragment.left,
                                        width: fragment.width,
                                        height: fragment.height,
                                        borderRadius: 2,
                                        pointerEvents: 'none',
                                        background: fragment.type === 'breakdown' ? withAlpha(fragment.color, 0.22) : `${fragment.color}2E`,
                                        boxShadow: `inset 0 -1px ${fragment.color}`,
                                      }}
                                    />
                                  ))}
                                </div>
                              )
                            })}
                          </div>

                          <div style={{ position: 'absolute', right: 12, top: 10, fontSize: 11, color: '#64748b' }}>{page.number}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {(isDesktopDown ? mobileRightOpen : desktopRightOpen) ? (
            <div className={`script-sidebar script-sidebar-right ${isDesktopDown ? 'script-sidebar-mobile-right' : ''} ${mobileRightOpen ? 'is-mobile-open' : ''}`}>
            {isDesktopDown ? (
              <div className="script-sidebar-top" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#334155' }}>Inspector</div>
                <button className="toolbar-btn" onClick={() => setMobileRightOpen(false)} style={{ minHeight: 28, padding: '2px 8px' }}>
                  Close
                </button>
              </div>
            ) : null}
            {/* Combined Script Settings panel: Estimation / Pagination */}
            <section className="ss-module script-inspector-section">
              <button
                onClick={() => setInspectorSections(prev => ({ ...prev, scriptEstimation: !prev.scriptEstimation }))}
                className="ss-module-header script-inspector-header"
                style={{ width: '100%', borderBottom: inspectorSections.scriptEstimation ? '1px solid rgba(148,163,184,0.2)' : 'none', textAlign: 'left', fontSize: 12, fontWeight: 700 }}
              >
                {inspectorSections.scriptEstimation ? '▾' : '▸'} Script Settings
              </button>
              {inspectorSections.scriptEstimation && (
                <div style={{ padding: 10 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 4, marginBottom: 10 }}>
                    {[
                      { id: 'estimation', label: 'Estimation' },
                      { id: 'pagination', label: 'Pagination' },
                    ].map(tab => (
                      <button
                        key={tab.id}
                        type="button"
                        className={`script-page-style-tab${scriptInspectorMode === tab.id ? ' is-active' : ''}`}
                        onClick={() => setScriptInspectorMode(tab.id)}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>

                  {scriptInspectorMode === 'estimation' && (
                    <>
                      <label style={{ display: 'block', fontSize: 11, color: '#475569', marginBottom: 6 }}>Base minutes per page</label>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <input
                          type="range"
                          min={1}
                          max={60}
                          step={0.5}
                          value={Math.min(baseMinutesPerPage, 60)}
                          onChange={event => setScriptSettings({ baseMinutesPerPage: parseFloat(event.target.value) })}
                          style={{ flex: 1, accentColor: '#2563eb' }}
                        />
                        <input
                          type="number"
                          min={1}
                          step={0.5}
                          inputMode="decimal"
                          value={baseMinutesInput}
                          onChange={(event) => {
                            const nextValue = event.target.value
                            setBaseMinutesInput(nextValue)
                            const parsed = parseFloat(nextValue)
                            if (Number.isFinite(parsed) && parsed > 0) {
                              setScriptSettings({ baseMinutesPerPage: parsed })
                            }
                          }}
                          onBlur={commitBaseMinutesInput}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') {
                              event.currentTarget.blur()
                            }
                          }}
                          style={{ width: 64, padding: '2px 4px', fontSize: 12 }}
                          aria-label="Base minutes per page"
                        />
                        <span style={{ fontSize: 12, color: '#334155', fontFamily: 'monospace', width: 28, textAlign: 'right' }}>
                          {baseMinutesPerPage}
                        </span>
                      </div>
                      <div style={{ fontSize: 10, color: '#64748b', marginTop: 4 }}>
                        1 script page ≈ {baseMinutesPerPage} min shoot time
                      </div>
                    </>
                  )}

                  {scriptInspectorMode === 'pagination' && (
                    <>
                      <label style={{ display: 'block', fontSize: 11, color: '#475569', marginBottom: 6 }}>Scene pagination mode</label>
                      <select
                        className="ss-input"
                        value={scriptSettings.scenePaginationMode || SCENE_PAGINATION_MODES.CONTINUE}
                        onChange={(event) => setScriptSettings({ scenePaginationMode: event.target.value })}
                        style={{ width: '100%', padding: '5px 6px', fontSize: 12 }}
                      >
                        <option value={SCENE_PAGINATION_MODES.CONTINUE}>Natural pagination</option>
                        <option value={SCENE_PAGINATION_MODES.NEW_PAGE}>New page per scene</option>
                      </select>
                    </>
                  )}
                </div>
              )}
            </section>

            {[
              { id: 'writeOptions', title: 'Write panel options' },
              { id: 'pageStyles', title: 'Page & Styles' },
            ].map(section => (
              <section key={section.id} className="ss-module script-inspector-section">
                <button
                  onClick={() => setInspectorSections(prev => ({ ...prev, [section.id]: !prev[section.id] }))}
                  className="ss-module-header script-inspector-header"
                  style={{ width: '100%', borderBottom: inspectorSections[section.id] ? '1px solid rgba(148,163,184,0.2)' : 'none', textAlign: 'left', fontSize: 12, fontWeight: 700 }}
                >
                  {inspectorSections[section.id] ? '▾' : '▸'} {section.title}
                </button>
                {inspectorSections[section.id] && (
                  <div style={{ padding: 10 }}>
                    {section.id === 'writeOptions' && (
                      <>
                        <label className="script-checkbox-row" style={{ marginBottom: 8 }}>
                          <input type="checkbox" checked={writeOptions.boldSlugline} onChange={(event) => toggleWriteOption('boldSlugline', event.target.checked)} />
                          Bold Slugline
                        </label>
                        <label className="script-checkbox-row">
                          <input type="checkbox" checked={writeOptions.boldCharacter} onChange={(event) => toggleWriteOption('boldCharacter', event.target.checked)} />
                          Bold Character
                        </label>
                      </>
                    )}
                    {section.id === 'pageStyles' && (
                      <>
                        <div className="script-page-style-tabs script-page-style-tabs--inspector">
                          <button
                            type="button"
                            className={`script-page-style-tab script-page-style-tab--icon ${(inspectorSections.pageStylesTab || 'page') === 'page' ? 'is-active' : ''}`}
                            onClick={() => setInspectorSections(prev => ({ ...prev, pageStylesTab: 'page' }))}
                          >
                            <Ruler size={13} aria-hidden="true" />
                            Page
                          </button>
                          <button
                            type="button"
                            className={`script-page-style-tab script-page-style-tab--icon ${(inspectorSections.pageStylesTab || 'page') === 'paragraph' ? 'is-active' : ''}`}
                            onClick={() => setInspectorSections(prev => ({ ...prev, pageStylesTab: 'paragraph' }))}
                          >
                            <Pilcrow size={13} aria-hidden="true" />
                            Paragraph
                          </button>
                        </div>
                        {(inspectorSections.pageStylesTab || 'page') === 'page' ? (
                          <div className="script-page-styles-pane">
                            <div className="script-page-style-group">
                              <div className="script-page-style-group-title"><Ruler size={12} aria-hidden="true" /> Size</div>
                              <div className="script-page-style-field-grid">
                                <CompactInchField icon="W" label="Width" valuePx={pageSettings.widthPx} onChangePx={(value) => updateDocumentSettings(prev => ({ ...prev, page: { ...prev.page, widthPx: value } }))} />
                                <CompactInchField icon="H" label="Height" valuePx={pageSettings.heightPx} onChangePx={(value) => updateDocumentSettings(prev => ({ ...prev, page: { ...prev.page, heightPx: value } }))} />
                              </div>
                            </div>
                            <div className="script-page-style-group">
                              <div className="script-page-style-group-title"><Settings2 size={12} aria-hidden="true" /> Margins</div>
                              <div className="script-page-style-field-grid">
                                <CompactInchField icon="T" label="Top" valuePx={pageSettings.marginTopPx} onChangePx={(value) => updateDocumentSettings(prev => ({ ...prev, page: { ...prev.page, marginTopPx: value } }))} />
                                <CompactInchField icon="R" label="Right" valuePx={pageSettings.marginRightPx} onChangePx={(value) => updateDocumentSettings(prev => ({ ...prev, page: { ...prev.page, marginRightPx: value } }))} />
                                <CompactInchField icon="B" label="Bottom" valuePx={pageSettings.marginBottomPx} onChangePx={(value) => updateDocumentSettings(prev => ({ ...prev, page: { ...prev.page, marginBottomPx: value } }))} />
                                <CompactInchField icon="L" label="Left" valuePx={pageSettings.marginLeftPx} onChangePx={(value) => updateDocumentSettings(prev => ({ ...prev, page: { ...prev.page, marginLeftPx: value } }))} />
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div className="script-page-styles-pane">
                            <div className="script-page-style-group">
                              <div className="script-page-style-group-title"><Pilcrow size={12} aria-hidden="true" /> Indentation</div>
                              <div className="script-page-style-field-grid">
                                <CompactInchField icon="L" label="Left indent" valuePx={selectedStyle.marginLeftPx} onChangePx={(value) => updateDocumentSettings(prev => ({
                                  ...prev,
                                  blockStyles: {
                                    ...prev.blockStyles,
                                    [selectedStyleType]: { ...prev.blockStyles[selectedStyleType], marginLeftPx: value },
                                  },
                                }))} />
                                <CompactInchField icon="R" label="Right indent" valuePx={selectedStyle.marginRightPx} onChangePx={(value) => updateDocumentSettings(prev => ({
                                  ...prev,
                                  blockStyles: {
                                    ...prev.blockStyles,
                                    [selectedStyleType]: { ...prev.blockStyles[selectedStyleType], marginRightPx: value },
                                  },
                                }))} />
                                <div className="script-page-style-field-span">
                                  <CompactInchField icon="1" label="First-line indent" valuePx={selectedStyle.firstLineIndentPx} onChangePx={(value) => updateDocumentSettings(prev => ({
                                    ...prev,
                                    blockStyles: {
                                      ...prev.blockStyles,
                                      [selectedStyleType]: { ...prev.blockStyles[selectedStyleType], firstLineIndentPx: value },
                                    },
                                  }))} />
                                </div>
                              </div>
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}
              </section>
            ))}

            <section className="ss-module script-inspector-section">
              <div className="ss-module-header script-inspector-header" style={{ width: '100%', textAlign: 'left', fontSize: 12, fontWeight: 700 }}>
                Imported Scripts
              </div>
              <div style={{ padding: 10 }}>
                {importedScripts.length === 0 && <div style={{ fontSize: 11, color: '#64748b', marginBottom: 8 }}>No imported scripts yet.</div>}
                {importedScripts.map(sc => (
                  <div key={sc.id} style={{ display: 'flex', alignItems: 'center', gap: 6, borderBottom: '1px solid rgba(74,85,104,0.08)', padding: '6px 0' }}>
                    <div style={{ flex: 1, fontSize: 11, color: '#334155', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={sc.filename}>{sc.filename}</div>
                    <button onClick={() => setScriptDeleteConfirm(sc)} style={{ border: 'none', background: 'none', color: '#94a3b8', fontSize: 11, cursor: 'pointer', padding: 0 }}>✕</button>
                  </div>
                ))}
                <button className="ss-btn secondary" onClick={() => setShowImportModal(true)} style={{ width: '100%', marginTop: 8 }}>+ Import Script</button>
              </div>
            </section>
            </div>
          ) : null}
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

      {scriptDeleteConfirm && (
        <div className="modal-overlay" onClick={() => setScriptDeleteConfirm(null)}>
          <div className="modal app-dialog" onClick={e => e.stopPropagation()} style={{ maxWidth: 460 }}>
            <h3 className="dialog-title">Remove imported script?</h3>
            <p className="dialog-description">
              <strong>{scriptDeleteConfirm.filename}</strong> will be removed, including its imported scenes and derived script data in this project.
            </p>
            <p className="dialog-description" style={{ marginBottom: 18 }}>This action cannot be undone.</p>
            <div className="dialog-actions">
              <button className="dialog-button-secondary" onClick={() => setScriptDeleteConfirm(null)}>Cancel</button>
              <button
                className="dialog-button-danger"
                onClick={() => {
                  deleteImportedScript(scriptDeleteConfirm.id)
                  setScriptDeleteConfirm(null)
                }}
              >
                Remove Script
              </button>
            </div>
          </div>
        </div>
      )}

      {showImportModal && <ImportScriptModal isOpen={showImportModal} onClose={() => setShowImportModal(false)} />}
    </>
  )
}
