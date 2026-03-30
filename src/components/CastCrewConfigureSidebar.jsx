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
  config,
  onChange,
}) {
  return (
    <aside
      role="dialog"
      aria-label="Cast/Crew Configure"
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
        <div style={{ fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#A0AEC0', fontWeight: 700 }}>Cast/Crew</div>
        <div style={{ fontSize: 17, fontWeight: 700, color: '#FAF8F4', marginTop: 2 }}>Configure</div>
        <div style={{ marginTop: 6, fontSize: 11, color: '#D6D3CD' }}>
          Availability display colors
        </div>
      </div>

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
    </aside>
  )
}
