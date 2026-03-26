import React, { useMemo, useState, useRef, useEffect } from 'react'
import useStore from '../store'
import { computeConfidence } from '../utils/scriptParser'
import { naturalSortSceneNumber } from '../utils/sceneSort'
import ImportScriptModal from './ImportScriptModal'
import SceneColorPicker from './SceneColorPicker'
import { estimateScreenplayPagination } from '../utils/screenplay'

function CharacterTagInput({ scene, allCharacters, onChange }) {
  const [input, setInput] = useState('')
  const filtered = useMemo(() => {
    const q = input.trim().toLowerCase()
    if (!q) return []
    return allCharacters.filter(name => name.toLowerCase().includes(q) && !(scene.characters || []).includes(name)).slice(0, 8)
  }, [allCharacters, input, scene.characters])

  const addTag = (raw) => {
    const value = raw.trim()
    if (!value) return
    const exists = (scene.characters || []).some(c => c.toLowerCase() === value.toLowerCase())
    if (exists) return
    onChange([...(scene.characters || []), value])
    setInput('')
  }

  return (
    <div style={{ position: 'relative' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, border: '1px solid rgba(128,128,128,0.25)', borderRadius: 4, padding: 6, background: 'rgba(128,128,128,0.08)' }}>
        {(scene.characters || []).map(name => (
          <span key={name} style={{ fontSize: 10, background: 'rgba(59,130,246,0.2)', border: '1px solid rgba(59,130,246,0.45)', color: '#93c5fd', borderRadius: 10, padding: '2px 6px', display: 'inline-flex', gap: 4, alignItems: 'center' }}>
            {name}
            <button onClick={() => onChange((scene.characters || []).filter(c => c !== name))} style={{ border: 'none', background: 'none', color: '#93c5fd', cursor: 'pointer', padding: 0 }}>×</button>
          </span>
        ))}
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ',') {
              e.preventDefault()
              addTag(input)
            }
          }}
          placeholder="+ add"
          style={{ border: 'none', outline: 'none', background: 'transparent', color: '#ddd', fontSize: 11, minWidth: 80 }}
        />
      </div>
      {filtered.length > 0 && (
        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 40, background: '#1e1e2e', border: '1px solid #444', borderRadius: 4, marginTop: 4, maxHeight: 140, overflowY: 'auto' }}>
          {filtered.map(name => (
            <button key={name} onClick={() => addTag(name)} style={{ width: '100%', textAlign: 'left', border: 'none', background: 'none', color: '#ddd', fontSize: 11, padding: '5px 8px', cursor: 'pointer' }}>
              {name}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default function ScenesTab() {
  const scriptScenes = useStore(s => s.scriptScenes)
  const importedScripts = useStore(s => s.importedScripts)
  const scenes = useStore(s => s.scenes)
  const scriptSettings = useStore(s => s.scriptSettings)
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

  const visibleScenes = useMemo(() => {
    const subset = !activeScript
      ? scriptScenes
      : scriptScenes.filter(s => s.importSource === (importedScripts.find(x => x.id === activeScript)?.filename))
    return [...subset].sort(naturalSortSceneNumber)
  }, [scriptScenes, activeScript, importedScripts])

  const allCharacters = useMemo(() => {
    const set = new Set()
    scriptScenes.forEach(s => (s.characters || []).forEach(c => set.add(c)))
    return [...set]
  }, [scriptScenes])
  const pagination = useMemo(() => estimateScreenplayPagination(visibleScenes), [visibleScenes])

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
    setTabViewState('scenes', { activeScript })
  }, [activeScript, setTabViewState])

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
    <div style={{ display: 'flex', height: '100%' }} onClick={() => { setCtxMenu(null); setScriptCtxMenu(null) }}>
      <div style={{ width: 220, borderRight: '1px solid rgba(74,85,104,0.15)', background: '#EDE9E1', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '10px 12px', fontSize: 10, textTransform: 'uppercase', color: '#718096', fontWeight: 700 }}>Imported Scripts</div>
        <button onClick={() => setActiveScript(null)} style={{ textAlign: 'left', border: 'none', background: activeScript ? 'none' : 'rgba(232,64,64,0.1)', borderLeft: activeScript ? '3px solid transparent' : '3px solid #E84040', padding: '7px 12px' }}>All Scenes</button>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {importedScripts.map(sc => (
            <div
              key={sc.id}
              onContextMenu={(e) => {
                e.preventDefault()
                setScriptCtxMenu({ x: e.clientX, y: e.clientY, script: sc })
              }}
            >
              <button onClick={() => setActiveScript(sc.id)} style={{ width: '100%', textAlign: 'left', border: 'none', background: activeScript === sc.id ? 'rgba(232,64,64,0.1)' : 'none', padding: '8px 12px' }}>{sc.filename}</button>
            </div>
          ))}
        </div>
        <div style={{ padding: 10 }}><button onClick={() => setImportModalOpen(true)} style={{ width: '100%', background: '#E84040', color: '#fff', border: 'none', borderRadius: 5, padding: 7 }}>+ Import Script</button></div>
      </div>

      <div
        ref={listRef}
        onScroll={(e) => setTabViewState('scenes', { scrollTop: e.currentTarget.scrollTop })}
        style={{ flex: 1, padding: 14, overflowY: 'auto', position: 'relative' }}
      >
        {visibleScenes.map(scene => {
          const linkedShots = linkedShotsMap[scene.id] || []
          const confidence = computeConfidence(scene, linkedShots.length)
          const expanded = !!expandedIds[scene.id]
          const selected = selectedSceneIds.includes(scene.id)
          return (
            <div key={scene.id} onDoubleClick={() => openScenePropertiesDialog('script', scene.id)} onContextMenu={(e) => { e.preventDefault(); setCtxMenu({ x: e.clientX, y: e.clientY, scene }) }} style={{ border: '1px solid rgba(74,85,104,0.15)', borderRadius: 6, marginBottom: 8, background: '#FAF8F4' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px' }}>
                <input type="checkbox" checked={selected} onChange={(e) => setSelectedSceneIds(prev => e.target.checked ? [...new Set([...prev, scene.id])] : prev.filter(id => id !== scene.id))} style={{ opacity: selectedSceneIds.length > 0 || selected ? 1 : 0.2 }} />
                <SceneColorPicker value={scene.color || null} onChange={(color) => updateScriptScene(scene.id, { color })} />
                {editingSceneNumberId === scene.id ? (
                  <input
                    autoFocus
                    value={editSceneNumberValue}
                    onChange={e => setEditSceneNumberValue(e.target.value)}
                    onBlur={commitEditor}
                    onKeyDown={e => { if (e.key === 'Enter') commitEditor(); if (e.key === 'Escape') setEditingSceneNumberId(null) }}
                    style={{ width: 88, fontSize: 11, borderRadius: 3, border: invalidEdit ? '1px solid #ef4444' : '1px solid rgba(128,128,128,0.3)', padding: '3px 6px' }}
                  />
                ) : (
                  <button onClick={() => openEditor(scene)} style={{ border: 'none', background: 'none', fontFamily: 'monospace', fontWeight: 700, cursor: 'text' }}>SC {scene.sceneNumber || '—'}</button>
                )}
                <span style={{ color: '#4A5568', flex: 1, fontSize: 11 }}>{scene.location || scene.slugline}</span>
                <span style={{ color: '#718096', fontSize: 10 }}>{linkedShots.length} shots</span>
                <span style={{ color: '#718096', fontSize: 10 }}>{pagination.byScene[scene.id]?.pageCount?.toFixed(2) || '0.00'} pp</span>
                <span style={{ fontSize: 10, color: confidence === 'low' ? '#f87171' : confidence === 'medium' ? '#f59e0b' : '#22c55e' }}>● {confidence}</span>
                <button onClick={() => setExpandedIds(p => ({ ...p, [scene.id]: !p[scene.id] }))} style={{ border: 'none', background: 'none' }}>{expanded ? '▴' : '▾'}</button>
              </div>

              {expanded && (
                <div style={{ padding: '0 12px 12px' }}>
                  <div style={{ fontSize: 10, color: '#666', textTransform: 'uppercase', marginBottom: 4 }}>Characters</div>
                  <CharacterTagInput scene={scene} allCharacters={allCharacters} onChange={(chars) => updateScriptScene(scene.id, { characters: chars })} />
                </div>
              )}
            </div>
          )
        })}

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
            <CharacterTagInput scene={{ characters: combineForm.characters }} allCharacters={allCharacters} onChange={(chars) => setCombineForm(f => ({ ...f, characters: chars }))} />
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
