import React, { useEffect, useMemo, useState } from 'react'
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

function Section({ title, children, className = '' }) {
  return (
    <section className={`shot-props-section ${className}`.trim()}>
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
  const scriptScenes = useStore(s => s.scriptScenes)
  const moveShotToScriptScene = useStore(s => s.moveShotToScriptScene)
  const setActiveTab = useStore(s => s.setActiveTab)
  const [scenePickerOpen, setScenePickerOpen] = useState(false)
  const [sceneSearch, setSceneSearch] = useState('')

  const shotPayload = dialog ? getShotDialogData(dialog.shotId) : null
  const shot = shotPayload?.shot
  const filteredScenes = useMemo(() => {
    const query = sceneSearch.trim().toLowerCase()
    return scriptScenes.filter((scene) => {
      if (!query) return true
      return (`${scene.sceneNumber || ''}`.toLowerCase().includes(query)
        || `${scene.location || ''}`.toLowerCase().includes(query)
        || `${scene.slugline || ''}`.toLowerCase().includes(query)
        || (scene.characters || []).join(' ').toLowerCase().includes(query))
    })
  }, [sceneSearch, scriptScenes])

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

  const customFields = Object.entries(shot)
    .filter(([key]) => key.startsWith('custom_'))
    .sort(([a], [b]) => a.localeCompare(b))

  const linkRows = [
    ['Linked Script Scene', shot.linkedSceneId || '—'],
    ['Dialogue Line', shot.linkedDialogueLine || '—'],
    ['Dialogue Offset', shot.linkedDialogueOffset ?? '—'],
    ['Script Range Start', shot.linkedScriptRangeStart ?? '—'],
    ['Script Range End', shot.linkedScriptRangeEnd ?? '—'],
  ]

  return (
    <div className="modal-overlay" style={{ zIndex: 720 }} onClick={close}>
      <div
        className="modal app-dialog shot-properties-dialog"
        style={{ width: 'min(1720px, 90vw)', height: 'min(1120px, 88vh)', overflow: 'hidden' }}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="shot-props-header">
          <div>
            <h3 className="dialog-title">Shot Properties</h3>
            <p className="dialog-description shot-props-dialog-description">
              Edit canonical shot details. Changes are saved automatically.
            </p>
          </div>
          <button className="dialog-button-secondary shot-props-close" onClick={close}>Close</button>
        </header>

        <div className="shot-props-content shot-props-content-full">
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
              <div className="shot-props-hero-heading">
                <div>
                  <span className="shot-props-meta-label">Shot</span>
                  <p className="shot-props-meta-value">{shotPayload.displayId || shot.id}</p>
                </div>
                <div>
                  <span className="shot-props-meta-label">Scene / Slugline</span>
                  <p className="shot-props-meta-value">{shotPayload.sceneTitle || 'Unassigned scene'}</p>
                </div>
              </div>

              <div className="shot-props-hero-summary">
                <div>
                  <span className="shot-props-meta-label">Shot Size</span>
                  <p className="shot-props-meta-value">{shot.specs?.size || '—'}</p>
                </div>
                <div>
                  <span className="shot-props-meta-label">Movement</span>
                  <p className="shot-props-meta-value">{shot.specs?.move || '—'}</p>
                </div>
                <div>
                  <span className="shot-props-meta-label">Status</span>
                  <p className="shot-props-meta-value">{shot.checked ? 'Checked' : 'Untracked'}</p>
                </div>
                <div>
                  <span className="shot-props-meta-label">Aspect Ratio</span>
                  <p className="shot-props-meta-value">{shot.shotAspectRatio || '—'}</p>
                </div>
              </div>

              <div className="shot-props-hero-controls">
                <div className="shot-props-field shot-props-field-wide">
                  <span className="dialog-label">Organization</span>
                  <button
                    className="dialog-button-secondary"
                    type="button"
                    onClick={() => {
                      setSceneSearch('')
                      setScenePickerOpen(true)
                    }}
                    style={{ justifySelf: 'flex-start' }}
                  >
                    Move to Scene
                  </button>
                </div>
                <Field label="Camera Name">
                  <input value={shot.cameraName || ''} onChange={(e) => setField('cameraName', e.target.value)} />
                </Field>
                <Field label="Focal Length">
                  <input value={shot.focalLength || ''} onChange={(e) => setField('focalLength', e.target.value)} />
                </Field>
                <Field label="Marked Complete">
                  <select value={shot.checked ? 'yes' : 'no'} onChange={(e) => setField('checked', e.target.value === 'yes')}>
                    <option value="no">No</option>
                    <option value="yes">Yes</option>
                  </select>
                </Field>
                <Field label="Shot Aspect Ratio">
                  <input value={shot.shotAspectRatio || ''} onChange={(e) => setField('shotAspectRatio', e.target.value)} />
                </Field>
              </div>
            </div>
          </section>

          <div className="shot-props-layout shot-props-layout-main">
            <Section title="General" className="shot-props-section-primary">
              <Field label="Description" wide>
                <input value={shot.description || ''} onChange={(e) => setField('description', e.target.value)} />
              </Field>
              <Field label="Subject">
                <input value={shot.subject || ''} onChange={(e) => setField('subject', e.target.value)} />
              </Field>
              <Field label="Cast" wide>
                <textarea value={shot.cast || ''} onChange={(e) => setField('cast', e.target.value)} style={{ minHeight: 82 }} />
              </Field>
            </Section>

            <Section title="Scene Context" className="shot-props-section-compact">
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

            <Section title="Camera / Specs" className="shot-props-section-primary">
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
              <Field label="Shot ID">
                <input value={shot.id || ''} readOnly />
              </Field>
            </Section>

            <Section title="Timing" className="shot-props-section-compact">
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

            <Section title="Production" className="shot-props-section-compact">
              <Field label="Sound">
                <input value={shot.sound || ''} onChange={(e) => setField('sound', e.target.value)} />
              </Field>
              <Field label="Props">
                <input value={shot.props || ''} onChange={(e) => setField('props', e.target.value)} />
              </Field>
            </Section>

            <Section title="Notes" className="shot-props-section-primary shot-props-section-notes">
              <Field label="Notes" wide>
                <textarea value={shot.notes || ''} onChange={(e) => setField('notes', e.target.value)} style={{ minHeight: 120 }} />
              </Field>
            </Section>

            <Section title="Links / Script Binding" className="shot-props-section-compact">
              {linkRows.map(([label, value]) => (
                <div key={label} className="shot-props-data-row">
                  <span>{label}</span>
                  <code>{String(value)}</code>
                </div>
              ))}
            </Section>

            <Section title="Custom Columns" className="shot-props-section-compact">
              {customFields.length === 0 ? (
                <div className="shot-props-empty">No custom fields on this shot.</div>
                ) : customFields.map(([key, value]) => (
                <Field key={key} label={key.replace(/^custom_/, '').replace(/_/g, ' ').toUpperCase()}>
                  <input
                    value={value == null ? '' : String(value)}
                    onChange={(e) => setField(key, e.target.value)}
                  />
                </Field>
              ))}
            </Section>

            <Section title="Image Asset Data" className="shot-props-section-compact">
              <div className="shot-props-data-row"><span>Thumb</span><code>{shot.imageAsset?.thumb ? 'available' : 'none'}</code></div>
              <div className="shot-props-data-row"><span>Mime</span><code>{shot.imageAsset?.mime || '—'}</code></div>
              <div className="shot-props-data-row"><span>Source</span><code>{shot.imageAsset?.meta?.sourceName || '—'}</code></div>
              <div className="shot-props-data-row"><span>Dimensions</span><code>{shot.imageAsset?.meta ? `${shot.imageAsset.meta.sourceWidth}×${shot.imageAsset.meta.sourceHeight}` : '—'}</code></div>
            </Section>

            <section className="shot-props-debug">
              <h4 className="shot-props-section-title">Full Shot Record (Read-only)</h4>
              <pre>{JSON.stringify(shot, null, 2)}</pre>
            </section>
          </div>
      </div>

      {scenePickerOpen && (
        <div className="modal-overlay" style={{ zIndex: 760 }} onClick={() => setScenePickerOpen(false)}>
          <div
            className="modal app-dialog"
            style={{ width: 'min(560px, 92vw)', maxHeight: 'min(640px, 85vh)', overflow: 'hidden' }}
            onClick={(event) => event.stopPropagation()}
          >
            <p className="dialog-title" style={{ marginBottom: 6 }}>Move to Scene</p>
            <p className="dialog-description" style={{ marginBottom: 12 }}>
              Select a target scene. The shot will move to that scene&apos;s storyboard page.
            </p>
            <input
              autoFocus
              placeholder="Search by scene number, location, slugline, or cast..."
              value={sceneSearch}
              onChange={(event) => setSceneSearch(event.target.value)}
              style={{
                width: '100%',
                border: '1px solid rgba(74,85,104,0.35)',
                background: '#FAF8F4',
                color: '#1A1A1A',
                fontSize: 12,
                padding: '9px 10px',
                borderRadius: 6,
                outline: 'none',
                marginBottom: 10,
              }}
            />
            <div style={{ overflowY: 'auto', maxHeight: 420, paddingRight: 2 }}>
              {filteredScenes.map((scene) => (
                <button
                  key={scene.id}
                  type="button"
                  onClick={() => {
                    moveShotToScriptScene(shot.id, scene.id)
                    setScenePickerOpen(false)
                    setActiveTab('storyboard')
                  }}
                  style={{
                    width: '100%',
                    textAlign: 'left',
                    padding: '10px 12px',
                    marginBottom: 7,
                    background: '#FAF8F4',
                    border: '1px solid rgba(74,85,104,0.2)',
                    cursor: 'pointer',
                    borderRadius: 8,
                    display: 'grid',
                    gap: 4,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {scene.color ? <span style={{ width: 8, height: 8, borderRadius: '50%', background: scene.color }} /> : null}
                    <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', color: '#4A5568' }}>SC {scene.sceneNumber || '—'}</span>
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#1A1A1A' }}>{scene.slugline || scene.location || 'Untitled scene'}</div>
                  <div style={{ fontSize: 11, color: '#718096', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {[scene.location, (scene.characters || []).length > 0 ? scene.characters.join(', ') : null].filter(Boolean).join(' · ') || 'No additional metadata'}
                  </div>
                </button>
              ))}
              {filteredScenes.length === 0 && (
                <div style={{ textAlign: 'center', color: '#718096', padding: '26px 8px', fontSize: 12 }}>
                  No scenes match this search.
                </div>
              )}
            </div>
            <div className="dialog-actions" style={{ marginTop: 12 }}>
              <button className="dialog-button-secondary" type="button" onClick={() => setScenePickerOpen(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      <div className="dialog-actions shot-props-footer">
          <span className="shot-props-autosave-pill">Autosave is on</span>
          <button className="dialog-button-primary" onClick={close}>Close</button>
        </div>
      </div>
    </div>
  )
}
