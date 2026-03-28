import React, { useRef, useEffect, useCallback, useState } from 'react'
import {
  DndContext,
  DragOverlay,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {
  SortableContext,
  rectSortingStrategy,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import useStore from './store'
import Toolbar from './components/Toolbar'
import PageHeader from './components/PageHeader'
import ShotGrid from './components/ShotGrid'
import ShotCard from './components/ShotCard'
import SettingsPanel from './components/SettingsPanel'
import ContextMenu from './components/ContextMenu'
import ExportModal from './components/ExportModal'
import ShotlistTab from './components/ShotlistTab'
import ScheduleTab from './components/ScheduleTab'
import CallsheetTab from './components/CallsheetTab'
import ScenesTab from './components/ScenesTab'
import ScriptTab from './components/ScriptTab'
import CastCrewTab from './components/CastCrewTab'
import ScenePropertiesDialog from './components/ScenePropertiesDialog'
import ShotPropertiesDialog from './components/ShotPropertiesDialog'
import PersonProfileDialog from './components/PersonProfileDialog'
import SceneColorPicker from './components/SceneColorPicker'
import SidebarPane from './components/SidebarPane'
import ConfigureButton from './components/ConfigureButton'
import { SHORTCUT_DEFAULTS, isShortcutMatch } from './shortcuts'
import { resolveEntityTarget, resolvePersonEntityTarget, shouldSuppressEntityOpen } from './utils/entityDialog'

// Cards per page based on column count (2 rows)
const CARDS_PER_PAGE = { 4: 8, 3: 6, 2: 4 }

function chunkArray(arr, size) {
  if (arr.length === 0) return [[]] // always at least one (empty) page
  const pages = []
  for (let i = 0; i < arr.length; i += size) {
    pages.push(arr.slice(i, i + size))
  }
  return pages
}

function hexToRgb(hex) {
  if (typeof hex !== 'string') return null
  const clean = hex.trim().replace('#', '')
  if (!/^[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/.test(clean)) return null
  const full = clean.length === 3
    ? clean.split('').map(ch => ch + ch).join('')
    : clean
  const int = parseInt(full, 16)
  return {
    r: (int >> 16) & 255,
    g: (int >> 8) & 255,
    b: int & 255,
  }
}

function tintFromColor(color, alpha = 0.14) {
  const rgb = hexToRgb(color)
  if (!rgb) return `rgba(74,85,104,${alpha * 0.65})`
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`
}

function getOutlineItemStyle(color, isActive = false) {
  return {
    display: 'block',
    width: '100%',
    textAlign: 'left',
    border: '1px solid',
    borderColor: isActive ? tintFromColor(color, 0.5) : tintFromColor(color, 0.25),
    background: tintFromColor(color, isActive ? 0.18 : 0.1),
    padding: '8px 10px',
    cursor: 'pointer',
    marginBottom: -1,
  }
}

function SortableStoryboardSceneNavItem({
  item,
  isActive,
  onClick,
  onDoubleClick,
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
    isOver,
  } = useSortable({ id: item.id })

  return (
    <button
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      onDoubleClick={onDoubleClick}
      onClick={onClick}
      data-entity-type="scene"
      data-entity-id={item.id}
      style={{
        ...getOutlineItemStyle(item.color, isActive),
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.45 : 1,
        boxShadow: isDragging ? '0 8px 20px rgba(0,0,0,0.18)' : 'none',
        borderTopWidth: isOver && !isDragging ? 2 : 1,
        borderTopColor: isOver && !isDragging ? '#E84040' : undefined,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ width: 10, height: 10, borderRadius: 999, background: item.color, border: '1px solid rgba(0,0,0,0.1)' }} />
        <div style={{ fontSize: 11, fontWeight: 700, color: '#2C2C2C' }}>{item.label}</div>
      </div>
      <div style={{ fontSize: 10, color: '#718096', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.subtitle}</div>
    </button>
  )
}

/** One scene rendered as one or more page-document divs inside a single DnD context */
function SceneSection({
  scene,
  columnCount,
  useDropdowns,
  pageIndexOffset,
  pageRefs,
  pageNavRefs,
  onOpenSceneProperties,
}) {
  const getShotsForScene = useStore(s => s.getShotsForScene)
  const addShot = useStore(s => s.addShot)
  const reorderShots = useStore(s => s.reorderShots)
  const deleteScene = useStore(s => s.deleteScene)
  const scenes = useStore(s => s.scenes)
  const getCanonicalStoryboardSceneMetadata = useStore(s => s.getCanonicalStoryboardSceneMetadata)
  const updateCanonicalStoryboardSceneMetadata = useStore(s => s.updateCanonicalStoryboardSceneMetadata)

  const [activeId, setActiveId] = useState(null)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  const canDelete = scenes.length > 1
  const shotCount = scene.shots ? scene.shots.length : 0

  const handleDeleteClick = () => {
    if (shotCount > 0) {
      setShowDeleteConfirm(true)
    } else {
      deleteScene(scene.id)
    }
  }

  const handleConfirmDelete = () => {
    setShowDeleteConfirm(false)
    deleteScene(scene.id)
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  )

  const shotsWithIds = getShotsForScene(scene.id)
  const canonical = getCanonicalStoryboardSceneMetadata(scene.id)
  const canonicalSceneColor = canonical?.color || scene.color || null
  const cardsPerPage = CARDS_PER_PAGE[columnCount] || 8
  const pages = chunkArray(shotsWithIds, cardsPerPage)
  const allShotIds = shotsWithIds.map(s => s.id)

  const activeShot = activeId ? shotsWithIds.find(s => s.id === activeId) : null

  const handleDragStart = useCallback((event) => {
    setActiveId(event.active.id)
  }, [])

  const handleDragEnd = useCallback((event) => {
    const { active, over } = event
    setActiveId(null)
    if (!over || active.id === over.id) return
    reorderShots(scene.id, active.id, over.id)
  }, [reorderShots, scene.id])

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={allShotIds} strategy={rectSortingStrategy}>
        {pages.map((pageShots, pageIdx) => {
          const globalPageNum = pageIndexOffset + pageIdx + 1
          const isContinuation = pageIdx > 0
          const isLastPage = pageIdx === pages.length - 1
          return (
            <div
              key={`${scene.id}_page_${pageIdx}`}
              id={`${scene.id}__page_${pageIdx}`}
              ref={el => {
                if (!el) return
                pageRefs.current[globalPageNum - 1] = el
                pageNavRefs.current[`${scene.id}__page_${pageIdx}`] = el
              }}
              data-outline-id={`${scene.id}__page_${pageIdx}`}
              className="page-document"
              style={{ borderLeft: `5px solid ${canonicalSceneColor || 'rgba(74,85,104,0.18)'}` }}
            >
              <PageHeader
                scene={scene}
                isContinuation={isContinuation}
                pageNum={pageIdx + 1}
                pageIndex={pageIdx}
                onDoubleClick={() => onOpenSceneProperties(scene.id)}
              />

              <ShotGrid
                sceneId={scene.id}
                shots={pageShots}
                columnCount={columnCount}
                useDropdowns={useDropdowns}
                showAddBtn={isLastPage}
                onAddShot={() => addShot(scene.id)}
              />

              <div className="page-footer">
                <div style={{ position: 'absolute', right: 12, top: 8 }}>
                  <SceneColorPicker
                    value={canonicalSceneColor}
                    size={12}
                    title="Set scene color"
                    onChange={(color) => updateCanonicalStoryboardSceneMetadata(scene.id, { color })}
                  />
                </div>
                {/* Delete scene button — lower-left of footer, first page only, subtle trash icon */}
                {!isContinuation && canDelete && (
                  <button
                    className="scene-delete-btn"
                    onClick={handleDeleteClick}
                    title="Delete scene"
                    style={{ position: 'absolute', left: 12 }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="3 6 5 6 21 6"></polyline>
                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"></path>
                      <line x1="10" y1="11" x2="10" y2="17"></line>
                      <line x1="14" y1="11" x2="14" y2="17"></line>
                    </svg>
                  </button>
                )}
                {globalPageNum}
              </div>
            </div>
          )
        })}
      </SortableContext>

      {/* Confirmation dialog — shown when deleting a scene that has shots */}
      {showDeleteConfirm && (
        <div className="modal-overlay" style={{ zIndex: 500 }} onClick={() => setShowDeleteConfirm(false)}>
          <div className="modal app-dialog" onClick={e => e.stopPropagation()} style={{ maxWidth: 420 }}>
            <p className="dialog-title" style={{ marginBottom: 8, fontSize: 20 }}>
              Delete scene?
            </p>
            <p style={{ marginBottom: 6, fontSize: 13, color: '#333' }}>
              <strong>{scene.sceneLabel}</strong> — {scene.location}
            </p>
            <p style={{ marginBottom: 16, fontSize: 13, color: '#666' }}>
              This will permanently delete the scene and all{' '}
              <strong>{shotCount} shot{shotCount !== 1 ? 's' : ''}</strong> within it.
              This cannot be undone.
            </p>
            {shotCount > 0 && (
              <p style={{ marginBottom: 16, fontSize: 12, color: '#ef4444', background: '#fef2f2', padding: '8px 10px', borderRadius: 4 }}>
                {shotCount} shot{shotCount !== 1 ? 's' : ''} will be lost, including any schedule blocks referencing {shotCount !== 1 ? 'them' : 'it'}.
              </p>
            )}
            <div className="dialog-actions">
              <button
                className="dialog-button-secondary"
                onClick={() => setShowDeleteConfirm(false)}
              >
                Cancel
              </button>
              <button
                className="dialog-button-danger"
                onClick={handleConfirmDelete}
              >
                Delete Scene
              </button>
            </div>
            </div>
        </div>
      )}

      <DragOverlay>
        {activeShot ? (
          <div className="drag-overlay">
            <ShotCard
              shot={activeShot}
              displayId={activeShot.displayId}
              useDropdowns={useDropdowns}
              sceneId={scene.id}
            />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}

export default function App() {
  const theme = useStore(s => s.theme)
  const scenes = useStore(s => s.scenes)
  const columnCount = useStore(s => s.columnCount)
  const useDropdowns = useStore(s => s.useDropdowns)
  const autoSave = useStore(s => s.autoSave)
  const getProjectData = useStore(s => s.getProjectData)
  const hideContextMenu = useStore(s => s.hideContextMenu)
  const showPersonContextMenu = useStore(s => s.showPersonContextMenu)
  const openPersonDialog = useStore(s => s.openPersonDialog)
  const closePersonDialog = useStore(s => s.closePersonDialog)
  const personDialog = useStore(s => s.personDialog)
  const castRoster = useStore(s => s.castRoster)
  const crewRoster = useStore(s => s.crewRoster)
  const addScene = useStore(s => s.addScene)
  const activeTab = useStore(s => s.activeTab)
  const setActiveTab = useStore(s => s.setActiveTab)
  const storyboardViewState = useStore(s => s.tabViewState?.storyboard || {})
  const callsheetViewState = useStore(s => s.tabViewState?.callsheet || {})
  const setTabViewState = useStore(s => s.setTabViewState)
  const documentSession = useStore(s => s.documentSession)
  const scriptScenes = useStore(s => s.scriptScenes)
  const openScenePropertiesDialog = useStore(s => s.openScenePropertiesDialog)
  const openSceneDialog = useStore(s => s.openSceneDialog)
  const openShotDialog = useStore(s => s.openShotDialog)
  const getCanonicalStoryboardSceneMetadata = useStore(s => s.getCanonicalStoryboardSceneMetadata)
  const getStoryboardScenes = useStore(s => s.getStoryboardScenes)
  const reorderStoryboardScenes = useStore(s => s.reorderStoryboardScenes)

  const projectName = useStore(s => s.projectName)
  const shortcutBindings = useStore(s => s.shortcutBindings)
  const executeCommand = useStore(s => s.executeCommand)
  const [exportModalOpen, setExportModalOpen] = useState(false)
  // Autosave restore — kept as React state so we never call window.confirm()
  // (native OS dialogs steal focus from the webContents; after dismissal
  // Electron does not automatically return input focus, reproducing the
  // first-click-doesn't-work bug on every launch where autosave data exists).
  const [restorePrompt, setRestorePrompt] = useState(null) // { data, timeStr, totalShots }
  // When set, overrides activeTab in the export modal (e.g. explicit pick from toolbar dropdown).
  const [forcedExportTab, setForcedExportTab] = useState(null)
  const [showStoryboardOutline, setShowStoryboardOutline] = useState(storyboardViewState.showOutline ?? true)
  const [storyboardConfigOpen, setStoryboardConfigOpen] = useState(false)
  const [scenesConfigOpen, setScenesConfigOpen] = useState(false)
  const [shotlistConfigOpen, setShotlistConfigOpen] = useState(false)
  const [scheduleConfigOpen, setScheduleConfigOpen] = useState(false)
  const [callsheetConfigOpen, setCallsheetConfigOpen] = useState(callsheetViewState.sidebarExpanded ?? true)
  const [storyboardOutlineTab, setStoryboardOutlineTab] = useState(storyboardViewState.outlineTab || 'Scenes')
  const [activeOutlineItem, setActiveOutlineItem] = useState(storyboardViewState.activeItem || null)
  const [activeOutlineDragId, setActiveOutlineDragId] = useState(null)
  const storyboardScrollRef = useRef(null)
  // pageRefs is a flat array of all storyboard page-document elements
  const pageRefs = useRef([])
  const storyboardSceneRefs = useRef({})
  const storyboardPageRefs = useRef({})
  // shotlistRef points to the ShotlistTab root container for PDF export
  const shotlistRef = useRef(null)

  // Reset refs array size on render so stale refs don't linger
  const storyboardScenes = getStoryboardScenes()
  const outlineSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  )

  const totalPages = storyboardScenes.reduce((acc, scene) => {
    const cardsPerPage = CARDS_PER_PAGE[columnCount] || 8
    return acc + Math.max(1, Math.ceil(scene.shots.length / cardsPerPage))
  }, 0)
  pageRefs.current = pageRefs.current.slice(0, totalPages)

  useEffect(() => {
    const validSceneIds = new Set(scenes.map(scene => scene.id))
    Object.keys(storyboardSceneRefs.current).forEach((key) => {
      if (key.startsWith('script-')) return
      if (!validSceneIds.has(key)) delete storyboardSceneRefs.current[key]
    })
    Object.keys(storyboardPageRefs.current).forEach((key) => {
      const sceneId = key.split('__page_')[0]
      if (!validSceneIds.has(sceneId)) delete storyboardPageRefs.current[key]
    })
  }, [scenes])

  // Global keyboard shortcuts (rebindable via Settings)
  useEffect(() => {
    const handler = (e) => {
      if (e.defaultPrevented || e.repeat) return
      const entries = Object.entries(shortcutBindings || SHORTCUT_DEFAULTS)
      const match = entries.find(([, binding]) => isShortcutMatch(binding, e))
      if (!match) return

      const [actionId] = match
      if (!actionId) return

      e.preventDefault()
      e.stopPropagation()
      executeCommand(actionId)
    }

    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [executeCommand, shortcutBindings])

  // Auto-save every 60 seconds
  useEffect(() => {
    if (!autoSave) return
    const interval = setInterval(() => {
      try {
        const data = getProjectData()
        localStorage.setItem('autosave', JSON.stringify(data))
        localStorage.setItem('autosave_time', new Date().toISOString())
      } catch {
        // Silently skip — the user will see an error on the next manual save.
      }
    }, 60000)
    return () => clearInterval(interval)
  }, [autoSave, getProjectData])

  // Restore from autosave on first load if no shots.
  // We set React state instead of calling window.confirm() so the dialog stays
  // inside the renderer — native dialogs steal OS focus from the webContents
  // and Electron does not restore it on dismissal, which breaks the first click.
  useEffect(() => {
    const hasShots = useStore.getState().scenes.some(s => s.shots.length > 0)
    if (!hasShots) {
      try {
        const saved = localStorage.getItem('autosave')
        if (saved) {
          const data = JSON.parse(saved)
          const totalShots = (data.scenes || [{ shots: data.shots || [] }])
            .reduce((a, s) => a + (s.shots || []).length, 0)
          if (totalShots > 0) {
            const savedTime = localStorage.getItem('autosave_time')
            const timeStr = savedTime ? new Date(savedTime).toLocaleString() : 'recently'
            setRestorePrompt({ data, timeStr, totalShots })
          }
        }
      } catch {
        // Ignore malformed or unavailable localStorage (SecurityError/file://).
      }
    }
  }, []) // eslint-disable-line

  const isDark = theme === 'dark'

  // Compute page offset for each scene (for global page numbering)
  const scenePageOffsets = []
  let runningOffset = 0
  for (const scene of storyboardScenes) {
    scenePageOffsets.push(runningOffset)
    const cardsPerPage = CARDS_PER_PAGE[columnCount] || 8
    runningOffset += Math.max(1, Math.ceil(scene.shots.length / cardsPerPage))
  }

  const sceneNavItems = storyboardScenes.map(scene => {
    const linkedScene = scene.linkedScriptSceneId
      ? scriptScenes.find(sc => sc.id === scene.linkedScriptSceneId)
      : null
    const canonical = getCanonicalStoryboardSceneMetadata(scene.id)
    const label = canonical?.sceneNumber
      ? `SC ${canonical.sceneNumber}`
      : (scene.sceneLabel || 'SCENE')
    const subtitle = canonical?.titleSlugline
      || canonical?.location
      || ''
    return {
      id: scene.id,
      label,
      subtitle,
      linkedSceneId: linkedScene?.id || null,
      color: canonical?.color || scene.color || linkedScene?.color || '#94a3b8',
    }
  })

  const jumpToStoryboardScene = (sceneId) => {
    const node = storyboardSceneRefs.current[sceneId]
      || document.getElementById(sceneId)
      || document.querySelector(`[data-outline-id="${sceneId}"]`)
    if (node) {
      node.scrollIntoView({ behavior: 'smooth', block: 'start' })
      setActiveOutlineItem(sceneId)
    }
  }

  const jumpToStoryboardPage = useCallback((pageId) => {
    const node = storyboardPageRefs.current[pageId] || document.getElementById(pageId)
    if (node) {
      node.scrollIntoView({ behavior: 'smooth', block: 'start' })
      setActiveOutlineItem(pageId)
    }
  }, [])

  useEffect(() => {
    setTabViewState('storyboard', {
      showOutline: showStoryboardOutline,
      outlineTab: storyboardOutlineTab,
      activeItem: activeOutlineItem,
    })
  }, [showStoryboardOutline, storyboardOutlineTab, activeOutlineItem, setTabViewState])

  useEffect(() => {
    setShowStoryboardOutline(storyboardViewState.showOutline ?? true)
    setStoryboardOutlineTab(storyboardViewState.outlineTab || 'Scenes')
    setActiveOutlineItem(storyboardViewState.activeItem || null)
  }, [documentSession]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (activeTab !== 'storyboard') return
    const node = storyboardScrollRef.current
    if (!node) return
    const savedTop = storyboardViewState.scrollTop
    if (typeof savedTop === 'number') {
      requestAnimationFrame(() => {
        node.scrollTop = savedTop
      })
    }
  }, [activeTab, storyboardViewState.scrollTop])

  useEffect(() => {
    if (activeTab !== 'storyboard') return
    const root = storyboardScrollRef.current
    if (!root) return

    const observer = new IntersectionObserver((entries) => {
      const visible = entries
        .filter(entry => entry.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio)

      if (!visible.length) return
      const best = visible[0].target
      const id = best.getAttribute('data-outline-id')
      if (id) setActiveOutlineItem(id)
    }, { root, threshold: [0.3, 0.5, 0.7] })

    if (storyboardOutlineTab === 'Scenes') {
      Object.entries(storyboardSceneRefs.current).forEach(([key, node]) => {
        if (!node || key.startsWith('script-')) return
        observer.observe(node)
      })
    } else {
      Object.values(storyboardPageRefs.current).forEach((node) => {
        if (!node) return
        observer.observe(node)
      })
    }

    return () => observer.disconnect()
  }, [activeTab, storyboardOutlineTab, storyboardScenes, columnCount])

  const storyboardPageItems = storyboardScenes.flatMap((scene, sceneIdx) => {
    const linkedScene = scene.linkedScriptSceneId
      ? scriptScenes.find(sc => sc.id === scene.linkedScriptSceneId)
      : null
    const canonical = getCanonicalStoryboardSceneMetadata(scene.id)
    const cardsPerPage = CARDS_PER_PAGE[columnCount] || 8
    const count = Math.max(1, Math.ceil(scene.shots.length / cardsPerPage))
    return Array.from({ length: count }).map((_, pageIdx) => ({
      id: `${scene.id}__page_${pageIdx}`,
      label: `Page ${scenePageOffsets[sceneIdx] + pageIdx + 1}`,
      subtitle: `SC ${canonical?.sceneNumber || scene.sceneLabel || `Scene ${sceneIdx + 1}`} · ${canonical?.titleSlugline || canonical?.location || scene.slugline || scene.location || ''}`,
      sceneColor: canonical?.color || scene.color || linkedScene?.color || '#94a3b8',
    }))
  })

  const handleOutlineSceneDragStart = useCallback((event) => {
    setActiveOutlineDragId(event.active?.id || null)
  }, [])

  const handleOutlineSceneDragEnd = useCallback((event) => {
    const activeId = event.active?.id
    const overId = event.over?.id
    setActiveOutlineDragId(null)
    if (!activeId || !overId || activeId === overId) return
    reorderStoryboardScenes(activeId, overId)
  }, [reorderStoryboardScenes])

  const activeOutlineDragItem = activeOutlineDragId
    ? sceneNavItems.find(item => item.id === activeOutlineDragId) || null
    : null

  const configureHandlers = {
    storyboard: {
      isActive: storyboardConfigOpen,
      onToggle: () => setStoryboardConfigOpen(o => !o),
    },
    scenes: {
      isActive: scenesConfigOpen,
      onToggle: () => setScenesConfigOpen(o => !o),
    },
    shotlist: {
      isActive: shotlistConfigOpen,
      onToggle: () => setShotlistConfigOpen(o => !o),
    },
    schedule: {
      isActive: scheduleConfigOpen,
      onToggle: () => setScheduleConfigOpen(o => !o),
    },
    script: { isActive: false, onToggle: () => {} },
    castcrew: { isActive: false, onToggle: () => {} },
    callsheet: {
      isActive: callsheetConfigOpen,
      onToggle: () => setCallsheetConfigOpen(o => !o),
    },
  }
  const activeConfigure = configureHandlers[activeTab] || configureHandlers.script

  const handleEntityDoubleClickCapture = useCallback((event) => {
    const target = event.target
    if (shouldSuppressEntityOpen(target)) return
    const person = resolvePersonEntityTarget(target)
    if (person) {
      openPersonDialog(person.personType, person.personId)
      return
    }
    const entity = resolveEntityTarget(target)
    if (!entity) return
    if (entity.entityType === 'scene') {
      openSceneDialog(entity.entityId)
      return
    }
    if (entity.entityType === 'shot') {
      openShotDialog(entity.entityId)
    }
  }, [openPersonDialog, openSceneDialog, openShotDialog])

  const handleEntityContextMenuCapture = useCallback((event) => {
    const target = event.target
    if (shouldSuppressEntityOpen(target)) return
    const person = resolvePersonEntityTarget(target)
    if (!person) return
    event.preventDefault()
    event.stopPropagation()
    showPersonContextMenu(person.personType, person.personId, event.clientX, event.clientY)
  }, [showPersonContextMenu])

  return (
    <div
      className="flex flex-col"
      style={{ height: '100vh', overflow: 'hidden', backgroundColor: '#F5F2EC' }}
      onClick={() => hideContextMenu()}
      onDoubleClickCapture={handleEntityDoubleClickCapture}
      onContextMenuCapture={handleEntityContextMenuCapture}
    >
      {/* Toolbar */}
      <Toolbar
        onExportPDF={(tab) => {
          setForcedExportTab(tab ?? null)
          setExportModalOpen(true)
        }}
        onExportPNG={() => {
          setForcedExportTab(null)
          setExportModalOpen(true)
        }}
      />

      {/* Top-level tab navigation — sticky, never scrolls out of view */}
      <div className="tab-nav" style={{
        display: 'flex',
        flexShrink: 0,
        alignItems: 'center',
        borderBottom: '1px solid #3A3A3C',
        backgroundColor: '#1C1C1E',
        paddingLeft: '16px',
        paddingRight: '16px',
      }}>
        {[
          { id: 'script',     label: 'Script' },
          { id: 'scenes',     label: 'Scenes' },
          { id: 'storyboard', label: 'Storyboard' },
          { id: 'shotlist',   label: 'Shotlist' },
          { id: 'castcrew',   label: 'Cast/Crew' },
          { id: 'schedule',   label: 'Schedule' },
          { id: 'callsheet',  label: 'Callsheet' },
        ].map(({ id, label }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            style={{
              padding: '8px 20px',
              fontFamily: 'Sora, sans-serif',
              fontSize: '12px',
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              border: 'none',
              borderBottom: activeTab === id
                ? '2px solid #E84040'
                : '2px solid transparent',
              background: 'none',
              color: activeTab === id ? '#FAF8F4' : '#718096',
              cursor: 'pointer',
              transition: 'color 0.15s, border-color 0.15s',
              marginBottom: '-1px',
            }}
            onMouseEnter={e => { if (activeTab !== id) e.currentTarget.style.color = 'rgba(250,248,244,0.8)' }}
            onMouseLeave={e => { if (activeTab !== id) e.currentTarget.style.color = '#718096' }}
          >
            {label}
          </button>
        ))}
        <div style={{ marginLeft: 'auto', position: 'relative' }}>
          <ConfigureButton onClick={activeConfigure.onToggle} active={activeConfigure.isActive} />
          {activeTab === 'storyboard' && storyboardConfigOpen && (
            <div style={{ position: 'absolute', right: 0, top: 'calc(100% + 6px)', background: '#FAF8F4', border: '1px solid rgba(74,85,104,0.2)', borderRadius: 6, padding: 10, minWidth: 220, boxShadow: '0 6px 20px rgba(0,0,0,0.15)', zIndex: 80 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#4A5568' }}>
                <input
                  type="checkbox"
                  checked={showStoryboardOutline}
                  onChange={(e) => setShowStoryboardOutline(e.target.checked)}
                />
                Show Storyboard Outline
              </label>
            </div>
          )}
        </div>
      </div>

      {/* Main content */}
      {activeTab === 'storyboard' ? (
        <div
          ref={storyboardScrollRef}
          className="flex-1 py-4 px-4 overflow-auto canvas-texture"
          onScroll={(e) => setTabViewState('storyboard', { scrollTop: e.currentTarget.scrollTop })}
        >
          <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
            {showStoryboardOutline && (
              <div style={{ width: 260, position: 'sticky', top: 0, alignSelf: 'flex-start', height: 'calc(100vh - 128px)', maxHeight: 'calc(100vh - 128px)', display: 'flex' }}>
                <SidebarPane
                  width={260}
                  controls={(
                    <div style={{ display: 'flex', gap: 6 }}>
                      {['Scenes', 'Pages'].map(tab => (
                        <button key={tab} onClick={() => setStoryboardOutlineTab(tab)} style={{ border: '1px solid rgba(74,85,104,0.2)', borderRadius: 999, padding: '3px 10px', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', background: storyboardOutlineTab === tab ? '#2C2C2E' : 'transparent', color: storyboardOutlineTab === tab ? '#FAF8F4' : '#4A5568' }}>{tab}</button>
                      ))}
                    </div>
                  )}
                >
                  {storyboardOutlineTab === 'Scenes' ? (
                    <DndContext
                      sensors={outlineSensors}
                      collisionDetection={closestCenter}
                      onDragStart={handleOutlineSceneDragStart}
                      onDragEnd={handleOutlineSceneDragEnd}
                      onDragCancel={() => setActiveOutlineDragId(null)}
                    >
                      <SortableContext items={sceneNavItems.map(item => item.id)} strategy={verticalListSortingStrategy}>
                        {sceneNavItems.map(item => (
                          <SortableStoryboardSceneNavItem
                            key={item.id}
                            item={item}
                            isActive={activeOutlineItem === item.id}
                            onDoubleClick={() => openScenePropertiesDialog('storyboard', item.id)}
                            onClick={() => jumpToStoryboardScene(item.id)}
                          />
                        ))}
                      </SortableContext>
                      <DragOverlay>
                        {activeOutlineDragItem ? (
                          <div style={{ width: 240 }}>
                            <div style={{ ...getOutlineItemStyle(activeOutlineDragItem.color, true), boxShadow: '0 10px 24px rgba(0,0,0,0.2)' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <span style={{ width: 10, height: 10, borderRadius: 999, background: activeOutlineDragItem.color }} />
                                <div style={{ fontSize: 11, fontWeight: 700, color: '#2C2C2C' }}>{activeOutlineDragItem.label}</div>
                              </div>
                              <div style={{ fontSize: 10, color: '#718096', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{activeOutlineDragItem.subtitle}</div>
                            </div>
                          </div>
                        ) : null}
                      </DragOverlay>
                    </DndContext>
                  ) : storyboardPageItems.map(item => (
                  <button key={item.id} onClick={() => jumpToStoryboardPage(item.id)} style={getOutlineItemStyle(item.sceneColor, activeOutlineItem === item.id)}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 8, height: 8, borderRadius: 999, background: item.sceneColor }} /><div style={{ fontSize: 11, fontWeight: 700, color: '#2C2C2C' }}>{item.label}</div></div>
                    <div style={{ fontSize: 10, color: '#718096', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.subtitle}</div>
                  </button>
                ))}
                </SidebarPane>
              </div>
            )}
            <div className="pages-container" style={{ flex: 1 }}>
              {storyboardScenes.map((scene, sceneIdx) => (
                <div
                  key={scene.id}
                  ref={el => {
                    if (el) {
                      storyboardSceneRefs.current[scene.id] = el
                      if (scene.linkedScriptSceneId) {
                        storyboardSceneRefs.current[`script-${scene.linkedScriptSceneId}`] = el
                      }
                    }
                  }}
                  id={scene.id}
                  data-outline-id={scene.id}
                  data-entity-type="scene"
                  data-entity-id={scene.id}
                >
                  {/* Scene separator (between scenes) */}
                  {sceneIdx > 0 && (
                    <div className="scene-separator">
                      <span className="scene-separator-label">NEW PAGE</span>
                    </div>
                  )}

                  <SceneSection
                    scene={scene}
                    columnCount={columnCount}
                    useDropdowns={useDropdowns}
                    pageIndexOffset={scenePageOffsets[sceneIdx]}
                    pageRefs={pageRefs}
                    pageNavRefs={storyboardPageRefs}
                    onOpenSceneProperties={(sceneId) => openScenePropertiesDialog('storyboard', sceneId)}
                  />
                </div>
              ))}

            {/* Add Page button */}
            <div className="add-scene-row">
              <button
                className="add-scene-btn"
                onClick={() => addScene()}
                title="Add a new page"
              >
                <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="10" cy="10" r="8" />
                  <line x1="10" y1="6" x2="10" y2="14" />
                  <line x1="6" y1="10" x2="14" y2="10" />
                </svg>
                Add Page
              </button>
            </div>
            </div>
          </div>
        </div>
      ) : activeTab === 'shotlist' ? (
        <div className="flex-1 flex flex-col overflow-auto canvas-texture">
          <ShotlistTab
            key={`shotlist-${documentSession}`}
            containerRef={shotlistRef}
            configureOpen={shotlistConfigOpen}
            onConfigureOpenChange={setShotlistConfigOpen}
          />
        </div>
      ) : activeTab === 'scenes' ? (
        <div className="flex-1 overflow-hidden canvas-texture">
          <ScenesTab
            key={`scenes-${documentSession}`}
            configureOpen={scenesConfigOpen}
            onConfigureOpenChange={setScenesConfigOpen}
          />
        </div>
      ) : activeTab === 'script' ? (
        <div className="flex-1 overflow-hidden canvas-texture">
          <ScriptTab key={`script-${documentSession}`} />
        </div>
      ) : activeTab === 'schedule' ? (
        <div className="flex-1 overflow-y-auto canvas-texture">
          <ScheduleTab
            key={`schedule-${documentSession}`}
            configureOpen={scheduleConfigOpen}
            onConfigureOpenChange={setScheduleConfigOpen}
          />
        </div>
      ) : activeTab === 'callsheet' ? (
        <div className="flex-1 flex flex-col overflow-hidden canvas-texture">
          <CallsheetTab
            key={`callsheet-${documentSession}`}
            configureOpen={callsheetConfigOpen}
          />
        </div>
      ) : activeTab === 'castcrew' ? (
        <div className="flex-1 overflow-hidden canvas-texture">
          <CastCrewTab key={`castcrew-${documentSession}`} />
        </div>
      ) : null}

      {/* Settings Panel */}
      <SettingsPanel />

      {/* Context Menu */}
      <ContextMenu />
      <ScenePropertiesDialog />
      <ShotPropertiesDialog />
      {personDialog && (
        <PersonProfileDialog
          personType={personDialog.type}
          person={personDialog.id ? (personDialog.type === 'cast' ? castRoster : crewRoster).find(entry => entry.id === personDialog.id) : null}
          onClose={closePersonDialog}
        />
      )}

      {/* Export Modal */}
      <ExportModal
        isOpen={exportModalOpen}
        onClose={() => { setExportModalOpen(false); setForcedExportTab(null) }}
        pageRefs={pageRefs}
        shotlistRef={shotlistRef}
        activeTab={forcedExportTab ?? activeTab}
        projectName={projectName}
      />

      {/* Autosave restore prompt — in-app dialog so focus never leaves the webContents */}
      {restorePrompt && (
        <div className="modal-overlay" style={{ zIndex: 500 }} onClick={() => setRestorePrompt(null)}>
          <div className="modal app-dialog" onClick={e => e.stopPropagation()} style={{ maxWidth: 400 }}>
            <p style={{ marginBottom: 8, fontFamily: 'monospace', fontSize: 13 }}>
              Restore auto-saved project?
            </p>
            <p style={{ marginBottom: 16, fontSize: 12, color: '#666' }}>
              Saved {restorePrompt.timeStr} &mdash; {restorePrompt.totalShots} shot{restorePrompt.totalShots !== 1 ? 's' : ''}
            </p>
            <div className="dialog-actions">
              <button
                className="dialog-button-secondary"
                onClick={() => setRestorePrompt(null)}
              >
                Discard
              </button>
              <button
                className="dialog-button-primary"
                onClick={() => {
                  useStore.getState().loadProject(restorePrompt.data)
                  setRestorePrompt(null)
                }}
              >
                Restore
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
