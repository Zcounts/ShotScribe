import ConfigureSidebarShell from './ConfigureSidebarShell'
import React, { useMemo, useState } from 'react'
import { DEFAULT_CALLSHEET_SECTION_CONFIG } from '../store'
import { Checkbox } from './ui/checkbox'

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
  onClose,
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
    <ConfigureSidebarShell
      open={open}
      onClose={onClose}
      ariaLabel="Callsheet Configure"
      context="Callsheet"
      meta={`${visibleCount} visible sections`}
    >
      <div style={{ padding: 12, overflowY: 'auto', display: 'grid', gap: 10 }}>
        <Section title="Visible Sections" meta={`(${visibleCount})`}>
          <div style={{ display: 'grid', gap: 7 }}>
            {(sectionConfig || DEFAULT_CALLSHEET_SECTION_CONFIG).map(section => (
              <label key={section.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '8px 9px', border: '1px solid #CBD5E1', borderRadius: 7, fontSize: 12, background: '#fff' }}>
                <span>{section.label}</span>
                <Checkbox
                  checked={section.visible}
                  onCheckedChange={(checked) => onSectionConfigChange((sectionConfig || DEFAULT_CALLSHEET_SECTION_CONFIG).map(item => item.key === section.key ? { ...item, visible: !!checked } : item))}
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
    </ConfigureSidebarShell>
  )
}
