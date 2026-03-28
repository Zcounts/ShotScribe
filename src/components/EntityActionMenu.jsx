import React, { useEffect } from 'react'

export default function EntityActionMenu({
  menu,
  onRequestClose,
  onOpenProperties,
  onDelete,
}) {
  useEffect(() => {
    if (!menu) return undefined
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onRequestClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [menu, onRequestClose])

  if (!menu) return null

  const deleteLabel = menu.entityType === 'scene' ? 'Delete Scene' : 'Delete Shot'

  return (
    <>
      <div className="entity-action-backdrop" onClick={onRequestClose} />
      <div
        className="entity-action-menu app-panel-shadow"
        style={{ left: menu.x, top: menu.y }}
        onClick={(event) => event.stopPropagation()}
      >
        <button className="entity-action-item" onClick={onOpenProperties}>
          Open Properties
        </button>
        <button className="entity-action-item danger" onClick={onDelete}>
          {deleteLabel}
        </button>
      </div>
    </>
  )
}
