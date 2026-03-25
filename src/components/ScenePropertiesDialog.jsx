import React from 'react'
import useStore from '../store'
import SceneColorPicker from './SceneColorPicker'
import { estimateScreenplayPagination } from '../utils/screenplay'

export default function ScenePropertiesDialog() {
  const dialog = useStore(s => s.scenePropertiesDialog)
  const close = useStore(s => s.closeScenePropertiesDialog)
  const scenes = useStore(s => s.scenes)
  const scriptScenes = useStore(s => s.scriptScenes)
  const updateScene = useStore(s => s.updateScene)
  const updateScriptScene = useStore(s => s.updateScriptScene)

  if (!dialog) return null

  const isScript = dialog.source === 'script'
  const scene = isScript
    ? scriptScenes.find(s => s.id === dialog.sceneId)
    : scenes.find(s => s.id === dialog.sceneId)

  if (!scene) return null

  const pagination = isScript ? estimateScreenplayPagination(scriptScenes).byScene[scene.id] : null

  const update = (updates) => {
    if (isScript) updateScriptScene(scene.id, updates)
    else updateScene(scene.id, updates)
  }

  return (
    <div className="modal-overlay" style={{ zIndex: 700 }} onClick={close}>
      <div className="modal" style={{ width: 'min(860px, 92vw)', maxWidth: 860, maxHeight: '84vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
        <h3 style={{ marginBottom: 16, fontSize: 22 }}>Scene Properties</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr', rowGap: 12, columnGap: 14, alignItems: 'center' }}>
          <label>Scene Number</label>
          <input value={isScript ? (scene.sceneNumber || '') : (scene.sceneLabel || '')} onChange={(e) => update(isScript ? { sceneNumber: e.target.value } : { sceneLabel: e.target.value })} />

          <label>Title / Slugline</label>
          <input value={isScript ? (scene.slugline || '') : ''} onChange={(e) => isScript && update({ slugline: e.target.value })} disabled={!isScript} />

          <label>Location</label>
          <input value={scene.location || ''} onChange={(e) => update({ location: e.target.value })} />

          <label>INT / EXT</label>
          <input value={(isScript ? scene.intExt : scene.intOrExt) || ''} onChange={(e) => update(isScript ? { intExt: e.target.value } : { intOrExt: e.target.value })} />

          <label>DAY / NIGHT</label>
          <input value={scene.dayNight || ''} onChange={(e) => update({ dayNight: e.target.value })} />

          <label>Color</label>
          <SceneColorPicker value={scene.color || null} onChange={(color) => update({ color })} size={16} />

          {isScript && (
            <>
              <label>Estimated Pages</label>
              <div style={{ fontSize: 13, color: '#4A5568' }}>
                {pagination ? `${pagination.pageCount.toFixed(2)} pp · p${pagination.startPage}–${pagination.endPage}` : '—'}
              </div>
            </>
          )}
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}>
          <button onClick={close}>Close</button>
        </div>
      </div>
    </div>
  )
}
