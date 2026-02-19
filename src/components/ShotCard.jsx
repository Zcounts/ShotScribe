import React, { useRef } from 'react'

/**
 * ShotCard — Session 2 component
 * Displays a single shot with header, image placeholder, specs table, and notes.
 */
export default function ShotCard({ shot }) {
  const {
    shotCode,
    camera,
    focalLength,
    color,
    image,
    size,
    type,
    move,
    equip,
    notes,
  } = shot

  const fileInputRef = useRef(null)

  // Parse notes to bold labeled prefixes
  const renderNotes = (text) => {
    if (!text) return null
    const LABELS = ['ACTION:', 'BGD:', 'EST:', 'SHOOT ORDER:']
    return text.split('\n').map((line, i) => {
      const matched = LABELS.find((label) => line.startsWith(label))
      if (matched) {
        return (
          <div key={i} className="leading-snug">
            <span className="font-bold text-gray-800">{matched}</span>
            <span className="text-gray-600">{line.slice(matched.length)}</span>
          </div>
        )
      }
      return (
        <div key={i} className="leading-snug text-gray-600">
          {line}
        </div>
      )
    })
  }

  return (
    <div
      className="flex flex-col bg-white rounded overflow-hidden shadow-sm"
      style={{
        borderTop: `3px solid ${color}`,
        borderLeft: `3px solid ${color}`,
      }}
    >
      {/* ── Card Header Row ── */}
      <div
        className="flex items-center justify-between px-2 py-1.5"
        style={{ backgroundColor: `${color}18` }}
      >
        <div className="flex items-center gap-1.5 min-w-0">
          {/* Color indicator square */}
          <div
            className="flex-shrink-0 w-3 h-3 rounded-sm"
            style={{ backgroundColor: color }}
          />
          {/* Shot ID + Camera */}
          <span className="text-xs font-bold text-gray-900 leading-none truncate">
            {shotCode} — {camera}
          </span>
        </div>
        {/* Focal length */}
        <span className="text-xs font-semibold text-gray-500 leading-none flex-shrink-0 ml-2">
          {focalLength}
        </span>
      </div>

      {/* ── Image Area (16:9) ── */}
      <div
        className="relative w-full bg-gray-100 cursor-pointer group"
        style={{
          aspectRatio: '16 / 9',
          border: `2px solid ${color}`,
          borderTop: 'none',
          borderLeft: 'none',
        }}
        onClick={() => fileInputRef.current?.click()}
        title="Click to upload image"
      >
        {image ? (
          <img
            src={image}
            alt={`Shot ${shotCode}`}
            className="absolute inset-0 w-full h-full object-cover"
          />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-400 select-none">
            <svg
              className="w-8 h-8 mb-1 opacity-40"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.5}
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 4.5v15m7.5-7.5h-15"
              />
            </svg>
            <span className="text-xs opacity-50 font-medium">Add Image</span>
          </div>
        )}
        {/* Hover overlay */}
        <div className="absolute inset-0 bg-black opacity-0 group-hover:opacity-10 transition-opacity" />
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(e) => {
            /* Image upload handler — wired in Session 4 */
            console.log('Image selected:', e.target.files[0])
          }}
        />
      </div>

      {/* ── Specs Table ── */}
      <div className="px-0 pt-0">
        <table className="specs-table w-full border-collapse">
          <thead>
            <tr>
              {['SIZE', 'TYPE', 'MOVE', 'EQUIP'].map((header) => (
                <th
                  key={header}
                  className="text-center border border-gray-200 bg-gray-100 font-bold uppercase tracking-wide text-gray-700"
                  style={{ fontSize: '8px', padding: '3px 2px' }}
                >
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              {[size, type, move, equip].map((val, i) => (
                <td
                  key={i}
                  className="text-center border border-gray-200 text-gray-600"
                  style={{ fontSize: '8px', padding: '3px 2px' }}
                >
                  {val || '—'}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      {/* ── Notes / Description ── */}
      <div
        className="flex-1 px-2 py-1.5 border-t border-gray-100"
        style={{ fontSize: '9px', minHeight: '48px' }}
      >
        {notes ? (
          renderNotes(notes)
        ) : (
          <span className="text-gray-300 italic">No notes</span>
        )}
      </div>
    </div>
  )
}
