import { useState, useRef, useEffect } from 'react'

const COLOR_OPTIONS = [
  '#22c55e', // green
  '#06b6d4', // cyan
  '#eab308', // yellow
  '#ef4444', // red
  '#a855f7', // purple
  '#f97316', // orange
  '#ec4899', // pink
  '#3b82f6', // blue
  '#84cc16', // lime
]

const SIZE_OPTIONS = ['WIDE SHOT', 'MEDIUM', 'CLOSE UP', 'OTS', 'ECU', 'TWO SHOT']
const TYPE_OPTIONS = ['EYE LVL', 'SHOULDER LVL', 'CROWD LVL', 'HIGH ANGLE', 'LOW ANGLE']
const MOVE_OPTIONS = ['STATIC', 'PUSH', 'PULL', 'PAN', 'TILT', 'STATIC or PUSH']
const EQUIP_OPTIONS = ['STICKS', 'GIMBAL', 'HANDHELD', 'STICKS or GIMBAL']

const BOLD_PREFIXES = ['SHOOT ORDER:', 'ACTION:', 'BGD:', 'EST:']

function FormattedNotes({ text }) {
  if (!text) {
    return <span style={{ color: '#9ca3af', fontStyle: 'italic' }}>Click to add notes...</span>
  }

  const lines = text.split('\n')
  const result = []

  lines.forEach((line, i) => {
    const matchedPrefix = BOLD_PREFIXES.find(p => line.startsWith(p))
    if (matchedPrefix) {
      result.push(
        <span key={i}>
          <strong>{matchedPrefix}</strong>
          {line.slice(matchedPrefix.length)}
          {i < lines.length - 1 && <br />}
        </span>
      )
    } else {
      result.push(
        <span key={i}>
          {line}
          {i < lines.length - 1 && <br />}
        </span>
      )
    }
  })

  return <>{result}</>
}

