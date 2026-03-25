import React, { useMemo, useRef, useState, useEffect } from 'react'
import useStore from '../store'
import { naturalSortSceneNumber } from '../utils/sceneSort'
import SceneColorPicker from './SceneColorPicker'
import { estimateScreenplayPagination, getSceneScreenplayElements, SCREENPLAY_FORMAT } from '../utils/screenplay'

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
    elements.forEach((line, idx) => {
      const units = line.type === 'blank' ? 1 : (wrapCount(line.text, line.type) + 0.15)
      if (used + units > maxLines && currentPage.length > 0) {
        pages.push({ id: `sp_${pageNumber}`, number: pageNumber, lines: currentPage })
        currentPage = []
        used = 0
        pageNumber += 1
      }
      currentPage.push({ ...line, sceneId: scene.id, rowKey: `${scene.id}-${idx}` })
      used += units
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

  const orderedScenes = useMemo(() => [...scriptScenes].sort(naturalSortSceneNumber), [scriptScenes])
  const pagination = useMemo(() => estimateScreenplayPagination(orderedScenes), [orderedScenes])

  const shotCounts = useMemo(() => {
    const map = {}
    scenes.forEach((sc) => sc.shots.forEach((sh) => { if (sh.linkedSceneId) map[sh.linkedSceneId] = (map[sh.linkedSceneId] || 0) + 1 }))
    return map
  }, [scenes])

  const linkedSnippetsByScene = useMemo(() => {
    const map = {}
    scenes.forEach(storyScene => {
      storyScene.shots.forEach(shot => {
        if (!shot.linkedSceneId || !shot.linkedDialogueLine) return
        if (!map[shot.linkedSceneId]) map[shot.linkedSceneId] = new Set()
        map[shot.linkedSceneId].add(shot.linkedDialogueLine.trim().toLowerCase())
      })
    })
    return map
  }, [scenes])

  const screenplayBySceneId = useMemo(() => {
    const result = {}
    orderedScenes.forEach(sc => { result[sc.id] = getSceneScreenplayElements(sc) })
    return result
  }, [orderedScenes])

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

  useEffect(() => {
    const onMouseUp = () => {
      const sel = window.getSelection()
      const text = sel?.toString()?.trim()
      if (!text || !rightRef.current?.contains(sel.anchorNode)) return setSelectionBar(null)
      const range = sel.getRangeAt(0)
      const rect = range.getBoundingClientRect()
      const sceneEl = range.startContainer.parentElement?.closest('[data-sceneid]')
      const sceneId = sceneEl?.getAttribute('data-sceneid')
      if (!sceneId) return
      const scene = scriptScenes.find(s => s.id === sceneId)
      setSelectionBar({ x: rect.left + window.scrollX, y: rect.top + window.scrollY - 40, text: text.slice(0, 260), sceneId, sceneNumber: scene?.sceneNumber || '' })
    }
    document.addEventListener('mouseup', onMouseUp)
    return () => document.removeEventListener('mouseup', onMouseUp)
  }, [scriptScenes])

  const findStoryboardSceneForScriptScene = (scriptScene) => {
    if (!scriptScene) return null
    for (const storyboardScene of scenes) {
      if (storyboardScene.shots.some(shot => shot.linkedSceneId === scriptScene.id)) return storyboardScene
    }
    return scenes[0] || null
  }

  const allLinkedShotsForScriptScene = (scriptSceneId) => {
    const items = []
    scenes.forEach((storyScene, sceneIdx) => {
      storyScene.shots.forEach((shot, shotIdx) => {
        if (shot.linkedSceneId === scriptSceneId) items.push({ ...shot, parentSceneId: storyScene.id, displayId: `${sceneIdx + 1}${String.fromCharCode(65 + shotIdx)}` })
      })
    })
    return items
  }

  const openAddShotDialog = (sceneId, selectedText = '') => {
    const scriptScene = scriptScenes.find(scene => scene.id === sceneId)
    if (!scriptScene) return
    setAddShotDialog({ scene: scriptScene, selectedText, existingShots: allLinkedShotsForScriptScene(sceneId) })
    setSelectionBar(null)
  }

  const confirmAddShotDialog = ({ mode, selectedShotId }) => {
    if (!addShotDialog) return
    const { scene: scriptScene, selectedText } = addShotDialog
    if (mode === 'existing' && selectedShotId) {
      linkShotToScene(selectedShotId, scriptScene.id, { linkedDialogueLine: selectedText || null, linkedDialogueOffset: selectedText ? (scriptScene.actionText || '').indexOf(selectedText) : null })
      if (selectedText) updateShot(selectedShotId, { notes: selectedText })
      setAddShotDialog(null)
      return
    }
    const targetStoryboardScene = findStoryboardSceneForScriptScene(scriptScene)
    if (!targetStoryboardScene) return
    addShotWithOverrides(targetStoryboardScene.id, {
      linkedSceneId: scriptScene.id,
      linkedDialogueLine: selectedText || null,
      linkedDialogueOffset: selectedText ? (scriptScene.actionText || '').indexOf(selectedText) : null,
      notes: selectedText || '',
    })
    setAddShotDialog(null)
  }

  if (orderedScenes.length === 0) return <div style={{ height: '100%', display: 'grid', placeItems: 'center' }}><div style={{ textAlign: 'center' }}><p>No script imported yet.</p><button onClick={() => setActiveTab('scenes')}>Go to Scenes tab</button></div></div>

  const renderLine = (line) => {
    const linkedMatches = linkedSnippetsByScene[line.sceneId] || new Set()
    const isAnnotated = linkedMatches.has(String(line.text || '').trim().toLowerCase())
    const shared = { whiteSpace: 'pre-wrap', marginBottom: 4, position: 'relative', background: isAnnotated ? 'rgba(232,64,64,0.14)' : 'transparent', borderRadius: isAnnotated ? 4 : 0, paddingRight: isAnnotated ? 50 : 0 }
    const badge = isAnnotated ? <span style={{ position: 'absolute', right: 6, top: 2, fontSize: 9, color: '#991b1b', border: '1px solid rgba(153,27,27,0.35)', borderRadius: 999, padding: '0 6px', fontFamily: 'Sora, sans-serif', background: '#fff1f2' }}>SHOT</span> : null

    if (line.type === 'blank') return <div key={line.rowKey} style={{ height: 8 }} />
    if (line.type === 'heading') return <div key={line.rowKey} style={{ ...shared, textTransform: 'uppercase', fontWeight: 700 }}>{line.text}{badge}</div>
    if (line.type === 'action') return <div key={line.rowKey} style={{ ...shared, marginRight: '12%' }}>{line.text}{badge}</div>
    if (line.type === 'character') return <div key={line.rowKey} style={{ ...shared, width: '42%', marginLeft: '29%', textAlign: 'center', textTransform: 'uppercase', letterSpacing: '0.02em' }}>{line.text}{badge}</div>
    if (line.type === 'parenthetical') return <div key={line.rowKey} style={{ ...shared, marginLeft: '34%', width: '32%', color: '#374151' }}>{line.text}{badge}</div>
    if (line.type === 'dialogue') return <div key={line.rowKey} style={{ ...shared, marginLeft: '28%', width: '46%' }}>{line.text}{badge}</div>
    if (line.type === 'transition') return <div key={line.rowKey} style={{ ...shared, textAlign: 'right', textTransform: 'uppercase', fontWeight: 700 }}>{line.text}{badge}</div>
    return null
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
            <div key={page.id} style={{ width: '816px', minHeight: '1056px', background: '#fffdf8', border: '1px solid rgba(74,85,104,0.2)', boxShadow: '0 6px 20px rgba(0,0,0,0.08)', padding: '56px 72px', fontFamily: '"Courier Prime", "Courier New", Courier, monospace', fontSize: 16, lineHeight: 1.5, position: 'relative' }}>
              <div style={{ position: 'absolute', top: 12, right: 16, fontSize: 10, color: '#64748b', fontFamily: 'Sora, sans-serif' }}>Page {page.number}</div>
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
    </div>
  )
}
