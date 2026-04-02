import * as React from 'react'

import { cn } from '@/lib/utils'

function SegmentedControl({ value, onValueChange, options = [], className }) {
  return (
    <div className={cn('inline-flex rounded-md border border-[var(--ss-border-subtle)] bg-[var(--ss-paper-elevated)] p-0.5', className)} role="group" aria-label="Segmented control">
      {options.map((option) => {
        const selected = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onValueChange?.(option.value)}
            className={cn('rounded px-2.5 py-1 text-xs font-medium transition-colors', selected ? 'bg-[var(--ss-royal-blue)] text-white' : 'text-[var(--ss-slate)] hover:bg-[var(--ss-surface-slate)]')}
            aria-pressed={selected}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}

export { SegmentedControl }
