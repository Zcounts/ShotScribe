import React, { useEffect, useRef } from 'react'
import useStore from '../store'

export default function ContextMenu() {
  const contextMenu = useStore(s => s.contextMenu)
  const hideContextMenu = useStore(s => s.hideContextMenu)
  const deleteShot = useStore(s => s.deleteShot)
  const deleteScene = useStore(s => s.deleteScene)
  const duplicateShot = useStore(s => s.duplicateShot)
  const scenes = useStore(s => s.scenes)
  const openSceneDialog = useStore(s => s.openSceneDialog)
  const openShotDialog = useStore(s => s.openShotDialog)
  const openPersonDialog = useStore(s => s.openPersonDialog)
  const removeCastRosterEntry = useStore(s => s.removeCastRosterEntry)
  const removeCrewRosterEntry = useStore(s => s.removeCrewRosterEntry)
  const ref = useRef(null)

  useEffect(() => {
    if (!contextMenu) return
    function handleClick() { hideContextMenu() }
    function handleKey(e) { if (e.key === 'Escape') hideContextMenu() }
    document.addEventListener('click', handleClick)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('click', handleClick)
      document.removeEventListener('keydown', handleKey)
    }
  }, [contextMenu, hideContextMenu])

  if (!contextMenu) return null

  const { x, y } = contextMenu

  // Adjust position to stay in viewport
  const menuWidth = 180
  const menuHeight = contextMenu.type === 'person'
    ? 88
    : contextMenu.type === 'shot'
      ? 130
      : 100
  const left = Math.min(x, window.innerWidth - menuWidth - 8)
  const top = Math.min(y, window.innerHeight - menuHeight - 8)

  const entityType = contextMenu.type
  const entityId = entityType === 'person' ? null : contextMenu.entityId
  const sceneForDelete = entityType === 'scene' ? scenes.find(scene => scene.id === entityId) : null
  const sceneShotCount = sceneForDelete?.shots?.length || 0

  const handleOpenProperties = () => {
    if (entityType === 'scene') openSceneDialog(entityId)
    if (entityType === 'shot') openShotDialog(entityId)
    hideContextMenu()
  }

  const handleDeleteScene = () => {
    if (sceneShotCount > 0) {
      const confirmed = window.confirm(`Delete scene and ${sceneShotCount} shot${sceneShotCount === 1 ? '' : 's'}?`)
      if (!confirmed) return
    }
    deleteScene(entityId)
    hideContextMenu()
  }

  const handleDeleteShot = () => {
    const confirmed = window.confirm('Delete this shot?')
    if (!confirmed) return
    deleteShot(entityId)
    hideContextMenu()
  }

  if (contextMenu.type === 'person') {
    const { personType, personId } = contextMenu
    const label = personType === 'cast' ? 'cast' : 'crew'
    return (
      <div
        ref={ref}
        className="context-menu"
        style={{ left, top }}
        onClick={e => e.stopPropagation()}
      >
        <div
          className="context-menu-item"
          onClick={() => { openPersonDialog(personType, personId); hideContextMenu() }}
        >
          Edit Cast/Crew Member
        </div>
        <div className="border-t border-gray-200 my-1" />
        <div
          className="context-menu-item danger"
          onClick={() => {
            const ok = window.confirm(`Delete this ${label} member? This will also remove linked callsheet entries.`)
            if (!ok) return
            if (personType === 'cast') removeCastRosterEntry(personId)
            else removeCrewRosterEntry(personId)
            hideContextMenu()
          }}
        >
          Delete Cast/Crew Member
        </div>
      </div>
    )
  }

  return (
    <div
      ref={ref}
      className="context-menu"
      style={{ left, top }}
      onClick={e => e.stopPropagation()}
    >
      <div className="context-menu-item" onClick={handleOpenProperties}>
        Open Properties
      </div>
      {entityType === 'shot' && (
        <>
          <div
            className="context-menu-item"
            onClick={() => { duplicateShot(entityId); hideContextMenu() }}
          >
            <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="7" y="7" width="10" height="10" rx="1" />
              <path d="M3 13V3h10" />
            </svg>
            Duplicate Shot
          </div>
          <div className="border-t border-gray-200 my-1" />
          <div className="context-menu-item danger" onClick={handleDeleteShot}>
            <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="4,6 6,6 17,6" />
              <path d="M15 6v11a1 1 0 01-1 1H6a1 1 0 01-1-1V6M8 6V4a1 1 0 011-1h2a1 1 0 011 1v2" />
            </svg>
            Delete Shot
          </div>
        </>
      )}
      {entityType === 'scene' && (
        <>
          <div className="border-t border-gray-200 my-1" />
          <div className="context-menu-item danger" onClick={handleDeleteScene}>
            Delete Scene
          </div>
        </>
      )}
    </div>
  )
}
