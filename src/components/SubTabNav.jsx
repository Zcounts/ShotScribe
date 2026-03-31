import React from 'react'

export function SubTabNav({ tabs, active, onChange, fullWidth = false, minButtonWidth = 130 }) {
  const normalizedTabs = tabs.map((tab) => {
    if (typeof tab === 'string') return { value: tab, label: tab, icon: null }
    return { value: tab.value, label: tab.label || tab.value, icon: tab.icon || null }
  })

  return (
    <div className={`inline-flex rounded-xl border border-slate/25 bg-canvas-dark/70 p-1 gap-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] ${fullWidth ? 'w-full' : 'w-fit'}`}>
      {normalizedTabs.map((tab) => (
        <button
          key={tab.value}
          type="button"
          onClick={() => onChange(tab.value)}
          className={`ss-btn outline ${tab.icon ? 'icon-toggle' : ''} flex-1 whitespace-nowrap text-center px-4 py-2 text-sm font-semibold rounded-lg border transition-all duration-150 ${active === tab.value ? 'is-active' : ''}`}
          aria-label={tab.label}
          title={tab.label}
          aria-pressed={active === tab.value}
          style={{ minWidth: minButtonWidth }}
        >
          {tab.icon ? <img src={tab.icon} alt="" aria-hidden="true" /> : tab.label}
        </button>
      ))}
    </div>
  )
}
