import React, { useEffect } from 'react'
import useStore from '../store'

const INT_EXT_OPTIONS = ['INT', 'EXT', 'INT/EXT']
const DAY_NIGHT_OPTIONS = ['DAY', 'NIGHT', 'DAY/NIGHT']

const SPEC_OPTIONS = {
  size: ['WIDE SHOT', 'MEDIUM', 'CLOSE UP', 'OTS', 'ECU', 'INSERT', 'ESTABLISHING'],
  type: ['EYE LVL', 'SHOULDER LVL', 'CROWD LVL', 'HIGH ANGLE', 'LOW ANGLE', 'DUTCH'],
  move: ['STATIC', 'PUSH', 'PULL', 'PAN', 'TILT', 'STATIC or PUSH', 'TRACKING', 'CRANE'],
  equip: ['STICKS', 'GIMBAL', 'HANDHELD', 'STICKS or GIMBAL', 'CRANE', 'DOLLY', 'STEADICAM'],
}

function updateShotSpecs(updateShot, shotId, specs, key, value) {
  updateShot(shotId, {
    specs: {
      ...(specs || {}),
      [key]: value,
    },
  })
}

function Section({ title, children }) {
  return (
    <section className="shot-props-section">
      <h4 className="shot-props-section-title">{title}</h4>
      <div className="shot-props-fields">{children}</div>
    </section>
  )
}

function Field({ label, children, wide = false }) {
  return (
    <label className={`shot-props-field${wide ? ' shot-props-field-wide' : ''}`}>
      <span className="dialog-label">{label}</span>
      {children}
    </label>
  )
}

