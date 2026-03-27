import React, { useMemo, useRef, useState, useEffect, useCallback } from 'react'
import useStore from '../store'
import { naturalSortSceneNumber } from '../utils/sceneSort'
import SceneColorPicker from './SceneColorPicker'
import SpecsTable from './SpecsTable'
import ImportScriptModal from './ImportScriptModal'
import SidebarPane from './SidebarPane'
import {
  createScreenplayElement,
  EDITABLE_SCREENPLAY_TYPES,
  ensureEditableScreenplayElements,
  estimateScreenplayPagination,
  getSceneScreenplayElements,
  SCREENPLAY_FORMAT,
  SCREENPLAY_LAYOUT,
  SCENE_PAGINATION_MODES,
} from '../utils/screenplay'
import {
  DEFAULT_SCRIPT_DOCUMENT_SETTINGS,
  getBlockStyleForType,
  normalizeDocumentSettings,
  resetBlockStyle,
} from '../utils/scriptDocumentFormatting'

const EDIT_BAR_HEIGHT_PX = 42
const RULER_HEIGHT_PX = 30
const RULER_PAGE_GAP_PX = 8
const SCREENPLAY_CHAR_WIDTH_RATIO = 0.6

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

function AddShotModal({ scene, shots, onClose, onConfirm }) {
  const [mode, setMode] = useState('new')
  const [selectedShotId, setSelectedShotId] = useState(shots[0]?.id || null)

  return (
    <div className="modal-overlay" style={{ zIndex: 650 }} onClick={onClose}>
      <div className="modal app-dialog" style={{ maxWidth: 640, borderRadius: 12 }} onClick={e => e.stopPropagation()}>
        <h3 className="dialog-title" style={{ marginBottom: 4 }}>Add Shot to SC {scene.sceneNumber}</h3>
        <p className="dialog-description" style={{ marginBottom: 14 }}>{scene.slugline || scene.location || 'Script scene'}</p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <button onClick={() => setMode('existing')} style={{ border: mode === 'existing' ? '1px solid rgba(232,64,64,0.6)' : '1px solid rgba(74,85,104,0.2)', borderRadius: 10, background: mode === 'existing' ? 'rgba(232,64,64,0.08)' : '#fff', padding: 12, textAlign: 'left', cursor: 'pointer' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#1f2937', marginBottom: 4 }}>Link existing shot</div>
            <div style={{ fontSize: 11, color: '#64748b' }}>Attach this script selection to an existing storyboard shot.</div>
          </button>
          <button onClick={() => setMode('new')} style={{ border: mode === 'new' ? '1px solid rgba(232,64,64,0.6)' : '1px solid rgba(74,85,104,0.2)', borderRadius: 10, background: mode === 'new' ? 'rgba(232,64,64,0.08)' : '#fff', padding: 12, textAlign: 'left', cursor: 'pointer' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#1f2937', marginBottom: 4 }}>Create new shot</div>
            <div style={{ fontSize: 11, color: '#64748b' }}>Create, link, and open full shot details immediately.</div>
          </button>
        </div>
        {mode === 'existing' && (
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 11, color: '#4b5563', marginBottom: 6, fontWeight: 600 }}>Select shot</div>
            <div style={{ maxHeight: 170, overflowY: 'auto', border: '1px solid rgba(74,85,104,0.2)', borderRadius: 6 }}>
              {shots.length === 0 && <div style={{ padding: 10, fontSize: 12, color: '#718096' }}>No existing shots found for this scene.</div>}
              {shots.map(shot => (
                <label key={shot.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderBottom: '1px solid rgba(74,85,104,0.08)' }}>
                  <input type="radio" checked={selectedShotId === shot.id} onChange={() => setSelectedShotId(shot.id)} />
                  <span style={{ fontFamily: 'monospace', fontSize: 11 }}>{shot.displayId}</span>
                  <span style={{ fontSize: 11, color: '#4A5568', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{shot.notes || shot.subject || 'Untitled shot'}</span>
                </label>
              ))}
            </div>
          </div>
        )}
        <div className="dialog-actions">
          <button className="dialog-button-secondary" onClick={onClose}>Cancel</button>
          <button className="dialog-button-primary" onClick={() => onConfirm({ mode, selectedShotId })} disabled={mode === 'existing' && !selectedShotId}>
            {mode === 'new' ? 'Create & Edit Shot' : 'Link Shot'}
          </button>
        </div>
      </div>
    </div>
  )
}

const normalizeShotColor = (color) => {
  const value = String(color || '').trim().toLowerCase()
  if (!value) return null
  if (value === '#fff' || value === '#ffffff' || value === 'white' || value === 'rgb(255,255,255)' || value === 'rgb(255, 255, 255)') {
    return '#CBD5E1'
  }
  return color
}

const toRgba = (hex, alpha) => {
  const clean = String(hex || '').replace('#', '').trim()
  if (![3, 6].includes(clean.length)) return null
  const expanded = clean.length === 3 ? clean.split('').map(ch => ch + ch).join('') : clean
  const num = Number.parseInt(expanded, 16)
  if (Number.isNaN(num)) return null
  const r = (num >> 16) & 255
  const g = (num >> 8) & 255
  const b = num & 255
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

const getHighlightStyleForShot = (shot) => {
  const normalized = normalizeShotColor(shot?.color || '#E84040')
  return {
    background: toRgba(normalized, normalized === '#CBD5E1' ? 0.55 : 0.24) || 'rgba(239,68,68,0.18)',
    underline: toRgba(normalized, normalized === '#CBD5E1' ? 0.65 : 0.55) || 'rgba(220,38,38,0.55)',
  }
}

function ShotLinkDialog({ data, onClose, onUpdateShot, onUpdateShotImage, useDropdowns, onJumpToStoryboard }) {
  const [activeShotId, setActiveShotId] = useState(data.shotIds[0] || null)
  const activeShot = data.shotMap[activeShotId] || null

  const onImageChange = (e) => {
    const file = e.target.files?.[0]
    if (!file || !activeShot) return
    const reader = new FileReader()
    reader.onload = (ev) => onUpdateShotImage(activeShot.id, ev.target?.result || null)
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  if (!activeShot) return null

  return (
    <div className="modal-overlay" style={{ zIndex: 700 }} onClick={onClose}>
      <div className="modal app-dialog" style={{ width: 760, maxWidth: '95vw' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <h3 style={{ margin: 0, fontSize: 18 }}>Linked Shot</h3>
          <button onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 18 }}>✕</button>
        </div>

        {data.shotIds.length > 1 && (
          <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
            {data.shotIds.map(id => {
              const shot = data.shotMap[id]
              return (
                <button
                  key={id}
                  onClick={() => setActiveShotId(id)}
                  style={{
                    border: id === activeShotId ? '1px solid #E84040' : '1px solid rgba(74,85,104,0.25)',
                    background: id === activeShotId ? 'rgba(232,64,64,0.08)' : '#fff',
                    borderRadius: 999,
                    fontSize: 11,
                    fontFamily: 'monospace',
                    padding: '2px 8px',
                    cursor: 'pointer',
                  }}
                >
                  {shot?.displayId || id}
                </button>
              )
            })}
          </div>
        )}

        <div style={{ border: '1px solid rgba(74,85,104,0.18)', borderRadius: 8, overflow: 'hidden', background: '#FAF8F4' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderBottom: '1px solid rgba(74,85,104,0.15)' }}>
            <div style={{ width: 12, height: 12, borderRadius: 2, background: activeShot.color || '#9ca3af', border: '1px solid rgba(0,0,0,0.15)' }} />
            <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 12 }}>{activeShot.displayId || activeShot.id} -</span>
            <input
              className="dialog-input"
              value={activeShot.cameraName || ''}
              onChange={(e) => onUpdateShot(activeShot.id, { cameraName: e.target.value })}
              style={{ border: 'none', background: 'transparent', boxShadow: 'none', fontSize: 12, flex: 1, minWidth: 120 }}
            />
            <input
              className="dialog-input"
              value={activeShot.focalLength || ''}
              onChange={(e) => onUpdateShot(activeShot.id, { focalLength: e.target.value })}
              style={{ border: 'none', background: 'transparent', boxShadow: 'none', fontSize: 12, width: 80, textAlign: 'right' }}
            />
          </div>

          <label style={{ display: 'block', background: '#EDE9E1', borderBottom: '1px solid rgba(74,85,104,0.15)', cursor: 'pointer' }}>
            <div style={{ width: '100%', aspectRatio: '16 / 9', position: 'relative', display: 'grid', placeItems: 'center' }}>
              {activeShot.image ? (
                <img src={activeShot.image} alt="Shot" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <span style={{ fontSize: 12, color: '#718096' }}>Click to add image</span>
              )}
            </div>
            <input type="file" accept="image/*" style={{ display: 'none' }} onChange={onImageChange} />
          </label>

          <SpecsTable shotId={activeShot.id} specs={activeShot.specs || { size: '', type: '', move: '', equip: '' }} useDropdowns={useDropdowns} />

          <div style={{ padding: 10, borderTop: '1px solid rgba(74,85,104,0.12)' }}>
            <label style={{ display: 'block', fontSize: 11, color: '#4A5568', marginBottom: 4 }}>Notes</label>
            <textarea
              value={activeShot.notes || ''}
              onChange={e => onUpdateShot(activeShot.id, { notes: e.target.value })}
              style={{ width: '100%', minHeight: 66, border: '1px solid rgba(74,85,104,0.18)', borderRadius: 4, padding: 6, fontSize: 12, marginBottom: 8 }}
            />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 160px', gap: 8 }}>
              <label style={{ display: 'block', fontSize: 11, color: '#4A5568' }}>
                Cast
                <input
                  value={activeShot.cast || ''}
                  onChange={e => onUpdateShot(activeShot.id, { cast: e.target.value })}
                  style={{ width: '100%', border: '1px solid rgba(74,85,104,0.18)', borderRadius: 4, padding: 6, fontSize: 12 }}
                />
              </label>
              <label style={{ display: 'block', fontSize: 11, color: '#4A5568' }}>
                Script Time
                <input
                  value={activeShot.scriptTime || ''}
                  onChange={e => onUpdateShot(activeShot.id, { scriptTime: e.target.value })}
                  style={{ width: '100%', border: '1px solid rgba(74,85,104,0.18)', borderRadius: 4, padding: 6, fontSize: 12 }}
                />
              </label>
            </div>
          </div>
        </div>

        <div style={{ marginTop: 10, display: 'flex', justifyContent: 'flex-end' }}>
          <button className="toolbar-btn" onClick={() => onJumpToStoryboard(activeShot)}>
            Open in Storyboard
          </button>
        </div>
      </div>
    </div>
  )
}

function splitToWrappedChunks(text, maxChars) {
  const raw = String(text || '')
  if (!raw) return [{ text: '', start: 0, end: 0 }]
  const chunks = []
  let i = 0
  while (i < raw.length) {
    if (raw.length - i <= maxChars) {
      chunks.push({ text: raw.slice(i), start: i, end: raw.length })
      break
    }
    const lookahead = raw.slice(i, i + maxChars + 1)
    let splitAt = lookahead.lastIndexOf(' ')
    if (splitAt <= 0) splitAt = maxChars
    const end = i + splitAt
    chunks.push({ text: raw.slice(i, end), start: i, end })
    i = end
    while (raw[i] === ' ') i += 1
  }
  return chunks.length ? chunks : [{ text: '', start: 0, end: 0 }]
}

function getRowsPerPage(pageSettings, lineHeightPx) {
  const contentHeightPx = Math.max(1, pageSettings.heightPx - pageSettings.marginTopPx - pageSettings.marginBottomPx)
  return Math.max(1, Math.floor(contentHeightPx / Math.max(1, lineHeightPx)))
}

function getCharsPerLineByType(documentSettings) {
  const page = documentSettings.page
  const contentWidthPx = Math.max(1, page.widthPx - page.marginLeftPx - page.marginRightPx)
  return Object.entries(documentSettings.blockStyles).reduce((acc, [type, style]) => {
    const availableWidth = Math.max(1, contentWidthPx - style.marginLeftPx - style.marginRightPx - style.paddingLeftPx - style.paddingRightPx)
    const charWidth = Math.max(1, style.fontSizePx * SCREENPLAY_CHAR_WIDTH_RATIO)
    acc[type] = Math.max(1, Math.floor(availableWidth / charWidth))
    return acc
  }, {})
}

function buildScreenplayRows(orderedScenes, screenplayBySceneId, charsPerLineByType = SCREENPLAY_FORMAT.charsPerLine) {
  const rows = []
  orderedScenes.forEach(scene => {
    const elements = screenplayBySceneId[scene.id] || []
    let sceneCharOffset = 0
    let isSceneStart = true

    const pushSpacerRows = (count, idx) => {
      for (let spacerIdx = 0; spacerIdx < count; spacerIdx += 1) {
        rows.push({
          sceneId: scene.id,
          rowKey: `${scene.id}-${idx}-sp-${spacerIdx}-${rows.length}`,
          type: 'spacer',
          text: '',
          sceneCharStart: sceneCharOffset,
          sceneCharEnd: sceneCharOffset,
          sourceIndex: idx,
        })
      }
    }

    elements.forEach((line, idx) => {
      const lineText = String(line.text || '')
      const nextOffset = sceneCharOffset + lineText.length + 1
      const prevType = idx > 0 ? elements[idx - 1]?.type : null
      const nextType = elements[idx + 1]?.type
      const spacingRule = SCREENPLAY_LAYOUT.spacing[line.type] || SCREENPLAY_LAYOUT.spacing.action

      if (spacingRule.before > 0 && prevType && prevType !== 'blank') {
        pushSpacerRows(spacingRule.before, idx)
      }

      if (line.type === 'blank') {
        rows.push({
          sceneId: scene.id,
          blockId: line.id || null,
          rowKey: `${scene.id}-${idx}-0`,
          type: 'blank',
          text: '',
          sceneCharStart: sceneCharOffset,
          sceneCharEnd: sceneCharOffset,
          sourceIndex: idx,
          isSceneStart,
        })
      } else {
        const width = charsPerLineByType[line.type] || charsPerLineByType.action || SCREENPLAY_FORMAT.charsPerLine.action
        const chunks = splitToWrappedChunks(lineText, width)
        chunks.forEach((chunk, chunkIdx) => {
          rows.push({
            sceneId: scene.id,
            blockId: line.id || null,
            rowKey: `${scene.id}-${idx}-${chunkIdx}`,
            type: line.type,
            text: chunk.text,
            sceneCharStart: sceneCharOffset + chunk.start,
            sceneCharEnd: sceneCharOffset + chunk.end,
            sourceIndex: idx,
            isFirstChunk: chunkIdx === 0,
            isSceneStart: isSceneStart && chunkIdx === 0,
          })
        })
      }

      if (spacingRule.after > 0 && nextType && nextType !== 'blank') {
        pushSpacerRows(spacingRule.after, idx)
      }

      const pairSpacing = SCREENPLAY_LAYOUT.spacing.pairAfter?.[line.type]?.[nextType] ?? 0
      if (pairSpacing > 0) {
        pushSpacerRows(pairSpacing, idx)
      }

      isSceneStart = false
      sceneCharOffset = nextOffset
    })
  })
  return rows
}

function getBlockLength(rows, startIndex, predicate) {
  let len = 0
  while (startIndex + len < rows.length && predicate(rows[startIndex + len])) len += 1
  return len
}

function countRowsOfTypes(rows, types) {
  const match = new Set(types)
  return rows.reduce((sum, row) => sum + (match.has(row.type) ? 1 : 0), 0)
}

function paginateRows(rows, options = {}) {
  const scenePaginationMode = options.scenePaginationMode || SCENE_PAGINATION_MODES.CONTINUE
  const rowsPerPage = Math.max(1, options.rowsPerPage || SCREENPLAY_FORMAT.pageLines)
  const pages = []
  let page = { id: 'sp_1', number: 1, lines: [] }

  const pushPage = () => {
    pages.push(page)
    page = { id: `sp_${pages.length + 1}`, number: pages.length + 1, lines: [] }
  }
  const startNewPageIfNeeded = () => {
    if (page.lines.length > 0) pushPage()
  }
  const addLine = (line) => {
    if (page.lines.length >= rowsPerPage) pushPage()
    page.lines.push(line)
  }
  const previousContentRow = (index) => {
    for (let idx = index - 1; idx >= 0; idx -= 1) {
      const row = rows[idx]
      if (row.type !== 'blank' && row.type !== 'spacer') return row
    }
    return null
  }
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i]

    if (scenePaginationMode === SCENE_PAGINATION_MODES.NEW_PAGE && row.isSceneStart) {
      startNewPageIfNeeded()
    }

    const isHeading = row.type === 'heading' && row.isFirstChunk
    if (isHeading) {
      const headingLen = getBlockLength(rows, i, r => r.sceneId === row.sceneId && r.sourceIndex === row.sourceIndex)
      const nextLen = getBlockLength(rows, i + headingLen, r => r.type === 'blank' || r.type === 'spacer')
      const actionLen = getBlockLength(rows, i + headingLen + nextLen, r => r.sceneId === row.sceneId && r.type !== 'blank' && r.type !== 'spacer')
      const minAfterHeading = SCREENPLAY_LAYOUT.pagination?.minLinesAfterHeading ?? 2
      const keepRows = headingLen + nextLen + Math.min(actionLen, minAfterHeading)
      if (page.lines.length > 0 && page.lines.length + keepRows > rowsPerPage) startNewPageIfNeeded()
    }

    if (row.type === 'character' && row.isFirstChunk) {
      const cueLen = getBlockLength(rows, i, r => r.sceneId === row.sceneId && r.sourceIndex === row.sourceIndex)
      const blockLen = getBlockLength(rows, i + cueLen, r => r.type === 'parenthetical' || r.type === 'dialogue' || r.type === 'spacer')
      const blockRows = rows.slice(i, i + cueLen + blockLen)
      const minDialogueAfterCue = SCREENPLAY_LAYOUT.pagination?.minDialogueLinesAfterCharacter ?? 2
      const minDialogueAtPageTop = SCREENPLAY_LAYOUT.pagination?.minDialogueLinesAtPageTop ?? 2
      const remaining = rowsPerPage - page.lines.length
      const keepRows = cueLen + Math.max(1, Math.min(blockLen, minDialogueAfterCue))

      if (page.lines.length > 0 && page.lines.length + keepRows > rowsPerPage) startNewPageIfNeeded()
      if (page.lines.length > 0) {
        if (remaining <= cueLen + minDialogueAfterCue - 1) startNewPageIfNeeded()
        if (cueLen + blockLen > remaining && remaining > 0) {
          const rowsOnNextPage = blockRows.slice(remaining)
          const dialogueRowsOnNextPage = countRowsOfTypes(rowsOnNextPage, ['dialogue', 'parenthetical'])
          if (dialogueRowsOnNextPage > 0 && dialogueRowsOnNextPage < minDialogueAtPageTop) startNewPageIfNeeded()
        }
      }
    }

    if (row.type === 'transition' && row.isFirstChunk) {
      const transitionLen = getBlockLength(rows, i, r => r.sceneId === row.sceneId && r.sourceIndex === row.sourceIndex)
      const gapLen = getBlockLength(rows, i + transitionLen, r => r.type === 'blank' || r.type === 'spacer')
      const nextBlockLen = getBlockLength(rows, i + transitionLen + gapLen, r => r.type !== 'blank' && r.type !== 'spacer')
      const minAfterTransition = SCREENPLAY_LAYOUT.pagination?.minLinesAfterTransition ?? 2
      const keepRows = transitionLen + gapLen + Math.min(nextBlockLen, minAfterTransition)
      if (page.lines.length > 0 && page.lines.length + keepRows > rowsPerPage) startNewPageIfNeeded()
    }

    if (row.type === 'section' && row.isFirstChunk) {
      const sectionLen = getBlockLength(rows, i, r => r.sceneId === row.sceneId && r.sourceIndex === row.sourceIndex)
      const gapLen = getBlockLength(rows, i + sectionLen, r => r.type === 'blank' || r.type === 'spacer')
      const nextBlockLen = getBlockLength(rows, i + sectionLen + gapLen, r => r.type !== 'blank' && r.type !== 'spacer')
      const minAfterSection = SCREENPLAY_LAYOUT.pagination?.minLinesAfterSection ?? 1
      const keepRows = sectionLen + gapLen + Math.min(nextBlockLen, minAfterSection)
      if (page.lines.length > 0 && page.lines.length + keepRows > rowsPerPage) startNewPageIfNeeded()
    }

    if (row.type === 'action' && row.isFirstChunk) {
      const prevContent = previousContentRow(i)
      const minActionLinesAfterDialogue = SCREENPLAY_LAYOUT.pagination?.minActionLinesAfterDialogue ?? 2
      if (
        page.lines.length > 0
        && (prevContent?.type === 'dialogue' || prevContent?.type === 'parenthetical')
        && (rowsPerPage - page.lines.length) < minActionLinesAfterDialogue
      ) {
        startNewPageIfNeeded()
      }
    }

    addLine(row)
  }

  if (page.lines.length || pages.length === 0) {
    pages.push(page)
  }
  return pages
}

export default function ScriptTab() {
  const scriptScenes = useStore(s => s.scriptScenes)
  const scenes = useStore(s => s.scenes)
  const addShotWithOverrides = useStore(s => s.addShotWithOverrides)
  const linkShotToScene = useStore(s => s.linkShotToScene)
  const updateShot = useStore(s => s.updateShot)
  const updateShotImage = useStore(s => s.updateShotImage)
  const setActiveTab = useStore(s => s.setActiveTab)
  const updateScriptScene = useStore(s => s.updateScriptScene)
  const updateScriptSceneScreenplay = useStore(s => s.updateScriptSceneScreenplay)
  const useDropdowns = useStore(s => s.useDropdowns)
  const scriptSettings = useStore(s => s.scriptSettings)
  const setScriptSettings = useStore(s => s.setScriptSettings)
  const scriptFocusRequest = useStore(s => s.scriptFocusRequest)
  const clearScriptFocusRequest = useStore(s => s.clearScriptFocusRequest)
  const openScenePropertiesDialog = useStore(s => s.openScenePropertiesDialog)
  const scriptViewState = useStore(s => s.tabViewState?.script || {})
  const setTabViewState = useStore(s => s.setTabViewState)

  const rightRef = useRef(null)
  const headingRefs = useRef({})
  const [activeSceneId, setActiveSceneId] = useState(scriptViewState.activeSceneId || null)
  const [addShotDialog, setAddShotDialog] = useState(null)
  const [shotLinkDialog, setShotLinkDialog] = useState(null)
  const [pendingOpenShotDialog, setPendingOpenShotDialog] = useState(null)
  const [importModalOpen, setImportModalOpen] = useState(false)
  const [isEditMode, setIsEditMode] = useState(Boolean(scriptViewState.isEditMode))
  const [isInspectorOpen, setIsInspectorOpen] = useState(Boolean(scriptViewState.isInspectorOpen))
  const [selectedBlock, setSelectedBlock] = useState(null)
  const [draggingMarker, setDraggingMarker] = useState(null)
  const rulerTrackRef = useRef(null)

  const orderedScenes = useMemo(() => [...scriptScenes].sort(naturalSortSceneNumber), [scriptScenes])
  const scenePaginationMode = scriptSettings?.scenePaginationMode || SCENE_PAGINATION_MODES.CONTINUE
  const pagination = useMemo(
    () => estimateScreenplayPagination(orderedScenes, { scenePaginationMode }),
    [orderedScenes, scenePaginationMode],
  )
  const documentSettings = useMemo(
    () => normalizeDocumentSettings(scriptSettings?.documentSettings || DEFAULT_SCRIPT_DOCUMENT_SETTINGS),
    [scriptSettings?.documentSettings],
  )
  const pageSettings = documentSettings.page
  const charsPerLineByType = useMemo(() => getCharsPerLineByType(documentSettings), [documentSettings])
  const baseBlockStyle = documentSettings.blockStyles.action || DEFAULT_SCRIPT_DOCUMENT_SETTINGS.blockStyles.action
  const screenplayLineHeightPx = baseBlockStyle.lineHeightPx
  const screenplayFontSizePx = baseBlockStyle.fontSizePx
  const rowsPerPage = useMemo(() => getRowsPerPage(pageSettings, screenplayLineHeightPx), [pageSettings, screenplayLineHeightPx])

  const updateDocumentSettings = useCallback((updater) => {
    const current = normalizeDocumentSettings(scriptSettings?.documentSettings || DEFAULT_SCRIPT_DOCUMENT_SETTINGS)
    const nextValue = typeof updater === 'function' ? updater(current) : updater
    setScriptSettings({ documentSettings: normalizeDocumentSettings(nextValue) })
  }, [scriptSettings?.documentSettings, setScriptSettings])

  const updateBlockStyle = useCallback((blockType, key, value) => {
    const mappedType = blockType || 'action'
    updateDocumentSettings((current) => ({
      ...current,
      blockStyles: {
        ...current.blockStyles,
        [mappedType]: {
          ...(current.blockStyles[mappedType] || current.blockStyles.action),
          [key]: value,
        },
      },
    }))
  }, [updateDocumentSettings])

  const shotCounts = useMemo(() => {
    const map = {}
    scenes.forEach((sc) => sc.shots.forEach((sh) => { if (sh.linkedSceneId) map[sh.linkedSceneId] = (map[sh.linkedSceneId] || 0) + 1 }))
    return map
  }, [scenes])

  const linkedShotsByScene = useMemo(() => {
    const map = {}
    scenes.forEach((storyScene, sceneIdx) => {
      storyScene.shots.forEach((shot, shotIdx) => {
        if (!shot.linkedSceneId) return
        if (!map[shot.linkedSceneId]) map[shot.linkedSceneId] = []
        map[shot.linkedSceneId].push({
          ...shot,
          parentSceneId: storyScene.id,
          displayId: `${sceneIdx + 1}${String.fromCharCode(65 + shotIdx)}`,
        })
      })
    })
    return map
  }, [scenes])

  const getSceneById = useCallback((sceneId) => orderedScenes.find(scene => scene.id === sceneId), [orderedScenes])

  const commitSceneBlocks = useCallback((sceneId, nextElements, focusBlockId = null) => {
    const normalized = ensureEditableScreenplayElements(nextElements)
    updateScriptSceneScreenplay(sceneId, normalized)
  }, [updateScriptSceneScreenplay])

  const updateBlock = useCallback((sceneId, blockId, updates) => {
    const scene = getSceneById(sceneId)
    if (!scene) return
    const elements = ensureEditableScreenplayElements(getSceneScreenplayElements(scene))
    const next = elements.map(element => element.id === blockId ? { ...element, ...updates } : element)
    commitSceneBlocks(sceneId, next, blockId)
  }, [commitSceneBlocks, getSceneById])

  const splitBlock = useCallback((sceneId, blockId) => {
    const scene = getSceneById(sceneId)
    if (!scene) return
    const elements = ensureEditableScreenplayElements(getSceneScreenplayElements(scene))
    const index = elements.findIndex(element => element.id === blockId)
    if (index === -1) return
    const rawText = String(elements[index].text || '')
    const cursor = rawText.length
    const left = rawText.slice(0, cursor)
    const right = rawText.slice(cursor)
    const current = elements[index]
    const newBlock = createScreenplayElement(current.type, right)
    const next = [...elements]
    next.splice(index, 1, { ...current, text: left }, newBlock)
    commitSceneBlocks(sceneId, next, newBlock.id)
    setSelectedBlock({ sceneId, blockId: newBlock.id })
  }, [commitSceneBlocks, getSceneById])

  const mergeBlock = useCallback((sceneId, blockId, direction = 'up') => {
    const scene = getSceneById(sceneId)
    if (!scene) return
    const elements = ensureEditableScreenplayElements(getSceneScreenplayElements(scene))
    const index = elements.findIndex(element => element.id === blockId)
    if (index === -1) return
    const targetIndex = direction === 'up' ? index - 1 : index + 1
    if (targetIndex < 0 || targetIndex >= elements.length) return
    const current = elements[index]
    const target = elements[targetIndex]
    const mergedText = direction === 'up'
      ? `${String(target.text || '')}${target.text ? '\n' : ''}${String(current.text || '')}`
      : `${String(current.text || '')}${current.text ? '\n' : ''}${String(target.text || '')}`
    const next = [...elements]
    if (direction === 'up') {
      next[targetIndex] = { ...target, text: mergedText }
      next.splice(index, 1)
      commitSceneBlocks(sceneId, next, target.id)
      setSelectedBlock({ sceneId, blockId: target.id })
    } else {
      next[index] = { ...current, text: mergedText }
      next.splice(targetIndex, 1)
      commitSceneBlocks(sceneId, next, current.id)
      setSelectedBlock({ sceneId, blockId: current.id })
    }
  }, [commitSceneBlocks, getSceneById])

  const insertBlockAfter = useCallback((sceneId, blockId) => {
    const scene = getSceneById(sceneId)
    if (!scene) return
    const elements = ensureEditableScreenplayElements(getSceneScreenplayElements(scene))
    const index = elements.findIndex(element => element.id === blockId)
    if (index === -1) return
    const newBlock = createScreenplayElement('action', '')
    const next = [...elements]
    next.splice(index + 1, 0, newBlock)
    commitSceneBlocks(sceneId, next, newBlock.id)
    setSelectedBlock({ sceneId, blockId: newBlock.id })
  }, [commitSceneBlocks, getSceneById])

  const screenplayBySceneId = useMemo(() => {
    const result = {}
    orderedScenes.forEach(sc => { result[sc.id] = getSceneScreenplayElements(sc) })
    return result
  }, [orderedScenes])

  const screenplayRows = useMemo(
    () => buildScreenplayRows(orderedScenes, screenplayBySceneId, charsPerLineByType),
    [charsPerLineByType, orderedScenes, screenplayBySceneId],
  )
  const pagedScript = useMemo(
    () => paginateRows(screenplayRows, { scenePaginationMode, rowsPerPage }),
    [screenplayRows, scenePaginationMode, rowsPerPage],
  )
  const scenePageStats = useMemo(() => {
    const stats = {}
    pagedScript.forEach(page => {
      const sceneIds = [...new Set(page.lines.map(l => l.sceneId).filter(Boolean))]
      sceneIds.forEach(sceneId => {
        if (!stats[sceneId]) stats[sceneId] = { startPage: page.number, endPage: page.number, pages: new Set() }
        stats[sceneId].startPage = Math.min(stats[sceneId].startPage, page.number)
        stats[sceneId].endPage = Math.max(stats[sceneId].endPage, page.number)
        stats[sceneId].pages.add(page.number)
      })
    })
    Object.keys(stats).forEach(sceneId => {
      stats[sceneId].pageCount = Number((stats[sceneId].pages.size).toFixed(2))
    })
    return stats
  }, [pagedScript])

  useEffect(() => {
    const io = new IntersectionObserver((entries) => {
      const visible = entries.filter(e => e.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0]
      if (visible?.target?.dataset?.sceneid) setActiveSceneId(visible.target.dataset.sceneid)
    }, { root: rightRef.current, threshold: [0.25, 0.5, 0.75] })
    Object.values(headingRefs.current).forEach(el => el && io.observe(el))
    return () => io.disconnect()
  }, [orderedScenes])

  useEffect(() => {
    setTabViewState('script', { activeSceneId, isEditMode, isInspectorOpen })
  }, [activeSceneId, isEditMode, isInspectorOpen, setTabViewState])

  useEffect(() => {
    const node = rightRef.current
    if (!node) return
    const savedTop = scriptViewState.scrollTop
    if (typeof savedTop === 'number') {
      requestAnimationFrame(() => {
        node.scrollTop = savedTop
      })
    }
  }, [scriptViewState.scrollTop])

  useEffect(() => {
    if (!scriptFocusRequest) return
    const node = headingRefs.current[scriptFocusRequest.sceneId]
    if (node) node.scrollIntoView({ behavior: 'smooth', block: 'start' })
    clearScriptFocusRequest()
  }, [scriptFocusRequest, clearScriptFocusRequest])

  const allLinkedShotsForScriptScene = useCallback((scriptSceneId) => linkedShotsByScene[scriptSceneId] || [], [linkedShotsByScene])

  const findStoryboardSceneForScriptScene = (scriptScene) => {
    if (!scriptScene) return null
    for (const storyboardScene of scenes) {
      if (storyboardScene.shots.some(shot => shot.linkedSceneId === scriptScene.id)) return storyboardScene
    }
    return scenes[0] || null
  }

  const confirmAddShotDialog = ({ mode, selectedShotId }) => {
    if (!addShotDialog) return
    const { scene: scriptScene, selectedText, rangeStart, rangeEnd } = addShotDialog
    if (mode === 'existing' && selectedShotId) {
      linkShotToScene(selectedShotId, scriptScene.id, {
        linkedDialogueLine: selectedText || null,
        linkedDialogueOffset: Number.isFinite(rangeStart) ? rangeStart : null,
        linkedScriptRangeStart: rangeStart,
        linkedScriptRangeEnd: rangeEnd,
      })
      if (selectedText) updateShot(selectedShotId, { notes: selectedText })
      setAddShotDialog(null)
      return
    }
    const targetStoryboardScene = findStoryboardSceneForScriptScene(scriptScene)
    if (!targetStoryboardScene) return
    const createdShotId = addShotWithOverrides(targetStoryboardScene.id, {
      linkedSceneId: scriptScene.id,
      linkedDialogueLine: selectedText || null,
      linkedDialogueOffset: Number.isFinite(rangeStart) ? rangeStart : null,
      linkedScriptRangeStart: rangeStart,
      linkedScriptRangeEnd: rangeEnd,
      notes: selectedText || '',
    })
    if (createdShotId) {
      setPendingOpenShotDialog({ sceneId: scriptScene.id, shotId: createdShotId })
    }
    setAddShotDialog(null)
  }

  const openShotLinkDialog = (sceneId, shotIds) => {
    if (!shotIds?.length) return
    const shots = allLinkedShotsForScriptScene(sceneId)
    const shotMap = Object.fromEntries(shots.map(sh => [sh.id, sh]))
    setShotLinkDialog({ sceneId, shotIds, shotMap })
  }

  useEffect(() => {
    if (!pendingOpenShotDialog) return
    const shots = allLinkedShotsForScriptScene(pendingOpenShotDialog.sceneId)
    const foundShot = shots.find(sh => sh.id === pendingOpenShotDialog.shotId)
    if (!foundShot) return
    setShotLinkDialog({
      sceneId: pendingOpenShotDialog.sceneId,
      shotIds: [foundShot.id],
      shotMap: { [foundShot.id]: foundShot },
    })
    setPendingOpenShotDialog(null)
  }, [pendingOpenShotDialog, allLinkedShotsForScriptScene])

  const jumpToStoryboardShot = (shot) => {
    if (!shot?.id) return
    setActiveTab('storyboard')
    requestAnimationFrame(() => {
      const node = document.getElementById(`storyboard-shot-${shot.id}`)
      if (node) node.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' })
    })
  }

  const selectedScene = selectedBlock?.sceneId ? getSceneById(selectedBlock.sceneId) : null
  const selectedBlockData = selectedScene
    ? ensureEditableScreenplayElements(getSceneScreenplayElements(selectedScene)).find((block) => block.id === selectedBlock?.blockId)
    : null
  const selectedStyleType = selectedBlockData?.type || 'action'
  const selectedStyle = getBlockStyleForType(documentSettings, selectedStyleType)
  const pageContentWidthPx = Math.max(120, pageSettings.widthPx - pageSettings.marginLeftPx - pageSettings.marginRightPx)

  const isBlockSelectedForEdit = Boolean(isEditMode && selectedBlockData)
  const blockLeftPx = pageSettings.marginLeftPx + selectedStyle.marginLeftPx
  const blockRightPx = pageSettings.widthPx - pageSettings.marginRightPx - selectedStyle.marginRightPx
  const firstLineIndentPx = blockLeftPx + selectedStyle.firstLineIndentPx

  useEffect(() => {
    if (!draggingMarker || !isBlockSelectedForEdit) return
    const onPointerMove = (event) => {
      const trackRect = rulerTrackRef.current?.getBoundingClientRect()
      if (!trackRect) return
      const x = clamp(event.clientX - trackRect.left, 0, trackRect.width)
      if (draggingMarker === 'marginLeftPx') {
        const nextLeft = clamp(x - pageSettings.marginLeftPx, 0, pageContentWidthPx - selectedStyle.marginRightPx)
        updateBlockStyle(selectedStyleType, 'marginLeftPx', Math.round(nextLeft))
      } else if (draggingMarker === 'marginRightPx') {
        const distanceFromRight = clamp((pageSettings.widthPx - pageSettings.marginRightPx) - x, 0, pageContentWidthPx - selectedStyle.marginLeftPx)
        updateBlockStyle(selectedStyleType, 'marginRightPx', Math.round(distanceFromRight))
      } else if (draggingMarker === 'firstLineIndentPx') {
        const maxIndent = Math.max(0, pageContentWidthPx - selectedStyle.marginLeftPx - selectedStyle.marginRightPx)
        const nextIndent = clamp(x - blockLeftPx, 0, maxIndent)
        updateBlockStyle(selectedStyleType, 'firstLineIndentPx', Math.round(nextIndent))
      }
    }
    const onPointerUp = () => setDraggingMarker(null)
    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
    return () => {
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
    }
  }, [blockLeftPx, draggingMarker, isBlockSelectedForEdit, pageContentWidthPx, pageSettings.marginLeftPx, pageSettings.marginRightPx, pageSettings.widthPx, selectedStyle.firstLineIndentPx, selectedStyle.marginLeftPx, selectedStyle.marginRightPx, selectedStyleType, updateBlockStyle])

  const DocumentRuler = () => {
    const contentWidthPx = Math.max(1, pageSettings.widthPx - pageSettings.marginLeftPx - pageSettings.marginRightPx)
    const totalInches = contentWidthPx / 96
    const quarterTicks = Math.round(totalInches * 4)
    const ticks = Array.from({ length: quarterTicks + 1 }, (_, idx) => {
      const isInch = idx % 4 === 0
      const isHalf = idx % 2 === 0
      return {
        x: pageSettings.marginLeftPx + ((idx / quarterTicks) * contentWidthPx),
        height: isInch ? 12 : isHalf ? 8 : 5,
        label: isInch ? String(idx / 4) : null,
      }
    })

    return (
      <div
        style={{
          width: `${pageSettings.widthPx}px`,
          height: RULER_HEIGHT_PX,
          border: '1px solid rgba(148,163,184,0.55)',
          borderRadius: 4,
          background: '#f8fafc',
          position: 'relative',
          overflow: 'hidden',
          boxSizing: 'border-box',
        }}
      >
        <div
          ref={rulerTrackRef}
          style={{
            position: 'absolute',
            inset: 0,
            background: `linear-gradient(to right, rgba(226,232,240,0.6) ${pageSettings.marginLeftPx}px, transparent ${pageSettings.marginLeftPx}px, transparent ${pageSettings.widthPx - pageSettings.marginRightPx}px, rgba(226,232,240,0.6) ${pageSettings.widthPx - pageSettings.marginRightPx}px)`,
          }}
        >
          {ticks.map((tick) => (
            <div key={tick.x} style={{ position: 'absolute', left: tick.x, bottom: 0, transform: 'translateX(-0.5px)' }}>
              <div style={{ width: 1, height: tick.height, background: 'rgba(51,65,85,0.48)' }} />
              {tick.label && <span style={{ position: 'absolute', top: 2, left: 4, fontSize: 9, color: '#64748b' }}>{tick.label}</span>}
            </div>
          ))}
          <div style={{ position: 'absolute', left: pageSettings.marginLeftPx, top: 0, bottom: 0, width: 1, background: 'rgba(30,41,59,0.35)' }} />
          <div style={{ position: 'absolute', left: pageSettings.widthPx - pageSettings.marginRightPx, top: 0, bottom: 0, width: 1, background: 'rgba(30,41,59,0.35)' }} />

          {isBlockSelectedForEdit && (
            <>
              <button type="button" onPointerDown={() => setDraggingMarker('marginLeftPx')} style={{ position: 'absolute', left: blockLeftPx - 6, top: -1, width: 12, height: 12, borderRadius: 2, border: '1px solid #2563eb', background: '#3b82f6', cursor: 'ew-resize' }} aria-label="Adjust block left margin" />
              <button type="button" onPointerDown={() => setDraggingMarker('marginRightPx')} style={{ position: 'absolute', left: blockRightPx - 6, top: -1, width: 12, height: 12, borderRadius: 2, border: '1px solid #2563eb', background: '#3b82f6', cursor: 'ew-resize' }} aria-label="Adjust block right margin" />
              <button type="button" onPointerDown={() => setDraggingMarker('firstLineIndentPx')} style={{ position: 'absolute', left: firstLineIndentPx - 6, top: 15, width: 12, height: 12, clipPath: 'polygon(50% 0%, 100% 100%, 0% 100%)', border: '1px solid #1d4ed8', background: '#60a5fa', cursor: 'ew-resize' }} aria-label="Adjust first-line indent" />
            </>
          )}
        </div>
      </div>
    )
  }

  const BlockStyleInspector = ({ type, style }) => (
    <div style={{ width: 260, border: '1px solid rgba(148,163,184,0.45)', borderRadius: 10, background: 'rgba(255,255,255,0.96)', padding: 12, alignSelf: 'flex-start', boxShadow: '0 4px 14px rgba(15,23,42,0.08)' }}>
      <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>Page Layout</div>
      {[
        ['widthPx', 'Page width'],
        ['marginTopPx', 'Top margin'],
        ['marginRightPx', 'Right margin'],
        ['marginBottomPx', 'Bottom margin'],
        ['marginLeftPx', 'Left margin'],
      ].map(([key, label]) => (
        <label key={key} style={{ display: 'grid', gridTemplateColumns: '1fr 78px', gap: 8, alignItems: 'center', fontSize: 11, marginBottom: 6 }}>
          <span>{label}</span>
          <input
            type="number"
            value={Number(pageSettings[key] ?? 0)}
            onChange={(e) => updateDocumentSettings((current) => ({ ...current, page: { ...current.page, [key]: Number(e.target.value) || 0 } }))}
            style={{ width: '100%', border: '1px solid rgba(74,85,104,0.25)', borderRadius: 4, padding: '3px 4px', fontSize: 11 }}
          />
        </label>
      ))}
      <div style={{ borderTop: '1px solid rgba(74,85,104,0.16)', margin: '8px 0' }} />
      <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>Block Layout · {type}</div>
      {[
        ['marginLeftPx', 'Left margin'],
        ['marginRightPx', 'Right margin'],
        ['firstLineIndentPx', 'First-line indent'],
        ['spacingBeforePx', 'Spacing before'],
        ['spacingAfterPx', 'Spacing after'],
        ['lineHeightPx', 'Line height'],
        ['fontSizePx', 'Font size'],
        ['letterSpacingPx', 'Letter spacing'],
      ].map(([key, label]) => (
        <label key={key} style={{ display: 'grid', gridTemplateColumns: '1fr 78px', gap: 8, alignItems: 'center', fontSize: 11, marginBottom: 6 }}>
          <span>{label}</span>
          <input type="number" value={Number(style[key] ?? 0)} onChange={(e) => updateBlockStyle(type, key, Number(e.target.value) || 0)} style={{ width: '100%', border: '1px solid rgba(74,85,104,0.25)', borderRadius: 4, padding: '3px 4px', fontSize: 11 }} />
        </label>
      ))}
      <label style={{ display: 'grid', gridTemplateColumns: '1fr 100px', gap: 8, alignItems: 'center', fontSize: 11, marginBottom: 10 }}>
        <span>Alignment</span>
        <select value={style.align || 'left'} onChange={(e) => updateBlockStyle(type, 'align', e.target.value)} style={{ border: '1px solid rgba(74,85,104,0.25)', borderRadius: 4, padding: '3px 4px', fontSize: 11 }}>
          <option value="left">Left</option>
          <option value="center">Center</option>
          <option value="right">Right</option>
          <option value="justify">Justify</option>
        </select>
      </label>
      {selectedBlockData && (
        <label style={{ display: 'block', fontSize: 11, marginBottom: 10 }}>
          <span style={{ display: 'block', marginBottom: 4 }}>Block text</span>
          <textarea
            value={String(selectedBlockData.text || '')}
            onChange={(event) => selectedBlock && updateBlock(selectedBlock.sceneId, selectedBlock.blockId, { text: event.target.value })}
            style={{ width: '100%', minHeight: 72, border: '1px solid rgba(74,85,104,0.25)', borderRadius: 4, padding: 6, fontSize: 12, fontFamily: SCREENPLAY_LAYOUT.typography.fontFamily, lineHeight: 1.4, boxSizing: 'border-box' }}
          />
        </label>
      )}
      <button className="toolbar-btn" style={{ width: '100%', marginBottom: 6 }} onClick={() => updateDocumentSettings((current) => resetBlockStyle(current, type))}>Reset {type} Default</button>
      <button className="toolbar-btn danger" style={{ width: '100%' }} onClick={() => updateDocumentSettings(() => DEFAULT_SCRIPT_DOCUMENT_SETTINGS)}>Reset Entire Document Formatting</button>
    </div>
  )

  if (orderedScenes.length === 0) {
    return (
      <div style={{ height: '100%', display: 'grid', placeItems: 'center' }}>
        <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center' }}>
          <p style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>No script imported yet</p>
          <p style={{ margin: 0, color: '#4A5568' }}>Import a screenplay to generate scenes and start linking shots.</p>
          <button className="dialog-button-primary" onClick={() => setImportModalOpen(true)}>Import Script</button>
        </div>
        <ImportScriptModal isOpen={importModalOpen} onClose={() => setImportModalOpen(false)} />
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', height: '100%' }}>
      <SidebarPane
        title={`Scenes · ${pagedScript.length} pp`}
        width={260}
        controls={null}
      >
          {orderedScenes.map(sc => (
            <button key={sc.id} onDoubleClick={() => openScenePropertiesDialog('script', sc.id)} onClick={() => headingRefs.current[sc.id]?.scrollIntoView({ behavior: 'smooth', block: 'start' })} style={{ width: '100%', textAlign: 'left', padding: '8px 10px', border: 'none', borderBottom: '1px solid rgba(74,85,104,0.08)', borderLeft: activeSceneId === sc.id ? '3px solid #E84040' : '3px solid transparent', background: activeSceneId === sc.id ? 'rgba(232,64,64,0.08)' : 'none' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <SceneColorPicker value={sc.color || null} onChange={(color) => updateScriptScene(sc.id, { color })} title="Scene color" />
                <span style={{ fontWeight: 700, fontSize: 11 }}>SC {sc.sceneNumber}</span>
                <span style={{ fontSize: 10, color: '#718096', marginLeft: 'auto' }}>{shotCounts[sc.id] || 0} shots</span>
              </div>
              <div style={{ fontSize: 10, color: '#4b5563', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sc.location || sc.slugline}</div>
              <div style={{ fontSize: 10, color: '#718096' }}>
                {scenePageStats[sc.id]?.pageCount?.toFixed(2) || pagination.byScene[sc.id]?.pageCount?.toFixed(2) || '0.00'} pp
              </div>
            </button>
          ))}
      </SidebarPane>

      <div
        ref={rightRef}
        onScroll={(e) => {
          setTabViewState('script', { scrollTop: e.currentTarget.scrollTop })
        }}
        style={{ flex: 1, overflowY: 'auto', padding: '8px 12px 16px', position: 'relative', background: '#eef2f7' }}
      >
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'flex-start', position: 'relative' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div style={{ width: `${pageSettings.widthPx}px`, minHeight: EDIT_BAR_HEIGHT_PX, border: '1px solid rgba(148,163,184,0.45)', borderRadius: 6, background: 'rgba(248,250,252,0.95)', padding: '4px 8px', display: 'flex', alignItems: 'center', gap: 6, boxSizing: 'border-box' }}>
              <button
                className={`toolbar-btn script-edit-toggle ${isEditMode ? 'active' : ''}`}
                onClick={() => setIsEditMode(value => !value)}
              >
                {isEditMode ? 'Done Editing' : 'Edit Script'}
              </button>
              {isEditMode && (
                <>
                  {isBlockSelectedForEdit && (
                    <>
                      <select
                        value={selectedStyleType}
                        onChange={(event) => selectedBlock && updateBlock(selectedBlock.sceneId, selectedBlock.blockId, { type: event.target.value })}
                        style={{ border: '1px solid rgba(74,85,104,0.28)', borderRadius: 4, background: '#fff', padding: '2px 6px', fontSize: 11 }}
                      >
                        {EDITABLE_SCREENPLAY_TYPES.map(type => (
                          <option key={type.value} value={type.value}>{type.label}</option>
                        ))}
                      </select>
                      <button className="toolbar-btn" onClick={() => selectedBlock && splitBlock(selectedBlock.sceneId, selectedBlock.blockId)} style={{ fontSize: 11, padding: '2px 6px' }}>Split</button>
                      <button className="toolbar-btn" onClick={() => selectedBlock && mergeBlock(selectedBlock.sceneId, selectedBlock.blockId, 'up')} style={{ fontSize: 11, padding: '2px 6px' }}>Merge ↑</button>
                      <button className="toolbar-btn" onClick={() => selectedBlock && mergeBlock(selectedBlock.sceneId, selectedBlock.blockId, 'down')} style={{ fontSize: 11, padding: '2px 6px' }}>Merge ↓</button>
                      <button className="toolbar-btn" onClick={() => selectedBlock && insertBlockAfter(selectedBlock.sceneId, selectedBlock.blockId)} style={{ fontSize: 11, padding: '2px 6px' }}>+ Block</button>
                    </>
                  )}
                  <button className="toolbar-btn" onClick={() => setIsInspectorOpen(value => !value)} style={{ marginLeft: 'auto', fontSize: 11 }}>
                    {isInspectorOpen ? 'Hide Formatting' : 'Show Formatting'}
                  </button>
                </>
              )}
            </div>
            {isEditMode && <div style={{ marginTop: 4 }}><DocumentRuler /></div>}
            <div style={{ height: isEditMode ? RULER_PAGE_GAP_PX : 6 }} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {pagedScript.map((page) => (
                <div
                  key={page.id}
                  style={{
                    width: `${pageSettings.widthPx}px`,
                    height: `${pageSettings.heightPx}px`,
                    background: '#fff',
                    border: '1px solid rgba(148,163,184,0.42)',
                    boxShadow: '0 2px 8px rgba(15,23,42,0.08)',
                    fontFamily: SCREENPLAY_LAYOUT.typography.fontFamily,
                    fontSize: screenplayFontSizePx,
                    lineHeight: `${screenplayLineHeightPx}px`,
                    paddingTop: `${pageSettings.marginTopPx}px`,
                    paddingRight: `${pageSettings.marginRightPx}px`,
                    paddingBottom: `${pageSettings.marginBottomPx}px`,
                    paddingLeft: `${pageSettings.marginLeftPx}px`,
                    boxSizing: 'border-box',
                    overflow: 'hidden',
                    position: 'relative',
                  }}
                >
                  {page.lines.map((row, rowIndex) => {
                    const styleCfg = getBlockStyleForType(documentSettings, row.type)
                    const selected = selectedBlock?.sceneId === row.sceneId && selectedBlock?.blockId === row.blockId
                    const isUppercaseType = ['heading', 'character', 'transition'].includes(row.type)
                    const isSpacer = row.type === 'spacer' || row.type === 'blank'
                    const textStyle = {
                      marginLeft: `${styleCfg.marginLeftPx}px`,
                      marginRight: `${styleCfg.marginRightPx}px`,
                      maxWidth: styleCfg.maxWidthPx ? `${styleCfg.maxWidthPx}px` : 'none',
                      paddingLeft: `${styleCfg.paddingLeftPx}px`,
                      paddingRight: `${styleCfg.paddingRightPx}px`,
                      textAlign: styleCfg.align || 'left',
                      minHeight: `${styleCfg.lineHeightPx}px`,
                      fontFamily: SCREENPLAY_LAYOUT.typography.fontFamily,
                      fontSize: `${styleCfg.fontSizePx}px`,
                      lineHeight: `${styleCfg.lineHeightPx}px`,
                      letterSpacing: `${styleCfg.letterSpacingPx}px`,
                      textIndent: row.isFirstChunk ? `${styleCfg.firstLineIndentPx}px` : '0px',
                      textTransform: isUppercaseType ? 'uppercase' : 'none',
                      border: selected && isEditMode && !isSpacer ? '1px solid rgba(37,99,235,0.55)' : '1px solid transparent',
                      background: selected && isEditMode && !isSpacer ? 'rgba(37,99,235,0.06)' : 'transparent',
                      borderRadius: 4,
                      paddingTop: 0,
                      paddingBottom: 0,
                      boxSizing: 'border-box',
                      whiteSpace: 'pre-wrap',
                      overflowWrap: 'break-word',
                    }
                    return (
                      <div
                        key={row.rowKey}
                        ref={(el) => {
                          if (row.isSceneStart) headingRefs.current[row.sceneId] = el
                        }}
                        data-sceneid={row.sceneId}
                        onClick={() => {
                          if (row.blockId) setSelectedBlock({ sceneId: row.sceneId, blockId: row.blockId })
                          setActiveSceneId(row.sceneId)
                        }}
                        style={{ minHeight: `${screenplayLineHeightPx}px` }}
                      >
                        <div style={textStyle}>{isSpacer ? '\u00a0' : String(row.text || '')}</div>
                      </div>
                    )
                  })}
                  <div style={{ position: 'absolute', top: 8, right: 14, fontSize: 11, color: 'rgba(100,116,139,0.8)' }}>{page.number}</div>
                </div>
              ))}
            </div>
          </div>
          {isInspectorOpen && isEditMode && (
            <div style={{ position: 'absolute', top: EDIT_BAR_HEIGHT_PX + RULER_HEIGHT_PX + 24, right: 12 }}>
              <BlockStyleInspector type={selectedStyleType} style={selectedStyle} />
            </div>
          )}
        </div>
      </div>

      {addShotDialog && <AddShotModal scene={addShotDialog.scene} shots={addShotDialog.existingShots} onClose={() => setAddShotDialog(null)} onConfirm={confirmAddShotDialog} />}
      {shotLinkDialog && (
        <ShotLinkDialog
          data={shotLinkDialog}
          onClose={() => setShotLinkDialog(null)}
          onUpdateShot={(shotId, updates) => updateShot(shotId, updates)}
          onUpdateShotImage={updateShotImage}
          useDropdowns={useDropdowns}
          onJumpToStoryboard={jumpToStoryboardShot}
        />
      )}
    </div>
  )
}
