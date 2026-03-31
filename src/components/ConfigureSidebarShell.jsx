import React from 'react'

export default function ConfigureSidebarShell({
  open,
  ariaLabel,
  context,
  title = 'Configure',
  meta,
  onClose,
  children,
}) {
  return (
    <aside
      role="dialog"
      aria-label={ariaLabel}
      aria-hidden={!open}
      className={`configure-sidebar ${open ? 'is-open' : ''}`}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
    >
      <div className="configure-sidebar-header">
        <div className="configure-sidebar-header-top">
          <div>
            <div className="configure-sidebar-context">{context}</div>
            <div className="configure-sidebar-title">{title}</div>
          </div>
          <button
            type="button"
            className="configure-sidebar-close"
            onClick={onClose}
            aria-label="Close Configure sidebar"
            title="Close Configure"
          >
            ×
          </button>
        </div>
        {meta ? <div className="configure-sidebar-meta">{meta}</div> : null}
      </div>
      <div className="configure-sidebar-content">
        {children}
      </div>
    </aside>
  )
}
