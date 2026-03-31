import React, { useMemo, useState } from 'react'
import SceneColorPicker from './SceneColorPicker'

export function CharacterChip({ name, onRemove }) {
  return (
    <span className="ss-chip is-active" style={{ fontSize: 10, gap: 5 }}>
      {name}
      {onRemove && (
        <button
          onClick={onRemove}
          style={{ border: 'none', background: 'none', color: 'inherit', cursor: 'pointer', padding: 0, fontSize: 11, lineHeight: 1 }}
        >
          ×
        </button>
      )}
    </span>
  )
}

export function CharacterTagInput({ characters = [], allCharacters = [], onChange }) {
  const [input, setInput] = useState('')

  const filtered = useMemo(() => {
    const q = input.trim().toLowerCase()
    if (!q) return []
    return allCharacters
      .filter(name => name.toLowerCase().includes(q) && !characters.includes(name))
      .slice(0, 8)
  }, [allCharacters, characters, input])

  const addTag = (raw) => {
    const value = raw.trim()
    if (!value) return
    const exists = characters.some(c => c.toLowerCase() === value.toLowerCase())
    if (exists) return
    onChange([...(characters || []), value])
    setInput('')
  }

  return (
    <div style={{ position: 'relative' }} onClick={e => e.stopPropagation()}>
      <div className="ss-module" style={{ display: 'flex', flexWrap: 'wrap', gap: 6, borderRadius: 6, padding: 6, background: 'rgba(255,255,255,0.72)' }}>
        {(characters || []).map(name => (
          <CharacterChip
            key={name}
            name={name}
            onRemove={() => onChange((characters || []).filter(c => c !== name))}
          />
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
          className="ss-input"
          style={{ border: 'none', outline: 'none', background: 'transparent', color: '#334155', fontSize: 11, minWidth: 80, minHeight: 'auto', padding: 0, width: 'auto' }}
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

function CharacterChipList({ characters = [] }) {
  if (characters.length === 0) {
    return <span style={{ color: '#718096', fontSize: 11 }}>—</span>
  }

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {characters.map(name => <CharacterChip key={name} name={name} />)}
    </div>
  )
}

export default function ScenePropertiesPanel({
  values,
  estimatedPages,
  editable = false,
  onChange,
  allCharacters = [],
}) {
  const readOnlyValue = (value) => (value && String(value).trim() ? value : '—')

  const rows = [
    { label: 'Scene Number', key: 'sceneNumber' },
    { label: 'Title / Slugline', key: 'titleSlugline' },
    { label: 'Location', key: 'location' },
    { label: 'INT / EXT', key: 'intExt' },
    { label: 'DAY / NIGHT', key: 'dayNight' },
  ]

  return (
    <div className="ss-module" style={{ borderRadius: 6, background: 'rgba(255,255,255,0.55)', padding: 10 }} onClick={e => e.stopPropagation()}>
      <div style={{ display: 'grid', gridTemplateColumns: '140px minmax(0, 1fr)', gap: '7px 12px', alignItems: 'center' }}>
        {rows.map(({ label, key }) => (
          <React.Fragment key={key}>
            <div style={{ fontSize: 10, color: '#55657a', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</div>
            {editable ? (
              <input
                value={values[key] || ''}
                onChange={(e) => onChange?.({ [key]: e.target.value })}
                className="ss-input"
                style={{ borderRadius: 4, background: '#fff', padding: '5px 7px', fontSize: 12, color: '#1f2937' }}
              />
            ) : (
              <div style={{ fontSize: 12, color: '#1f2937' }}>{readOnlyValue(values[key])}</div>
            )}
          </React.Fragment>
        ))}

        <div style={{ fontSize: 10, color: '#55657a', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Color</div>
        <SceneColorPicker
          value={values.color || null}
          onChange={(color) => onChange?.({ color })}
          size={16}
        />

        {estimatedPages !== undefined && (
          <>
            <div style={{ fontSize: 10, color: '#55657a', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Estimated Pages</div>
            <div style={{ fontSize: 12, color: '#1f2937' }}>{estimatedPages || '—'}</div>
          </>
        )}

        <div style={{ fontSize: 10, color: '#55657a', textTransform: 'uppercase', letterSpacing: '0.04em', alignSelf: 'start', paddingTop: 3 }}>Characters</div>
        {editable ? (
          <CharacterTagInput
            characters={values.characters || []}
            allCharacters={allCharacters}
            onChange={(characters) => onChange?.({ characters })}
          />
        ) : (
          <CharacterChipList characters={values.characters || []} />
        )}
      </div>
    </div>
  )
}
