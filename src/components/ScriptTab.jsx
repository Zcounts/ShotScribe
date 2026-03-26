import React, { useMemo, useRef, useState, useEffect, useCallback } from 'react'
import useStore from '../store'
import { naturalSortSceneNumber } from '../utils/sceneSort'
import SceneColorPicker from './SceneColorPicker'
import SpecsTable from './SpecsTable'
import { estimateScreenplayPagination, getSceneScreenplayElements, SCREENPLAY_FORMAT } from '../utils/screenplay'

const PAGE_SIZE = { width: 816, height: 1056 }
const PAGE_MARGIN = { top: 96, right: 96, bottom: 96, left: 144 }
const SCREENPLAY_FONT_SIZE = 12
const SCREENPLAY_LINE_HEIGHT = 1.5
const SCREENPLAY_LINE_HEIGHT_PX = SCREENPLAY_FONT_SIZE * SCREENPLAY_LINE_HEIGHT
const ROWS_PER_PAGE = Math.floor((PAGE_SIZE.height - PAGE_MARGIN.top - PAGE_MARGIN.bottom) / SCREENPLAY_LINE_HEIGHT_PX)

function AddShotModal({ scene, shots, onClose, onConfirm }) {
  const [mode, setMode] = useState('new')
  const [selectedShotId, setSelectedShotId] = useState(shots[0]?.id || null)

  return (
    <div className="modal-overlay" style={{ zIndex: 650 }} onClick={onClose}>
      <div className="modal" style={{ maxWidth: 560 }} onClick={e => e.stopPropagation()}>
        <h3 style={{ marginBottom: 4 }}>Add Shot to SC {scene.sceneNumber}</h3>
        <p style={{ marginBottom: 12, fontSize: 12, color: '#4A5568' }}>{scene.slugline || scene.location || 'Script scene'}</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}><input type="radio" checked={mode === 'existing'} onChange={() => setMode('existing')} />Link existing shot</label>
          {mode === 'existing' && (
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
          )}
          <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}><input type="radio" checked={mode === 'new'} onChange={() => setMode('new')} />Create brand new shot</label>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
          <button onClick={onClose}>Cancel</button>
          <button onClick={() => onConfirm({ mode, selectedShotId })} disabled={mode === 'existing' && !selectedShotId}>Confirm</button>
        </div>
      </div>
    </div>
  )
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
      <div className="modal" style={{ width: 760, maxWidth: '95vw' }} onClick={e => e.stopPropagation()}>
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
              value={activeShot.cameraName || ''}
              onChange={(e) => onUpdateShot(activeShot.id, { cameraName: e.target.value })}
              style={{ border: 'none', background: 'transparent', fontSize: 12, flex: 1, minWidth: 120 }}
            />
            <input
              value={activeShot.focalLength || ''}
              onChange={(e) => onUpdateShot(activeShot.id, { focalLength: e.target.value })}
              style={{ border: 'none', background: 'transparent', fontSize: 12, width: 80, textAlign: 'right' }}
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
    elements.forEach((line, idx) => {
      const lineText = String(line.text || '')
      const nextOffset = sceneCharOffset + lineText.length + 1
      if (line.type === 'blank') {
        rows.push({
          sceneId: scene.id,
          rowKey: `${scene.id}-${idx}-0`,
          type: 'blank',
          text: '',
          sceneCharStart: sceneCharOffset,
          sceneCharEnd: sceneCharOffset,
          sourceIndex: idx,
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
          })
        })
      }
      sceneCharOffset = nextOffset
    })
  })
  return rows
}

