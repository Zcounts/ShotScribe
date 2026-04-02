import * as React from 'react'
import { CalendarIcon } from 'lucide-react'

import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'

export function DatePicker({ value, onChange, placeholder = 'Pick a date', className }) {
  const selectedDate = React.useMemo(() => {
    if (!value) return undefined
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? undefined : date
  }, [value])

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" className={cn('h-8 justify-start text-left text-xs font-normal', !selectedDate && 'text-[var(--ss-slate)]', className)}>
          <CalendarIcon className="mr-2 h-3.5 w-3.5" />
          {selectedDate ? selectedDate.toLocaleDateString() : placeholder}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={selectedDate}
          onSelect={(date) => {
            if (!date) {
              onChange?.('')
              return
            }
            const iso = new Date(date.getFullYear(), date.getMonth(), date.getDate()).toISOString().slice(0, 10)
            onChange?.(iso)
          }}
          initialFocus
        />
      </PopoverContent>
    </Popover>
  )
}