export default function ShotCard({
  shotId = '1A',
  cameraName = 'Camera 1',
  initialColor = '#22c55e',
  initialFocalLength = '85mm',
  initialSpecs = {},
  initialNotes = '',
}) {
  const [indicatorColor, setIndicatorColor] = useState(initialColor)
  const [showColorPicker, setShowColorPicker] = useState(false)
  const [image, setImage] = useState(null)
  const [focalLength, setFocalLength] = useState(initialFocalLength)
  const [specs, setSpecs] = useState({
    size: initialSpecs.size || '',
    type: initialSpecs.type || '',
    move: initialSpecs.move || '',
    equip: initialSpecs.equip || '',
  })
  const [notes, setNotes] = useState(initialNotes)
  const [editingNotes, setEditingNotes] = useState(false)

  const fileInputRef = useRef(null)
  const textareaRef = useRef(null)
  const colorPickerRef = useRef(null)

  // Close color picker on outside click
  useEffect(() => {
    if (!showColorPicker) return
    function handleClick(e) {
      if (colorPickerRef.current && !colorPickerRef.current.contains(e.target)) {
        setShowColorPicker(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [showColorPicker])

  // Auto-expand textarea on focus
  useEffect(() => {
    if (editingNotes && textareaRef.current) {
      const el = textareaRef.current
      el.style.height = 'auto'
      el.style.height = el.scrollHeight + 'px'
      el.focus()
      const len = el.value.length
      el.setSelectionRange(len, len)
    }
  }, [editingNotes])

  const handleImageUpload = (e) => {
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => setImage(ev.target.result)
    reader.readAsDataURL(file)
  }

  const handleNotesChange = (e) => {
    setNotes(e.target.value)
    e.target.style.height = 'auto'
    e.target.style.height = e.target.scrollHeight + 'px'
  }

  const handleImageAreaClick = () => {
    fileInputRef.current?.click()
  }

  return (
    <div
      style={{
        border: `2px solid ${indicatorColor}`,
        backgroundColor: '#ffffff',
        fontSize: '11px',
        fontFamily: 'Arial, sans-serif',
      }}
    >
      {/* ── Header Row ─────────────────────────────────────────── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '5px',
          padding: '3px 6px',
          borderBottom: '1px solid #e5e7eb',
          minHeight: '22px',
        }}
      >
        {/* Color Indicator Square */}
        <div ref={colorPickerRef} style={{ position: 'relative', flexShrink: 0 }}>
          <div
            onClick={() => setShowColorPicker(v => !v)}
            title="Pick color"
            style={{
              width: '12px',
              height: '12px',
              backgroundColor: indicatorColor,
              cursor: 'pointer',
              border: '1px solid rgba(0,0,0,0.2)',
              borderRadius: '1px',
            }}
          />
          {showColorPicker && (
            <div
              style={{
                position: 'absolute',
                top: '16px',
                left: 0,
                zIndex: 50,
                backgroundColor: '#fff',
                border: '1px solid #d1d5db',
                borderRadius: '4px',
                boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                padding: '6px',
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: '4px',
              }}
            >
              {COLOR_OPTIONS.map(color => (
                <div
                  key={color}
                  onClick={() => { setIndicatorColor(color); setShowColorPicker(false) }}
                  style={{
                    width: '20px',
                    height: '20px',
                    backgroundColor: color,
                    cursor: 'pointer',
                    border: color === indicatorColor ? '2px solid #374151' : '1px solid rgba(0,0,0,0.2)',
                    borderRadius: '2px',
                  }}
                />
              ))}
            </div>
          )}
        </div>

        {/* Shot ID + Camera Name */}
        <span
          style={{
            fontWeight: '700',
            flex: 1,
            fontSize: '11px',
            letterSpacing: '0.02em',
          }}
        >
          {shotId} - {cameraName}
        </span>

        {/* Focal Length */}
        <input
          type="text"
          value={focalLength}
          onChange={e => setFocalLength(e.target.value)}
          style={{
            textAlign: 'right',
            width: '42px',
            background: 'transparent',
            border: 'none',
            outline: 'none',
            fontSize: '11px',
            color: '#374151',
            fontFamily: 'inherit',
          }}
        />
      </div>

      {/* ── Image Area 16:9 ─────────────────────────────────────── */}
      <div
        style={{
          position: 'relative',
          aspectRatio: '16 / 9',
          cursor: 'pointer',
          overflow: 'hidden',
          border: `2px solid ${indicatorColor}`,
          backgroundColor: '#d1d5db',
          margin: '0',
        }}
        onClick={handleImageAreaClick}
        title="Click to upload image"
      >
        {image ? (
          <img
            src={image}
            alt="shot"
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              display: 'block',
            }}
          />
        ) : (
          <div
            style={{
              width: '100%',
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#9ca3af',
            }}
          >
            <span style={{ fontSize: '32px', fontWeight: '300', lineHeight: 1 }}>+</span>
          </div>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          style={{ display: 'none' }}
          onChange={handleImageUpload}
        />
      </div>

      {/* ── Specs Table ─────────────────────────────────────────── */}
      <table
        style={{
          width: '100%',
          borderCollapse: 'collapse',
          borderTop: '1px solid #e5e7eb',
        }}
      >
        <thead>
          <tr>
            {['SIZE', 'TYPE', 'MOVE', 'EQUIP'].map((header, idx) => (
              <th
                key={header}
                style={{
                  textAlign: 'center',
                  fontWeight: '700',
                  fontSize: '10px',
                  padding: '3px 2px',
                  borderBottom: '1px solid #d1d5db',
                  borderRight: idx < 3 ? '1px solid #d1d5db' : 'none',
                  letterSpacing: '0.05em',
                  backgroundColor: '#f9fafb',
                }}
              >
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr>
            {[
              { key: 'size', options: SIZE_OPTIONS },
              { key: 'type', options: TYPE_OPTIONS },
              { key: 'move', options: MOVE_OPTIONS },
              { key: 'equip', options: EQUIP_OPTIONS },
            ].map(({ key, options }, idx) => (
              <td
                key={key}
                style={{
                  padding: '0',
                  borderRight: idx < 3 ? '1px solid #d1d5db' : 'none',
                }}
              >
                <select
                  value={specs[key]}
                  onChange={e => setSpecs(prev => ({ ...prev, [key]: e.target.value }))}
                  style={{
                    width: '100%',
                    textAlign: 'center',
                    fontSize: '10px',
                    padding: '3px 1px',
                    background: 'transparent',
                    border: 'none',
                    outline: 'none',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    fontWeight: '600',
                    color: '#111827',
                    appearance: 'none',
                    WebkitAppearance: 'none',
                  }}
                >
                  <option value=""></option>
                  {options.map(opt => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
              </td>
            ))}
          </tr>
        </tbody>
      </table>

      {/* ── Notes Area ──────────────────────────────────────────── */}
      <div
        style={{
          borderTop: '1px solid #e5e7eb',
          padding: '4px 6px',
          minHeight: '44px',
        }}
      >
        {editingNotes ? (
          <textarea
            ref={textareaRef}
            value={notes}
            onChange={handleNotesChange}
            onBlur={() => setEditingNotes(false)}
            style={{
              width: '100%',
              fontSize: '11px',
              fontFamily: 'inherit',
              lineHeight: '1.4',
              resize: 'none',
              outline: 'none',
              border: 'none',
              background: 'transparent',
              overflow: 'hidden',
              minHeight: '36px',
              color: '#1f2937',
            }}
          />
        ) : (
          <div
            onClick={() => setEditingNotes(true)}
            style={{
              fontSize: '11px',
              lineHeight: '1.4',
              cursor: 'text',
              minHeight: '36px',
              color: '#1f2937',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}
          >
            <FormattedNotes text={notes} />
          </div>
        )}
      </div>
    </div>
  )
}
