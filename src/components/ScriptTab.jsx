import React, { useMemo, useRef, useState, useEffect, useCallback } from 'react'
import useStore from '../store'
import { naturalSortSceneNumber } from '../utils/sceneSort'
import SceneColorPicker from './SceneColorPicker'
import SpecsTable from './SpecsTable'
import ImportScriptModal from './ImportScriptModal'
import SidebarPane from './SidebarPane'
import {
  estimateScreenplayPagination,
  getSceneScreenplayElements,
  SCREENPLAY_FORMAT,
  SCREENPLAY_LAYOUT,
  SCENE_PAGINATION_MODES,
  getElementPrintLayout,
} from '../utils/screenplay'

const PAGE_SIZE = {
  width: SCREENPLAY_LAYOUT.page.widthPx,
  height: SCREENPLAY_LAYOUT.page.heightPx,
}
const PAGE_MARGIN = SCREENPLAY_LAYOUT.page.marginsPx
const SCREENPLAY_FONT_SIZE = SCREENPLAY_LAYOUT.typography.fontSizePx
const SCREENPLAY_LINE_HEIGHT_PX = SCREENPLAY_LAYOUT.typography.lineHeightPx
const ROWS_PER_PAGE = SCREENPLAY_FORMAT.pageLines
const ELEMENT_LAYOUT = Object.fromEntries(
  Object.keys(SCREENPLAY_FORMAT.charsPerLine).map(type => [type, getElementPrintLayout(type)]),
)

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

