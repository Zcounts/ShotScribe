import * as React from 'react'
import * as SliderPrimitive from '@radix-ui/react-slider'

import { cn } from '@/lib/utils'

const Slider = React.forwardRef(({ className, ...props }, ref) => (
  <SliderPrimitive.Root ref={ref} className={cn('relative flex w-full touch-none select-none items-center', className)} {...props}>
    <SliderPrimitive.Track className="relative h-1.5 w-full grow overflow-hidden rounded-full bg-[var(--ss-surface-slate)]">
      <SliderPrimitive.Range className="absolute h-full bg-[var(--ss-royal-blue)]" />
    </SliderPrimitive.Track>
    <SliderPrimitive.Thumb className="block h-4 w-4 rounded-full border border-[var(--ss-border-subtle)] bg-[var(--ss-paper-elevated)] shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ss-input-focus-ring)]" />
  </SliderPrimitive.Root>
))
Slider.displayName = SliderPrimitive.Root.displayName

export { Slider }
