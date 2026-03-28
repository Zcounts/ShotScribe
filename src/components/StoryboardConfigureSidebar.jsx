import React, { useMemo, useState } from 'react'
import { STORYBOARD_INFO_FIELDS } from '../storyboardDisplayConfig'

const ASPECT_RATIO_OPTIONS = [
  { value: '1:1', label: '1:1 (Square)' },
  { value: '4:3', label: '4:3 (Classic)' },
  { value: '16:9', label: '16:9 (Widescreen)' },
  { value: '3:2', label: '3:2' },
  { value: '2.39:1', label: '2.39:1 (Scope)' },
]

const VISIBLE_INFO_GROUPS = [
  { title: 'Text', keys: ['notes'] },
  { title: 'Time', keys: ['setupTime', 'shotTime'] },
  { title: 'Camera', keys: ['camera', 'lens'] },
  { title: 'Shot Metadata', keys: ['size', 'type', 'move', 'equip', 'shotAspectRatio'] },
]

function Section({ title, defaultOpen = true, children }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <section style={{ border: '1px solid rgba(74,85,104,0.22)', borderRadius: 8, overflow: 'hidden', background: '#FAF8F4' }}>
      <button
        onClick={() => setOpen((value) => !value)}
        style={{
          width: '100%',
          textAlign: 'left',
          padding: '10px 12px',
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: '#2C2C2E',
          background: '#F2EEE6',
          border: 'none',
          borderBottom: open ? '1px solid rgba(74,85,104,0.2)' : 'none',
          cursor: 'pointer',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <span>{title}</span>
        <span style={{ fontSize: 12, color: '#4A5568' }}>{open ? '−' : '+'}</span>
      </button>
      {open && <div style={{ padding: 12 }}>{children}</div>}
    </section>
  )
}

export default function StoryboardConfigureSidebar({
  open,
  showOutline,
  onShowOutlineChange,
  config,
  onAspectRatioChange,
  onVisibleFieldToggle,
  onUseVisibilityInPdfChange,
}) {
  const visibleInfo = config?.visibleInfo || {}
  const selectedAspect = config?.aspectRatio || '16:9'
  const visibleCount = useMemo(
    () => STORYBOARD_INFO_FIELDS.filter(field => visibleInfo[field.key] !== false).length,
    [visibleInfo]
  )
  const visibleLabelByKey = useMemo(
    () => Object.fromEntries(STORYBOARD_INFO_FIELDS.map(field => [field.key, field.label])),
    []
  )

  return (
    <aside
      role="dialog"
      aria-label="Storyboard Configure"
      aria-hidden={!open}
      style={{
        position: 'fixed',
        top: 0,
        right: 0,
        width: 'min(400px, calc(100vw - 24px))',
        height: '100vh',
        zIndex: 160,
        background: '#F7F3EC',
        borderLeft: '1px solid rgba(74,85,104,0.28)',
        boxShadow: '-16px 0 36px rgba(0,0,0,0.22)',
        transform: open ? 'translateX(0)' : 'translateX(104%)',
        transition: 'transform 220ms ease',
        display: 'flex',
        flexDirection: 'column',
      }}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
    >
      <div style={{ padding: '14px 14px 10px', borderBottom: '1px solid rgba(74,85,104,0.2)', background: '#1C1C1E' }}>
        <div style={{ fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#A0AEC0', fontWeight: 700 }}>Storyboard</div>
        <div style={{ fontSize: 17, fontWeight: 700, color: '#FAF8F4', marginTop: 2 }}>Configure</div>
        <div style={{ marginTop: 6, fontSize: 11, color: '#D6D3CD' }}>
          {selectedAspect} layout · {visibleCount} fields visible
        </div>
      </div>

      <div style={{ padding: 12, overflowY: 'auto', display: 'grid', gap: 10 }}>
        <Section title="Layout">
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#2C2C2E', marginBottom: 10 }}>
            <input type="checkbox" checked={showOutline} onChange={(event) => onShowOutlineChange(event.target.checked)} />
            Show storyboard outline
          </label>

          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#4A5568', marginBottom: 6 }}>Global image aspect ratio</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 6 }}>
              {ASPECT_RATIO_OPTIONS.map((option) => {
                const active = option.value === selectedAspect
                return (
                  <button
                    key={option.value}
                    onClick={() => onAspectRatioChange(option.value)}
                    style={{
                      border: `1px solid ${active ? '#E84040' : 'rgba(74,85,104,0.3)'}`,
                      background: active ? 'rgba(232,64,64,0.12)' : '#FAF8F4',
                      borderRadius: 6,
                      padding: '8px 10px',
                      textAlign: 'left',
                      color: active ? '#A82C2C' : '#2C2C2E',
                      fontSize: 11,
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    {option.label}
                  </button>
                )
              })}
            </div>
          </div>
        </Section>

        <Section title="Visible Info">
          <div style={{ display: 'grid', gap: 10 }}>
            {VISIBLE_INFO_GROUPS.map(group => (
              <div key={group.title} style={{ border: '1px solid rgba(74,85,104,0.14)', borderRadius: 6, padding: '8px 10px', background: '#fffdf9' }}>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#4A5568', marginBottom: 6 }}>
                  {group.title}
                </div>
                <div style={{ display: 'grid', gap: 5 }}>
                  {group.keys.map((fieldKey) => (
                    <label key={fieldKey} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, fontSize: 12, color: '#2C2C2E', padding: '2px 0' }}>
                      <span>{visibleLabelByKey[fieldKey] || fieldKey}</span>
                      <input
                        type="checkbox"
                        checked={visibleInfo[fieldKey] !== false}
                        onChange={(event) => onVisibleFieldToggle(fieldKey, event.target.checked)}
                      />
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Section>

        <Section title="PDF Export">
          <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 12, color: '#2C2C2E' }}>
            <input
              type="checkbox"
              checked={!!config?.useVisibilitySettingsInPdf}
              onChange={(event) => onUseVisibilityInPdfChange(event.target.checked)}
              style={{ marginTop: 2 }}
            />
            <span>
              Use current storyboard visibility settings in PDF export
            </span>
          </label>
          <p style={{ margin: '8px 0 0', fontSize: 11, color: '#718096', lineHeight: 1.4 }}>
            When enabled, storyboard PDF exports mirror on-screen visible fields and the selected global image aspect ratio.
          </p>
        </Section>
      </div>
    </aside>
  )
}
