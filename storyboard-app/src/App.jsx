import ShotCard from './components/ShotCard'
import './index.css'

function App() {
  return (
    <div
      style={{
        backgroundColor: '#f5f0e8',
        minHeight: '100vh',
        padding: '24px',
      }}
    >
      {/* Page Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          borderBottom: '2px solid #1a1a1a',
          paddingBottom: '8px',
          marginBottom: '16px',
        }}
      >
        <div>
          <span
            style={{
              fontSize: '22px',
              fontWeight: '900',
              letterSpacing: '0.05em',
              fontFamily: 'Arial, sans-serif',
            }}
          >
            SCENE 1 | CLUB | INT
          </span>
        </div>
        <div
          style={{
            flex: 1,
            padding: '0 24px',
            fontSize: '11px',
            fontFamily: 'Arial, sans-serif',
            maxWidth: '480px',
          }}
        >
          <p style={{ margin: 0, lineHeight: '1.5' }}>
            <strong>*NOTE:</strong> Prioritize on getting extras in and out fast.
          </p>
          <p style={{ margin: '4px 0 0 0', lineHeight: '1.5' }}>
            <strong>*SHOOT ORDER:</strong> shoot inserts(1K), then POVs(1L, 1M) unless we need BGD,
            then 1D, then bring some BGD in for singles, then wider shots(1P), and then bring all in
            for crowd stuff(1B, 1C).
          </p>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div
            style={{
              display: 'inline-block',
              backgroundColor: '#22c55e',
              color: '#fff',
              fontSize: '11px',
              fontWeight: '700',
              padding: '2px 8px',
              borderRadius: '2px',
              marginBottom: '4px',
              fontFamily: 'Arial, sans-serif',
            }}
          >
            Camera 1 = fx30
          </div>
          <div
            style={{
              fontSize: '22px',
              fontWeight: '900',
              letterSpacing: '0.1em',
              fontFamily: 'Arial, sans-serif',
            }}
          >
            SHOTLIST
          </div>
        </div>
      </div>

      {/* Main Content — single hardcoded ShotCard for verification */}
      <div style={{ maxWidth: '320px' }}>
        <ShotCard
          shotId="1A"
          cameraName="Camera 1"
          initialColor="#22c55e"
          initialFocalLength="85mm"
          initialSpecs={{
            size: 'WIDE SHOT',
            type: 'EYE LVL',
            move: 'STATIC or PUSH',
            equip: 'STICKS or GIMBAL',
          }}
          initialNotes={
            'ACTION: Host announcing performer, walking out of frame, performer walking into frame, starts singing.\nBGD: Need ALL background.'
          }
        />
      </div>
    </div>
  )
}

export default App