function SelectWithValue({ value, options, onChange }) {
  const normalized = (value || '').trim()
  const mergedOptions = normalized && !options.includes(normalized)
    ? [normalized, ...options]
    : options

  return (
    <select value={value || ''} onChange={onChange}>
      <option value="">—</option>
      {mergedOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
    </select>
  )
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
      <div
        className="modal app-dialog shot-properties-dialog"
        style={{ width: 'min(1080px, 95vw)', maxHeight: '88vh', overflowY: 'auto' }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="dialog-title">Shot Properties</h3>
        <p className="dialog-description" style={{ marginBottom: 14 }}>
          {shotPayload.displayId || shot.id} · {shotPayload.sceneTitle || 'Unassigned scene'}
        </p>

        <section className="shot-props-identity">
          <div
            className="shot-props-image"
            style={{ borderColor: shot.color || '#cbd5e1' }}
            title={shot.image ? 'Storyboard image' : 'No storyboard image'}
          >
            {shot.image ? (
              <img src={shot.image} alt={`Storyboard frame for ${shotPayload.displayId || shot.id}`} />
            ) : (
              <div className="shot-props-image-placeholder">
                <span className="shot-props-image-placeholder-icon">🖼️</span>
                <span>No storyboard image</span>
                <small>Add an image from the storyboard card.</small>
              </div>
            )}
          </div>

          <div className="shot-props-identity-meta">
            <div>
              <span className="shot-props-meta-label">Shot</span>
              <p className="shot-props-meta-value">{shotPayload.displayId || shot.id}</p>
            </div>
            <div>
              <span className="shot-props-meta-label">Scene</span>
              <p className="shot-props-meta-value">{shotPayload.sceneTitle || 'Unassigned scene'}</p>
            </div>
            <Field label="Camera Name">
              <input value={shot.cameraName || ''} onChange={(e) => setField('cameraName', e.target.value)} />
            </Field>
            <Field label="Focal Length">
              <input value={shot.focalLength || ''} onChange={(e) => setField('focalLength', e.target.value)} />
            </Field>
          </div>
        </section>

        <div className="shot-props-layout">
          <Section title="General">
            <Field label="Description" wide>
              <input value={shot.description || ''} onChange={(e) => setField('description', e.target.value)} />
            </Field>
            <Field label="Subject">
              <input value={shot.subject || ''} onChange={(e) => setField('subject', e.target.value)} />
            </Field>
            <Field label="Cast">
              <input value={shot.cast || ''} onChange={(e) => setField('cast', e.target.value)} />
            </Field>
          </Section>

          <Section title="Scene Context">
            <Field label="INT / EXT">
              <SelectWithValue
                value={shot.intOrExt || ''}
                options={INT_EXT_OPTIONS}
                onChange={(e) => setField('intOrExt', e.target.value)}
              />
            </Field>
            <Field label="DAY / NIGHT">
              <SelectWithValue
                value={shot.dayNight || ''}
                options={DAY_NIGHT_OPTIONS}
                onChange={(e) => setField('dayNight', e.target.value)}
              />
            </Field>
          </Section>

          <Section title="Camera / Specs">
            <Field label="Shot Size">
              <SelectWithValue
                value={shot.specs?.size || ''}
                options={SPEC_OPTIONS.size}
                onChange={(e) => updateShotSpecs(updateShot, shot.id, shot.specs, 'size', e.target.value)}
              />
            </Field>
            <Field label="Type / Coverage">
              <SelectWithValue
                value={shot.specs?.type || ''}
                options={SPEC_OPTIONS.type}
                onChange={(e) => updateShotSpecs(updateShot, shot.id, shot.specs, 'type', e.target.value)}
              />
            </Field>
            <Field label="Movement">
              <SelectWithValue
                value={shot.specs?.move || ''}
                options={SPEC_OPTIONS.move}
                onChange={(e) => updateShotSpecs(updateShot, shot.id, shot.specs, 'move', e.target.value)}
              />
            </Field>
            <Field label="Equipment">
              <SelectWithValue
                value={shot.specs?.equip || ''}
                options={SPEC_OPTIONS.equip}
                onChange={(e) => updateShotSpecs(updateShot, shot.id, shot.specs, 'equip', e.target.value)}
              />
            </Field>
            <Field label="Frame Rate">
              <input value={shot.frameRate || ''} onChange={(e) => setField('frameRate', e.target.value)} />
            </Field>
          </Section>

          <Section title="Timing">
            <Field label="Shoot Time">
              <input value={shot.shootTime || ''} onChange={(e) => setField('shootTime', e.target.value)} />
            </Field>
            <Field label="Setup Time">
              <input value={shot.setupTime || ''} onChange={(e) => setField('setupTime', e.target.value)} />
            </Field>
            <Field label="Script Time">
              <input value={shot.scriptTime || ''} onChange={(e) => setField('scriptTime', e.target.value)} />
            </Field>
            <Field label="Predicted Takes">
              <input value={shot.predictedTakes || ''} onChange={(e) => setField('predictedTakes', e.target.value)} />
            </Field>
            <Field label="Take Number">
              <input value={shot.takeNumber || ''} onChange={(e) => setField('takeNumber', e.target.value)} />
            </Field>
          </Section>

          <Section title="Production">
            <Field label="Sound">
              <input value={shot.sound || ''} onChange={(e) => setField('sound', e.target.value)} />
            </Field>
            <Field label="Props">
              <input value={shot.props || ''} onChange={(e) => setField('props', e.target.value)} />
            </Field>
          </Section>

          <Section title="Notes">
            <Field label="Notes" wide>
              <textarea value={shot.notes || ''} onChange={(e) => setField('notes', e.target.value)} style={{ minHeight: 112 }} />
            </Field>
          </Section>
        </div>

        <details className="shot-props-debug">
          <summary>Advanced debug data</summary>
          <pre>
            {JSON.stringify(shot, null, 2)}
          </pre>
        </details>

        <div className="dialog-actions shot-props-footer">
          <span className="shot-props-autosave-pill">Changes save automatically</span>
          <button className="dialog-button-primary" onClick={close}>Close</button>
        </div>
      </div>
    </div>
  )
}
