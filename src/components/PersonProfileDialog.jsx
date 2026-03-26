import React, { useMemo } from 'react'
import useStore from '../store'

export default function PersonProfileDialog({ personType, person, onClose }) {
  const upsertCast = useStore(s => s.upsertCastRosterEntry)
  const upsertCrew = useStore(s => s.upsertCrewRosterEntry)
  const characterCatalog = useStore(s => s.getScriptCharacterCatalog)

  const availableCharacters = useMemo(() => characterCatalog().map(c => c.name), [characterCatalog])

  if (!person) return null

  const update = (updates) => {
    if (personType === 'cast') upsertCast({ ...person, ...updates })
    else upsertCrew({ ...person, ...updates })
  }

  return (
    <div className="modal-overlay" style={{ zIndex: 760 }} onClick={onClose}>
      <div className="modal app-dialog" style={{ width: 'min(840px, 92vw)', maxWidth: 840, maxHeight: '84vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
        <h3 className="dialog-title">Edit {personType === 'cast' ? 'Cast Profile' : 'Crew Profile'}</h3>
        <div className="dialog-form-grid" style={{ gridTemplateColumns: '170px 1fr', columnGap: 16 }}>
          <label className="dialog-label">Name</label>
          <input value={person.name || ''} onChange={e => update({ name: e.target.value })} />

          <label className="dialog-label">Email</label>
          <input value={person.email || ''} onChange={e => update({ email: e.target.value })} />

          <label className="dialog-label">Phone</label>
          <input value={person.phone || ''} onChange={e => update({ phone: e.target.value })} />

          <label className="dialog-label">Role</label>
          <input value={person.role || ''} onChange={e => update({ role: e.target.value })} />

          <label className="dialog-label">Department</label>
          <input value={person.department || ''} onChange={e => update({ department: e.target.value })} />

          {personType === 'cast' && (
            <>
              <label className="dialog-label">Primary Character</label>
              <input value={person.character || ''} onChange={e => update({ character: e.target.value })} placeholder="Character played" />

              <label className="dialog-label">Linked Characters</label>
              <div>
                <input
                  value={(person.characterIds || []).join(', ')}
                  onChange={e => update({ characterIds: e.target.value.split(',').map(v => v.trim()).filter(Boolean) })}
                  placeholder="Comma-separated character names"
                />
                {availableCharacters.length > 0 && (
                  <div style={{ marginTop: 6, fontSize: 11, color: '#718096' }}>
                    Script characters: {availableCharacters.slice(0, 12).join(', ')}{availableCharacters.length > 12 ? '…' : ''}
                  </div>
                )}
              </div>
            </>
          )}

          <label className="dialog-label">Notes</label>
          <textarea
            rows={4}
            value={person.notes || ''}
            onChange={e => update({ notes: e.target.value })}
            style={{ resize: 'vertical' }}
          />
        </div>

        <div className="dialog-actions" style={{ marginTop: 18 }}>
          <button className="dialog-button-secondary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  )
}
