import React from 'react'

import { cn } from '@/lib/utils'

function SidebarPanel({ open, ariaLabel, onPointerDown, onClick, className, children }) {
  return (
    <aside
      role="dialog"
      aria-label={ariaLabel}
      aria-hidden={!open}
      className={cn('configure-sidebar', open ? 'is-open' : '', className)}
      onPointerDown={onPointerDown}
      onClick={onClick}
    >
      {children}
    </aside>
  )
}

export { SidebarPanel }
