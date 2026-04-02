import React, { useEffect, useMemo, useState } from 'react'
import LeftSidebarResources from './LeftSidebarResources'
import useResponsiveViewport from '../hooks/useResponsiveViewport'

export default function SidebarPane({
  width = null,
  title,
  controls = null,
  footer = null,
  children,
  className = '',
  bodyClassName = '',
  showResources = true,
  responsiveLabel = 'Open sidebar',
}) {
  const { isDesktopDown } = useResponsiveViewport()
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => {
    if (!isDesktopDown) {
      setMobileOpen(false)
    }
  }, [isDesktopDown])

  useEffect(() => {
    if (!mobileOpen) return undefined
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        setMobileOpen(false)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [mobileOpen])

  const sidebarStyle = useMemo(() => {
    if (width == null) return undefined
    return { width, minWidth: width }
  }, [width])
  const effectiveResponsiveLabel = responsiveLabel === 'Open sidebar' && title
    ? `Open ${title} panel`
    : responsiveLabel

  const content = (
    <>
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
    </>
  )

  if (!isDesktopDown) {
    return (
      <aside
        className={`ss-left-sidebar ${className}`.trim()}
        style={sidebarStyle}
      >
        {content}
      </aside>
    )
  }

  return (
    <>
      <div className="ss-left-sidebar-toggle-slot">
        <button
          type="button"
          className="ss-left-sidebar-toggle-btn"
          onClick={() => setMobileOpen(true)}
          aria-label={effectiveResponsiveLabel}
          title={effectiveResponsiveLabel}
          aria-expanded={mobileOpen}
        >
          <span aria-hidden="true">☰</span>
        </button>
      </div>

      <div
        className={`ss-left-sidebar-mobile-scrim ${mobileOpen ? 'is-open' : ''}`}
        onClick={() => setMobileOpen(false)}
      />

      <aside
        className={`ss-left-sidebar ss-left-sidebar-mobile ${mobileOpen ? 'is-open' : ''} ${className}`.trim()}
        style={sidebarStyle}
        role="dialog"
        aria-modal="true"
        aria-hidden={!mobileOpen}
      >
        <div className="ss-left-sidebar-mobile-header">
          <button
            type="button"
            className="ss-left-sidebar-mobile-close"
            onClick={() => setMobileOpen(false)}
            aria-label="Close sidebar"
            title="Close"
          >
            ×
          </button>
        </div>
        {content}
      </aside>
    </>
  )
}
