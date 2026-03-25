import React, { useMemo, useRef, useState, useEffect } from 'react'
import useStore from '../store'
import { naturalSortSceneNumber } from '../utils/sceneSort'

function detectLineType(line) {
  const t = (line || '').trim()
  if (!t) return 'blank'
  if (/^(INT\.?|EXT\.?|INT\/EXT\.?)/.test(t) || /^\d+[A-Z\.]?\s+/.test(t)) return 'heading'
  if (/^[A-Z0-9 '\-()]+$/.test(t) && t.length <= 30 && !t.includes('.')) return 'character'
  if (/^\(.+\)$/.test(t)) return 'parenthetical'
  if (/:$/.test(t) || /TO:$/.test(t)) return 'transition'
  return 'action'
}

export default function ScriptTab() {
  const scriptScenes = useStore(s => s.scriptScenes)
  const scenes = useStore(s => s.scenes)
  const addShotWithOverrides = useStore(s => s.addShotWithOverrides)
  const setActiveTab = useStore(s => s.setActiveTab)
  const updateScriptScene = useStore(s => s.updateScriptScene)
  const scriptFocusRequest = useStore(s => s.scriptFocusRequest)
  const clearScriptFocusRequest = useStore(s => s.clearScriptFocusRequest)

  const rightRef = useRef(null)
  const headingRefs = useRef({})
  const [activeSceneId, setActiveSceneId] = useState(null)
  const [selectionBar, setSelectionBar] = useState(null)

  const orderedScenes = useMemo(() => [...scriptScenes].sort(naturalSortSceneNumber), [scriptScenes])
  const shotCounts = useMemo(() => {
    const map = {}
    scenes.forEach(sc => sc.shots.forEach(sh => {
      if (sh.linkedSceneId) map[sh.linkedSceneId] = (map[sh.linkedSceneId] || 0) + 1
    }))
    return map
  }, [scenes])

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
      if (!text || !rightRef.current?.contains(sel.anchorNode)) {
        setSelectionBar(null)
        return
      }
      const range = sel.getRangeAt(0)
      const rect = range.getBoundingClientRect()
      const sceneEl = range.startContainer.parentElement?.closest('[data-sceneid]')
      const sceneId = sceneEl?.getAttribute('data-sceneid')
      if (!sceneId) return
      const scene = scriptScenes.find(s => s.id === sceneId)
      setSelectionBar({ x: rect.left + window.scrollX, y: rect.top + window.scrollY - 40, text: text.slice(0, 200), sceneId, sceneNumber: scene?.sceneNumber || '' })
    }
    document.addEventListener('mouseup', onMouseUp)
    return () => document.removeEventListener('mouseup', onMouseUp)
  }, [scriptScenes])

  if (orderedScenes.length === 0) {
    return <div style={{ height: '100%', display: 'grid', placeItems: 'center' }}><div style={{ textAlign: 'center' }}><p>No script imported yet.</p><button onClick={() => setActiveTab('scenes')}>Go to Scenes tab</button></div></div>
  }

  return (
    <div style={{ display: 'flex', height: '100%' }}>
      <div style={{ width: 260, borderRight: '1px solid rgba(74,85,104,0.15)', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: 10, fontSize: 10, textTransform: 'uppercase', color: '#718096', fontWeight: 700 }}>Scenes</div>
        <div style={{ overflowY: 'auto' }}>
          {orderedScenes.map(sc => (
            <button key={sc.id} onClick={() => headingRefs.current[sc.id]?.scrollIntoView({ behavior: 'smooth', block: 'start' })} style={{ width: '100%', textAlign: 'left', padding: '8px 10px', border: 'none', borderLeft: activeSceneId === sc.id ? '3px solid #E84040' : '3px solid transparent', background: 'none' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: sc.color || '#9ca3af' }} />
                <span style={{ fontWeight: 700, fontSize: 11 }}>SC {sc.sceneNumber}</span>
                <span style={{ fontSize: 10, color: '#718096', marginLeft: 'auto' }}>{shotCounts[sc.id] || 0} shots</span>
              </div>
              <div style={{ fontSize: 10, color: '#4b5563', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sc.location || sc.slugline}</div>
            </button>
          ))}
        </div>
      </div>

      <div ref={rightRef} style={{ flex: 1, overflowY: 'auto', padding: 16, position: 'relative' }}>
        {orderedScenes.map(sc => {
          const linkedShots = scenes.flatMap(s => s.shots).filter(sh => sh.linkedSceneId === sc.id && sh.linkedDialogueLine)
          return (
            <section key={sc.id} data-sceneid={sc.id} style={{ padding: '16px 0', borderBottom: '1px solid rgba(74,85,104,0.15)' }}>
              <div ref={el => { headingRefs.current[sc.id] = el }} data-sceneid={sc.id} style={{ fontWeight: 700, borderLeft: `4px solid ${sc.color || '#9ca3af'}`, padding: '6px 10px', marginBottom: 8, background: sc.color ? `${sc.color}0d` : 'rgba(148,163,184,0.08)', position: 'relative' }}>
                {sc.slugline || `${sc.intExt || ''}. ${sc.location || ''} - ${sc.dayNight || ''}`}
                <span style={{ position: 'absolute', right: 8, top: 6, fontSize: 10, border: '1px solid rgba(74,85,104,0.2)', borderRadius: 10, padding: '1px 6px' }}>SC {sc.sceneNumber}</span>
              </div>
              {(sc.actionText || '').split('\n').map((line, idx) => {
                const type = detectLineType(line)
                const base = { fontSize: 14, color: '#1f2937', marginBottom: 4, whiteSpace: 'pre-wrap' }
                if (type === 'character') Object.assign(base, { textTransform: 'uppercase', textAlign: 'center', fontWeight: 600 })
                if (type === 'parenthetical') Object.assign(base, { textAlign: 'center', fontStyle: 'italic', maxWidth: '40%', margin: '0 auto 4px', color: '#64748b' })
                if (type === 'transition') Object.assign(base, { textAlign: 'right', textTransform: 'uppercase', fontWeight: 600, color: '#64748b' })
                if (type === 'action') Object.assign(base, { maxWidth: '100%' })
                const linked = linkedShots.find(sh => line.includes(sh.linkedDialogueLine || ''))
                return <div key={idx} style={base}>{line}{linked && <mark style={{ textDecoration: 'underline', textDecorationColor: '#E84040', background: 'transparent' }}> </mark>}</div>
              })}
            </section>
          )
        })}
      </div>

      {selectionBar && (
        <div style={{ position: 'fixed', left: selectionBar.x, top: selectionBar.y, zIndex: 120, background: '#1c1c1e', color: '#fff', borderRadius: 8, padding: '6px 8px', display: 'flex', gap: 8, alignItems: 'center' }}>
          <button onClick={() => {
            const boardScene = scenes[0]
            addShotWithOverrides(boardScene?.id, {
              linkedSceneId: selectionBar.sceneId,
              linkedDialogueLine: selectionBar.text,
              linkedDialogueOffset: (scriptScenes.find(s => s.id === selectionBar.sceneId)?.actionText || '').indexOf(selectionBar.text),
              notes: selectionBar.text,
            })
            setSelectionBar(null)
          }} style={{ border: 'none', background: 'none', color: '#fff', cursor: 'pointer' }}>+ Add Shot to SC {selectionBar.sceneNumber}</button>
          <button onClick={() => {
            const scene = scriptScenes.find(s => s.id === selectionBar.sceneId)
            if (scene) updateScriptScene(scene.id, { notes: `${scene.notes || ''}\n${selectionBar.text}`.trim() })
            setSelectionBar(null)
          }} style={{ border: 'none', background: 'none', color: '#fff', cursor: 'pointer' }}>🔖</button>
        </div>
      )}
    </div>
  )
}
