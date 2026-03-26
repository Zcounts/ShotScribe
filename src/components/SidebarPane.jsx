import React from 'react'

export default function SidebarPane({
  width = 260,
  title,
  controls = null,
  footer = null,
  children,
}) {
  return (
    <aside
      style={{
        width,
        background: '#FAF8F4',
        borderRight: '1px solid rgba(74,85,104,0.15)',
        display: 'flex',
        flexDirection: 'column',
        minWidth: width,
      }}
    >
      <div
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 2,
          background: '#FAF8F4',
          borderBottom: '1px solid rgba(74,85,104,0.12)',
        }}
      >
        {title && (
          <div style={{ padding: '10px 12px', fontSize: 10, textTransform: 'uppercase', color: '#64748b', fontWeight: 700, letterSpacing: '0.06em' }}>
            {title}
          </div>
        )}
        {controls && (
          <div style={{ padding: '8px 10px 10px', borderTop: title ? '1px solid rgba(74,85,104,0.08)' : 'none' }}>
            {controls}
          </div>
        )}
      </div>

      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
        {children}
      </div>

      {footer && (
        <div style={{ padding: 10, borderTop: '1px solid rgba(74,85,104,0.12)', background: '#FAF8F4' }}>
          {footer}
        </div>
      )}
    </aside>
  )
}
