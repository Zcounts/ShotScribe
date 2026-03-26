import React, { useMemo, useRef, useState, useEffect, useCallback } from 'react'
import useStore from '../store'
import { naturalSortSceneNumber } from '../utils/sceneSort'
import SceneColorPicker from './SceneColorPicker'
import { estimateScreenplayPagination, getSceneScreenplayElements, SCREENPLAY_FORMAT } from '../utils/screenplay'

const PAGE_SIZE = { width: 816, height: 1056 }
const PAGE_MARGIN = { top: 96, right: 96, bottom: 96, left: 144 }

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

function ShotLinkDialog({ data, onClose, onUpdateShot, onJumpToStoryboard }) {
  const [activeShotId, setActiveShotId] = useState(data.shotIds[0] || null)
  const activeShot = data.shotMap[activeShotId] || null

  if (!activeShot) return null

  return (
    <div className="modal-overlay" style={{ zIndex: 700 }} onClick={onClose}>
      <div className="modal" style={{ maxWidth: 640 }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <h3 style={{ margin: 0 }}>Linked Shot</h3>
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

        <div style={{ fontSize: 12, color: '#4A5568', marginBottom: 12 }}>
          <strong>{activeShot.displayId}</strong> · {activeShot.cameraName || 'Camera'} · {activeShot.focalLength || 'Lens TBD'}
        </div>

        <label style={{ display: 'block', fontSize: 11, marginBottom: 4 }}>Notes</label>
        <textarea
          value={activeShot.notes || ''}
          onChange={e => onUpdateShot(activeShot.id, { notes: e.target.value })}
          style={{ width: '100%', minHeight: 88, marginBottom: 10 }}
        />

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <label style={{ fontSize: 11 }}>
            Cast
            <input
              value={activeShot.cast || ''}
              onChange={e => onUpdateShot(activeShot.id, { cast: e.target.value })}
              style={{ width: '100%' }}
            />
          </label>
          <label style={{ fontSize: 11 }}>
            Script Time
            <input
              value={activeShot.scriptTime || ''}
              onChange={e => onUpdateShot(activeShot.id, { scriptTime: e.target.value })}
              style={{ width: '100%' }}
            />
          </label>
        </div>

        <div style={{ marginTop: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: '#718096' }}>Stay on Script by default. Use jump only when needed.</span>
          <button className="toolbar-btn" onClick={() => onJumpToStoryboard(activeShot)}>
            Open in Storyboard
          </button>
        </div>
      </div>
    </div>
  )
}

function paginateScenes(orderedScenes, screenplayBySceneId) {
  const pages = []
  let currentPage = []
  let used = 0
  let pageNumber = 1
  const maxLines = SCREENPLAY_FORMAT.pageLines
  const widths = SCREENPLAY_FORMAT.charsPerLine

  const wrapCount = (text, type) => {
    const str = String(text || '').trim()
    if (!str) return 1
    const width = widths[type] || widths.action
    return str.split(/\r?\n/).reduce((sum, segment) => sum + Math.max(1, Math.ceil(segment.length / width)), 0)
  }

  orderedScenes.forEach(scene => {
    const elements = screenplayBySceneId[scene.id] || []
    let sceneCharOffset = 0
    elements.forEach((line, idx) => {
      const lineText = String(line.text || '')
      const nextOffset = sceneCharOffset + lineText.length + 1
      const units = line.type === 'blank' ? 1 : (wrapCount(line.text, line.type) + 0.15)
      if (used + units > maxLines && currentPage.length > 0) {
        pages.push({ id: `sp_${pageNumber}`, number: pageNumber, lines: currentPage })
        currentPage = []
        used = 0
        pageNumber += 1
      }
      currentPage.push({
        ...line,
        sceneId: scene.id,
        rowKey: `${scene.id}-${idx}`,
        sceneCharStart: sceneCharOffset,
        sceneCharEnd: nextOffset,
      })
      used += units
      sceneCharOffset = nextOffset
    })
  })

  if (currentPage.length > 0) pages.push({ id: `sp_${pageNumber}`, number: pageNumber, lines: currentPage })
  return pages.length > 0 ? pages : [{ id: 'sp_1', number: 1, lines: [] }]
}

export default function ScriptTab() {
  const scriptScenes = useStore(s => s.scriptScenes)
  const scenes = useStore(s => s.scenes)
  const addShotWithOverrides = useStore(s => s.addShotWithOverrides)
  const linkShotToScene = useStore(s => s.linkShotToScene)
  const updateShot = useStore(s => s.updateShot)
  const setActiveTab = useStore(s => s.setActiveTab)
  const updateScriptScene = useStore(s => s.updateScriptScene)
  const scriptFocusRequest = useStore(s => s.scriptFocusRequest)
  const clearScriptFocusRequest = useStore(s => s.clearScriptFocusRequest)
  const openScenePropertiesDialog = useStore(s => s.openScenePropertiesDialog)

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

  const pagedScript = useMemo(() => paginateScenes(orderedScenes, screenplayBySceneId), [orderedScenes, screenplayBySceneId])

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

  const getClosestLineEl = (node) => {
    if (!node) return null
    if (node.nodeType === Node.ELEMENT_NODE) return node.closest('[data-line-start]')
    return node.parentElement?.closest('[data-line-start]') || null
  }

  const getLocalOffset = (lineEl, container, offset) => {
    const r = document.createRange()
    r.selectNodeContents(lineEl)
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

      const startLine = getClosestLineEl(range.startContainer)
      const endLine = getClosestLineEl(range.endContainer)
      const sceneEl = (startLine || endLine)?.closest('[data-sceneid]')
      const sceneId = sceneEl?.getAttribute('data-sceneid')
      if (!sceneId || !startLine || !endLine) {
        setSelectionBar(null)
        return
      }

      const startBase = Number(startLine.dataset.lineStart || 0)
      const endBase = Number(endLine.dataset.lineStart || 0)
      const absA = startBase + getLocalOffset(startLine, range.startContainer, range.startOffset)
      const absB = endBase + getLocalOffset(endLine, range.endContainer, range.endOffset)
      const rangeStart = Math.min(absA, absB)
      const rangeEnd = Math.max(absA, absB)
      if (!Number.isFinite(rangeStart) || !Number.isFinite(rangeEnd) || rangeEnd <= rangeStart) {
        setSelectionBar(null)
        return
      }

      const fullText = sceneFullTextById[sceneId] || ''
      const text = fullText.slice(rangeStart, rangeEnd).trim()
      if (!text) {
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

  const getLineBaseStyle = (lineType) => {
    const style = {
      whiteSpace: 'pre-wrap',
      marginBottom: 4,
      position: 'relative',
      lineHeight: '1.5',
      color: '#111827',
    }

    if (lineType === 'heading') {
      return { ...style, textTransform: 'uppercase', fontWeight: 700 }
    }
    if (lineType === 'action') {
      return { ...style, width: '100%' }
    }
    if (lineType === 'character') {
      return { ...style, marginLeft: '211px', width: '192px', textAlign: 'center', textTransform: 'uppercase' }
    }
    if (lineType === 'parenthetical') {
      return { ...style, marginLeft: '144px', width: '240px', color: '#374151' }
    }
    if (lineType === 'dialogue') {
      return { ...style, marginLeft: '96px', width: '336px' }
    }
    if (lineType === 'transition') {
      return { ...style, textAlign: 'right', textTransform: 'uppercase', fontWeight: 700 }
    }
    return style
  }

  const renderLine = (line) => {
    const lineText = String(line.text || '')
    const linkedShots = allLinkedShotsForScriptScene(line.sceneId).filter(shot => (
      Number.isFinite(shot.linkedScriptRangeStart)
      && Number.isFinite(shot.linkedScriptRangeEnd)
      && shot.linkedScriptRangeStart < (line.sceneCharEnd ?? 0)
      && shot.linkedScriptRangeEnd > (line.sceneCharStart ?? 0)
    ))

    if (line.type === 'blank') {
      return <div key={line.rowKey} data-line-start={line.sceneCharStart} data-line-end={line.sceneCharEnd} style={{ height: 8 }} />
    }

    const localRanges = linkedShots.map(shot => ({
      shotId: shot.id,
      start: Math.max(0, shot.linkedScriptRangeStart - line.sceneCharStart),
      end: Math.min(lineText.length, shot.linkedScriptRangeEnd - line.sceneCharStart),
    })).filter(r => r.end > r.start)

    const markers = Array.from(new Set([0, lineText.length, ...localRanges.flatMap(r => [r.start, r.end])]))
      .sort((a, b) => a - b)

    const segments = []
    for (let i = 0; i < markers.length - 1; i += 1) {
      const segStart = markers[i]
      const segEnd = markers[i + 1]
      const text = lineText.slice(segStart, segEnd)
      const matching = localRanges.filter(r => r.start < segEnd && r.end > segStart)
      segments.push({ key: `${line.rowKey}-${segStart}-${segEnd}`, text, matching })
    }

    const hasAnnotation = localRanges.length > 0
    const lineStyle = getLineBaseStyle(line.type)

    return (
      <div
        key={line.rowKey}
        data-line-start={line.sceneCharStart}
        data-line-end={line.sceneCharEnd}
        style={lineStyle}
      >
        {segments.map(seg => {
          if (!seg.matching.length) return <span key={seg.key}>{seg.text}</span>
          const shotIds = [...new Set(seg.matching.map(m => m.shotId))]
          return (
            <span
              key={seg.key}
              onClick={(e) => {
                e.stopPropagation()
                openShotLinkDialog(line.sceneId, shotIds)
              }}
              title="View linked shot"
              style={{
                background: 'rgba(239,68,68,0.18)',
                boxShadow: 'inset 0 -1px 0 rgba(220,38,38,0.55)',
                cursor: 'pointer',
                borderRadius: 2,
              }}
            >
              {seg.text}
            </span>
          )
        })}
        {hasAnnotation && (
          <span
            style={{
              position: 'absolute',
              right: 0,
              top: -12,
              fontSize: 9,
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
            <div key={page.id} style={{ width: `${PAGE_SIZE.width}px`, height: `${PAGE_SIZE.height}px`, background: '#fff', border: '1px solid rgba(74,85,104,0.28)', boxShadow: '0 6px 20px rgba(0,0,0,0.08)', padding: `${PAGE_MARGIN.top}px ${PAGE_MARGIN.right}px ${PAGE_MARGIN.bottom}px ${PAGE_MARGIN.left}px`, fontFamily: '"Courier Prime", "Courier New", Courier, monospace', fontSize: 16, lineHeight: 1.5, position: 'relative', overflow: 'hidden' }}>
              <div style={{ position: 'absolute', top: 16, right: 16, fontSize: 10, color: '#64748b', fontFamily: 'Sora, sans-serif' }}>Page {page.number}</div>
              {page.lines.map(line => {
                const scene = orderedScenes.find(sc => sc.id === line.sceneId)
                const showSceneHeader = line.type === 'heading'
                return (
                  <div key={line.rowKey} data-sceneid={line.sceneId}>
                    {showSceneHeader && (
                      <div
                        ref={el => { headingRefs.current[line.sceneId] = el }}
                        data-sceneid={line.sceneId}
                        onDoubleClick={() => openScenePropertiesDialog('script', line.sceneId)}
                        style={{ fontWeight: 700, borderLeft: `4px solid ${scene?.color || '#9ca3af'}`, padding: '6px 10px', marginBottom: 12, background: scene?.color ? `${scene.color}0d` : 'rgba(148,163,184,0.08)', position: 'relative', fontFamily: 'Sora, sans-serif', fontSize: 13 }}
                      >
                        {scene?.slugline || `${scene?.intExt || ''}. ${scene?.location || ''} - ${scene?.dayNight || ''}`}
                        <span style={{ position: 'absolute', right: 8, top: 6, fontSize: 10, border: '1px solid rgba(74,85,104,0.2)', borderRadius: 10, padding: '1px 6px', fontFamily: 'monospace' }}>SC {scene?.sceneNumber}</span>
                      </div>
                    )}
                    {renderLine(line)}
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
          onJumpToStoryboard={jumpToStoryboardShot}
        />
      )}
    </div>
  )
}
