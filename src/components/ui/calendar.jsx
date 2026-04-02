import * as React from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { DayPicker } from 'react-day-picker'

import { cn } from '@/lib/utils'

function Calendar({ className, classNames, showOutsideDays = true, ...props }) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn('p-2', className)}
      classNames={{
        months: 'flex flex-col space-y-2',
        month: 'space-y-2',
        caption: 'flex justify-center pt-1 relative items-center',
        caption_label: 'text-xs font-semibold',
        nav: 'space-x-1 flex items-center',
        nav_button: 'h-7 w-7 bg-transparent p-0 opacity-70 hover:opacity-100',
        nav_button_previous: 'absolute left-1',
        nav_button_next: 'absolute right-1',
        table: 'w-full border-collapse space-y-1',
        head_row: 'flex',
        head_cell: 'text-[10px] text-[var(--ss-slate)] rounded-md w-8 font-medium',
        row: 'flex w-full mt-1',
        cell: 'h-8 w-8 text-center text-xs p-0 relative',
        day: 'h-8 w-8 p-0 font-normal rounded-md hover:bg-[var(--ss-surface-slate)]',
        day_selected: 'bg-[var(--ss-royal-blue)] text-white hover:bg-[var(--ss-royal-blue)]',
        day_today: 'border border-[var(--ss-border-subtle)]',
        day_outside: 'text-[var(--ss-slate)] opacity-50',
        day_disabled: 'text-[var(--ss-slate)] opacity-40',
        day_range_middle: 'aria-selected:bg-[var(--ss-surface-blue)] aria-selected:text-[var(--ss-ink)]',
        day_hidden: 'invisible',
        ...classNames,
      }}
      components={{
        IconLeft: () => <ChevronLeft className="h-4 w-4" />,
        IconRight: () => <ChevronRight className="h-4 w-4" />,
      }}
      {...props}
    />
  )
}
Calendar.displayName = 'Calendar'

export { Calendar }
