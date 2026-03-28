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
  const updateScriptSceneScreenplay = useStore(s => s.updateScriptSceneScreenplay)
  const scriptSettings = useStore(s => s.scriptSettings)
  const setScriptSettings = useStore(s => s.setScriptSettings)

  const rightRef = useRef(null)
  const headingRefs = useRef({})
  const blockInputRefs = useRef({})
  const rulerTrackRef = useRef(null)

  const [activeSceneId, setActiveSceneId] = useState(null)
  const [selectedBlock, setSelectedBlock] = useState(null)
  const [draggingMarker, setDraggingMarker] = useState(null)
  const [activeDialog, setActiveDialog] = useState(null)

  const orderedScenes = useMemo(() => [...scriptScenes].sort(naturalSortSceneNumber), [scriptScenes])
  const scenePaginationMode = scriptSettings?.scenePaginationMode || SCENE_PAGINATION_MODES.CONTINUE
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

  const screenplayBySceneId = useMemo(() => {
    const result = {}
    orderedScenes.forEach(sc => { result[sc.id] = ensureEditableScreenplayElements(getSceneScreenplayElements(sc)) })
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

  const selectedScene = selectedBlock?.sceneId ? orderedScenes.find(scene => scene.id === selectedBlock.sceneId) : null
  const selectedBlockData = selectedScene
    ? ensureEditableScreenplayElements(getSceneScreenplayElements(selectedScene)).find((block) => block.id === selectedBlock?.blockId)
    : null
  const selectedStyleType = selectedBlockData?.type || 'action'
  const selectedStyle = getBlockStyleForType(documentSettings, selectedStyleType)
  const pageContentWidthPx = Math.max(120, pageSettings.widthPx - pageSettings.marginLeftPx - pageSettings.marginRightPx)

  const blockLeftPx = pageSettings.marginLeftPx + selectedStyle.marginLeftPx
  const blockRightPx = pageSettings.widthPx - pageSettings.marginRightPx - selectedStyle.marginRightPx
  const firstLineIndentPx = blockLeftPx + selectedStyle.firstLineIndentPx

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

  const updateSceneBlocks = useCallback((sceneId, updater) => {
    const scene = orderedScenes.find(entry => entry.id === sceneId)
    if (!scene) return
    const current = ensureEditableScreenplayElements(getSceneScreenplayElements(scene))
    const next = ensureEditableScreenplayElements(typeof updater === 'function' ? updater(current) : updater)
    updateScriptSceneScreenplay(sceneId, next)
  }, [orderedScenes, updateScriptSceneScreenplay])

  const updateBlockText = useCallback((sceneId, blockId, text) => {
    updateSceneBlocks(sceneId, (blocks) => blocks.map(block => (block.id === blockId ? { ...block, text } : block)))
  }, [updateSceneBlocks])

  const updateBlockType = useCallback((sceneId, blockId, type) => {
    updateSceneBlocks(sceneId, (blocks) => blocks.map(block => (block.id === blockId ? { ...block, type } : block)))
  }, [updateSceneBlocks])

  const screenplayTypeOrder = useMemo(() => EDITABLE_SCREENPLAY_TYPES.map(option => option.value), [])
  const nextTypeForEnter = useCallback((type) => {
    if (type === 'character') return 'dialogue'
    if (type === 'parenthetical') return 'dialogue'
    if (type === 'dialogue') return 'action'
    return type
  }, [])

  const cycleType = useCallback((sceneId, blockId, direction = 1) => {
    updateSceneBlocks(sceneId, (blocks) => {
      const index = blocks.findIndex(block => block.id === blockId)
      if (index === -1) return blocks
      const currentIndex = screenplayTypeOrder.indexOf(blocks[index].type)
      const nextIndex = (currentIndex + direction + screenplayTypeOrder.length) % screenplayTypeOrder.length
      const next = [...blocks]
      next[index] = { ...next[index], type: screenplayTypeOrder[nextIndex] }
      return next
    })
  }, [screenplayTypeOrder, updateSceneBlocks])

  const insertBlockAfter = useCallback((sceneId, blockId, type) => {
    const newBlock = createScreenplayElement(type, '')
    updateSceneBlocks(sceneId, (blocks) => {
      const index = blocks.findIndex(block => block.id === blockId)
      if (index === -1) return blocks
      const next = [...blocks]
      next.splice(index + 1, 0, newBlock)
      return next
    })
    setSelectedBlock({ sceneId, blockId: newBlock.id })
    requestAnimationFrame(() => blockInputRefs.current[`${sceneId}:${newBlock.id}`]?.focus())
  }, [updateSceneBlocks])

  const mergeWithPrevious = useCallback((sceneId, blockId) => {
    updateSceneBlocks(sceneId, (blocks) => {
      const index = blocks.findIndex(block => block.id === blockId)
      if (index <= 0) return blocks
      const prev = blocks[index - 1]
      const curr = blocks[index]
      const next = [...blocks]
      next[index - 1] = { ...prev, text: `${prev.text || ''}${curr.text || ''}` }
      next.splice(index, 1)
      setSelectedBlock({ sceneId, blockId: prev.id })
      requestAnimationFrame(() => blockInputRefs.current[`${sceneId}:${prev.id}`]?.focus())
      return next
    })
  }, [updateSceneBlocks])

  const pxToInches = useCallback((px) => Number((px / 96).toFixed(2)), [])
  const inchesToPx = useCallback((inches) => Math.round((Number(inches) || 0) * 96), [])

  useEffect(() => {
    if (!draggingMarker || !selectedBlockData) return
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
  }, [blockLeftPx, draggingMarker, pageContentWidthPx, pageSettings.marginLeftPx, pageSettings.marginRightPx, pageSettings.widthPx, selectedBlockData, selectedStyle.marginLeftPx, selectedStyle.marginRightPx, selectedStyleType, updateBlockStyle])

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
      <div style={{ width: `${pageSettings.widthPx}px`, height: RULER_HEIGHT_PX, border: '1px solid rgba(148,163,184,0.55)', borderRadius: 4, background: '#f8fafc', position: 'relative', overflow: 'hidden', boxSizing: 'border-box' }}>
        <div
          ref={rulerTrackRef}
          style={{ position: 'absolute', inset: 0, background: `linear-gradient(to right, rgba(226,232,240,0.6) ${pageSettings.marginLeftPx}px, transparent ${pageSettings.marginLeftPx}px, transparent ${pageSettings.widthPx - pageSettings.marginRightPx}px, rgba(226,232,240,0.6) ${pageSettings.widthPx - pageSettings.marginRightPx}px)` }}
        >
          {ticks.map((tick) => (
            <div key={tick.x} style={{ position: 'absolute', left: tick.x, bottom: 0, transform: 'translateX(-0.5px)' }}>
              <div style={{ width: 1, height: tick.height, background: 'rgba(51,65,85,0.48)' }} />
              {tick.label && <span style={{ position: 'absolute', top: 2, left: 4, fontSize: 9, color: '#64748b' }}>{tick.label}</span>}
            </div>
          ))}
          <div style={{ position: 'absolute', left: pageSettings.marginLeftPx, top: 0, bottom: 0, width: 1, background: 'rgba(30,41,59,0.35)' }} />
          <div style={{ position: 'absolute', left: pageSettings.widthPx - pageSettings.marginRightPx, top: 0, bottom: 0, width: 1, background: 'rgba(30,41,59,0.35)' }} />

          {selectedBlockData && (
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

  const InlineNumericField = ({ label, pxValue, onChange }) => (
    <label style={{ display: 'grid', gridTemplateColumns: '1fr 82px', gap: 8, alignItems: 'center', fontSize: 12, marginBottom: 8 }}>
      <span>{label}</span>
      <input
        type="number"
        step="0.05"
        value={pxToInches(pxValue)}
        onChange={(event) => onChange(inchesToPx(event.target.value))}
        style={{ width: '100%', border: '1px solid rgba(74,85,104,0.25)', borderRadius: 4, padding: '4px 6px', fontSize: 12 }}
      />
    </label>
  )

  const handleBlockKeyDown = useCallback((event, row) => {
    if (!row?.blockId) return
    if (event.key === 'Tab') {
      event.preventDefault()
      cycleType(row.sceneId, row.blockId, event.shiftKey ? -1 : 1)
      return
    }

    const input = event.currentTarget
    const atStart = input.selectionStart === 0 && input.selectionEnd === 0

    if (event.key === 'Enter') {
      event.preventDefault()
      insertBlockAfter(row.sceneId, row.blockId, nextTypeForEnter(row.type))
      return
    }

    if (event.key === 'Backspace' && atStart && !String(input.value || '').length) {
      event.preventDefault()
      mergeWithPrevious(row.sceneId, row.blockId)
    }
  }, [cycleType, insertBlockAfter, mergeWithPrevious, nextTypeForEnter])

  if (orderedScenes.length === 0) {
    return (
      <div style={{ height: '100%', display: 'grid', placeItems: 'center' }}>
        <p style={{ margin: 0, fontSize: 18, color: '#475569' }}>Import a screenplay to start writing in the Script tab.</p>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div className="app-surface-card" style={{ minHeight: EDIT_BAR_HEIGHT_PX, borderRadius: 0, borderLeft: 'none', borderRight: 'none', display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px' }}>
        <span style={{ fontSize: 12, color: '#475569', fontWeight: 700 }}>Script Editor</span>
        <select
          value={scenePaginationMode}
          onChange={(event) => setScriptSettings({ scenePaginationMode: event.target.value })}
          style={{ border: '1px solid rgba(74,85,104,0.28)', borderRadius: 4, background: '#fff', padding: '4px 6px', fontSize: 12 }}
        >
          <option value={SCENE_PAGINATION_MODES.CONTINUE}>Natural pagination</option>
          <option value={SCENE_PAGINATION_MODES.NEW_PAGE}>New page per scene</option>
        </select>
        {selectedBlockData && (
          <select
            value={selectedStyleType}
            onChange={(event) => updateBlockType(selectedBlock.sceneId, selectedBlock.blockId, event.target.value)}
            style={{ border: '1px solid rgba(74,85,104,0.28)', borderRadius: 4, background: '#fff', padding: '4px 6px', fontSize: 12 }}
          >
            {EDITABLE_SCREENPLAY_TYPES.map(type => (<option key={type.value} value={type.value}>{type.label}</option>))}
          </select>
        )}
        <button className="toolbar-btn" onClick={() => setActiveDialog(activeDialog === 'page' ? null : 'page')} style={{ marginLeft: 'auto' }}>Page Setup</button>
        <button className="toolbar-btn" onClick={() => setActiveDialog(activeDialog === 'styles' ? null : 'styles')}>Element Styles</button>
      </div>

      <div ref={rightRef} style={{ flex: 1, overflowY: 'auto', padding: '12px 0 24px' }}>
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'flex-start', gap: 18, position: 'relative' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <DocumentRuler />
            <div style={{ height: RULER_PAGE_GAP_PX }} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {pagedScript.map((page) => (
                <div
                  className="app-panel-shadow"
                  key={page.id}
                  style={{
                    width: `${pageSettings.widthPx}px`,
                    height: `${pageSettings.heightPx}px`,
                    background: '#fff',
                    border: '1px solid rgba(148,163,184,0.42)',
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
                  {page.lines.map((row) => {
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
                      border: selected && !isSpacer ? '1px solid rgba(37,99,235,0.55)' : '1px solid transparent',
                      background: selected && !isSpacer ? 'rgba(37,99,235,0.06)' : 'transparent',
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
                        onClick={() => {
                          if (row.blockId) {
                            setSelectedBlock({ sceneId: row.sceneId, blockId: row.blockId })
                            requestAnimationFrame(() => blockInputRefs.current[`${row.sceneId}:${row.blockId}`]?.focus())
                          }
                          setActiveSceneId(row.sceneId)
                        }}
                        style={{ minHeight: `${screenplayLineHeightPx}px` }}
                      >
                        {row.blockId && row.isFirstChunk ? (
                          <textarea
                            ref={(el) => {
                              blockInputRefs.current[`${row.sceneId}:${row.blockId}`] = el
                            }}
                            value={String(selectedBlock?.sceneId === row.sceneId && selectedBlock?.blockId === row.blockId ? selectedBlockData?.text || '' : (() => {
                              const scene = orderedScenes.find(entry => entry.id === row.sceneId)
                              const blocks = ensureEditableScreenplayElements(getSceneScreenplayElements(scene))
                              return blocks.find(block => block.id === row.blockId)?.text || ''
                            })())}
                            onFocus={() => setSelectedBlock({ sceneId: row.sceneId, blockId: row.blockId })}
                            onChange={(event) => updateBlockText(row.sceneId, row.blockId, event.target.value)}
                            onKeyDown={(event) => handleBlockKeyDown(event, row)}
                            style={{
                              ...textStyle,
                              width: '100%',
                              resize: 'none',
                              border: selected ? '1px solid rgba(37,99,235,0.75)' : '1px solid transparent',
                              outline: 'none',
                              background: selected ? 'rgba(37,99,235,0.06)' : 'transparent',
                              overflow: 'hidden',
                            }}
                            rows={1}
                          />
                        ) : (
                          <div style={textStyle}>{isSpacer ? ' ' : String(row.text || '')}</div>
                        )}
                      </div>
                    )
                  })}
                  <div style={{ position: 'absolute', top: 8, right: 14, fontSize: 11, color: 'rgba(100,116,139,0.8)' }}>{page.number}</div>
                </div>
              ))}
            </div>
          </div>

          {activeDialog === 'page' && (
            <div style={{ width: 290, border: '1px solid rgba(148,163,184,0.45)', borderRadius: 10, background: 'rgba(255,255,255,0.98)', padding: 12, alignSelf: 'flex-start', boxShadow: '0 4px 14px rgba(15,23,42,0.08)' }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Page Setup (inches)</div>
              <InlineNumericField label="Page width" pxValue={pageSettings.widthPx} onChange={(value) => updateDocumentSettings((current) => ({ ...current, page: { ...current.page, widthPx: value } }))} />
              <InlineNumericField label="Page height" pxValue={pageSettings.heightPx} onChange={(value) => updateDocumentSettings((current) => ({ ...current, page: { ...current.page, heightPx: value } }))} />
              <InlineNumericField label="Top margin" pxValue={pageSettings.marginTopPx} onChange={(value) => updateDocumentSettings((current) => ({ ...current, page: { ...current.page, marginTopPx: value } }))} />
              <InlineNumericField label="Right margin" pxValue={pageSettings.marginRightPx} onChange={(value) => updateDocumentSettings((current) => ({ ...current, page: { ...current.page, marginRightPx: value } }))} />
              <InlineNumericField label="Bottom margin" pxValue={pageSettings.marginBottomPx} onChange={(value) => updateDocumentSettings((current) => ({ ...current, page: { ...current.page, marginBottomPx: value } }))} />
              <InlineNumericField label="Left margin" pxValue={pageSettings.marginLeftPx} onChange={(value) => updateDocumentSettings((current) => ({ ...current, page: { ...current.page, marginLeftPx: value } }))} />
            </div>
          )}

          {activeDialog === 'styles' && (
            <div style={{ width: 290, border: '1px solid rgba(148,163,184,0.45)', borderRadius: 10, background: 'rgba(255,255,255,0.98)', padding: 12, alignSelf: 'flex-start', boxShadow: '0 4px 14px rgba(15,23,42,0.08)' }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Element Styles · {selectedStyleType}</div>
              <InlineNumericField label="Left indent" pxValue={selectedStyle.marginLeftPx} onChange={(value) => updateBlockStyle(selectedStyleType, 'marginLeftPx', value)} />
              <InlineNumericField label="Right indent" pxValue={selectedStyle.marginRightPx} onChange={(value) => updateBlockStyle(selectedStyleType, 'marginRightPx', value)} />
              <InlineNumericField label="First-line indent" pxValue={selectedStyle.firstLineIndentPx} onChange={(value) => updateBlockStyle(selectedStyleType, 'firstLineIndentPx', value)} />
              <InlineNumericField label="Spacing before" pxValue={selectedStyle.spacingBeforePx} onChange={(value) => updateBlockStyle(selectedStyleType, 'spacingBeforePx', value)} />
              <InlineNumericField label="Spacing after" pxValue={selectedStyle.spacingAfterPx} onChange={(value) => updateBlockStyle(selectedStyleType, 'spacingAfterPx', value)} />
              <InlineNumericField label="Line height" pxValue={selectedStyle.lineHeightPx} onChange={(value) => updateBlockStyle(selectedStyleType, 'lineHeightPx', value)} />
              <label style={{ display: 'grid', gridTemplateColumns: '1fr 100px', gap: 8, alignItems: 'center', fontSize: 12, marginBottom: 10 }}>
                <span>Alignment</span>
                <select value={selectedStyle.align || 'left'} onChange={(event) => updateBlockStyle(selectedStyleType, 'align', event.target.value)} style={{ border: '1px solid rgba(74,85,104,0.25)', borderRadius: 4, padding: '4px 6px', fontSize: 12 }}>
                  <option value="left">Left</option>
                  <option value="center">Center</option>
                  <option value="right">Right</option>
                  <option value="justify">Justify</option>
                </select>
              </label>
              <button className="toolbar-btn" style={{ width: '100%' }} onClick={() => updateDocumentSettings((current) => resetBlockStyle(current, selectedStyleType))}>Reset {selectedStyleType}</button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
