import React from 'react'
import LeftSidebarResources from './LeftSidebarResources'

export default function SidebarPane({
  width = null,
  title,
  controls = null,
  footer = null,
  children,
  className = '',
  bodyClassName = '',
  showResources = true,
}) {
  const sidebarStyle = width == null
    ? undefined
    : { width, minWidth: width }

  return (
    <aside
      className={`ss-left-sidebar ${className}`.trim()}
      style={sidebarStyle}
    >
      <div className="ss-left-sidebar-scroll">
        {title && (
          <div className="ss-left-sidebar-section-label">
            {title}
          </div>
        )}
        {controls && (
          <div className="ss-left-sidebar-controls">
            {controls}
          </div>
        )}

        <div className={bodyClassName}>
          {children}
        </div>
      </div>

      {footer || (showResources ? <LeftSidebarResources /> : null)}
    </aside>
  )
}
