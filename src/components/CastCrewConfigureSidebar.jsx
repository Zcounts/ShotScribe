import ConfigureSidebarShell from './ConfigureSidebarShell'
import React from 'react'

function ColorRow({ label, value, onChange }) {
  return (
    <label style={{ display: 'grid', gridTemplateColumns: '1fr auto', alignItems: 'center', gap: 10, fontSize: 12, color: '#2C2C2E' }}>
      <span>{label}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <input
          type="color"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          style={{ width: 34, height: 24, border: '1px solid rgba(74,85,104,0.3)', borderRadius: 4, padding: 0, background: '#fff', cursor: 'pointer' }}
        />
        <code style={{ fontSize: 11, color: '#4A5568', minWidth: 66, textTransform: 'uppercase' }}>{value}</code>
      </div>
    </label>
  )
}

export default function CastCrewConfigureSidebar({
  open,
  onClose,
  config,
  onChange,
}) {
  return (
    <ConfigureSidebarShell
      open={open}
      onClose={onClose}
      ariaLabel="Cast/Crew Configure"
      context="Cast/Crew"
      meta="Availability display colors"
    >
      <div style={{ padding: 12, overflowY: 'auto', display: 'grid', gap: 10 }}>
        <section style={{ border: '1px solid rgba(74,85,104,0.22)', borderRadius: 8, overflow: 'hidden', background: '#FAF8F4' }}>
          <div style={{ padding: '10px 12px', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#2C2C2E', background: '#F2EEE6', borderBottom: '1px solid rgba(74,85,104,0.2)' }}>
            Availability Matrix
          </div>
          <div style={{ padding: 12, display: 'grid', gap: 10 }}>
            <ColorRow label="Full day color" value={config?.fullDayColor || '#5265E0'} onChange={(value) => onChange({ fullDayColor: value })} />
            <ColorRow label="Brief color" value={config?.briefColor || '#C7D0FF'} onChange={(value) => onChange({ briefColor: value })} />
            <ColorRow label="Night block only color" value={config?.nightOnlyColor || '#6E4450'} onChange={(value) => onChange({ nightOnlyColor: value })} />
            <ColorRow label="Not needed color" value={config?.notNeededColor || '#94A3B8'} onChange={(value) => onChange({ notNeededColor: value })} />
            <ColorRow label="DAY header cell color" value={config?.dayHeaderBgColor || '#5265E0'} onChange={(value) => onChange({ dayHeaderBgColor: value })} />
          </div>
        </section>
      </div>
    </ConfigureSidebarShell>
  )
}