function paginateRows(rows) {
  const pages = []
  let pageNo = 1
  for (let i = 0; i < rows.length; i += ROWS_PER_PAGE) {
    pages.push({ id: `sp_${pageNo}`, number: pageNo, lines: rows.slice(i, i + ROWS_PER_PAGE) })
    pageNo += 1
  }
  return pages.length ? pages : [{ id: 'sp_1', number: 1, lines: [] }]
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
  const scriptFocusRequest = useStore(s => s.scriptFocusRequest)
  const clearScriptFocusRequest = useStore(s => s.clearScriptFocusRequest)
  const openScenePropertiesDialog = useStore(s => s.openScenePropertiesDialog)
  const useDropdowns = useStore(s => s.useDropdowns)

  const rightRef = useRef(null)
  const headingRefs = useRef({})
  const [activeSceneId, setActiveSceneId] = useState(null)
  const [selectionBar, setSelectionBar] = useState(null)
  const [addShotDialog, setAddShotDialog] = useState(null)
  const [shotLinkDialog, setShotLinkDialog] = useState(null)

  const orderedScenes = useMemo(() => [...scriptScenes].sort(naturalSortSceneNumber), [scriptScenes])
  const pagination = useMemo(() => estimateScreenplayPagination(orderedScenes), [orderedScenes])

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
  const pagedScript = useMemo(() => paginateRows(screenplayRows), [screenplayRows])

  useEffect(() => {
    const io = new IntersectionObserver((entries) => {
      const visible = entries.filter(e => e.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0]
      if (visible?.target?.dataset?.sceneid) setActiveSceneId(visible.target.dataset.sceneid)
    }, { root: rightRef.current, threshold: [0.25, 0.5, 0.75] })
    Object.values(headingRefs.current).forEach(el => el && io.observe(el))
    return () => io.disconnect()
  }, [orderedScenes])

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
    addShotWithOverrides(targetStoryboardScene.id, {
      linkedSceneId: scriptScene.id,
      linkedDialogueLine: selectedText || null,
      linkedDialogueOffset: Number.isFinite(rangeStart) ? rangeStart : null,
      linkedScriptRangeStart: rangeStart,
      linkedScriptRangeEnd: rangeEnd,
      notes: selectedText || '',
    })
    setAddShotDialog(null)
  }

  const openShotLinkDialog = (sceneId, shotIds) => {
    if (!shotIds?.length) return
    const shots = allLinkedShotsForScriptScene(sceneId)
    const shotMap = Object.fromEntries(shots.map(sh => [sh.id, sh]))
    setShotLinkDialog({ sceneId, shotIds, shotMap })
  }

  const jumpToStoryboardShot = (shot) => {
    if (!shot?.id) return
    setActiveTab('storyboard')
    requestAnimationFrame(() => {
      const node = document.getElementById(`storyboard-shot-${shot.id}`)
      if (node) node.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' })
    })
  }

  if (orderedScenes.length === 0) return <div style={{ height: '100%', display: 'grid', placeItems: 'center' }}><div style={{ textAlign: 'center' }}><p>No script imported yet.</p><button onClick={() => setActiveTab('scenes')}>Go to Scenes tab</button></div></div>

  const getRowStyle = (lineType) => {
    const style = {
      whiteSpace: 'pre',
      lineHeight: `${SCREENPLAY_LINE_HEIGHT_PX}px`,
      height: `${SCREENPLAY_LINE_HEIGHT_PX}px`,
      overflow: 'hidden',
      position: 'relative',
      color: '#111827',
    }

    if (lineType === 'heading') return { ...style, textTransform: 'uppercase', fontWeight: 700 }
    if (lineType === 'action') return { ...style, width: '100%' }
    if (lineType === 'character') return { ...style, marginLeft: '211px', width: '192px', textAlign: 'center', textTransform: 'uppercase' }
    if (lineType === 'parenthetical') return { ...style, marginLeft: '144px', width: '240px', color: '#374151' }
    if (lineType === 'dialogue') return { ...style, marginLeft: '96px', width: '336px' }
    if (lineType === 'transition') return { ...style, textAlign: 'right', textTransform: 'uppercase', fontWeight: 700 }
    return style
  }

  const renderRow = (row) => {
    if (row.type === 'blank') {
      return <div key={row.rowKey} data-row-start={row.sceneCharStart} data-row-end={row.sceneCharEnd} style={{ height: `${SCREENPLAY_LINE_HEIGHT_PX}px` }} />
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
          return (
            <span
              key={piece.key}
              onClick={(e) => {
                e.stopPropagation()
                openShotLinkDialog(row.sceneId, shotIds)
              }}
              style={{ background: 'rgba(239,68,68,0.18)', boxShadow: 'inset 0 -1px 0 rgba(220,38,38,0.55)', cursor: 'pointer' }}
              title="View linked shot"
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
      <div style={{ width: 260, borderRight: '1px solid rgba(74,85,104,0.15)', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: 10, fontSize: 10, textTransform: 'uppercase', color: '#718096', fontWeight: 700 }}>Scenes · {pagination.totalPages.toFixed(2)} pp</div>
        <div style={{ overflowY: 'auto' }}>
          {orderedScenes.map(sc => (
            <button key={sc.id} onDoubleClick={() => openScenePropertiesDialog('script', sc.id)} onClick={() => headingRefs.current[sc.id]?.scrollIntoView({ behavior: 'smooth', block: 'start' })} style={{ width: '100%', textAlign: 'left', padding: '8px 10px', border: 'none', borderLeft: activeSceneId === sc.id ? '3px solid #E84040' : '3px solid transparent', background: 'none' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <SceneColorPicker value={sc.color || null} onChange={(color) => updateScriptScene(sc.id, { color })} title="Scene color" />
                <span style={{ fontWeight: 700, fontSize: 11 }}>SC {sc.sceneNumber}</span>
                <span style={{ fontSize: 10, color: '#718096', marginLeft: 'auto' }}>{shotCounts[sc.id] || 0} shots</span>
              </div>
              <div style={{ fontSize: 10, color: '#4b5563', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sc.location || sc.slugline}</div>
              <div style={{ fontSize: 10, color: '#718096' }}>{pagination.byScene[sc.id]?.pageCount?.toFixed(2) || '0.00'} pp</div>
            </button>
          ))}
        </div>
      </div>

      <div ref={rightRef} style={{ flex: 1, overflowY: 'auto', padding: 18, position: 'relative' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24 }}>
          {pagedScript.map(page => (
            <div key={page.id} style={{ width: `${PAGE_SIZE.width}px`, height: `${PAGE_SIZE.height}px`, background: '#fff', border: '1px solid rgba(74,85,104,0.28)', boxShadow: '0 6px 20px rgba(0,0,0,0.08)', padding: `${PAGE_MARGIN.top}px ${PAGE_MARGIN.right}px ${PAGE_MARGIN.bottom}px ${PAGE_MARGIN.left}px`, fontFamily: '"Courier Prime", "Courier New", Courier, monospace', fontSize: SCREENPLAY_FONT_SIZE, lineHeight: SCREENPLAY_LINE_HEIGHT, position: 'relative', overflow: 'hidden' }}>
              <div style={{ position: 'absolute', top: 16, right: 16, fontSize: 10, color: '#64748b', fontFamily: 'Sora, sans-serif' }}>Page {page.number}</div>
              {page.lines.map(row => {
                const scene = orderedScenes.find(sc => sc.id === row.sceneId)
                const showSceneHeader = row.type === 'heading' && row.isFirstChunk
                return (
                  <div key={row.rowKey} data-sceneid={row.sceneId}>
                    {showSceneHeader && (
                      <div
                        ref={el => { headingRefs.current[row.sceneId] = el }}
                        data-sceneid={row.sceneId}
                        onDoubleClick={() => openScenePropertiesDialog('script', row.sceneId)}
                        style={{ fontWeight: 700, borderLeft: `4px solid ${scene?.color || '#9ca3af'}`, padding: '6px 10px', marginBottom: 6, background: scene?.color ? `${scene.color}0d` : 'rgba(148,163,184,0.08)', position: 'relative', fontFamily: 'Sora, sans-serif', fontSize: 13 }}
                      >
                        {scene?.slugline || `${scene?.intExt || ''}. ${scene?.location || ''} - ${scene?.dayNight || ''}`}
                        <span style={{ position: 'absolute', right: 8, top: 6, fontSize: 10, border: '1px solid rgba(74,85,104,0.2)', borderRadius: 10, padding: '1px 6px', fontFamily: 'monospace' }}>SC {scene?.sceneNumber}</span>
                      </div>
                    )}
                    {renderRow(row)}
                  </div>
                )
              })}
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
