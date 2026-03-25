import React, { useEffect, useRef, useState } from 'react'

const SCENE_COLORS = [
  '#4ade80', '#22d3ee', '#facc15', '#f87171',
  '#60a5fa', '#fb923c', '#c084fc', '#f472b6', null,
]

export default function SceneColorPicker({ value, onChange, size = 12, title = 'Scene color' }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-flex' }}>
      <button
        onClick={(e) => { e.stopPropagation(); setOpen(v => !v) }}
        title={title}
        style={{
          width: size,
          height: size,
          borderRadius: '50%',
          border: value ? '1px solid rgba(0,0,0,0.25)' : '1px dashed rgba(113,128,150,0.8)',
          background: value || 'transparent',
          cursor: 'pointer',
          padding: 0,
          flexShrink: 0,
        }}
      />
      {open && (
        <div
          onMouseDown={e => e.stopPropagation()}
          style={{
            position: 'absolute',
            left: 0,
            top: 'calc(100% + 6px)',
            zIndex: 150,
            background: '#fff',
            border: '1px solid rgba(74,85,104,0.25)',
            borderRadius: 6,
            boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
            padding: 6,
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 4,
          }}
        >
          {SCENE_COLORS.map(color => (
            <button
              key={String(color)}
              onClick={() => { onChange(color); setOpen(false) }}
              title={color || 'No color'}
              style={{
                width: 18,
                height: 18,
                borderRadius: '50%',
                border: value === color ? '2px solid #111827' : '1px solid rgba(0,0,0,0.2)',
                background: color || 'transparent',
                outline: color ? 'none' : '1px dashed rgba(113,128,150,0.7)',
                cursor: 'pointer',
                padding: 0,
              }}
            />
          ))}
        </div>
      )}
    </div>
  )
}
