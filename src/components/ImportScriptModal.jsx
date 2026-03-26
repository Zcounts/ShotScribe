/**
 * ImportScriptModal.jsx
 * 4-step script import wizard:
 *   Step 1 — File Selection (drag-and-drop or Browse)
 *   Step 2 — Parsing Preview (editable table of extracted scenes)
 *   Step 3 — Custom Header Template (optional)
 *   Step 4 — Confirm import
 */

import React, { useState, useCallback, useRef, useEffect } from 'react'
import useStore from '../store'
import { parseScriptFile, applyHeaderTemplate } from '../utils/scriptParser'

// ── Small UI helpers ──────────────────────────────────────────────────────────

function ModalOverlay({ onClose, children }) {
  return (
    <div
      className="modal-overlay"
      style={{ zIndex: 600 }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      {children}
    </div>
  )
}

function WizardStep({ step, current, label }) {
  const done = current > step
  const active = current === step
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <div style={{
        width: 22, height: 22,
        borderRadius: '50%',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 11, fontFamily: 'monospace', fontWeight: 700,
        background: done ? '#22c55e' : active ? '#3b82f6' : 'rgba(128,128,128,0.2)',
        color: done || active ? '#fff' : '#b8b8b8',
        flexShrink: 0,
        transition: 'background 0.2s',
      }}>
        {done ? '✓' : step}
      </div>
      <span style={{
        fontSize: 11, fontFamily: 'monospace',
        color: active ? '#fff' : done ? '#d1d5db' : '#cbd5e1',
        fontWeight: active ? 700 : 400,
      }}>
        {label}
      </span>
    </div>
  )
}

const SCENE_COLORS = [
  '#4ade80', '#22d3ee', '#facc15', '#f87171',
  '#60a5fa', '#fb923c', '#c084fc', '#f472b6', null,
]

function ColorDot({ color, size = 14, onClick, title }) {
  return (
    <button
      onClick={onClick}
      title={title || 'Set color'}
      style={{
        width: size, height: size,
        borderRadius: '50%',
        border: color ? '2px solid rgba(255,255,255,0.3)' : '2px dashed rgba(128,128,128,0.5)',
        background: color || 'transparent',
        cursor: 'pointer',
        flexShrink: 0,
        display: 'inline-block',
        padding: 0,
        verticalAlign: 'middle',
      }}
    />
  )
}

function ColorPalette({ value, onChange }) {
  return (
    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
      {SCENE_COLORS.map((c, i) => (
        <button
          key={i}
          onClick={() => onChange(c)}
          title={c || 'No color'}
          style={{
            width: 16, height: 16,
            borderRadius: '50%',
            border: value === c ? '2px solid #fff' : '2px solid transparent',
            background: c || 'transparent',
            cursor: 'pointer',
            flexShrink: 0,
            padding: 0,
            outline: !c ? '1px dashed rgba(128,128,128,0.6)' : 'none',
          }}
        />
      ))}
    </div>
  )
}

// ── Step 1 — File Selection ───────────────────────────────────────────────────

