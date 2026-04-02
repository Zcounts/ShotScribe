import React from 'react'
import { SidebarPanel } from './ui/sidebar-panel'

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
    <SidebarPanel
      ariaLabel={ariaLabel}
      open={open}
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
    </SidebarPanel>
  )
}
