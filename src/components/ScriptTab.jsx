import React, { useCallback, useMemo, useRef, useState } from 'react'
import useStore from '../store'
import SidebarPane from './SidebarPane'
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

const PX_PER_INCH = 96
const PAGE_GAP_PX = 24
const SCREENPLAY_CHAR_WIDTH_RATIO = 0.6
const RULER_HEIGHT_PX = 34
const BLOCK_VERTICAL_PADDING = 2

function inchesToPx(value) {
  return Math.round((Number(value) || 0) * PX_PER_INCH)
}

function pxToInches(value) {
  return Number((Number(value || 0) / PX_PER_INCH).toFixed(2))
}

function sceneHeader(scene) {
  return scene.slugline || scene.location || `Scene ${scene.sceneNumber || ''}`.trim()
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

function renderHighlightedText(text, baseStart, links, onOpenShot) {
  if (!links.length) return text || ' '

  const safeText = String(text || '')
  const segments = []
  let cursor = 0
  const endOffset = baseStart + safeText.length

  links.forEach(link => {
    const overlapStart = Math.max(baseStart, link.start)
    const overlapEnd = Math.min(endOffset, link.end)
    if (overlapEnd <= overlapStart) return

    const localStart = overlapStart - baseStart
    const localEnd = overlapEnd - baseStart

    if (localStart > cursor) {
      segments.push({ type: 'plain', text: safeText.slice(cursor, localStart) })
    }

    segments.push({
      type: 'link',
      shotId: link.shotId,
      color: link.color,
      label: link.label,
      text: safeText.slice(localStart, localEnd),
    })

    cursor = localEnd
  })

  if (cursor < safeText.length) {
    segments.push({ type: 'plain', text: safeText.slice(cursor) })
  }

  if (!segments.length) return safeText || ' '

  return segments.map((segment, index) => {
    if (segment.type === 'plain') return <React.Fragment key={index}>{segment.text}</React.Fragment>
    return (
      <span
        key={index}
        title={`Linked shot ${segment.label} • Double-click to inspect`}
        onDoubleClick={() => onOpenShot(segment.shotId)}
        style={{
          background: `${segment.color}33`,
          borderBottom: `1px solid ${segment.color}`,
          cursor: 'pointer',
        }}
      >
        {segment.text}
      </span>
    )
  })
}

export default function ScriptTab() {
  const scriptScenes = useStore(s => s.scriptScenes)
  const storyboardScenes = useStore(s => s.scenes)
  const scriptSettings = useStore(s => s.scriptSettings)
  const setScriptSettings = useStore(s => s.setScriptSettings)
  const updateScriptSceneScreenplay = useStore(s => s.updateScriptSceneScreenplay)
  const importScriptScenes = useStore(s => s.importScriptScenes)
  const openShotDialog = useStore(s => s.openShotDialog)

  const [view, setView] = useState('write')
  const [activeSceneId, setActiveSceneId] = useState(null)
  const [selectedBlock, setSelectedBlock] = useState(null)
  const [activePanel, setActivePanel] = useState(null)
  const [showImportModal, setShowImportModal] = useState(false)
  const blockRefs = useRef({})

  const orderedScenes = useMemo(() => [...scriptScenes].sort(naturalSortSceneNumber), [scriptScenes])
  const documentSettings = useMemo(
    () => normalizeDocumentSettings(scriptSettings?.documentSettings || DEFAULT_SCRIPT_DOCUMENT_SETTINGS),
    [scriptSettings?.documentSettings],
  )

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

  const shotLinksByScene = useMemo(() => {
    const result = {}
    storyboardScenes.forEach(storyScene => {
      ;(storyScene.shots || []).forEach((shot, idx) => {
        if (!shot.linkedSceneId) return
        const start = Number.isFinite(shot.linkedScriptRangeStart) ? shot.linkedScriptRangeStart : null
        const end = Number.isFinite(shot.linkedScriptRangeEnd) ? shot.linkedScriptRangeEnd : null
        if (start == null || end == null || end <= start) return
        if (!result[shot.linkedSceneId]) result[shot.linkedSceneId] = []
        result[shot.linkedSceneId].push({
          shotId: shot.id,
          start,
          end,
          color: shot.color || '#E84040',
          label: shot.displayId || `${storyScene.sceneNumber || storyScene.id}${String.fromCharCode(65 + idx)}`,
        })
      })
    })

    Object.keys(result).forEach(sceneId => {
      result[sceneId] = result[sceneId].sort((a, b) => a.start - b.start)
    })

    return result
  }, [storyboardScenes])

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

  const focusBlock = useCallback((sceneId, blockId, cursor = 'end') => {
    requestAnimationFrame(() => {
      const key = `${sceneId}:${blockId}`
      const el = blockRefs.current[key]
      if (!el) return
      el.focus()
      const selection = window.getSelection()
      if (!selection) return
      const range = document.createRange()
      range.selectNodeContents(el)
      range.collapse(cursor === 'start')
      selection.removeAllRanges()
      selection.addRange(range)
    })
  }, [])

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
    focusBlock(sceneId, newBlock.id, 'start')
  }, [focusBlock, updateSceneBlocks])

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
      focusBlock(sceneId, previous.id, 'end')
      return updated
    })
  }, [focusBlock, updateSceneBlocks])

  const updateBlockText = useCallback((sceneId, blockId, type, text) => {
    const normalizedText = normalizeTextForStore(text, type)
    updateSceneBlocks(sceneId, blocks => blocks.map(block => (block.id === blockId ? { ...block, text: normalizedText } : block)))
  }, [updateSceneBlocks])

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

  return (
    <>
      <div style={{ display: 'flex', height: '100%' }}>
        <SidebarPane
          width={278}
          title="Script"
          controls={(
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
          )}
        >
          {orderedScenes.map(scene => {
            const isActive = activeSceneId === scene.id
            const linkCount = (shotLinksByScene[scene.id] || []).length
            return (
              <button
                key={scene.id}
                onClick={() => {
                  setActiveSceneId(scene.id)
                  const firstBlock = screenplayByScene[scene.id]?.[0]
                  if (firstBlock) {
                    setSelectedBlock({ sceneId: scene.id, blockId: firstBlock.id })
                    focusBlock(scene.id, firstBlock.id, 'start')
                  }
                }}
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
        </SidebarPane>

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
            <span style={{ fontSize: 12, color: '#475569', marginLeft: 12 }}>
              Page {pxToInches(pageSettings.widthPx)}" × {pxToInches(pageSettings.heightPx)}" • Margins {pxToInches(pageSettings.marginTopPx)}"/{pxToInches(pageSettings.marginRightPx)}"/{pxToInches(pageSettings.marginBottomPx)}"/{pxToInches(pageSettings.marginLeftPx)}"
            </span>
            <button className="toolbar-btn" onClick={() => setActivePanel(activePanel === 'page' ? null : 'page')} style={{ marginLeft: 'auto' }}>Page Setup</button>
            <button className="toolbar-btn" onClick={() => setActivePanel(activePanel === 'styles' ? null : 'styles')}>Element Styles</button>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '12px 0 24px' }}>
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'flex-start', gap: 14 }}>
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
                  <div style={{ position: 'absolute', top: 0, bottom: 0, left: pageSettings.marginLeftPx, width: 1, background: 'rgba(14,116,144,0.35)' }} />
                  <div style={{ position: 'absolute', top: 0, bottom: 0, left: pageSettings.widthPx - pageSettings.marginRightPx, width: 1, background: 'rgba(14,116,144,0.35)' }} />
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
                          const sceneLinks = shotLinksByScene[block.sceneId] || []
                          const blockLinks = sceneLinks.filter(link => link.end > block.sceneCharStart && link.start < block.sceneCharEnd)
                          const isSelected = selectedBlock?.sceneId === block.sceneId && selectedBlock?.blockId === block.blockId
                          const upper = ['heading', 'character', 'transition'].includes(block.blockType)

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
                            textTransform: upper ? 'uppercase' : 'none',
                            borderRadius: 4,
                            border: isSelected ? '1px solid rgba(37,99,235,0.45)' : '1px solid transparent',
                            background: isSelected ? 'rgba(37,99,235,0.04)' : 'transparent',
                          }

                          if (view === 'write') {
                            return (
                              <div
                                key={`${block.sceneId}:${block.blockId}`}
                                ref={(el) => { blockRefs.current[`${block.sceneId}:${block.blockId}`] = el }}
                                contentEditable
                                suppressContentEditableWarning
                                spellCheck
                                onFocus={() => {
                                  setSelectedBlock({ sceneId: block.sceneId, blockId: block.blockId })
                                  setActiveSceneId(block.sceneId)
                                }}
                                onInput={(event) => updateBlockText(block.sceneId, block.blockId, block.blockType, event.currentTarget.textContent || '')}
                                onKeyDown={(event) => handleBlockKeyDown(event, block)}
                                style={{ ...sharedStyle, outline: 'none' }}
                              >
                                {block.blockText || ''}
                              </div>
                            )
                          }

                          return (
                            <div
                              key={`${block.sceneId}:${block.blockId}`}
                              style={{ ...sharedStyle, cursor: 'text' }}
                              onClick={() => {
                                setSelectedBlock({ sceneId: block.sceneId, blockId: block.blockId })
                                setActiveSceneId(block.sceneId)
                              }}
                            >
                              {renderHighlightedText(block.blockText, block.sceneCharStart, blockLinks, openShotDialog)}
                            </div>
                          )
                        })}
                      </div>

                      <div style={{ position: 'absolute', right: 12, top: 10, fontSize: 11, color: '#64748b' }}>{page.number}</div>
                    </div>
                  ))}
                </div>
              </div>

              {activePanel === 'page' && (
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

              {activePanel === 'styles' && (
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

      {showImportModal && <ImportScriptModal onClose={() => setShowImportModal(false)} />}
    </>
  )
}
