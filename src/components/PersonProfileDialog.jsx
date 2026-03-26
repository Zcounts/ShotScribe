import React, { useMemo, useState, useEffect } from 'react'
import useStore from '../store'

function createEmptyPerson(type) {
  return type === 'cast'
    ? { name: '', email: '', phone: '', role: 'Cast', department: 'Cast', character: '', characterIds: [], notes: '' }
    : { name: '', email: '', phone: '', role: '', department: 'Production', notes: '' }
}

export default function PersonProfileDialog({ personType, person, onClose }) {
  const upsertCast = useStore(s => s.upsertCastRosterEntry)
  const upsertCrew = useStore(s => s.upsertCrewRosterEntry)
  const characterCatalog = useStore(s => s.getScriptCharacterCatalog)
  const availableCharacters = useMemo(() => characterCatalog().map(c => c.name), [characterCatalog])
  const isCreateMode = !person?.id
  const [draft, setDraft] = useState(() => ({ ...createEmptyPerson(personType), ...(person || {}) }))

  useEffect(() => {
    setDraft({ ...createEmptyPerson(personType), ...(person || {}) })
  }, [person, personType])

  const save = () => {
    if (personType === 'cast') upsertCast(draft)
    else upsertCrew(draft)
    onClose()
  }

  return (
    <div className="modal-overlay" style={{ zIndex: 760 }} onClick={onClose}>
      <div className="modal app-dialog" style={{ width: 'min(840px, 92vw)', maxWidth: 840, maxHeight: '84vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
        <h3 className="dialog-title">{isCreateMode ? `Add ${personType === 'cast' ? 'Cast' : 'Crew'} Profile` : `Edit ${personType === 'cast' ? 'Cast' : 'Crew'} Profile`}</h3>
        <div className="dialog-form-grid" style={{ gridTemplateColumns: '170px 1fr', columnGap: 16 }}>
          <label className="dialog-label">Name</label>
          <input value={draft.name || ''} onChange={e => setDraft(prev => ({ ...prev, name: e.target.value }))} />

          <label className="dialog-label">Email</label>
          <input value={draft.email || ''} onChange={e => setDraft(prev => ({ ...prev, email: e.target.value }))} />

          <label className="dialog-label">Phone</label>
          <input value={draft.phone || ''} onChange={e => setDraft(prev => ({ ...prev, phone: e.target.value }))} />

          <label className="dialog-label">Role</label>
          <input value={draft.role || ''} onChange={e => setDraft(prev => ({ ...prev, role: e.target.value }))} />

          <label className="dialog-label">Department</label>
          <input value={draft.department || ''} onChange={e => setDraft(prev => ({ ...prev, department: e.target.value }))} />

          {personType === 'cast' && (
            <>
              <label className="dialog-label">Primary Character</label>
              <input value={draft.character || ''} onChange={e => setDraft(prev => ({ ...prev, character: e.target.value }))} placeholder="Character played" />

              <label className="dialog-label">Linked Characters</label>
              <div>
                <input
                  value={(draft.characterIds || []).join(', ')}
                  onChange={e => setDraft(prev => ({ ...prev, characterIds: e.target.value.split(',').map(v => v.trim()).filter(Boolean) }))}
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
            value={draft.notes || ''}
            onChange={e => setDraft(prev => ({ ...prev, notes: e.target.value }))}
            style={{ resize: 'vertical' }}
          />
        </div>

        <div className="dialog-actions" style={{ marginTop: 18 }}>
          <button className="dialog-button-secondary" onClick={onClose}>Cancel</button>
          <button className="dialog-button-primary" onClick={save}>Save</button>
        </div>
      </div>
    </div>
  )
}
