import React, { useRef, useEffect, useCallback, useState } from 'react'
import {
  DndContext,
  DragOverlay,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import { SortableContext, rectSortingStrategy } from '@dnd-kit/sortable'
import useStore from './store'
import Toolbar from './components/Toolbar'
import PageHeader from './components/PageHeader'
import ShotGrid from './components/ShotGrid'
import ShotCard from './components/ShotCard'
import SettingsPanel from './components/SettingsPanel'
import ContextMenu from './components/ContextMenu'
import ExportModal from './components/ExportModal'
import RecentProjects from './components/RecentProjects'
import ShotlistTab from './components/ShotlistTab'
import ScheduleTab from './components/ScheduleTab'

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

/** One scene rendered as one or more page-document divs inside a single DnD context */
function SceneSection({
  scene,
  columnCount,
  useDropdowns,
  pageIndexOffset,
  pageRefs,
}) {
  const getShotsForScene = useStore(s => s.getShotsForScene)
  const addShot = useStore(s => s.addShot)
  const reorderShots = useStore(s => s.reorderShots)

  const [activeId, setActiveId] = useState(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  )

  const shotsWithIds = getShotsForScene(scene.id)
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
              ref={el => { if (el) pageRefs.current[globalPageNum - 1] = el }}
              className="page-document"
            >
              <PageHeader
                scene={scene}
                isContinuation={isContinuation}
                pageNum={pageIdx + 1}
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
                {globalPageNum}
              </div>
            </div>
          )
        })}
      </SortableContext>

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
  const addScene = useStore(s => s.addScene)
  const activeTab = useStore(s => s.activeTab)
  const setActiveTab = useStore(s => s.setActiveTab)

  const projectName = useStore(s => s.projectName)
  const [exportModalOpen, setExportModalOpen] = useState(false)
  // Autosave restore — kept as React state so we never call window.confirm()
  // (native OS dialogs steal focus from the webContents; after dismissal
  // Electron does not automatically return input focus, reproducing the
  // first-click-doesn't-work bug on every launch where autosave data exists).
  const [restorePrompt, setRestorePrompt] = useState(null) // { data, timeStr, totalShots }
  // When set, overrides activeTab in the export modal (e.g. explicit pick from toolbar dropdown).
  const [forcedExportTab, setForcedExportTab] = useState(null)
  // pageRefs is a flat array of all storyboard page-document elements
  const pageRefs = useRef([])
  // shotlistRef points to the ShotlistTab root container for PDF export
  const shotlistRef = useRef(null)

  // Reset refs array size on render so stale refs don't linger
  const totalPages = scenes.reduce((acc, scene) => {
    const cardsPerPage = CARDS_PER_PAGE[columnCount] || 8
    return acc + Math.max(1, Math.ceil(scene.shots.length / cardsPerPage))
  }, 0)
  pageRefs.current = pageRefs.current.slice(0, totalPages)

  // Auto-save every 60 seconds
  useEffect(() => {
    if (!autoSave) return
    const interval = setInterval(() => {
      const data = getProjectData()
      localStorage.setItem('autosave', JSON.stringify(data))
      localStorage.setItem('autosave_time', new Date().toISOString())
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
      const saved = localStorage.getItem('autosave')
      if (saved) {
        try {
          const data = JSON.parse(saved)
          const totalShots = (data.scenes || [{ shots: data.shots || [] }])
            .reduce((a, s) => a + (s.shots || []).length, 0)
          if (totalShots > 0) {
            const savedTime = localStorage.getItem('autosave_time')
            const timeStr = savedTime ? new Date(savedTime).toLocaleString() : 'recently'
            setRestorePrompt({ data, timeStr, totalShots })
          }
        } catch {
          // ignore
        }
      }
    }
  }, []) // eslint-disable-line

  const isDark = theme === 'dark'

  // Compute page offset for each scene (for global page numbering)
  const scenePageOffsets = []
  let runningOffset = 0
  for (const scene of scenes) {
    scenePageOffsets.push(runningOffset)
    const cardsPerPage = CARDS_PER_PAGE[columnCount] || 8
    runningOffset += Math.max(1, Math.ceil(scene.shots.length / cardsPerPage))
  }

  return (
    <div
      className="flex flex-col"
      style={{ height: '100vh', overflow: 'hidden', backgroundColor: isDark ? '#1a1a1a' : '#e8e4db' }}
      onClick={() => hideContextMenu()}
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

      {/* Recent Projects bar */}
      <RecentProjects />

      {/* Top-level tab navigation — sticky, never scrolls out of view */}
      <div className="tab-nav" style={{
        display: 'flex',
        flexShrink: 0,
        borderBottom: isDark ? '1px solid #333' : '1px solid #ccc',
        backgroundColor: isDark ? '#111' : '#d4cfc6',
        paddingLeft: '16px',
      }}>
        {[
          { id: 'storyboard', label: 'Storyboard' },
          { id: 'shotlist',   label: 'Shotlist' },
          { id: 'schedule',   label: 'Schedule' },
        ].map(({ id, label }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            style={{
              padding: '8px 20px',
              fontFamily: 'monospace',
              fontSize: '12px',
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              border: 'none',
              borderBottom: activeTab === id
                ? (isDark ? '2px solid #fff' : '2px solid #222')
                : '2px solid transparent',
              background: 'none',
              color: activeTab === id
                ? (isDark ? '#fff' : '#222')
                : (isDark ? '#666' : '#888'),
              cursor: 'pointer',
              transition: 'color 0.15s, border-color 0.15s',
              marginBottom: '-1px',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Main content */}
      {activeTab === 'storyboard' ? (
        <div className="flex-1 py-6 px-4 overflow-auto">
          <div className="pages-container">
            {scenes.map((scene, sceneIdx) => (
              <React.Fragment key={scene.id}>
                {/* Scene separator (between scenes) */}
                {sceneIdx > 0 && (
                  <div className="scene-separator">
                    <span className="scene-separator-label">NEW SCENE</span>
                  </div>
                )}

                <SceneSection
                  scene={scene}
                  columnCount={columnCount}
                  useDropdowns={useDropdowns}
                  pageIndexOffset={scenePageOffsets[sceneIdx]}
                  pageRefs={pageRefs}
                />
              </React.Fragment>
            ))}

            {/* Add Scene button */}
            <div className="add-scene-row">
              <button
                className="add-scene-btn"
                onClick={addScene}
                title="Add a new scene (new page)"
              >
                <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="10" cy="10" r="8" />
                  <line x1="10" y1="6" x2="10" y2="14" />
                  <line x1="6" y1="10" x2="14" y2="10" />
                </svg>
                Add Scene
              </button>
            </div>
          </div>
        </div>
      ) : activeTab === 'shotlist' ? (
        <div className="flex-1 flex flex-col overflow-auto">
          <ShotlistTab containerRef={shotlistRef} />
        </div>
      ) : (
        <div className="flex-1 flex flex-col overflow-auto" style={{ backgroundColor: isDark ? '#1a1a1a' : '#f0ede4' }}>
          <ScheduleTab />
        </div>
      )}

      {/* Settings Panel */}
      <SettingsPanel />

      {/* Context Menu */}
      <ContextMenu />

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
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 400 }}>
            <p style={{ marginBottom: 8, fontFamily: 'monospace', fontSize: 13 }}>
              Restore auto-saved project?
            </p>
            <p style={{ marginBottom: 16, fontSize: 12, color: '#666' }}>
              Saved {restorePrompt.timeStr} &mdash; {restorePrompt.totalShots} shot{restorePrompt.totalShots !== 1 ? 's' : ''}
            </p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setRestorePrompt(null)}
                style={{ padding: '6px 16px', cursor: 'pointer', fontFamily: 'monospace', fontSize: 12 }}
              >
                Discard
              </button>
              <button
                onClick={() => {
                  useStore.getState().loadProject(restorePrompt.data)
                  setRestorePrompt(null)
                }}
                style={{ padding: '6px 16px', cursor: 'pointer', fontFamily: 'monospace', fontSize: 12, fontWeight: 700 }}
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
