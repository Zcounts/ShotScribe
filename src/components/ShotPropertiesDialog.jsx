import React, { useEffect } from 'react'
import useStore from '../store'

function updateShotSpecs(updateShot, shotId, specs, key, value) {
  updateShot(shotId, {
    specs: {
      ...(specs || {}),
      [key]: value,
    },
  })
}

export default function ShotPropertiesDialog() {
  const dialog = useStore(s => s.shotPropertiesDialog)
  const close = useStore(s => s.closeShotDialog)
  const getShotDialogData = useStore(s => s.getShotDialogData)
  const updateShot = useStore(s => s.updateShot)

  const shotPayload = dialog ? getShotDialogData(dialog.shotId) : null
  const shot = shotPayload?.shot

  useEffect(() => {
    if (!dialog) return undefined
    const handler = (event) => {
      if (event.key === 'Escape') close()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [dialog, close])

  if (!dialog || !shot) return null

  const setField = (key, value) => {
    updateShot(shot.id, { [key]: value })
  }

  return (
    <div className="modal-overlay" style={{ zIndex: 720 }} onClick={close}>
      <div className="modal app-dialog" style={{ width: 'min(920px, 94vw)', maxHeight: '86vh', overflowY: 'auto' }} onClick={(e) => e.stopPropagation()}>
        <h3 className="dialog-title">Shot Properties</h3>
        <p className="dialog-description" style={{ marginBottom: 10 }}>
          {shotPayload.displayId || shot.id} · {shotPayload.sceneTitle || 'Unassigned scene'}
        </p>

        <div className="dialog-form-grid">
          <label className="dialog-label">Shot ID</label>
          <div style={{ fontFamily: 'monospace', fontSize: 12 }}>{shotPayload.displayId || shot.id}</div>

          <label className="dialog-label">Camera Name</label>
          <input value={shot.cameraName || ''} onChange={(e) => setField('cameraName', e.target.value)} />

          <label className="dialog-label">Focal Length</label>
          <input value={shot.focalLength || ''} onChange={(e) => setField('focalLength', e.target.value)} />

          <label className="dialog-label">Description</label>
          <input value={shot.description || ''} onChange={(e) => setField('description', e.target.value)} />

          <label className="dialog-label">Subject</label>
          <input value={shot.subject || ''} onChange={(e) => setField('subject', e.target.value)} />

          <label className="dialog-label">Cast</label>
          <input value={shot.cast || ''} onChange={(e) => setField('cast', e.target.value)} />

          <label className="dialog-label">INT / EXT</label>
          <input value={shot.intOrExt || ''} onChange={(e) => setField('intOrExt', e.target.value)} />

          <label className="dialog-label">DAY / NIGHT</label>
          <input value={shot.dayNight || ''} onChange={(e) => setField('dayNight', e.target.value)} />

          <label className="dialog-label">Shoot Time</label>
          <input value={shot.shootTime || ''} onChange={(e) => setField('shootTime', e.target.value)} />

          <label className="dialog-label">Setup Time</label>
          <input value={shot.setupTime || ''} onChange={(e) => setField('setupTime', e.target.value)} />

          <label className="dialog-label">Specs · Size</label>
          <input value={shot.specs?.size || ''} onChange={(e) => updateShotSpecs(updateShot, shot.id, shot.specs, 'size', e.target.value)} />

          <label className="dialog-label">Specs · Type</label>
          <input value={shot.specs?.type || ''} onChange={(e) => updateShotSpecs(updateShot, shot.id, shot.specs, 'type', e.target.value)} />

          <label className="dialog-label">Specs · Move</label>
          <input value={shot.specs?.move || ''} onChange={(e) => updateShotSpecs(updateShot, shot.id, shot.specs, 'move', e.target.value)} />

          <label className="dialog-label">Specs · Equip</label>
          <input value={shot.specs?.equip || ''} onChange={(e) => updateShotSpecs(updateShot, shot.id, shot.specs, 'equip', e.target.value)} />

          <label className="dialog-label">Sound</label>
          <input value={shot.sound || ''} onChange={(e) => setField('sound', e.target.value)} />

          <label className="dialog-label">Props</label>
          <input value={shot.props || ''} onChange={(e) => setField('props', e.target.value)} />

          <label className="dialog-label">Frame Rate</label>
          <input value={shot.frameRate || ''} onChange={(e) => setField('frameRate', e.target.value)} />

          <label className="dialog-label">Script Time</label>
          <input value={shot.scriptTime || ''} onChange={(e) => setField('scriptTime', e.target.value)} />

          <label className="dialog-label">Predicted Takes</label>
          <input value={shot.predictedTakes || ''} onChange={(e) => setField('predictedTakes', e.target.value)} />

          <label className="dialog-label">Take Number</label>
          <input value={shot.takeNumber || ''} onChange={(e) => setField('takeNumber', e.target.value)} />

          <label className="dialog-label">Notes</label>
          <textarea value={shot.notes || ''} onChange={(e) => setField('notes', e.target.value)} style={{ minHeight: 88 }} />
        </div>

        <label className="dialog-label" style={{ marginTop: 12 }}>Raw shot data</label>
        <pre style={{ marginTop: 6, maxHeight: 220, overflow: 'auto', background: '#111827', color: '#e5e7eb', padding: 10, borderRadius: 6, fontSize: 11 }}>
          {JSON.stringify(shot, null, 2)}
        </pre>

        <div className="dialog-actions">
          <button className="dialog-button-secondary" onClick={close}>Close</button>
        </div>
      </div>
    </div>
  )
}
