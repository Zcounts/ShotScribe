import React, { useMemo, useState, useEffect, useRef } from 'react'
import useStore from '../store'

const DEFAULT_CREW_ROLES = [
  'Director',
  '1st Assistant Director',
  '2nd Assistant Director',
  'Director of Photography',
  'Producer',
  'Production Designer',
  'Camera Operator',
  'Gaffer',
  'Key Grip',
  'Sound Mixer',
  'Boom Operator',
  'Editor',
  'VFX Supervisor',
  'Script Supervisor',
  'Hair / Makeup',
  'Wardrobe',
  'PA',
]

function createEmptyPerson(type) {
  return type === 'cast'
    ? { name: '', email: '', phone: '', role: 'Cast', department: 'Cast', character: '', characterIds: [], notes: '' }
    : { name: '', email: '', phone: '', role: '', roles: [], department: 'Production', notes: '' }
}

function getCrewRolesFromPerson(person = {}) {
  const roleValues = Array.isArray(person.roles) && person.roles.length > 0
    ? person.roles
    : String(person.role || '').split(',').map(value => value.trim()).filter(Boolean)
  return Array.from(new Set(roleValues.map(value => String(value || '').trim()).filter(Boolean)))
}

export default function PersonProfileDialog({ personType, person, onClose }) {
  const upsertCast = useStore(s => s.upsertCastRosterEntry)
  const upsertCrew = useStore(s => s.upsertCrewRosterEntry)
  const castRoster = useStore(s => s.castRoster)
  const crewRoster = useStore(s => s.crewRoster)
  const characterCatalog = useStore(s => s.getScriptCharacterCatalog)
  const scriptCharacters = useMemo(() => characterCatalog(), [characterCatalog])
  const isCreateMode = !person?.id
  const [draft, setDraft] = useState(() => ({ ...createEmptyPerson(personType), ...(person || {}) }))
  const [characterQuery, setCharacterQuery] = useState('')
  const [isPickerOpen, setIsPickerOpen] = useState(false)
  const [highlightedOption, setHighlightedOption] = useState(0)
  const [customRoleInput, setCustomRoleInput] = useState('')
  const pickerRef = useRef(null)

  useEffect(() => {
    setDraft({ ...createEmptyPerson(personType), ...(person || {}) })
  }, [person, personType])

  useEffect(() => {
    if (personType !== 'cast') return
    const linked = Array.isArray(draft.characterIds) ? draft.characterIds.filter(Boolean) : []
    if (linked.length === 1 && draft.character !== linked[0]) {
      setDraft(prev => ({ ...prev, character: linked[0] }))
      return
    }
    if (linked.length > 1 && !linked.includes(draft.character)) {
      setDraft(prev => ({ ...prev, character: linked[0] }))
      return
    }
    if (linked.length === 0 && draft.character) {
      setDraft(prev => ({ ...prev, character: '' }))
    }
  }, [draft.character, draft.characterIds, personType])

  useEffect(() => {
    const onWindowClick = (event) => {
      if (!pickerRef.current?.contains(event.target)) {
        setIsPickerOpen(false)
      }
    }
    window.addEventListener('mousedown', onWindowClick)
    return () => window.removeEventListener('mousedown', onWindowClick)
  }, [])

  const catalogById = useMemo(() => {
    const byId = new Map()
    scriptCharacters.forEach(entry => {
      const id = String(entry?.id || '').trim()
      if (!id) return
      byId.set(id, { ...entry, id, name: String(entry?.name || id).trim() || id })
    })
    return byId
  }, [scriptCharacters])

  const linkedCharacterIds = useMemo(() => {
    return Array.from(new Set((draft.characterIds || []).map(id => String(id || '').trim()).filter(Boolean)))
  }, [draft.characterIds])

  const assignmentByCharacterId = useMemo(() => {
    const map = new Map()
    castRoster.forEach(entry => {
      const castName = String(entry?.name || '').trim() || 'Unnamed cast member'
      const ids = Array.from(new Set([...(entry?.characterIds || []), entry?.character].map(id => String(id || '').trim()).filter(Boolean)))
      ids.forEach(id => {
        if (!map.has(id)) map.set(id, [])
        map.get(id).push({ id: entry.id, name: castName })
      })
    })
    return map
  }, [castRoster])

  const characterOptions = useMemo(() => {
    const query = characterQuery.trim().toLowerCase()
    const options = scriptCharacters
      .map(entry => {
        const id = String(entry?.id || '').trim()
        if (!id) return null
        const name = String(entry?.name || id).trim() || id
        const assignments = (assignmentByCharacterId.get(id) || []).filter(item => item.id !== draft.id)
        const isAssignedElsewhere = assignments.length > 0
        const isSelected = linkedCharacterIds.includes(id)
        return {
          id,
          name,
          sceneCount: Array.isArray(entry?.sceneIds) ? entry.sceneIds.length : 0,
          isAssignedElsewhere,
          assignments,
          isSelected,
        }
      })
      .filter(Boolean)
      .filter(option => {
        if (!query) return true
        return option.name.toLowerCase().includes(query)
      })
      .sort((a, b) => {
        if (a.isSelected !== b.isSelected) return a.isSelected ? -1 : 1
        if (a.isAssignedElsewhere !== b.isAssignedElsewhere) return a.isAssignedElsewhere ? 1 : -1
        return a.name.localeCompare(b.name)
      })
    return options
  }, [assignmentByCharacterId, characterQuery, draft.id, linkedCharacterIds, scriptCharacters])

  useEffect(() => {
    if (highlightedOption >= characterOptions.length) {
      setHighlightedOption(characterOptions.length > 0 ? characterOptions.length - 1 : 0)
    }
  }, [characterOptions.length, highlightedOption])

  const selectedCharacterDisplay = useMemo(() => {
    return linkedCharacterIds.map(id => ({ id, name: catalogById.get(id)?.name || id }))
  }, [catalogById, linkedCharacterIds])

  const unassignedCount = useMemo(
    () => scriptCharacters.filter(entry => !(assignmentByCharacterId.get(String(entry?.id || '').trim()) || []).some(item => item.id !== draft.id)).length,
    [assignmentByCharacterId, draft.id, scriptCharacters]
  )

  const addLinkedCharacter = (characterId) => {
    const id = String(characterId || '').trim()
    if (!id) return
    const assignedElsewhere = (assignmentByCharacterId.get(id) || []).some(item => item.id !== draft.id)
    if (assignedElsewhere) return
    setDraft(prev => {
      const existingIds = Array.from(new Set((prev.characterIds || []).map(value => String(value || '').trim()).filter(Boolean)))
      if (existingIds.includes(id)) return prev
      return { ...prev, characterIds: [...existingIds, id] }
    })
    setCharacterQuery('')
    setIsPickerOpen(true)
  }

  const removeLinkedCharacter = (characterId) => {
    const id = String(characterId || '').trim()
    if (!id) return
    setDraft(prev => ({
      ...prev,
      characterIds: (prev.characterIds || []).filter(value => String(value || '').trim() !== id),
    }))
  }

  const save = () => {
    if (personType === 'cast') upsertCast(draft)
    else {
      const selectedRoles = Array.from(new Set((draft.roles || []).map(value => String(value || '').trim()).filter(Boolean)))
      upsertCrew({ ...draft, roles: selectedRoles, role: selectedRoles.join(', ') })
    }
    onClose()
  }

  const selectedCrewRoles = useMemo(() => {
    if (personType !== 'crew') return []
    return getCrewRolesFromPerson(draft)
  }, [draft.role, draft.roles, personType])

  const crewRoleOptions = useMemo(() => {
    if (personType !== 'crew') return []
    const options = new Map()
    DEFAULT_CREW_ROLES.forEach(role => options.set(role.toLowerCase(), role))
    crewRoster.forEach(member => {
      const values = Array.isArray(member.roles) && member.roles.length > 0
        ? member.roles
        : String(member.role || '').split(',').map(value => value.trim()).filter(Boolean)
      values.forEach(role => {
        const normalized = String(role || '').trim()
        if (!normalized) return
        options.set(normalized.toLowerCase(), normalized)
      })
    })
    selectedCrewRoles.forEach(role => options.set(role.toLowerCase(), role))
    return Array.from(options.values()).sort((a, b) => a.localeCompare(b))
  }, [crewRoster, personType, selectedCrewRoles])

  const addCrewRole = (value) => {
    const nextRole = String(value || '').trim()
    if (!nextRole) return
    setDraft(prev => {
      const existing = getCrewRolesFromPerson(prev)
      if (existing.some(role => role.toLowerCase() === nextRole.toLowerCase())) return prev
      const roles = [...existing, nextRole]
      return { ...prev, roles, role: roles.join(', ') }
    })
    setCustomRoleInput('')
  }

  const removeCrewRole = (value) => {
    const roleToRemove = String(value || '').trim().toLowerCase()
    if (!roleToRemove) return
    setDraft(prev => {
      const roles = getCrewRolesFromPerson(prev).filter(role => role.toLowerCase() !== roleToRemove)
      return { ...prev, roles, role: roles.join(', ') }
    })
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
          {personType === 'crew' ? (
            <div style={{ display: 'grid', gap: 8 }}>
              {selectedCrewRoles.length > 0 && (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {selectedCrewRoles.map(role => (
                    <span key={role} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, border: '1px solid #BFDBFE', background: '#EFF6FF', color: '#1E3A8A', borderRadius: 999, padding: '2px 8px', fontSize: 11, fontWeight: 600 }}>
                      {role}
                      <button type="button" onClick={() => removeCrewRole(role)} style={{ border: 'none', background: 'transparent', color: 'inherit', cursor: 'pointer', padding: 0, lineHeight: 1 }}>×</button>
                    </span>
                  ))}
                </div>
              )}
              <select value="" onChange={e => addCrewRole(e.target.value)}>
                <option value="">Select assigned role…</option>
                {crewRoleOptions.filter(role => !selectedCrewRoles.some(selected => selected.toLowerCase() === role.toLowerCase())).map(role => (
                  <option key={role} value={role}>{role}</option>
                ))}
              </select>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  value={customRoleInput}
                  onChange={e => setCustomRoleInput(e.target.value)}
                  placeholder="Add custom role"
                />
                <button type="button" className="dialog-button-secondary" onClick={() => addCrewRole(customRoleInput)}>Add Role</button>
              </div>
            </div>
          ) : (
            <input value={draft.role || ''} onChange={e => setDraft(prev => ({ ...prev, role: e.target.value }))} />
          )}

          <label className="dialog-label">Department</label>
          <input value={draft.department || ''} onChange={e => setDraft(prev => ({ ...prev, department: e.target.value }))} />

          {personType === 'cast' && (
            <>
              <label className="dialog-label">Primary Character</label>
              {linkedCharacterIds.length <= 1 ? (
                <input
                  value={selectedCharacterDisplay[0]?.name || ''}
                  disabled
                  placeholder={linkedCharacterIds.length === 0 ? 'Select linked characters first' : ''}
                />
              ) : (
                <select
                  value={draft.character || linkedCharacterIds[0] || ''}
                  onChange={e => setDraft(prev => ({ ...prev, character: e.target.value }))}
                >
                  {selectedCharacterDisplay.map(character => (
                    <option key={character.id} value={character.id}>{character.name}</option>
                  ))}
                </select>
              )}

              <label className="dialog-label">Linked Characters</label>
              <div ref={pickerRef}>
                <div
                  style={{ border: '1px solid rgba(55,65,81,0.28)', borderRadius: 7, padding: 8, background: '#fff' }}
                  onClick={() => setIsPickerOpen(true)}
                >
                  {selectedCharacterDisplay.length > 0 && (
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
                      {selectedCharacterDisplay.map(character => (
                        <span
                          key={character.id}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 6,
                            border: '1px solid rgba(30,64,175,0.28)',
                            background: 'rgba(219,234,254,0.8)',
                            color: '#1e3a8a',
                            borderRadius: 999,
                            padding: '2px 8px',
                            fontSize: 11,
                            fontWeight: 600,
                          }}
                        >
                          {character.name}
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation()
                              removeLinkedCharacter(character.id)
                            }}
                            style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'inherit', padding: 0, fontSize: 12, lineHeight: 1 }}
                            aria-label={`Remove ${character.name}`}
                          >
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                  <input
                    value={characterQuery}
                    onFocus={() => setIsPickerOpen(true)}
                    onChange={e => {
                      setCharacterQuery(e.target.value)
                      setIsPickerOpen(true)
                      setHighlightedOption(0)
                    }}
                    onKeyDown={e => {
                      if (!isPickerOpen && (e.key === 'ArrowDown' || e.key === 'Enter')) {
                        setIsPickerOpen(true)
                        return
                      }
                      if (!characterOptions.length) return
                      if (e.key === 'ArrowDown') {
                        e.preventDefault()
                        setHighlightedOption(prev => Math.min(prev + 1, characterOptions.length - 1))
                      } else if (e.key === 'ArrowUp') {
                        e.preventDefault()
                        setHighlightedOption(prev => Math.max(prev - 1, 0))
                      } else if (e.key === 'Enter') {
                        e.preventDefault()
                        const option = characterOptions[highlightedOption]
                        if (option && !option.isAssignedElsewhere) addLinkedCharacter(option.id)
                      } else if (e.key === 'Escape') {
                        setIsPickerOpen(false)
                      }
                    }}
                    placeholder={scriptCharacters.length > 0 ? 'Search screenplay characters…' : 'No screenplay characters detected yet'}
                    disabled={scriptCharacters.length === 0}
                  />
                </div>
                {isPickerOpen && characterOptions.length > 0 && (
                  <div style={{ marginTop: 4, maxHeight: 190, overflowY: 'auto', border: '1px solid rgba(55,65,81,0.22)', borderRadius: 7, background: '#fff' }}>
                    {characterOptions.map((option, index) => (
                      <button
                        key={option.id}
                        type="button"
                        onMouseDown={event => event.preventDefault()}
                        onClick={() => addLinkedCharacter(option.id)}
                        disabled={option.isAssignedElsewhere}
                        style={{
                          width: '100%',
                          border: 'none',
                          borderBottom: index === characterOptions.length - 1 ? 'none' : '1px solid rgba(226,232,240,0.9)',
                          textAlign: 'left',
                          background: highlightedOption === index ? 'rgba(219,234,254,0.6)' : '#fff',
                          padding: '8px 10px',
                          cursor: option.isAssignedElsewhere ? 'not-allowed' : 'pointer',
                          opacity: option.isAssignedElsewhere ? 0.65 : 1,
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                          <span style={{ fontSize: 12, fontWeight: 600, color: '#1f2937' }}>{option.name}</span>
                          <span style={{ fontSize: 11, color: option.isAssignedElsewhere ? '#b45309' : '#047857' }}>
                            {option.isAssignedElsewhere ? `Assigned to ${option.assignments.map(item => item.name).join(', ')}` : 'Unassigned'}
                          </span>
                        </div>
                        <div style={{ marginTop: 2, fontSize: 10, color: '#64748b' }}>Appears in {option.sceneCount} scene{option.sceneCount === 1 ? '' : 's'}</div>
                      </button>
                    ))}
                  </div>
                )}
                {scriptCharacters.length > 0 && (
                  <div style={{ marginTop: 6, fontSize: 11, color: '#718096' }}>
                    {unassignedCount} unassigned of {scriptCharacters.length} screenplay characters.
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
