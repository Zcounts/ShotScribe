import React from 'react'

export function DayTabBar({ days, activeDay, onSelect, onAddDay }) {
  return (
    <div className="flex items-center gap-1 px-3 py-1.5 bg-[#2C2C2E] border-b border-[#3A3A3C] overflow-x-auto shrink-0">
      {days.map(day => (
        <button
          key={day.id}
          onClick={() => onSelect(day.id)}
          className={`whitespace-nowrap rounded-md px-3 py-1 text-xs font-semibold font-mono transition-colors duration-150 shrink-0 ${
            activeDay === day.id
              ? 'bg-[#E84040] text-white'
              : 'text-[#A0A0A8] hover:bg-white/5 hover:text-white'
          }`}
        >
          {day.label}
        </button>
      ))}
      {onAddDay && (
        <button
          onClick={onAddDay}
          className="whitespace-nowrap shrink-0 rounded-md px-3 py-1 text-xs font-semibold font-mono text-[#A0A0A8]/60 border border-dashed border-[#A0A0A8]/30 hover:border-[#A0A0A8]/60 hover:text-[#A0A0A8] transition-colors"
        >
          + Add Day
        </button>
      )}
    </div>
  )
}