function buildScreenplayRows(orderedScenes, screenplayBySceneId) {
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
          rowKey: `${scene.id}-${idx}-0`,
          type: 'blank',
          text: '',
          sceneCharStart: sceneCharOffset,
          sceneCharEnd: sceneCharOffset,
          sourceIndex: idx,
          isSceneStart,
        })
      } else {
        const width = SCREENPLAY_FORMAT.charsPerLine[line.type] || SCREENPLAY_FORMAT.charsPerLine.action
        const chunks = splitToWrappedChunks(lineText, width)
        chunks.forEach((chunk, chunkIdx) => {
          rows.push({
            sceneId: scene.id,
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
    if (page.lines.length >= ROWS_PER_PAGE) pushPage()
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
      if (page.lines.length > 0 && page.lines.length + keepRows > ROWS_PER_PAGE) startNewPageIfNeeded()
    }

    if (row.type === 'character' && row.isFirstChunk) {
      const cueLen = getBlockLength(rows, i, r => r.sceneId === row.sceneId && r.sourceIndex === row.sourceIndex)
      const blockLen = getBlockLength(rows, i + cueLen, r => r.type === 'parenthetical' || r.type === 'dialogue' || r.type === 'spacer')
      const blockRows = rows.slice(i, i + cueLen + blockLen)
      const minDialogueAfterCue = SCREENPLAY_LAYOUT.pagination?.minDialogueLinesAfterCharacter ?? 2
      const minDialogueAtPageTop = SCREENPLAY_LAYOUT.pagination?.minDialogueLinesAtPageTop ?? 2
      const remaining = ROWS_PER_PAGE - page.lines.length
      const keepRows = cueLen + Math.max(1, Math.min(blockLen, minDialogueAfterCue))

      if (page.lines.length > 0 && page.lines.length + keepRows > ROWS_PER_PAGE) startNewPageIfNeeded()
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
      if (page.lines.length > 0 && page.lines.length + keepRows > ROWS_PER_PAGE) startNewPageIfNeeded()
    }

    if (row.type === 'section' && row.isFirstChunk) {
      const sectionLen = getBlockLength(rows, i, r => r.sceneId === row.sceneId && r.sourceIndex === row.sourceIndex)
      const gapLen = getBlockLength(rows, i + sectionLen, r => r.type === 'blank' || r.type === 'spacer')
      const nextBlockLen = getBlockLength(rows, i + sectionLen + gapLen, r => r.type !== 'blank' && r.type !== 'spacer')
      const minAfterSection = SCREENPLAY_LAYOUT.pagination?.minLinesAfterSection ?? 1
      const keepRows = sectionLen + gapLen + Math.min(nextBlockLen, minAfterSection)
      if (page.lines.length > 0 && page.lines.length + keepRows > ROWS_PER_PAGE) startNewPageIfNeeded()
    }

    if (row.type === 'action' && row.isFirstChunk) {
      const prevContent = previousContentRow(i)
      const minActionLinesAfterDialogue = SCREENPLAY_LAYOUT.pagination?.minActionLinesAfterDialogue ?? 2
      if (
        page.lines.length > 0
        && (prevContent?.type === 'dialogue' || prevContent?.type === 'parenthetical')
        && (ROWS_PER_PAGE - page.lines.length) < minActionLinesAfterDialogue
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
  const useDropdowns = useStore(s => s.useDropdowns)
  const scriptSettings = useStore(s => s.scriptSettings)
  const scriptFocusRequest = useStore(s => s.scriptFocusRequest)
  const clearScriptFocusRequest = useStore(s => s.clearScriptFocusRequest)
  const openScenePropertiesDialog = useStore(s => s.openScenePropertiesDialog)
  const scriptViewState = useStore(s => s.tabViewState?.script || {})
  const setTabViewState = useStore(s => s.setTabViewState)

  const rightRef = useRef(null)
  const headingRefs = useRef({})
  const [activeSceneId, setActiveSceneId] = useState(scriptViewState.activeSceneId || null)
  const [selectionBar, setSelectionBar] = useState(null)
  const [addShotDialog, setAddShotDialog] = useState(null)
  const [shotLinkDialog, setShotLinkDialog] = useState(null)
  const [pendingOpenShotDialog, setPendingOpenShotDialog] = useState(null)
  const [importModalOpen, setImportModalOpen] = useState(false)

  const orderedScenes = useMemo(() => [...scriptScenes].sort(naturalSortSceneNumber), [scriptScenes])
  const scenePaginationMode = scriptSettings?.scenePaginationMode || SCENE_PAGINATION_MODES.CONTINUE
  const pagination = useMemo(
    () => estimateScreenplayPagination(orderedScenes, { scenePaginationMode }),
    [orderedScenes, scenePaginationMode],
  )

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

  const screenplayBySceneId = useMemo(() => {
    const result = {}
    orderedScenes.forEach(sc => { result[sc.id] = getSceneScreenplayElements(sc) })
    return result
  }, [orderedScenes])

  const sceneFullTextById = useMemo(() => {
    const out = {}
    orderedScenes.forEach(scene => {
      const elements = screenplayBySceneId[scene.id] || []
      out[scene.id] = elements.map(el => String(el.text || '')).join('\n')
    })
    return out
  }, [orderedScenes, screenplayBySceneId])

  const screenplayRows = useMemo(() => buildScreenplayRows(orderedScenes, screenplayBySceneId), [orderedScenes, screenplayBySceneId])
  const pagedScript = useMemo(
    () => paginateRows(screenplayRows, { scenePaginationMode }),
    [screenplayRows, scenePaginationMode],
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
    setTabViewState('script', { activeSceneId })
  }, [activeSceneId, setTabViewState])

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

  const getClosestRowEl = (node) => {
    if (!node) return null
    if (node.nodeType === Node.ELEMENT_NODE) return node.closest('[data-row-start]')
    return node.parentElement?.closest('[data-row-start]') || null
  }

  const getLocalOffset = (rowEl, container, offset) => {
    const r = document.createRange()
    r.selectNodeContents(rowEl)
    r.setEnd(container, offset)
    return r.toString().length
  }

  useEffect(() => {
    const onMouseUp = () => {
      const sel = window.getSelection()
      if (!sel || sel.rangeCount === 0 || sel.isCollapsed) {
        setSelectionBar(null)
        return
      }
      const range = sel.getRangeAt(0)
      if (!rightRef.current?.contains(range.commonAncestorContainer)) {
        setSelectionBar(null)
        return
      }

      const startRow = getClosestRowEl(range.startContainer)
      const endRow = getClosestRowEl(range.endContainer)
      const sceneEl = (startRow || endRow)?.closest('[data-sceneid]')
      const sceneId = sceneEl?.getAttribute('data-sceneid')
      if (!sceneId || !startRow || !endRow) {
        setSelectionBar(null)
        return
      }

      const startBase = Number(startRow.dataset.rowStart || 0)
      const endBase = Number(endRow.dataset.rowStart || 0)
      const absA = startBase + getLocalOffset(startRow, range.startContainer, range.startOffset)
      const absB = endBase + getLocalOffset(endRow, range.endContainer, range.endOffset)
      const rangeStart = Math.min(absA, absB)
      const rangeEnd = Math.max(absA, absB)
      if (!Number.isFinite(rangeStart) || !Number.isFinite(rangeEnd) || rangeEnd <= rangeStart) {
        setSelectionBar(null)
        return
      }

      const fullText = sceneFullTextById[sceneId] || ''
      const text = fullText.slice(rangeStart, rangeEnd)
      if (!text.trim()) {
        setSelectionBar(null)
        return
      }

      const rect = range.getBoundingClientRect()
      const scene = scriptScenes.find(s => s.id === sceneId)
      setSelectionBar({
        x: rect.left + window.scrollX,
        y: rect.top + window.scrollY - 40,
        text: text.slice(0, 260),
        sceneId,
        sceneNumber: scene?.sceneNumber || '',
        rangeStart,
        rangeEnd,
      })
    }

    document.addEventListener('mouseup', onMouseUp)
    return () => document.removeEventListener('mouseup', onMouseUp)
  }, [scriptScenes, sceneFullTextById])

  const findStoryboardSceneForScriptScene = (scriptScene) => {
    if (!scriptScene) return null
    for (const storyboardScene of scenes) {
      if (storyboardScene.shots.some(shot => shot.linkedSceneId === scriptScene.id)) return storyboardScene
    }
    return scenes[0] || null
  }

  const openAddShotDialog = (sceneId, selectedText = '') => {
    const scriptScene = scriptScenes.find(scene => scene.id === sceneId)
    if (!scriptScene) return
    setAddShotDialog({
      scene: scriptScene,
      selectedText,
      existingShots: allLinkedShotsForScriptScene(sceneId),
      rangeStart: selectionBar?.rangeStart ?? null,
      rangeEnd: selectionBar?.rangeEnd ?? null,
    })
    setSelectionBar(null)
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

  const getRowStyle = (lineType) => {
    const style = {
      whiteSpace: 'pre',
      lineHeight: `${SCREENPLAY_LINE_HEIGHT_PX}px`,
      height: `${SCREENPLAY_LINE_HEIGHT_PX}px`,
      overflow: 'hidden',
      position: 'relative',
      color: '#111827',
      width: '100%',
    }

    if (lineType === 'heading') return { ...style, textTransform: 'uppercase', fontWeight: 700 }
    if (lineType === 'spacer') return { ...style, color: 'transparent' }
    if (lineType === 'action') return { ...style }
    if (lineType === 'section') return { ...style, textTransform: 'uppercase', textAlign: 'center', fontWeight: 700, color: '#374151' }
    if (lineType === 'character') return { ...style, textAlign: 'center', textTransform: 'uppercase' }
    if (lineType === 'parenthetical') return { ...style, color: '#374151' }
    if (lineType === 'dialogue') return { ...style }
    if (lineType === 'transition') return { ...style, textAlign: 'right', textTransform: 'uppercase', fontWeight: 700 }
    return style
  }

  const renderRow = (row) => {
    if (row.type === 'blank' || row.type === 'spacer') {
      return <div key={row.rowKey} data-row-start={row.sceneCharStart} data-row-end={row.sceneCharEnd} style={{ height: `${SCREENPLAY_LINE_HEIGHT_PX}px`, width: '100%' }} />
    }

    const text = String(row.text || '')
    const linkedShots = allLinkedShotsForScriptScene(row.sceneId).filter(shot => (
      Number.isFinite(shot.linkedScriptRangeStart)
      && Number.isFinite(shot.linkedScriptRangeEnd)
      && shot.linkedScriptRangeStart < row.sceneCharEnd
      && shot.linkedScriptRangeEnd > row.sceneCharStart
    ))

    const localRanges = linkedShots.map(shot => ({
      shotId: shot.id,
      start: Math.max(0, shot.linkedScriptRangeStart - row.sceneCharStart),
      end: Math.min(text.length, shot.linkedScriptRangeEnd - row.sceneCharStart),
    })).filter(r => r.end > r.start)

    const markers = Array.from(new Set([0, text.length, ...localRanges.flatMap(r => [r.start, r.end])])).sort((a, b) => a - b)
    const pieces = []
    for (let i = 0; i < markers.length - 1; i += 1) {
      const start = markers[i]
      const end = markers[i + 1]
      const segText = text.slice(start, end)
      const matches = localRanges.filter(r => r.start < end && r.end > start)
      pieces.push({ key: `${row.rowKey}-${start}-${end}`, text: segText, matches })
    }

    const hasAnnotation = localRanges.length > 0
    return (
      <div key={row.rowKey} data-row-start={row.sceneCharStart} data-row-end={row.sceneCharEnd} style={getRowStyle(row.type)}>
        {pieces.map(piece => {
          if (!piece.matches.length) return <span key={piece.key}>{piece.text}</span>
          const shotIds = [...new Set(piece.matches.map(m => m.shotId))]
          const firstShot = allLinkedShotsForScriptScene(row.sceneId).find(sh => sh.id === shotIds[0])
          const highlightStyle = getHighlightStyleForShot(firstShot)
          return (
            <span
              key={piece.key}
              onClick={(e) => {
                e.stopPropagation()
                openShotLinkDialog(row.sceneId, shotIds)
              }}
              style={{ background: highlightStyle.background, boxShadow: `inset 0 -1px 0 ${highlightStyle.underline}`, cursor: 'pointer' }}
              title={firstShot?.displayId ? `View Shot ${firstShot.displayId}` : 'View Linked Shot'}
            >
              {piece.text}
            </span>
          )
        })}
        {hasAnnotation && (
          <span
            style={{
              position: 'absolute',
              right: 0,
              top: -10,
              fontSize: 8,
              color: '#991b1b',
              border: '1px solid rgba(153,27,27,0.35)',
              borderRadius: 999,
              padding: '0 6px',
              fontFamily: 'Sora, sans-serif',
              background: '#fff1f2',
              pointerEvents: 'none',
              lineHeight: 1.4,
            }}
          >
            SHOT LINK
          </span>
        )}
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', height: '100%' }}>
      <SidebarPane title={`Scenes · ${pagedScript.length} pp`} width={260}>
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
        onScroll={(e) => setTabViewState('script', { scrollTop: e.currentTarget.scrollTop })}
        style={{ flex: 1, overflowY: 'auto', padding: 18, position: 'relative' }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24 }}>
          {pagedScript.map(page => (
            <div key={page.id} style={{ width: `${PAGE_SIZE.width}px`, height: `${PAGE_SIZE.height}px`, background: '#fff', border: '1px solid rgba(74,85,104,0.28)', boxShadow: '0 8px 24px rgba(15,23,42,0.12)', fontFamily: SCREENPLAY_LAYOUT.typography.fontFamily, fontSize: SCREENPLAY_FONT_SIZE, lineHeight: `${SCREENPLAY_LINE_HEIGHT_PX}px`, position: 'relative', overflow: 'hidden' }}>
              {page.number > 1 && (
                <div
                  style={{
                    position: 'absolute',
                    top: `${SCREENPLAY_LAYOUT.pageNumber.topPx}px`,
                    right: `${SCREENPLAY_LAYOUT.pageNumber.rightPx}px`,
                    fontSize: `${SCREENPLAY_LAYOUT.pageNumber.fontSizePx}px`,
                    color: '#111827',
                  }}
                >
                  {page.number}
                </div>
              )}
              <div style={{ position: 'absolute', inset: `${PAGE_MARGIN.top}px ${PAGE_MARGIN.right}px ${PAGE_MARGIN.bottom}px ${PAGE_MARGIN.left}px`, overflow: 'hidden' }}>
                {page.lines.map((row, idx) => {
                  const scene = orderedScenes.find(sc => sc.id === row.sceneId)
                  const isSceneAnchor = row.type === 'heading' && row.isFirstChunk
                  const layout = ELEMENT_LAYOUT[row.type] || ELEMENT_LAYOUT.action
                  return (
                    <div
                      key={row.rowKey}
                      data-sceneid={row.sceneId}
                      style={{
                        position: 'absolute',
                        top: `${idx * SCREENPLAY_LINE_HEIGHT_PX}px`,
                        left: 0,
                        right: 0,
                        height: `${SCREENPLAY_LINE_HEIGHT_PX}px`,
                      }}
                    >
                      {isSceneAnchor && (
                        <>
                          <button
                            ref={el => { headingRefs.current[row.sceneId] = el }}
                            data-sceneid={row.sceneId}
                            onDoubleClick={() => openScenePropertiesDialog('script', row.sceneId)}
                            onClick={() => setActiveSceneId(row.sceneId)}
                            title={`Scene ${scene?.sceneNumber || ''}`}
                            style={{
                              position: 'absolute',
                              left: -132,
                              top: -1,
                              border: '1px solid rgba(74,85,104,0.3)',
                              background: '#f8fafc',
                              color: '#334155',
                              borderRadius: 999,
                              padding: '0 8px',
                              fontSize: 10,
                              fontFamily: 'Sora, sans-serif',
                              lineHeight: '16px',
                              cursor: 'pointer',
                            }}
                          >
                            SC {scene?.sceneNumber || ''}
                            {(shotCounts[row.sceneId] || 0) > 0 ? ` · ${shotCounts[row.sceneId]} shot${shotCounts[row.sceneId] === 1 ? '' : 's'}` : ''}
                          </button>
                          <span
                            style={{
                              position: 'absolute',
                              left: -132,
                              top: 16,
                              maxWidth: 120,
                              fontSize: 9,
                              color: '#64748b',
                              fontFamily: 'Sora, sans-serif',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                              pointerEvents: 'none',
                            }}
                            title={scene?.slugline || ''}
                          >
                            {scene?.slugline || ''}
                          </span>
                        </>
                      )}
                      <div
                        style={{
                          position: 'absolute',
                          left: `${layout.leftPx}px`,
                          width: `${layout.widthPx}px`,
                          ...(layout.textAlign ? { textAlign: layout.textAlign } : {}),
                        }}
                      >
                        {renderRow(row)}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {selectionBar && (
        <div style={{ position: 'fixed', left: selectionBar.x, top: selectionBar.y, zIndex: 120, background: '#1c1c1e', color: '#fff', borderRadius: 8, padding: '6px 8px', display: 'flex', gap: 8, alignItems: 'center' }}>
          <button onClick={() => openAddShotDialog(selectionBar.sceneId, selectionBar.text)} style={{ border: 'none', background: 'none', color: '#fff', cursor: 'pointer' }}>+ Add Shot to SC {selectionBar.sceneNumber}</button>
          <button onClick={() => {
            const scene = scriptScenes.find(s => s.id === selectionBar.sceneId)
            if (scene) updateScriptScene(scene.id, { notes: `${scene.notes || ''}\n${selectionBar.text}`.trim() })
            setSelectionBar(null)
          }} style={{ border: 'none', background: 'none', color: '#fff', cursor: 'pointer' }}>🔖</button>
        </div>
      )}

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
