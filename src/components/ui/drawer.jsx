import * as React from 'react'
import { Drawer as DrawerPrimitive } from 'vaul'

import { cn } from '@/lib/utils'

const Drawer = ({ shouldScaleBackground = true, ...props }) => (
  <DrawerPrimitive.Root shouldScaleBackground={shouldScaleBackground} {...props} />
)

const DrawerTrigger = DrawerPrimitive.Trigger
const DrawerPortal = DrawerPrimitive.Portal
const DrawerClose = DrawerPrimitive.Close

const DrawerOverlay = React.forwardRef(({ className, ...props }, ref) => (
  <DrawerPrimitive.Overlay ref={ref} className={cn('fixed inset-0 z-[890] bg-black/50', className)} {...props} />
))
DrawerOverlay.displayName = 'DrawerOverlay'

const DrawerContent = React.forwardRef(({ className, children, ...props }, ref) => (
  <DrawerPortal>
    <DrawerOverlay />
    <DrawerPrimitive.Content ref={ref} className={cn('fixed inset-x-0 bottom-0 z-[891] mt-24 rounded-t-[10px] border border-[var(--ss-border-subtle)] bg-[var(--ss-paper)] p-4 text-[var(--ss-ink)]', className)} {...props}>
      <div className="mx-auto mb-3 h-1.5 w-16 rounded-full bg-[var(--ss-border-subtle)]" />
      {children}
    </DrawerPrimitive.Content>
  </DrawerPortal>
))
DrawerContent.displayName = 'DrawerContent'

const DrawerHeader = ({ className, ...props }) => (
  <div className={cn('mb-2 grid gap-1', className)} {...props} />
)

const DrawerTitle = React.forwardRef(({ className, ...props }, ref) => (
  <DrawerPrimitive.Title ref={ref} className={cn('text-sm font-semibold', className)} {...props} />
))
DrawerTitle.displayName = 'DrawerTitle'

const DrawerDescription = React.forwardRef(({ className, ...props }, ref) => (
  <DrawerPrimitive.Description ref={ref} className={cn('text-xs text-[var(--ss-slate)]', className)} {...props} />
))
DrawerDescription.displayName = 'DrawerDescription'

export { Drawer, DrawerPortal, DrawerOverlay, DrawerTrigger, DrawerClose, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription }
