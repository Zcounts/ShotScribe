import React from 'react'
import ShotCard from './ShotCard'

/**
 * PageLayout — Session 3 component
 *
 * Renders a full shotlist page:
 *  - Full-width header (3 sections: left / center / right)
 *  - 4-column responsive shot card grid
 *  - Centered page number footer
 */
export default function PageLayout({ page, shots }) {
  const {
    sceneLabel,
    sceneLocation,
    sceneType,
    note,
    shootOrder,
    cameraName,
    cameraBody,
    pageNumber,
  } = page

  return (
    <div className="shotlist-page flex flex-col" style={{ minHeight: '100vh', backgroundColor: '#f8f5ee' }}>
      {/* ═══════════════════════════════════════════════
          PAGE HEADER — three columns
          Left: Scene label
          Center: NOTE + SHOOT ORDER block
          Right: Camera badge + SHOTLIST title
      ═══════════════════════════════════════════════ */}
      <header
        style={{
          backgroundColor: '#f8f5ee',
          borderBottom: '2.5px solid #1a1a2e',
          display: 'grid',
          gridTemplateColumns: '1fr auto 1fr',
          alignItems: 'stretch',
          padding: '0',
        }}
      >
        {/* ── LEFT: Scene Label ── */}
        <div
          style={{
            padding: '14px 20px',
            borderRight: '1.5px solid #d4cebd',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
          }}
        >
          <div
            style={{
              fontSize: '22px',
              fontWeight: '900',
              letterSpacing: '0.04em',
              color: '#1a1a2e',
              lineHeight: 1.1,
              textTransform: 'uppercase',
            }}
          >
            {sceneLabel}
          </div>
          <div
            style={{
              fontSize: '13px',
              fontWeight: '700',
              letterSpacing: '0.12em',
              color: '#4a4a6a',
              marginTop: '4px',
              textTransform: 'uppercase',
            }}
          >
            {sceneLocation} &nbsp;|&nbsp; {sceneType}
          </div>
        </div>

        {/* ── CENTER: NOTE + SHOOT ORDER ── */}
        <div
          style={{
            padding: '12px 24px',
            borderRight: '1.5px solid #d4cebd',
            minWidth: '320px',
            maxWidth: '480px',
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
            justifyContent: 'center',
          }}
        >
          {/* *NOTE block */}
          <div>
            <div
              style={{
                fontSize: '8px',
                fontWeight: '800',
                letterSpacing: '0.15em',
                color: '#6b7280',
                textTransform: 'uppercase',
                marginBottom: '2px',
              }}
            >
              ✦ NOTE
            </div>
            <div
              style={{
                fontSize: '10px',
                color: '#374151',
                lineHeight: 1.5,
                fontStyle: 'italic',
              }}
            >
              {note || 'No notes for this scene.'}
            </div>
          </div>

          {/* *SHOOT ORDER block */}
          <div>
            <div
              style={{
                fontSize: '8px',
                fontWeight: '800',
                letterSpacing: '0.15em',
                color: '#6b7280',
                textTransform: 'uppercase',
                marginBottom: '2px',
              }}
            >
              ✦ SHOOT ORDER
            </div>
            <div
              style={{
                fontSize: '10px',
                color: '#374151',
                lineHeight: 1.5,
              }}
            >
              {shootOrder || 'TBD'}
            </div>
          </div>
        </div>

        {/* ── RIGHT: Camera Badge + SHOTLIST title ── */}
        <div
          style={{
            padding: '14px 20px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-end',
            justifyContent: 'center',
            gap: '6px',
          }}
        >
          {/* SHOTLIST title */}
          <div
            style={{
              fontSize: '22px',
              fontWeight: '900',
              letterSpacing: '0.1em',
              color: '#1a1a2e',
              textTransform: 'uppercase',
              lineHeight: 1,
            }}
          >
            SHOTLIST
          </div>

          {/* Camera badge */}
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              backgroundColor: '#1a1a2e',
              color: '#f8f5ee',
              borderRadius: '4px',
              padding: '4px 10px',
              fontSize: '10px',
              fontWeight: '700',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
            }}
          >
            <span
              style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                backgroundColor: '#22c55e',
                display: 'inline-block',
                flexShrink: 0,
              }}
            />
            {cameraName} = {cameraBody}
          </div>
        </div>
      </header>

      {/* ═══════════════════════════════════════════════
          SHOT CARD GRID — 4 columns
      ═══════════════════════════════════════════════ */}
      <main
        style={{
          flex: 1,
          padding: '16px 20px',
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: '12px',
          alignContent: 'start',
        }}
      >
        {shots.map((shot) => (
          <ShotCard key={shot.id} shot={shot} />
        ))}
      </main>

      {/* ═══════════════════════════════════════════════
          PAGE NUMBER FOOTER
      ═══════════════════════════════════════════════ */}
      <footer
        style={{
          borderTop: '1.5px solid #d4cebd',
          padding: '8px 20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#f0ece0',
        }}
      >
        <span
          style={{
            fontSize: '11px',
            fontWeight: '600',
            letterSpacing: '0.12em',
            color: '#6b7280',
            textTransform: 'uppercase',
          }}
        >
          Page {pageNumber}
        </span>
      </footer>
    </div>
  )
}
