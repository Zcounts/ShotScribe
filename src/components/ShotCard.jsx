import React, { useState, useRef, useCallback } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import useStore from '../store'
import ColorPicker from './ColorPicker'
import SpecsTable from './SpecsTable'
import NotesArea from './NotesArea'

export default function ShotCard({ shot, displayId, useDropdowns, sceneId }) {
  const updateShotImage = useStore(s => s.updateShotImage)
  const updateShot = useStore(s => s.updateShot)
  const showContextMenu = useStore(s => s.showContextMenu)
  const deleteShot = useStore(s => s.deleteShot)
  const [showColorPicker, setShowColorPicker] = useState(false)
  const [hovered, setHovered] = useState(false)
  const fileInputRef = useRef(null)

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: shot.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    '--card-color': shot.color,
    opacity: isDragging ? 0.4 : 1,
  }

  const handleImageClick = () => fileInputRef.current?.click()

  const handleImageChange = (e) => {
    const file = e.target.files[0]
    if (!file) return
    if (!file.type.match(/^image\//)) {
      alert('Please select an image file (JPG, PNG, WEBP)')
      return
    }
    const reader = new FileReader()
    reader.onload = (ev) => updateShotImage(shot.id, ev.target.result)
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  const handleContextMenu = (e) => {
    e.preventDefault()
    showContextMenu(shot.id, sceneId, e.clientX, e.clientY)
  }

  const handleFocalLengthChange = useCallback((e) => {
    updateShot(shot.id, { focalLength: e.target.value })
  }, [shot.id, updateShot])

  const handleCameraNameChange = useCallback((e) => {
    updateShot(shot.id, { cameraName: e.target.value })
  }, [shot.id, updateShot])

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`shot-card ${isDragging ? 'is-dragging' : ''}`}
      onContextMenu={handleContextMenu}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Card Header Row — entire row is the drag handle */}
      <div
        {...attributes}
        {...listeners}
        className="flex items-center gap-1 px-2 py-1 cursor-grab active:cursor-grabbing select-none"
        style={{ paddingLeft: 8, display: 'flex', alignItems: 'center' }}
        title="Drag to reorder"
      >
        {/* Color indicator */}
        <div className="relative flex-shrink-0">
          <div
            className="color-swatch"
            style={{ backgroundColor: shot.color, width: 12, height: 12 }}
            onClick={(e) => { e.stopPropagation(); setShowColorPicker(!showColorPicker) }}
            title="Click to change color"
          />
          {showColorPicker && (
            <ColorPicker
              shotId={shot.id}
              currentColor={shot.color}
              onClose={() => setShowColorPicker(false)}
            />
          )}
        </div>

        {/* Shot ID + Camera name */}
        <div className="flex-1 flex items-center gap-1 min-w-0">
          <span className="font-bold text-xs whitespace-nowrap">{displayId} -</span>
          <input
            type="text"
            value={shot.cameraName}
            onChange={handleCameraNameChange}
            className="text-xs bg-transparent border-none outline-none p-0 min-w-0 flex-1"
            style={{ maxWidth: 80 }}
            placeholder="Camera 1"
          />
        </div>

        {/* Focal length — right-aligned, never covered */}
        <input
          type="text"
          value={shot.focalLength}
          onChange={handleFocalLengthChange}
          className="text-xs bg-transparent border-none outline-none text-right p-0 flex-shrink-0"
          style={{ width: 46 }}
          placeholder="85mm"
        />
      </div>

      {/* Image Area */}
      <div
        className="image-placeholder"
        onClick={handleImageClick}
        style={{ border: `2px solid ${shot.color}`, aspectRatio: '16/9' }}
      >
        {shot.image ? (
          <img src={shot.image} alt="Shot frame" />
        ) : (
          <div className="flex flex-col items-center gap-1 text-gray-500">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <polyline points="21 15 16 10 5 21" />
            </svg>
            <span className="text-xs font-medium">Click to add image</span>
          </div>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleImageChange}
        />
      </div>

      {/* Specs Table */}
      <SpecsTable
        shotId={shot.id}
        specs={shot.specs}
        useDropdowns={useDropdowns}
      />

      {/* Notes Area */}
      <div className="border-t border-gray-200">
        <NotesArea shotId={shot.id} value={shot.notes} />
      </div>

      {/* Delete button — bottom-right corner, avoids focal length field */}
      {hovered && (
        <button
          className="delete-btn absolute bottom-0 right-0 w-5 h-5 flex items-center justify-center bg-red-500 text-white hover:bg-red-600 transition-colors z-20"
          style={{ fontSize: 14, lineHeight: 1 }}
          onClick={(e) => { e.stopPropagation(); deleteShot(shot.id) }}
          title="Delete shot"
        >
          ×
        </button>
      )}
    </div>
  )
}
