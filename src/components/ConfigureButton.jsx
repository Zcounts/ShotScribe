import React from 'react'

export default function ConfigureButton({
  onClick,
  active = false,
  label = 'Configure',
  title = 'Configure',
}) {
  return (
    <button
      className="toolbar-btn"
      onClick={onClick}
      title={title}
      style={active ? { background: '#2C2C2E' } : undefined}
    >
      {label}
    </button>
  )
}
