import React, { useMemo, useState } from 'react'
import { DEFAULT_CALLSHEET_SECTION_CONFIG } from '../store'

function Section({ title, meta, defaultOpen = true, children }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <section style={{ border: '1px solid rgba(74,85,104,0.22)', borderRadius: 8, overflow: 'hidden', background: '#FAF8F4' }}>
      <button
        type="button"
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
        <span>{title}{meta ? <span style={{ marginLeft: 6, color: '#64748B' }}>{meta}</span> : null}</span>
        <span style={{ fontSize: 12, color: '#4A5568' }}>{open ? '−' : '+'}</span>
      </button>
      {open ? <div style={{ padding: 12 }}>{children}</div> : null}
    </section>
  )
}

export default function CallsheetConfigureSidebar({
  open,
  sectionConfig,
  onSectionConfigChange,
  headerBgColor,
  onHeaderBgColorChange,
}) {
  const visibleCount = useMemo(
    () => (sectionConfig || DEFAULT_CALLSHEET_SECTION_CONFIG).filter(section => section.visible).length,
    [sectionConfig]
  )

  return (
    <aside
      role="dialog"
      aria-label="Callsheet Configure"
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
        <div style={{ fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#A0AEC0', fontWeight: 700 }}>Callsheet</div>
        <div style={{ fontSize: 17, fontWeight: 700, color: '#FAF8F4', marginTop: 2 }}>Configure</div>
        <div style={{ marginTop: 6, fontSize: 11, color: '#D6D3CD' }}>
          {visibleCount} visible sections
        </div>
      </div>

      <div style={{ padding: 12, overflowY: 'auto', display: 'grid', gap: 10 }}>
        <Section title="Visible Sections" meta={`(${visibleCount})`}>
          <div style={{ display: 'grid', gap: 7 }}>
            {(sectionConfig || DEFAULT_CALLSHEET_SECTION_CONFIG).map(section => (
              <label key={section.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '8px 9px', border: '1px solid #CBD5E1', borderRadius: 7, fontSize: 12, background: '#fff' }}>
                <span>{section.label}</span>
                <input
                  type="checkbox"
                  checked={section.visible}
                  onChange={(e) => onSectionConfigChange((sectionConfig || DEFAULT_CALLSHEET_SECTION_CONFIG).map(item => item.key === section.key ? { ...item, visible: e.target.checked } : item))}
                />
              </label>
            ))}
          </div>
        </Section>

        <Section title="Header">
          <label style={{ display: 'grid', gridTemplateColumns: '1fr auto', alignItems: 'center', gap: 10, fontSize: 12, color: '#2C2C2E' }}>
            <span>Header background color</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                type="color"
                value={headerBgColor}
                onChange={(event) => onHeaderBgColorChange(event.target.value)}
                style={{ width: 34, height: 24, border: '1px solid rgba(74,85,104,0.3)', borderRadius: 4, padding: 0, background: '#fff', cursor: 'pointer' }}
              />
              <code style={{ fontSize: 11, color: '#4A5568', minWidth: 66, textTransform: 'uppercase' }}>{headerBgColor}</code>
            </div>
          </label>
        </Section>
      </div>
    </aside>
  )
}
