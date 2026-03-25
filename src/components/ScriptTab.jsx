import React, { useMemo, useRef, useState, useEffect } from 'react'
import useStore from '../store'
import { naturalSortSceneNumber } from '../utils/sceneSort'

function buildScreenplayElements(text) {
  const lines = String(text || '').split(/\r?\n/)
  const elements = []
  let expectingDialogue = false

  for (const rawLine of lines) {
    const line = rawLine.replace(/\t/g, '  ')
    const trimmed = line.trim()

    if (!trimmed) {
      expectingDialogue = false
      elements.push({ type: 'blank', text: '' })
      continue
    }

    if (/^(INT\.?|EXT\.?|INT\/EXT\.?|I\/E\.?)/i.test(trimmed) || /^\d+[A-Z]?\s+/.test(trimmed)) {
      expectingDialogue = false
      elements.push({ type: 'heading', text: trimmed.toUpperCase() })
      continue
    }

    if (/^[A-Z0-9 '\-.()]+$/.test(trimmed) && trimmed.length <= 38 && !trimmed.includes(':')) {
      expectingDialogue = true
      elements.push({ type: 'character', text: trimmed.toUpperCase() })
      continue
    }

    if (/^\(.+\)$/.test(trimmed) && expectingDialogue) {
      elements.push({ type: 'parenthetical', text: trimmed })
      continue
    }

    if (trimmed.endsWith('TO:') || trimmed.endsWith(':')) {
      expectingDialogue = false
      elements.push({ type: 'transition', text: trimmed.toUpperCase() })
      continue
    }

    if (expectingDialogue) {
      elements.push({ type: 'dialogue', text: line.trim() })
    } else {
      elements.push({ type: 'action', text: line.trim() })
    }
  }

  return elements
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

  const screenplayBySceneId = useMemo(() => {
    const result = {}
    orderedScenes.forEach(sc => {
      result[sc.id] = buildScreenplayElements(sc.actionText || '')
    })
    return result
  }, [orderedScenes])

  useEffect(() => {
    const io = new IntersectionObserver((entries) => {
      const visible = entries
        .filter(e => e.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0]
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
      setSelectionBar({
        x: rect.left + window.scrollX,
        y: rect.top + window.scrollY - 40,
        text: text.slice(0, 260),
        sceneId,
        sceneNumber: scene?.sceneNumber || '',
      })
    }

    document.addEventListener('mouseup', onMouseUp)
    return () => document.removeEventListener('mouseup', onMouseUp)
  }, [scriptScenes])

  const findStoryboardSceneForScriptScene = (scriptScene) => {
    if (!scriptScene) return null

    for (const storyboardScene of scenes) {
      if (storyboardScene.shots.some(shot => shot.linkedSceneId === scriptScene.id)) return storyboardScene
    }

    const sceneNum = String(scriptScene.sceneNumber || '').toUpperCase()
    if (sceneNum) {
      const foundByLabel = scenes.find(scene => String(scene.sceneLabel || '').toUpperCase().includes(sceneNum))
      if (foundByLabel) return foundByLabel
    }

    return scenes[0] || null
  }

  const handleAddShotToScriptScene = (sceneId, selectedText = '') => {
    const scriptScene = scriptScenes.find(scene => scene.id === sceneId)
    const targetStoryboardScene = findStoryboardSceneForScriptScene(scriptScene)
    if (!targetStoryboardScene || !scriptScene) return

    addShotWithOverrides(targetStoryboardScene.id, {
      linkedSceneId: scriptScene.id,
      linkedDialogueLine: selectedText || null,
      linkedDialogueOffset: selectedText
        ? (scriptScene.actionText || '').indexOf(selectedText)
        : null,
      notes: selectedText || '',
    })

    setActiveTab('shotlist')
    setSelectionBar(null)
  }

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

      <div ref={rightRef} style={{ flex: 1, overflowY: 'auto', padding: 18, position: 'relative' }}>
        <div style={{ maxWidth: 860, margin: '0 auto', background: '#fffdf8', border: '1px solid rgba(74,85,104,0.18)', boxShadow: '0 6px 20px rgba(0,0,0,0.08)', padding: '28px 58px', fontFamily: '"Courier Prime", "Courier New", Courier, monospace', fontSize: 16, lineHeight: 1.5 }}>
          {orderedScenes.map(sc => (
            <section key={sc.id} data-sceneid={sc.id} style={{ padding: '20px 0', borderBottom: '1px solid rgba(74,85,104,0.12)' }}>
              <div ref={el => { headingRefs.current[sc.id] = el }} data-sceneid={sc.id} style={{ fontWeight: 700, borderLeft: `4px solid ${sc.color || '#9ca3af'}`, padding: '6px 10px', marginBottom: 14, background: sc.color ? `${sc.color}0d` : 'rgba(148,163,184,0.08)', position: 'relative', fontFamily: 'Sora, sans-serif', fontSize: 13 }}>
                {sc.slugline || `${sc.intExt || ''}. ${sc.location || ''} - ${sc.dayNight || ''}`}
                <span style={{ position: 'absolute', right: 8, top: 6, fontSize: 10, border: '1px solid rgba(74,85,104,0.2)', borderRadius: 10, padding: '1px 6px', fontFamily: 'monospace' }}>SC {sc.sceneNumber}</span>
              </div>

              {screenplayBySceneId[sc.id].map((line, idx) => {
                const shared = { whiteSpace: 'pre-wrap', marginBottom: 4 }
                if (line.type === 'blank') return <div key={`${sc.id}-${idx}`} style={{ height: 10 }} />
                if (line.type === 'heading') return <div key={`${sc.id}-${idx}`} style={{ ...shared, textTransform: 'uppercase', fontWeight: 700 }}>{line.text}</div>
                if (line.type === 'action') return <div key={`${sc.id}-${idx}`} style={{ ...shared, marginRight: '10%' }}>{line.text}</div>
                if (line.type === 'character') return <div key={`${sc.id}-${idx}`} style={{ ...shared, marginLeft: '38%', textTransform: 'uppercase' }}>{line.text}</div>
                if (line.type === 'parenthetical') return <div key={`${sc.id}-${idx}`} style={{ ...shared, marginLeft: '33%', color: '#374151' }}>{line.text}</div>
                if (line.type === 'dialogue') return <div key={`${sc.id}-${idx}`} style={{ ...shared, marginLeft: '28%', width: '48%' }}>{line.text}</div>
                if (line.type === 'transition') return <div key={`${sc.id}-${idx}`} style={{ ...shared, textAlign: 'right', textTransform: 'uppercase', fontWeight: 700 }}>{line.text}</div>
                return null
              })}

              <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end' }}>
                <button
                  onClick={() => handleAddShotToScriptScene(sc.id)}
                  style={{ border: '1px solid rgba(74,85,104,0.25)', background: '#FAF8F4', borderRadius: 4, padding: '6px 10px', fontSize: 11, fontWeight: 700, cursor: 'pointer', letterSpacing: '0.04em' }}
                >
                  + Add Shot to SC {sc.sceneNumber}
                </button>
              </div>
            </section>
          ))}
        </div>
      </div>

      {selectionBar && (
        <div style={{ position: 'fixed', left: selectionBar.x, top: selectionBar.y, zIndex: 120, background: '#1c1c1e', color: '#fff', borderRadius: 8, padding: '6px 8px', display: 'flex', gap: 8, alignItems: 'center' }}>
          <button onClick={() => handleAddShotToScriptScene(selectionBar.sceneId, selectionBar.text)} style={{ border: 'none', background: 'none', color: '#fff', cursor: 'pointer' }}>+ Add Shot to SC {selectionBar.sceneNumber}</button>
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
