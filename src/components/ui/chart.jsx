import * as React from 'react'

import { cn } from '@/lib/utils'

function ChartShell({ className, title, description, children }) {
  return (
    <section className={cn('rounded-md border border-[#2A313D] bg-[#171C24] p-3', className)}>
      {title ? <h3 className="mb-1 text-xs font-semibold uppercase tracking-[0.06em] text-[#9AA6BC]">{title}</h3> : null}
      {description ? <p className="mb-2 text-[11px] text-[#9AA6BC]">{description}</p> : null}
      <div className="h-[180px] w-full">{children}</div>
    </section>
  )
}

export { ChartShell }
