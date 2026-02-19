import React, { useRef, useState, useCallback } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import useShotlistStore from '../store/useShotlistStore'
import { CARD_COLORS } from '../data/dummyData'

const COLOR_OPTIONS = Object.entries(CARD_COLORS)

// Parse notes to bold labeled prefixes
function renderNotes(text) {
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

export default function ShotCard({ shot }) {
  const { id, shotCode, camera, focalLength, color, image, size, type, move, equip, notes } = shot

  const updateShot = useShotlistStore((s) => s.updateShot)
  const deleteShot = useShotlistStore((s) => s.deleteShot)
  const duplicateShot = useShotlistStore((s) => s.duplicateShot)

  const fileInputRef = useRef(null)
  const [hovered, setHovered] = useState(false)
  const [showColorPicker, setShowColorPicker] = useState(false)
  const [contextMenu, setContextMenu] = useState(null) // { x, y }
  const [editingNotes, setEditingNotes] = useState(false)

  // ── dnd-kit sortable ──────────────────────────────────
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    borderTop: `3px solid ${color}`,
    borderLeft: `3px solid ${color}`,
  }

  // ── Image upload ──────────────────────────────────────
  const handleImageChange = useCallback(
    (e) => {
      const file = e.target.files[0]
      if (!file) return
      const reader = new FileReader()
      reader.onload = (ev) => updateShot(id, { image: ev.target.result })
      reader.readAsDataURL(file)
    },
    [id, updateShot]
  )

  // ── Right-click context menu ──────────────────────────
  const handleContextMenu = useCallback((e) => {
    e.preventDefault()
    setContextMenu({ x: e.clientX, y: e.clientY })
  }, [])

  const closeContextMenu = useCallback(() => setContextMenu(null), [])

  // ── Specs cell edit ───────────────────────────────────
  const handleSpecChange = useCallback(
    (field, value) => updateShot(id, { [field]: value }),
    [id, updateShot]
  )

  return (
    <>
      <div
        ref={setNodeRef}
        style={style}
        className="flex flex-col bg-white rounded overflow-hidden shadow-sm relative select-none"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => { setHovered(false); setShowColorPicker(false) }}
        onContextMenu={handleContextMenu}
        onClick={contextMenu ? closeContextMenu : undefined}
      >
        {/* ── Delete button (X on hover) ── */}
        {hovered && (
          <button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); deleteShot(id) }}
            className="absolute top-1 right-1 z-20 w-5 h-5 flex items-center justify-center rounded-full bg-red-500 text-white leading-none hover:bg-red-600 transition-colors"
            style={{ fontSize: '10px', fontWeight: 900, lineHeight: 1 }}
            title="Delete shot"
          >
            ×
          </button>
        )}

        {/* ── Card Header Row ── */}
        <div
          className="flex items-center justify-between px-2 py-1.5"
          style={{ backgroundColor: `${color}18` }}
        >
          <div className="flex items-center gap-1.5 min-w-0">
            {/* Drag handle */}
            <div
              {...attributes}
              {...listeners}
              className="flex-shrink-0 cursor-grab active:cursor-grabbing touch-none"
              title="Drag to reorder"
              style={{ color: '#9ca3af', fontSize: '10px', lineHeight: 1 }}
            >
              ⠿
            </div>

            {/* Color indicator square (click to open picker) */}
            <div className="relative flex-shrink-0">
              <div
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => { e.stopPropagation(); setShowColorPicker((v) => !v) }}
                className="w-3 h-3 rounded-sm cursor-pointer hover:ring-1 hover:ring-gray-400 transition-all"
                style={{ backgroundColor: color }}
                title="Pick color"
              />
              {/* Color picker popover */}
              {showColorPicker && (
                <div
                  className="absolute left-0 top-5 z-30 bg-white border border-gray-200 rounded shadow-lg p-1.5 grid gap-1"
                  style={{ gridTemplateColumns: 'repeat(4, 1fr)', width: '80px' }}
                  onPointerDown={(e) => e.stopPropagation()}
                >
                  {COLOR_OPTIONS.map(([name, hex]) => (
                    <div
                      key={name}
                      onClick={(e) => {
                        e.stopPropagation()
                        updateShot(id, { color: hex })
                        setShowColorPicker(false)
                      }}
                      className="w-4 h-4 rounded-sm cursor-pointer hover:ring-1 hover:ring-gray-500"
                      style={{ backgroundColor: hex }}
                      title={name}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Shot ID + Camera */}
            <span className="text-xs font-bold text-gray-900 leading-none truncate">
              {shotCode} — {camera}
            </span>
          </div>

          {/* Focal length (editable inline) */}
          <input
            value={focalLength}
            onChange={(e) => handleSpecChange('focalLength', e.target.value)}
            onPointerDown={(e) => e.stopPropagation()}
            className="text-xs font-semibold text-gray-500 leading-none flex-shrink-0 ml-2 bg-transparent border-none outline-none text-right w-12"
            style={{ minWidth: '2.5rem' }}
            title="Focal length"
          />
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
          onPointerDown={(e) => e.stopPropagation()}
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
          <div className="absolute inset-0 bg-black opacity-0 group-hover:opacity-10 transition-opacity" />
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={handleImageChange}
          />
        </div>

        {/* ── Specs Table ── */}
        <div className="px-0 pt-0">
          <table className="w-full border-collapse">
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
                {[
                  ['size', size],
                  ['type', type],
                  ['move', move],
                  ['equip', equip],
                ].map(([field, val]) => (
                  <td
                    key={field}
                    className="text-center border border-gray-200 text-gray-600 p-0"
                    style={{ fontSize: '8px' }}
                  >
                    <input
                      value={val || ''}
                      onChange={(e) => handleSpecChange(field, e.target.value)}
                      onPointerDown={(e) => e.stopPropagation()}
                      className="w-full text-center bg-transparent border-none outline-none text-gray-600"
                      style={{ fontSize: '8px', padding: '3px 2px' }}
                      placeholder="—"
                    />
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
          onPointerDown={(e) => e.stopPropagation()}
        >
          {editingNotes ? (
            <textarea
              autoFocus
              value={notes || ''}
              onChange={(e) => updateShot(id, { notes: e.target.value })}
              onBlur={() => setEditingNotes(false)}
              className="w-full h-full bg-transparent border border-gray-200 rounded outline-none resize-none text-gray-700"
              style={{ fontSize: '9px', minHeight: '60px' }}
              placeholder="ACTION: ...\nBGD: ..."
            />
          ) : (
            <div
              className="cursor-text"
              onClick={() => setEditingNotes(true)}
              title="Click to edit notes"
            >
              {notes ? (
                renderNotes(notes)
              ) : (
                <span className="text-gray-300 italic">No notes — click to add</span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Right-click context menu ── */}
      {contextMenu && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={closeContextMenu}
            onContextMenu={(e) => { e.preventDefault(); closeContextMenu() }}
          />
          <div
            className="fixed z-50 bg-white border border-gray-200 rounded shadow-xl py-1"
            style={{ top: contextMenu.y, left: contextMenu.x, minWidth: '140px' }}
          >
            <button
              className="w-full text-left px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100 transition-colors"
              onClick={() => { duplicateShot(id); closeContextMenu() }}
            >
              Duplicate shot
            </button>
            <button
              className="w-full text-left px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 transition-colors"
              onClick={() => { deleteShot(id); closeContextMenu() }}
            >
              Delete shot
            </button>
          </div>
        </>
      )}
    </>
  )
}
