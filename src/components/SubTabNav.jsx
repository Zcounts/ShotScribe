import React from 'react'

export function SubTabNav({ tabs, active, onChange, fullWidth = false, minButtonWidth = 130 }) {
  return (
    <div className={`inline-flex rounded-xl border border-slate/25 bg-canvas-dark/70 p-1 gap-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] ${fullWidth ? 'w-full' : 'w-fit'}`}>
      {tabs.map((tab) => (
        <button
          key={tab}
          onClick={() => onChange(tab)}
          className={`flex-1 whitespace-nowrap text-center px-4 py-2 text-sm font-semibold rounded-lg border transition-all duration-150 ${
            active === tab
              ? 'bg-canvas text-ink border-[#E84040]/60 shadow-sm'
              : 'text-slate border-transparent hover:text-ink hover:bg-canvas/60'
          }`}
          style={{ minWidth: minButtonWidth }}
        >
          {tab}
        </button>
      ))}
    </div>
  )
}