function Step1({ onFileReady }) {
  const [dragOver, setDragOver] = useState(false)
  const [detectedFormat, setDetectedFormat] = useState(null)
  const [error, setError] = useState(null)
  const fileInputRef = useRef(null)

  const handleFile = useCallback(async (file) => {
    if (!file) return
    const ext = file.name.split('.').pop().toLowerCase()
    const formatLabels = {
      fountain: 'Fountain (.fountain)',
      fdx: 'Final Draft (.fdx)',
      txt: 'Plain Text (.txt)',
      pdf: 'PDF (.pdf)',
    }
    setDetectedFormat(formatLabels[ext] || `Unknown (.${ext})`)
    setError(null)
    onFileReady(file)
  }, [onFileReady])

  const handleDrop = useCallback((e) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }, [handleFile])

  const handleInputChange = (e) => {
    const file = e.target.files[0]
    if (file) handleFile(file)
    e.target.value = ''
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div
        onDragOver={e => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        style={{
          border: `2px dashed ${dragOver ? '#3b82f6' : 'rgba(128,128,128,0.4)'}`,
          borderRadius: 8,
          padding: '32px 24px',
          textAlign: 'center',
          background: dragOver ? 'rgba(59,130,246,0.08)' : 'rgba(128,128,128,0.05)',
          transition: 'all 0.15s',
          cursor: 'pointer',
        }}
        onClick={() => fileInputRef.current?.click()}
      >
        <div style={{ fontSize: 28, marginBottom: 8 }}>📄</div>
        <div style={{ fontSize: 13, fontFamily: 'monospace', marginBottom: 6, color: '#ccc' }}>
          Drop your script file here
        </div>
        <div style={{ fontSize: 11, color: '#cbd5e1' }}>
          .fountain &nbsp;·&nbsp; .fdx &nbsp;·&nbsp; .txt &nbsp;·&nbsp; .pdf
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <button
          onClick={() => fileInputRef.current?.click()}
          style={{
            padding: '7px 20px',
            fontFamily: 'monospace', fontSize: 12,
            background: '#3b82f6', color: '#fff',
            border: 'none', borderRadius: 4, cursor: 'pointer',
          }}
        >
          Browse…
        </button>
      </div>

      {detectedFormat && (
        <div style={{ textAlign: 'center', fontSize: 11, color: '#22c55e', fontFamily: 'monospace' }}>
          Detected: {detectedFormat}
        </div>
      )}

      {error && (
        <div style={{ fontSize: 12, color: '#f87171', background: 'rgba(248,113,113,0.1)', padding: '6px 10px', borderRadius: 4 }}>
          {error}
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept=".fountain,.fdx,.txt,.pdf"
        style={{ display: 'none' }}
        onChange={handleInputChange}
      />
    </div>
  )
}

// ── Step 2 — Parsing Preview ──────────────────────────────────────────────────

function Step2({ scenes, warnings, onScenesChange }) {
  const [colorPickerRow, setColorPickerRow] = useState(null) // row index
  const [editingCell, setEditingCell] = useState(null) // { row, field }

  const updateScene = (idx, field, value) => {
    const next = scenes.map((s, i) => i === idx ? { ...s, [field]: value } : s)
    onScenesChange(next)
  }

  const deleteRow = (idx) => {
    onScenesChange(scenes.filter((_, i) => i !== idx))
  }

  const mergeWithNext = (idx) => {
    if (idx >= scenes.length - 1) return
    const a = scenes[idx]
    const b = scenes[idx + 1]
    const merged = {
      ...a,
      actionText: [a.actionText, b.actionText].filter(Boolean).join('\n'),
      characters: [...new Set([...a.characters, ...b.characters])],
      dialogueCount: a.dialogueCount + b.dialogueCount,
    }
    const next = [...scenes.slice(0, idx), merged, ...scenes.slice(idx + 2)]
    onScenesChange(next)
  }

  // Compute summary stats
  const uniqueChars = new Set(scenes.flatMap(s => s.characters))
  const uniqueLocs = new Set(scenes.map(s => s.location).filter(Boolean))

  const tdStyle = {
    padding: '4px 6px',
    fontSize: 11,
    fontFamily: 'monospace',
    borderBottom: '1px solid rgba(128,128,128,0.15)',
    verticalAlign: 'middle',
    maxWidth: 160,
  }

  const EditableCell = ({ row, field, value, width }) => {
    const isEditing = editingCell?.row === row && editingCell?.field === field
    const [localVal, setLocalVal] = useState(value)
    useEffect(() => setLocalVal(value), [value])

    if (isEditing) {
      return (
        <td style={{ ...tdStyle, maxWidth: width }}>
          <input
            autoFocus
            value={localVal}
            onChange={e => setLocalVal(e.target.value)}
            onBlur={() => { updateScene(row, field, localVal); setEditingCell(null) }}
            onKeyDown={e => {
              if (e.key === 'Enter') { updateScene(row, field, localVal); setEditingCell(null) }
              if (e.key === 'Escape') { setLocalVal(value); setEditingCell(null) }
            }}
            style={{
              width: '100%', minWidth: 60,
              background: 'rgba(59,130,246,0.15)',
              border: '1px solid #3b82f6',
              borderRadius: 2,
              color: 'inherit',
              fontFamily: 'monospace',
              fontSize: 11,
              padding: '1px 3px',
            }}
          />
        </td>
      )
    }

    return (
      <td
        style={{ ...tdStyle, maxWidth: width, cursor: 'text' }}
        onClick={() => setEditingCell({ row, field })}
        title="Click to edit"
      >
        <span style={{ opacity: value ? 1 : 0.3 }}>{value || '—'}</span>
      </td>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {warnings.length > 0 && (
        <div style={{
          background: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.3)',
          borderRadius: 4, padding: '8px 12px',
        }}>
          {warnings.map((w, i) => (
            <div key={i} style={{ fontSize: 11, color: '#fbbf24', lineHeight: 1.5 }}>⚠ {w}</div>
          ))}
        </div>
      )}

      <div style={{ fontSize: 12, color: '#e2e8f0', fontFamily: 'monospace' }}>
        Found <strong style={{ color: '#fff' }}>{scenes.length}</strong> scenes
        &nbsp;·&nbsp; <strong style={{ color: '#fff' }}>{uniqueChars.size}</strong> unique characters
        &nbsp;·&nbsp; <strong style={{ color: '#fff' }}>{uniqueLocs.size}</strong> locations
      </div>

      <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: 380, border: '1px solid rgba(128,128,128,0.2)', borderRadius: 6 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
          <thead>
            <tr style={{ background: 'rgba(0,0,0,0.3)', position: 'sticky', top: 0, zIndex: 1 }}>
              {['#', 'Slugline', 'INT/EXT', 'D/N', 'Location', 'Characters', 'Color', 'Actions'].map(h => (
                <th key={h} style={{
                  padding: '5px 6px', fontSize: 10, fontFamily: 'monospace',
                  textAlign: 'left', color: '#f8fafc', fontWeight: 700,
                  letterSpacing: '0.06em', textTransform: 'uppercase',
                  borderBottom: '1px solid rgba(128,128,128,0.2)',
                }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {scenes.map((scene, i) => (
              <tr
                key={scene.id}
                style={{ background: i % 2 === 0 ? 'rgba(0,0,0,0.1)' : 'transparent' }}
              >
                {/* # */}
                <td style={{ ...tdStyle, width: 30, color: '#e2e8f0' }}>{i + 1}</td>

                {/* Slugline */}
                <EditableCell row={i} field="slugline" value={scene.slugline} width={180} />

                {/* INT/EXT */}
                <td style={{ ...tdStyle, width: 60 }}>
                  <select
                    value={scene.intExt || ''}
                    onChange={e => updateScene(i, 'intExt', e.target.value || null)}
                    style={{ background: 'transparent', border: 'none', color: 'inherit', fontFamily: 'monospace', fontSize: 11, width: '100%', cursor: 'pointer' }}
                  >
                    <option value="">—</option>
                    <option>INT</option>
                    <option>EXT</option>
                    <option>INT/EXT</option>
                  </select>
                </td>

                {/* D/N */}
                <td style={{ ...tdStyle, width: 80 }}>
                  <select
                    value={scene.dayNight || ''}
                    onChange={e => updateScene(i, 'dayNight', e.target.value || null)}
                    style={{ background: 'transparent', border: 'none', color: 'inherit', fontFamily: 'monospace', fontSize: 11, width: '100%', cursor: 'pointer' }}
                  >
                    <option value="">—</option>
                    <option>DAY</option>
                    <option>NIGHT</option>
                    <option>DAWN</option>
                    <option>DUSK</option>
                    <option>CONTINUOUS</option>
                    <option>LATER</option>
                  </select>
                </td>

                {/* Location */}
                <EditableCell row={i} field="location" value={scene.location} width={140} />

                {/* Characters */}
                <td style={{ ...tdStyle, width: 120, fontSize: 10 }}>
                  <span style={{ color: '#e2e8f0' }}>{scene.characters.slice(0, 3).join(', ')}{scene.characters.length > 3 ? '…' : ''}</span>
                </td>

                {/* Color */}
                <td style={{ ...tdStyle, width: 40 }}>
                  <div style={{ position: 'relative', display: 'inline-block' }}>
                    <ColorDot
                      color={scene.color}
                      onClick={() => setColorPickerRow(colorPickerRow === i ? null : i)}
                    />
                    {colorPickerRow === i && (
                      <div style={{
                        position: 'absolute', top: 20, left: 0, zIndex: 10,
                        background: '#222', border: '1px solid #444', borderRadius: 6,
                        padding: 8, boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
                      }}>
                        <ColorPalette
                          value={scene.color}
                          onChange={c => { updateScene(i, 'color', c); setColorPickerRow(null) }}
                        />
                      </div>
                    )}
                  </div>
                </td>

                {/* Actions */}
                <td style={{ ...tdStyle, width: 60, whiteSpace: 'nowrap' }}>
                  <button
                    onClick={() => mergeWithNext(i)}
                    title="Merge with next scene"
                    disabled={i >= scenes.length - 1}
                    style={{ fontSize: 10, background: 'none', border: 'none', color: '#e2e8f0', cursor: 'pointer', padding: '1px 3px', opacity: i >= scenes.length - 1 ? 0.3 : 0.7 }}
                  >
                    ⤵
                  </button>
                  <button
                    onClick={() => deleteRow(i)}
                    title="Remove this scene"
                    style={{ fontSize: 10, background: 'none', border: 'none', color: '#f87171', cursor: 'pointer', padding: '1px 3px', opacity: 0.7 }}
                  >
                    ✕
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Step 3 — Custom Header Template ──────────────────────────────────────────

function Step3({ template, onTemplateChange, previewScene }) {
  const preview = previewScene
    ? applyHeaderTemplate(template, previewScene)
    : ''

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ fontSize: 12, color: '#e2e8f0', lineHeight: 1.6 }}>
        If your production uses a specific scene header format, paste an example here.
        ShotScribe will use this pattern to pre-fill the{' '}
        <strong style={{ color: '#ddd' }}>Custom Header</strong> field for each imported scene.
      </div>

      <div>
        <label style={{ fontSize: 11, fontFamily: 'monospace', color: '#f1f5f9', display: 'block', marginBottom: 4 }}>
          HEADER TEMPLATE
        </label>
        <input
          type="text"
          value={template}
          onChange={e => onTemplateChange(e.target.value)}
          placeholder="e.g. SC {sceneNumber} · {intExt} · {location} · {dayNight}"
          style={{
            width: '100%', boxSizing: 'border-box',
            padding: '7px 10px',
            fontFamily: 'monospace', fontSize: 12,
            background: 'rgba(128,128,128,0.1)',
            border: '1px solid rgba(128,128,128,0.3)',
            borderRadius: 4, color: '#fff',
            outline: 'none',
          }}
        />
      </div>

      <div style={{ fontSize: 11, color: '#d1d5db', lineHeight: 1.6 }}>
        Available tokens: &nbsp;
        {['{sceneNumber}', '{location}', '{intExt}', '{dayNight}'].map(t => (
          <code key={t} style={{
            background: 'rgba(128,128,128,0.15)', borderRadius: 3,
            padding: '1px 5px', marginRight: 4, fontSize: 10,
          }}>
            {t}
          </code>
        ))}
      </div>

      {template && previewScene && (
        <div style={{ background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.25)', borderRadius: 4, padding: '8px 12px' }}>
          <div style={{ fontSize: 10, color: '#d1d5db', fontFamily: 'monospace', marginBottom: 4 }}>PREVIEW (first scene):</div>
          <div style={{ fontSize: 12, fontFamily: 'monospace', color: '#93c5fd' }}>{preview}</div>
        </div>
      )}

      <div style={{ fontSize: 11, color: '#d1d5db', marginTop: 4 }}>
        Leave blank to use the raw slugline as the custom header.
      </div>
    </div>
  )
}

// ── Step 4 — Confirm ──────────────────────────────────────────────────────────

function Step4({ scenes, existingImport, importMode, onImportModeChange }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ fontSize: 13, color: '#ddd', lineHeight: 1.6 }}>
        Ready to import <strong style={{ color: '#fff' }}>{scenes.length}</strong> scene{scenes.length !== 1 ? 's' : ''}.
      </div>

      {existingImport && (
        <div style={{ background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.25)', borderRadius: 6, padding: 12 }}>
          <div style={{ fontSize: 11, color: '#fbbf24', marginBottom: 8 }}>
            Scenes from <strong>{existingImport.filename}</strong> already exist ({existingImport.sceneCount} scenes).
            How do you want to handle this?
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {[
              { value: 'replace', label: 'Replace all scenes from this script' },
              { value: 'merge', label: 'Merge — add new scenes, keep existing' },
            ].map(opt => (
              <label key={opt.value} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 12 }}>
                <input
                  type="radio"
                  name="importMode"
                  value={opt.value}
                  checked={importMode === opt.value}
                  onChange={() => onImportModeChange(opt.value)}
                />
                <span>{opt.label}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        {[
          { label: 'INT scenes', count: scenes.filter(s => s.intExt === 'INT').length },
          { label: 'EXT scenes', count: scenes.filter(s => s.intExt === 'EXT').length },
          { label: 'Unique locations', count: new Set(scenes.map(s => s.location).filter(Boolean)).size },
          { label: 'Total characters', count: new Set(scenes.flatMap(s => s.characters)).size },
        ].map(stat => (
          <div key={stat.label} style={{
            background: 'rgba(128,128,128,0.1)', borderRadius: 6,
            padding: '6px 12px', fontSize: 11, fontFamily: 'monospace',
          }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#fff' }}>{stat.count}</div>
            <div style={{ color: '#e2e8f0' }}>{stat.label}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Main modal ────────────────────────────────────────────────────────────────

export default function ImportScriptModal({ isOpen, onClose }) {
  const importScriptScenes = useStore(s => s.importScriptScenes)
  const importedScripts = useStore(s => s.importedScripts)

  const [step, setStep] = useState(1)
  const [file, setFile] = useState(null)
  const [scenes, setScenes] = useState([])
  const [format, setFormat] = useState('')
  const [warnings, setWarnings] = useState([])
  const [headerTemplate, setHeaderTemplate] = useState('')
  const [importMode, setImportMode] = useState('replace')
  const [parsing, setParsing] = useState(false)
  const [parseError, setParseError] = useState(null)

  // Reset when modal opens
  useEffect(() => {
    if (isOpen) {
      setStep(1)
      setFile(null)
      setScenes([])
      setFormat('')
      setWarnings([])
      setHeaderTemplate('')
      setParseError(null)
    }
  }, [isOpen])

  const handleFileReady = useCallback(async (f) => {
    setFile(f)
    setParsing(true)
    setParseError(null)
    try {
      const result = await parseScriptFile(f)
      setScenes(result.scenes)
      setFormat(result.format)
      setWarnings(result.warnings)
    } catch (err) {
      setParseError(err.message)
    } finally {
      setParsing(false)
    }
  }, [])

  const goNext = () => {
    if (step === 1 && scenes.length === 0) return
    if (step < 4) setStep(s => s + 1)
  }

  const goBack = () => {
    if (step > 1) setStep(s => s - 1)
  }

  const handleConfirm = () => {
    // Apply header template to each scene
    const finalScenes = scenes.map(scene => ({
      ...scene,
      customHeader: headerTemplate
        ? applyHeaderTemplate(headerTemplate, scene)
        : scene.customHeader || scene.slugline,
    }))

    const scriptMeta = {
      id: `script_${Date.now()}`,
      filename: file?.name || 'Unknown',
    }

    importScriptScenes(finalScenes, scriptMeta, importMode)
    onClose()
  }

  // Check for existing import from this filename
  const existingImport = file
    ? importedScripts.find(s => s.filename === file.name)
    : null

  if (!isOpen) return null

  const canGoNext = step === 1
    ? (scenes.length > 0 && !parsing && !parseError)
    : step < 4

  const STEP_LABELS = ['File', 'Preview', 'Header', 'Confirm']

  return (
    <ModalOverlay onClose={onClose}>
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: '#1a1a2e',
          border: '1px solid rgba(128,128,128,0.25)',
          borderRadius: 10,
          width: '90vw', maxWidth: 760,
          maxHeight: '90vh',
          display: 'flex', flexDirection: 'column',
          boxShadow: '0 20px 60px rgba(0,0,0,0.7)',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div style={{
          padding: '16px 20px',
          borderBottom: '1px solid rgba(128,128,128,0.2)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 14, fontFamily: 'monospace', fontWeight: 700, color: '#fff' }}>
              Import Script
            </span>
            {format && (
              <span style={{ fontSize: 10, fontFamily: 'monospace', color: '#22c55e', background: 'rgba(34,197,94,0.1)', padding: '2px 8px', borderRadius: 12 }}>
                {format}
              </span>
            )}
          </div>

          {/* Step indicators */}
          <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
            {STEP_LABELS.map((label, i) => (
              <WizardStep key={i} step={i + 1} current={step} label={label} />
            ))}
          </div>

          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: '#f1f5f9', cursor: 'pointer', fontSize: 18, lineHeight: 1 }}
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflow: 'auto', padding: '20px 24px' }}>
          {step === 1 && (
            <>
              <Step1 onFileReady={handleFileReady} />
              {parsing && (
                <div style={{ textAlign: 'center', marginTop: 16, fontSize: 12, color: '#e2e8f0', fontFamily: 'monospace' }}>
                  Parsing script…
                </div>
              )}
              {parseError && (
                <div style={{ marginTop: 10, fontSize: 12, color: '#f87171', background: 'rgba(248,113,113,0.1)', padding: '8px 12px', borderRadius: 4 }}>
                  {parseError}
                </div>
              )}
              {scenes.length > 0 && !parsing && (
                <div style={{ marginTop: 12, textAlign: 'center', fontSize: 12, color: '#22c55e', fontFamily: 'monospace' }}>
                  ✓ Found {scenes.length} scenes. Click Next to review.
                </div>
              )}
            </>
          )}

          {step === 2 && (
            <Step2
              scenes={scenes}
              warnings={warnings}
              onScenesChange={setScenes}
            />
          )}

          {step === 3 && (
            <Step3
              template={headerTemplate}
              onTemplateChange={setHeaderTemplate}
              previewScene={scenes[0] || null}
            />
          )}

          {step === 4 && (
            <Step4
              scenes={scenes}
              existingImport={existingImport}
              importMode={importMode}
              onImportModeChange={setImportMode}
            />
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: '12px 20px',
          borderTop: '1px solid rgba(128,128,128,0.2)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          flexShrink: 0,
          background: 'rgba(0,0,0,0.2)',
        }}>
          <button
            onClick={step === 1 ? onClose : goBack}
            style={{
              padding: '7px 18px',
              fontFamily: 'monospace', fontSize: 12,
              background: 'transparent',
              border: '1px solid rgba(128,128,128,0.3)',
              borderRadius: 4, color: '#f1f5f9', cursor: 'pointer',
            }}
          >
            {step === 1 ? 'Cancel' : '← Back'}
          </button>

          <div style={{ display: 'flex', gap: 8 }}>
            {step < 4 ? (
              <button
                onClick={goNext}
                disabled={!canGoNext}
                style={{
                  padding: '7px 20px',
                  fontFamily: 'monospace', fontSize: 12, fontWeight: 700,
                  background: canGoNext ? '#3b82f6' : 'rgba(59,130,246,0.3)',
                  color: '#fff', border: 'none', borderRadius: 4,
                  cursor: canGoNext ? 'pointer' : 'default',
                }}
              >
                Next →
              </button>
            ) : (
              <button
                onClick={handleConfirm}
                disabled={scenes.length === 0}
                style={{
                  padding: '7px 20px',
                  fontFamily: 'monospace', fontSize: 12, fontWeight: 700,
                  background: scenes.length > 0 ? '#22c55e' : 'rgba(34,197,94,0.3)',
                  color: '#fff', border: 'none', borderRadius: 4,
                  cursor: scenes.length > 0 ? 'pointer' : 'default',
                }}
              >
                Import {scenes.length} Scene{scenes.length !== 1 ? 's' : ''}
              </button>
            )}
          </div>
        </div>
      </div>
    </ModalOverlay>
  )
}
