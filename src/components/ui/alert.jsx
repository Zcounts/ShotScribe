import * as React from 'react'
import { cva } from 'class-variance-authority'

import { cn } from '@/lib/utils'

const alertVariants = cva(
  'relative w-full rounded-md border px-3 py-2 text-sm',
  {
    variants: {
      variant: {
        default: 'border-[var(--ss-border-subtle)] bg-[var(--ss-paper-elevated)] text-[var(--ss-ink)]',
        warning: 'border-[#F59E0B66] bg-[#FEF3C7] text-[#78350F]',
        destructive: 'border-[#EF444466] bg-[#FEE2E2] text-[#7F1D1D]',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
)

const Alert = React.forwardRef(({ className, variant, ...props }, ref) => (
  <div ref={ref} role="alert" className={cn(alertVariants({ variant }), className)} {...props} />
))
Alert.displayName = 'Alert'

const AlertTitle = React.forwardRef(({ className, ...props }, ref) => (
  <h5 ref={ref} className={cn('mb-1 font-semibold leading-none tracking-tight', className)} {...props} />
))
AlertTitle.displayName = 'AlertTitle'

const AlertDescription = React.forwardRef(({ className, ...props }, ref) => (
  <div ref={ref} className={cn('text-xs leading-relaxed', className)} {...props} />
))
AlertDescription.displayName = 'AlertDescription'

export { Alert, AlertTitle, AlertDescription }
