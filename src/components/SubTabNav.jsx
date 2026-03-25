import React from 'react'

export function SubTabNav({ tabs, active, onChange }) {
  return (
    <div className="flex rounded-lg border border-slate/20 overflow-hidden bg-canvas-dark w-fit">
      {tabs.map((tab, i) => (
        <button
          key={tab}
          onClick={() => onChange(tab)}
          className={`flex-1 min-w-[90px] text-center px-4 py-1.5 text-sm font-semibold transition-colors duration-150 ${
            i < tabs.length - 1 ? 'border-r border-slate/15' : ''
          } ${
            active === tab
              ? 'bg-canvas text-ink border-b-2 border-[#E84040]'
              : 'text-slate hover:text-ink hover:bg-canvas/60'
          }`}
        >
          {tab}
        </button>
      ))}
    </div>
  )
}
