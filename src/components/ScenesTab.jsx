import React, { useMemo, useState, useRef, useEffect } from 'react'
import useStore from '../store'
import { computeConfidence } from '../utils/scriptParser'
import { naturalSortSceneNumber } from '../utils/sceneSort'
import ImportScriptModal from './ImportScriptModal'
import SceneColorPicker from './SceneColorPicker'
import ScenePropertiesPanel, { CharacterTagInput } from './ScenePropertiesPanel'
import { estimateScreenplayPagination } from '../utils/screenplay'
import SidebarPane from './SidebarPane'
import ConfigureButton from './ConfigureButton'

const COLUMN_OPTIONS = [1, 2, 3, 4]

const SORT_OPTIONS = [
  { value: 'sceneNumber', label: 'Scene Number' },
  { value: 'pageCount', label: 'Estimated Page Count' },
  { value: 'shotCount', label: 'Shot Count' },
  { value: 'location', label: 'Location' },
  { value: 'slugline', label: 'Title / Slugline' },
]

export default function ScenesTab() {
  const scriptScenes = useStore(s => s.scriptScenes)
  const importedScripts = useStore(s => s.importedScripts)
  const scenes = useStore(s => s.scenes)
  const updateScriptScene = useStore(s => s.updateScriptScene)
  const deleteScriptScene = useStore(s => s.deleteScriptScene)
  const importScriptScenes = useStore(s => s.importScriptScenes)
  const deleteImportedScript = useStore(s => s.deleteImportedScript)
  const linkShotToScene = useStore(s => s.linkShotToScene)
  const openScenePropertiesDialog = useStore(s => s.openScenePropertiesDialog)
  const scenesViewState = useStore(s => s.tabViewState?.scenes || {})
  const setTabViewState = useStore(s => s.setTabViewState)
  const setActiveTab = useStore(s => s.setActiveTab)

  const [activeScript, setActiveScript] = useState(scenesViewState.activeScript ?? null)
  const [columnCount, setColumnCount] = useState(() => {
    const value = Number(scenesViewState.columnCount)
    return COLUMN_OPTIONS.includes(value) ? value : 1
  })
  const [sortBy, setSortBy] = useState(() => scenesViewState.sortBy || 'sceneNumber')
  const [sortDirection, setSortDirection] = useState(() => scenesViewState.sortDirection || 'asc')
  const [configureOpen, setConfigureOpen] = useState(false)
  const [importModalOpen, setImportModalOpen] = useState(false)
  const [expandedIds, setExpandedIds] = useState({})
  const [editingSceneNumberId, setEditingSceneNumberId] = useState(null)
  const [editSceneNumberValue, setEditSceneNumberValue] = useState('')
  const [invalidEdit, setInvalidEdit] = useState(false)
  const [selectedSceneIds, setSelectedSceneIds] = useState([])
  const [combineOpen, setCombineOpen] = useState(false)
  const [ctxMenu, setCtxMenu] = useState(null)
  const [scriptCtxMenu, setScriptCtxMenu] = useState(null)
  const [scriptDeleteConfirm, setScriptDeleteConfirm] = useState(null)
  const listRef = useRef(null)

  const linkedShotsMap = useMemo(() => {
    const map = {}
    scenes.forEach((scene, sceneIdx) => {
      scene.shots.forEach((shot, shotIdx) => {
        if (shot.linkedSceneId) {
          if (!map[shot.linkedSceneId]) map[shot.linkedSceneId] = []
          map[shot.linkedSceneId].push({ ...shot, displayId: `${sceneIdx + 1}${String.fromCharCode(65 + shotIdx)}` })
        }
      })
    })
    return map
  }, [scenes])

  const pagination = useMemo(() => estimateScreenplayPagination(scriptScenes), [scriptScenes])

  const visibleScenes = useMemo(() => {
    const subset = !activeScript
      ? scriptScenes
      : scriptScenes.filter(s => s.importSource === (importedScripts.find(x => x.id === activeScript)?.filename))
    const baseSorted = [...subset].sort(naturalSortSceneNumber)
    const directionMultiplier = sortDirection === 'desc' ? -1 : 1
    const safeTextCompare = (left, right) => String(left || '').localeCompare(String(right || ''), undefined, { sensitivity: 'base' })
    const ordered = [...baseSorted].sort((left, right) => {
      if (sortBy === 'sceneNumber') return naturalSortSceneNumber(left, right) * directionMultiplier
      if (sortBy === 'pageCount') {
        const leftPages = pagination.byScene[left.id]?.pageCount ?? 0
        const rightPages = pagination.byScene[right.id]?.pageCount ?? 0
        if (leftPages !== rightPages) return (leftPages - rightPages) * directionMultiplier
      } else if (sortBy === 'shotCount') {
        const leftShots = (linkedShotsMap[left.id] || []).length
        const rightShots = (linkedShotsMap[right.id] || []).length
        if (leftShots !== rightShots) return (leftShots - rightShots) * directionMultiplier
      } else if (sortBy === 'location') {
        const cmp = safeTextCompare(left.location, right.location)
        if (cmp !== 0) return cmp * directionMultiplier
      } else if (sortBy === 'slugline') {
        const cmp = safeTextCompare(left.slugline, right.slugline)
        if (cmp !== 0) return cmp * directionMultiplier
      }
      return naturalSortSceneNumber(left, right)
    })
    return ordered
  }, [scriptScenes, activeScript, importedScripts, sortBy, sortDirection, linkedShotsMap, pagination])

  const allCharacters = useMemo(() => {
    const set = new Set()
    scriptScenes.forEach(s => (s.characters || []).forEach(c => set.add(c)))
    return [...set]
  }, [scriptScenes])

  const openEditor = (scene) => {
    setEditingSceneNumberId(scene.id)
    setEditSceneNumberValue(scene.sceneNumber || '')
    setInvalidEdit(false)
  }

  const commitEditor = () => {
    if (!editingSceneNumberId) return
    const v = editSceneNumberValue.trim()
    if (!v) {
      setInvalidEdit(true)
      setTimeout(() => setInvalidEdit(false), 350)
      return
    }
    updateScriptScene(editingSceneNumberId, { sceneNumber: v })
    setEditingSceneNumberId(null)
  }

  const addBlankSceneNear = (targetScene, offset = 1) => {
    const idx = scriptScenes.findIndex(s => s.id === targetScene.id)
    const newScene = {
      id: `sc_${Date.now()}`,
      sceneNumber: '', slugline: '', intExt: null, dayNight: null, location: '', customHeader: '',
      characters: [], actionText: '', dialogueCount: 0, pageCount: null, complexityTags: [], estimatedMinutes: null,
      screenplayText: '', screenplayElements: [],
      confidence: 'medium', linkedShotIds: [], notes: '', importSource: targetScene.importSource || '', color: null,
    }
    const next = [...scriptScenes]
    next.splice(Math.max(0, idx + offset), 0, newScene)
    importScriptScenes(next, { id: 'manual', filename: targetScene.importSource || 'manual' }, 'replace')
    openEditor(newScene)
  }

  const addSubScene = (targetScene) => {
    const base = targetScene.sceneNumber || ''
    let n = 1
    const existing = new Set(scriptScenes.map(s => s.sceneNumber))
    while (existing.has(`${base}.${n}`)) n += 1
    updateScriptScene(targetScene.id, {})
    importScriptScenes([
      ...scriptScenes,
      {
        id: `sc_${Date.now()}`,
        sceneNumber: `${base}.${n}`,
        slugline: '', intExt: null, dayNight: null, location: '', customHeader: '', characters: [], actionText: '', dialogueCount: 0,
        screenplayText: '', screenplayElements: [],
        pageCount: null, complexityTags: [], estimatedMinutes: null, confidence: 'medium', linkedShotIds: [], notes: '', importSource: targetScene.importSource || '', color: targetScene.color || null,
      },
    ], { id: 'manual', filename: targetScene.importSource || 'manual' }, 'replace')
  }

  const combineInit = useMemo(() => {
    const selected = visibleScenes.filter(s => selectedSceneIds.includes(s.id))
    if (selected.length === 0) return null
    const sorted = [...selected].sort(naturalSortSceneNumber)
    return {
      selected,
      sceneNumber: sorted[0].sceneNumber || '',
      slugline: sorted[0].slugline || '',
      characters: [...new Set(selected.flatMap(s => s.characters || []))],
    }
  }, [selectedSceneIds, visibleScenes])

  const [combineForm, setCombineForm] = useState(null)
  useEffect(() => { if (combineOpen && combineInit) setCombineForm(combineInit) }, [combineOpen, combineInit])

  useEffect(() => {
    setTabViewState('scenes', { activeScript, columnCount, sortBy, sortDirection })
  }, [activeScript, columnCount, sortBy, sortDirection, setTabViewState])

  useEffect(() => {
    const node = listRef.current
    if (!node) return
    const savedTop = scenesViewState.scrollTop
    if (typeof savedTop === 'number') {
      requestAnimationFrame(() => {
        node.scrollTop = savedTop
      })
    }
  }, [scenesViewState.scrollTop])

  const doCombine = () => {
    if (!combineForm || !combineForm.sceneNumber.trim()) return
    const selected = combineForm.selected
    const mergedScene = {
      ...selected[0],
      id: `sc_${Date.now()}`,
      sceneNumber: combineForm.sceneNumber.trim(),
      slugline: combineForm.slugline,
      characters: combineForm.characters,
      actionText: selected.map(s => s.actionText || '').filter(Boolean).join('\n\n---\n\n'),
    }
    const linkedShotIds = [...new Set(selected.flatMap(s => (linkedShotsMap[s.id] || []).map(sh => sh.id)))]
    linkedShotIds.forEach(shotId => linkShotToScene(shotId, mergedScene.id))
    const kept = scriptScenes.filter(s => !selectedSceneIds.includes(s.id))
    importScriptScenes([...kept, mergedScene], { id: 'manual', filename: mergedScene.importSource || 'manual' }, 'replace')
    setSelectedSceneIds([])
    setCombineOpen(false)
  }

  if (scriptScenes.length === 0 && !importModalOpen) {
    return (
      <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 10 }}>
        <div style={{ fontWeight: 700 }}>No script scenes available yet</div>
        <div style={{ color: '#4A5568', fontSize: 13 }}>Import your script from the Script tab to begin scene breakdown.</div>
        <button onClick={() => setActiveTab('script')} style={{ background: '#2C3E57', color: '#fff', border: 'none', borderRadius: 5, padding: '8px 14px' }}>Go to Script tab</button>
        <ImportScriptModal isOpen={importModalOpen} onClose={() => setImportModalOpen(false)} />
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', height: '100%' }} onClick={() => { setCtxMenu(null); setScriptCtxMenu(null); setConfigureOpen(false) }}>
      <SidebarPane
        width={240}
        title={null}
        footer={<button onClick={() => setImportModalOpen(true)} style={{ width: '100%', background: '#E84040', color: '#fff', border: 'none', borderRadius: 5, padding: 7 }}>+ Import Script</button>}
      >
          <div style={{ padding: 10, borderBottom: '1px solid rgba(74,85,104,0.12)' }}>
            <div style={{ border: '1px solid rgba(74,85,104,0.16)', borderRadius: 6, background: 'rgba(255,255,255,0.65)', padding: 10 }}>
              <div style={{ fontSize: 10, textTransform: 'uppercase', color: '#64748b', fontWeight: 700, letterSpacing: '0.06em', marginBottom: 8 }}>Scene Organization</div>
              <label style={{ display: 'block', fontSize: 10, color: '#64748b', marginBottom: 4 }}>Sort By</label>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                style={{ width: '100%', border: '1px solid rgba(128,128,128,0.3)', borderRadius: 4, padding: '6px 7px', fontSize: 12, marginBottom: 8 }}
              >
                {SORT_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
              <button
                onClick={() => setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc')}
                style={{ width: '100%', border: '1px solid rgba(74,85,104,0.2)', background: '#fff', borderRadius: 4, padding: '6px 8px', fontSize: 11, color: '#334155' }}
              >
                {sortDirection === 'asc' ? 'Ascending ↑' : 'Descending ↓'}
              </button>
            </div>
          </div>
          <div style={{ padding: '10px 12px 6px', fontSize: 10, textTransform: 'uppercase', color: '#64748b', fontWeight: 700, letterSpacing: '0.06em' }}>Imported Scripts</div>
          <button onClick={() => setActiveScript(null)} style={{ width: '100%', textAlign: 'left', border: 'none', background: activeScript ? 'none' : 'rgba(232,64,64,0.1)', borderLeft: activeScript ? '3px solid transparent' : '3px solid #E84040', padding: '7px 12px', borderRadius: 4 }}>All Scenes</button>
          {importedScripts.map(sc => (
            <div
              key={sc.id}
              onContextMenu={(e) => {
                e.preventDefault()
                setScriptCtxMenu({ x: e.clientX, y: e.clientY, script: sc })
              }}
            >
              <button onClick={() => setActiveScript(sc.id)} style={{ width: '100%', textAlign: 'left', border: 'none', borderBottom: '1px solid rgba(74,85,104,0.08)', background: activeScript === sc.id ? 'rgba(232,64,64,0.1)' : 'none', padding: '8px 12px' }}>{sc.filename}</button>
            </div>
          ))}
      </SidebarPane>

      <div
        ref={listRef}
        onScroll={(e) => setTabViewState('scenes', { scrollTop: e.currentTarget.scrollTop })}
        style={{ flex: 1, padding: 14, overflowY: 'auto', position: 'relative' }}
      >
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10, position: 'sticky', top: 0, zIndex: 5 }}>
          <div style={{ position: 'relative' }} onClick={(e) => e.stopPropagation()}>
            <ConfigureButton label="Configure" active={configureOpen} onClick={() => setConfigureOpen(v => !v)} />
            {configureOpen && (
              <div style={{ position: 'absolute', right: 0, marginTop: 6, width: 190, border: '1px solid rgba(74,85,104,0.2)', borderRadius: 6, background: '#fff', boxShadow: '0 8px 24px rgba(15,23,42,0.12)', padding: 10 }}>
                <div style={{ fontSize: 10, textTransform: 'uppercase', color: '#64748b', fontWeight: 700, letterSpacing: '0.06em', marginBottom: 7 }}>Scene Layout</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 6 }}>
                  {COLUMN_OPTIONS.map(count => (
                    <button
                      key={count}
                      onClick={() => setColumnCount(count)}
                      style={{
                        border: '1px solid rgba(74,85,104,0.2)',
                        borderRadius: 4,
                        padding: '6px 8px',
                        background: columnCount === count ? 'rgba(232,64,64,0.12)' : '#fff',
                        color: '#1f2937',
                        fontSize: 11,
                      }}
                    >
                      {count} Column{count > 1 ? 's' : ''}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${columnCount}, minmax(0, 1fr))`, gap: 10, alignItems: 'start' }}>
        {visibleScenes.map(scene => {
          const linkedShots = linkedShotsMap[scene.id] || []
          const confidence = computeConfidence(scene, linkedShots.length)
          const expanded = !!expandedIds[scene.id]
          const selected = selectedSceneIds.includes(scene.id)
          return (
            <div className="app-surface-card" key={scene.id} onDoubleClick={() => openScenePropertiesDialog('script', scene.id)} onContextMenu={(e) => { e.preventDefault(); setCtxMenu({ x: e.clientX, y: e.clientY, scene }) }} style={{ borderRadius: 6 }}>
              <div
                role="button"
                tabIndex={0}
                onClick={() => setExpandedIds(p => ({ ...p, [scene.id]: !p[scene.id] }))}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setExpandedIds(p => ({ ...p, [scene.id]: !p[scene.id] })) } }}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', cursor: 'pointer' }}
              >
                <input type="checkbox" checked={selected} onChange={(e) => setSelectedSceneIds(prev => e.target.checked ? [...new Set([...prev, scene.id])] : prev.filter(id => id !== scene.id))} onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()} style={{ opacity: selectedSceneIds.length > 0 || selected ? 1 : 0.2 }} />
                <div onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}><SceneColorPicker value={scene.color || null} onChange={(color) => updateScriptScene(scene.id, { color })} /></div>
                {editingSceneNumberId === scene.id ? (
                  <input
                    autoFocus
                    value={editSceneNumberValue}
                    onChange={e => setEditSceneNumberValue(e.target.value)}
                    onBlur={commitEditor}
                    onClick={(e) => e.stopPropagation()}
                    onPointerDown={(e) => e.stopPropagation()}
                    onKeyDown={e => { if (e.key === 'Enter') commitEditor(); if (e.key === 'Escape') setEditingSceneNumberId(null) }}
                    style={{ width: 88, fontSize: 11, borderRadius: 3, border: invalidEdit ? '1px solid #ef4444' : '1px solid rgba(128,128,128,0.3)', padding: '3px 6px' }}
                  />
                ) : (
                  <button onClick={(e) => { e.stopPropagation(); openEditor(scene) }} onPointerDown={(e) => e.stopPropagation()} style={{ border: 'none', background: 'none', fontFamily: 'monospace', fontWeight: 700, cursor: 'text' }}>SC {scene.sceneNumber || '—'}</button>
                )}
                <span style={{ color: '#4A5568', flex: 1, fontSize: 11, pointerEvents: 'none' }}>{scene.location || scene.slugline}</span>
                <span style={{ color: '#718096', fontSize: 10 }}>{linkedShots.length} shots</span>
                <span style={{ color: '#718096', fontSize: 10 }}>{pagination.byScene[scene.id]?.pageCount?.toFixed(2) || '0.00'} pp</span>
                <span style={{ fontSize: 10, color: confidence === 'low' ? '#f87171' : confidence === 'medium' ? '#f59e0b' : '#22c55e' }}>● {confidence}</span>
                <button onClick={(e) => { e.stopPropagation(); setExpandedIds(p => ({ ...p, [scene.id]: !p[scene.id] })) }} style={{ border: 'none', background: 'none', cursor: 'pointer' }}>{expanded ? '▴' : '▾'}</button>
              </div>

              {expanded && (
                <div style={{ padding: '0 12px 12px' }}>
                  <ScenePropertiesPanel
                    values={{
                      sceneNumber: scene.sceneNumber || '',
                      titleSlugline: scene.slugline || '',
                      location: scene.location || '',
                      intExt: scene.intExt || '',
                      dayNight: scene.dayNight || '',
                      color: scene.color || null,
                      characters: scene.characters || [],
                    }}
                    estimatedPages={pagination.byScene[scene.id]
                      ? `${pagination.byScene[scene.id].pageCount.toFixed(2)} pp · p${pagination.byScene[scene.id].startPage}–${pagination.byScene[scene.id].endPage}`
                      : '—'}
                    editable
                    allCharacters={allCharacters}
                    onChange={(updates) => {
                      const canonicalUpdates = {
                        ...updates,
                        ...(('titleSlugline' in updates) ? { slugline: updates.titleSlugline } : {}),
                      }
                      delete canonicalUpdates.titleSlugline
                      updateScriptScene(scene.id, canonicalUpdates)
                    }}
                  />
                </div>
              )}
            </div>
          )
        })}
        </div>

        {selectedSceneIds.length >= 2 && (
          <div style={{ position: 'sticky', bottom: 0, background: '#1c1c1e', color: '#fff', borderRadius: 8, padding: '8px 10px', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>{selectedSceneIds.length} scenes selected</span>
            <button onClick={() => setCombineOpen(true)} style={{ border: 'none', borderRadius: 4, padding: '4px 8px', background: '#E84040', color: '#fff' }}>Combine Scenes</button>
            <button onClick={() => selectedSceneIds.forEach(id => deleteScriptScene(id))} style={{ border: 'none', borderRadius: 4, padding: '4px 8px' }}>Delete</button>
            <button onClick={() => setSelectedSceneIds([])} style={{ border: 'none', borderRadius: 4, padding: '4px 8px' }}>✕ Cancel</button>
          </div>
        )}
      </div>

      {ctxMenu && (
        <div style={{ position: 'fixed', left: ctxMenu.x, top: ctxMenu.y, zIndex: 90, background: '#1e1e2e', border: '1px solid #444', borderRadius: 6, overflow: 'hidden' }}>
          <button onClick={() => { addBlankSceneNear(ctxMenu.scene, -1); setCtxMenu(null) }} style={{ display: 'block', width: '100%', border: 'none', background: 'none', color: '#ddd', padding: '7px 10px', textAlign: 'left' }}>Add scene above</button>
          <button onClick={() => { addBlankSceneNear(ctxMenu.scene, 1); setCtxMenu(null) }} style={{ display: 'block', width: '100%', border: 'none', background: 'none', color: '#ddd', padding: '7px 10px', textAlign: 'left' }}>Add scene below</button>
          <button onClick={() => { addSubScene(ctxMenu.scene); setCtxMenu(null) }} style={{ display: 'block', width: '100%', border: 'none', background: 'none', color: '#ddd', padding: '7px 10px', textAlign: 'left' }}>Add sub-scene</button>
        </div>
      )}

      {scriptCtxMenu && (
        <div style={{ position: 'fixed', left: scriptCtxMenu.x, top: scriptCtxMenu.y, zIndex: 95, background: '#1e1e2e', border: '1px solid #444', borderRadius: 6, overflow: 'hidden' }}>
          <button
            onClick={() => {
              setScriptDeleteConfirm(scriptCtxMenu.script)
              setScriptCtxMenu(null)
            }}
            style={{ display: 'block', width: '100%', border: 'none', background: 'none', color: '#fca5a5', padding: '7px 10px', textAlign: 'left' }}
          >
            Remove imported script…
          </button>
        </div>
      )}

      {combineOpen && combineForm && (
        <div className="modal-overlay" onClick={() => setCombineOpen(false)}>
          <div className="modal app-dialog" onClick={e => e.stopPropagation()} style={{ maxWidth: 520 }}>
            <h3 className="dialog-title">Combine {combineForm.selected.length} Scenes</h3>
            <label className="dialog-label">New scene number</label>
            <input className="dialog-input" value={combineForm.sceneNumber} onChange={e => setCombineForm(f => ({ ...f, sceneNumber: e.target.value }))} style={{ width: '100%', marginBottom: 8 }} />
            <label className="dialog-label">New slugline</label>
            <input className="dialog-input" value={combineForm.slugline} onChange={e => setCombineForm(f => ({ ...f, slugline: e.target.value }))} style={{ width: '100%', marginBottom: 8 }} />
            <label className="dialog-label">Merged characters</label>
            <CharacterTagInput characters={combineForm.characters} allCharacters={allCharacters} onChange={(chars) => setCombineForm(f => ({ ...f, characters: chars }))} />
            <div className="dialog-actions">
              <button className="dialog-button-secondary" onClick={() => setCombineOpen(false)}>Cancel</button>
              <button className="dialog-button-primary" onClick={doCombine}>Combine Scenes</button>
            </div>
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

      <ImportScriptModal isOpen={importModalOpen} onClose={() => setImportModalOpen(false)} />
    </div>
  )
}
