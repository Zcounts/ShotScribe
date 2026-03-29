import React, { useCallback, useEffect, useMemo, useState } from 'react'

export function DayTabBar({
  days,
  activeDay,
  onSelect,
  onAddDay,
  onDeleteDay,
  showAddAction = true,
  enableDayContextMenu = false,
}) {
  const [contextMenu, setContextMenu] = useState(null) // { x, y, dayId }

  const dayIndexById = useMemo(() => {
    const map = new Map()
    days.forEach((day, idx) => map.set(day.id, idx))
    return map
  }, [days])

  const getFallbackDayId = useCallback((dayId) => {
    const dayIdx = dayIndexById.get(dayId)
    if (dayIdx == null) return null
    const fallback = days[dayIdx - 1] || days[dayIdx + 1] || null
    return fallback?.id || null
  }, [dayIndexById, days])

  useEffect(() => {
    if (!contextMenu) return undefined

    const close = () => setContextMenu(null)
    const onKeyDown = (event) => {
      if (event.key === 'Escape') close()
    }

    document.addEventListener('click', close)
    document.addEventListener('contextmenu', close)
    document.addEventListener('keydown', onKeyDown)

    return () => {
      document.removeEventListener('click', close)
      document.removeEventListener('contextmenu', close)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [contextMenu])

  const handleDeleteDay = useCallback(() => {
    if (!contextMenu?.dayId || !onDeleteDay) return
    const dayIdx = dayIndexById.get(contextMenu.dayId)
    const dayNumber = dayIdx == null ? null : dayIdx + 1
    const confirmed = window.confirm(
      dayNumber
        ? `Delete Day ${dayNumber}? This also removes its callsheet data.`
        : 'Delete this day? This also removes its callsheet data.'
    )
    if (!confirmed) return
    onDeleteDay(contextMenu.dayId, getFallbackDayId(contextMenu.dayId))
    setContextMenu(null)
  }, [contextMenu, dayIndexById, getFallbackDayId, onDeleteDay])

  return (
    <div className="flex items-center gap-1 px-3 py-1.5 bg-[#2C2C2E] border-b border-[#3A3A3C] overflow-x-auto shrink-0" style={{ position: 'relative' }}>
      {days.map(day => (
        <button
          key={day.id}
          onClick={() => onSelect(day.id)}
          onContextMenu={(event) => {
            if (!enableDayContextMenu || !onDeleteDay) return
            event.preventDefault()
            event.stopPropagation()
            setContextMenu({ x: event.clientX, y: event.clientY, dayId: day.id })
          }}
          className={`whitespace-nowrap rounded-md px-3 py-1 text-xs font-semibold font-mono transition-colors duration-150 shrink-0 ${
            activeDay === day.id
              ? 'bg-[#E84040] text-white'
              : 'text-[#A0A0A8] hover:bg-white/5 hover:text-white'
          }`}
        >
          {day.label}
        </button>
      ))}
      {onAddDay && showAddAction && (
        <button
          onClick={onAddDay}
          className="whitespace-nowrap shrink-0 rounded-md px-3 py-1 text-xs font-semibold font-mono text-[#A0A0A8]/60 border border-dashed border-[#A0A0A8]/30 hover:border-[#A0A0A8]/60 hover:text-[#A0A0A8] transition-colors"
        >
          + Add Day
        </button>
      )}
      {contextMenu && (
        <div
          style={{
            position: 'fixed',
            top: contextMenu.y,
            left: contextMenu.x,
            zIndex: 80,
            minWidth: 148,
            padding: 4,
            borderRadius: 8,
            border: '1px solid #CBD5E1',
            background: '#fff',
            boxShadow: '0 10px 28px rgba(15, 23, 42, 0.16)',
          }}
          onClick={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            onClick={handleDeleteDay}
            style={{
              width: '100%',
              border: 'none',
              borderRadius: 6,
              background: 'transparent',
              color: '#B91C1C',
              cursor: 'pointer',
              textAlign: 'left',
              padding: '7px 9px',
              fontSize: 12,
              fontWeight: 600,
              fontFamily: 'monospace',
            }}
          >
            Delete Day
          </button>
        </div>
      )}
    </div>
  )
}
