import React, { useState } from 'react'
import useStore from '../store'

// ── Small icon buttons ────────────────────────────────────────────────────────

function IconButton({ onClick, title, children, danger }) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '3px 6px',
        border: '1px solid',
        borderColor: danger ? '#f87171' : 'currentColor',
        borderRadius: 4,
        background: 'none',
        color: danger ? '#f87171' : 'inherit',
        cursor: 'pointer',
        opacity: 0.75,
        fontSize: 11,
        fontFamily: 'monospace',
        lineHeight: 1,
      }}
      onMouseEnter={e => (e.currentTarget.style.opacity = '1')}
      onMouseLeave={e => (e.currentTarget.style.opacity = '0.75')}
    >
      {children}
    </button>
  )
}

// ── Badge for I/E and D/N ─────────────────────────────────────────────────────

function Badge({ label }) {
  if (!label) return null
  return (
    <span style={{
      display: 'inline-block',
      padding: '1px 5px',
      borderRadius: 3,
      fontSize: 10,
      fontFamily: 'monospace',
      fontWeight: 700,
      letterSpacing: '0.06em',
      background: 'rgba(128,128,128,0.15)',
    }}>
      {label}
    </span>
  )
}

// ── Add-shot-to-day panel ─────────────────────────────────────────────────────

function AddShotPanel({ dayId, isDark }) {
  const scenes = useStore(s => s.scenes)
  const addShotBlock = useStore(s => s.addShotBlock)
  const getShotsForScene = useStore(s => s.getShotsForScene)

  // Build a flat list of all shots with their displayId for the dropdown
  const allShots = scenes.flatMap((scene, sceneIdx) =>
    getShotsForScene(scene.id).map(shot => ({
      value: shot.id,
      label: `${shot.displayId}${shot.subject ? ' — ' + shot.subject : ''} (${scene.sceneLabel})`,
    }))
  )

  const [selectedShotId, setSelectedShotId] = useState('')

  const borderColor = isDark ? '#444' : '#ccc'
  const bg = isDark ? '#1e1e1e' : '#fff'
  const fg = isDark ? '#ccc' : '#333'

  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 10 }}>
      <select
        value={selectedShotId}
        onChange={e => setSelectedShotId(e.target.value)}
        style={{
          flex: 1,
          padding: '5px 8px',
          fontFamily: 'monospace',
          fontSize: 12,
          border: `1px solid ${borderColor}`,
          borderRadius: 4,
          background: bg,
          color: fg,
        }}
      >
        <option value="">— Select a shot to add —</option>
        {allShots.map(opt => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
      <button
        disabled={!selectedShotId}
        onClick={() => {
          if (!selectedShotId) return
          addShotBlock(dayId, selectedShotId)
          setSelectedShotId('')
        }}
        style={{
          padding: '5px 12px',
          fontFamily: 'monospace',
          fontSize: 12,
          fontWeight: 600,
          border: `1px solid ${borderColor}`,
          borderRadius: 4,
          background: selectedShotId ? (isDark ? '#333' : '#f0ede4') : 'none',
          color: selectedShotId ? fg : '#999',
          cursor: selectedShotId ? 'pointer' : 'default',
        }}
      >
        Add Shot
      </button>
    </div>
  )
}

// ── Single shot block row ─────────────────────────────────────────────────────

function ShotBlockRow({ block, dayId, isDark }) {
  const removeShotBlock = useStore(s => s.removeShotBlock)
  const borderColor = isDark ? '#333' : '#e5e0d8'
  const mutedFg = isDark ? '#888' : '#999'
  const fg = isDark ? '#ddd' : '#1a1a1a'

  const { shotData } = block

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '1fr auto',
      gap: '8px 12px',
      padding: '10px 14px',
      borderBottom: `1px solid ${borderColor}`,
      alignItems: 'start',
    }}>
      {/* Left: shot info pulled live from the storyboard/shotlist */}
      <div>
        {shotData ? (
          <>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
              <span style={{
                fontFamily: 'monospace',
                fontSize: 13,
                fontWeight: 700,
                color: fg,
              }}>
                {shotData.displayId}
              </span>
              {shotData.subject && (
                <span style={{ fontSize: 13, color: fg }}>{shotData.subject}</span>
              )}
              <Badge label={shotData.intOrExt} />
              <Badge label={shotData.dayNight} />
            </div>
            <div style={{ fontSize: 12, color: mutedFg, marginBottom: 3 }}>
              {shotData.sceneLabel}
              {shotData.location ? ` · ${shotData.location}` : ''}
            </div>
            {shotData.notes && (
              <div style={{
                fontSize: 11,
                color: mutedFg,
                fontStyle: 'italic',
                maxWidth: 560,
                whiteSpace: 'pre-wrap',
              }}>
                {shotData.notes.length > 120
                  ? shotData.notes.slice(0, 120) + '…'
                  : shotData.notes}
              </div>
            )}

            {/* Schedule-specific fields */}
            <div style={{
              display: 'flex',
              gap: 16,
              flexWrap: 'wrap',
              marginTop: 6,
              fontSize: 11,
              color: mutedFg,
              fontFamily: 'monospace',
            }}>
              {block.estimatedShootTime && (
                <span>Shoot: {block.estimatedShootTime}</span>
              )}
              {block.estimatedSetupTime && (
                <span>Setup: {block.estimatedSetupTime}</span>
              )}
              {block.shootingLocation && (
                <span>Location: {block.shootingLocation}</span>
              )}
              {block.castMembers && block.castMembers.length > 0 && (
                <span>Cast: {block.castMembers.join(', ')}</span>
              )}
            </div>
          </>
        ) : (
          <span style={{ fontSize: 12, color: '#f87171', fontFamily: 'monospace' }}>
            Shot deleted — remove this block
          </span>
        )}
      </div>

      {/* Right: remove button */}
      <div style={{ paddingTop: 2 }}>
        <IconButton
          onClick={() => removeShotBlock(dayId, block.id)}
          title="Remove shot from this day"
          danger
        >
          ✕
        </IconButton>
      </div>
    </div>
  )
}

// ── Single shooting day card ──────────────────────────────────────────────────

function ShootingDayCard({ day, dayIndex, enrichedDay, isDark }) {
  const removeShootingDay = useStore(s => s.removeShootingDay)
  const updateShootingDay = useStore(s => s.updateShootingDay)

  const bg = isDark ? '#1a1a1a' : '#fff'
  const headerBg = isDark ? '#222' : '#f7f5f0'
  const borderColor = isDark ? '#333' : '#d4cfc6'
  const fg = isDark ? '#ddd' : '#1a1a1a'
  const mutedFg = isDark ? '#888' : '#888'

  return (
    <div style={{
      border: `1px solid ${borderColor}`,
      borderRadius: 6,
      overflow: 'hidden',
      background: bg,
      marginBottom: 20,
    }}>
      {/* Day header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '10px 14px',
        background: headerBg,
        borderBottom: `1px solid ${borderColor}`,
        gap: 12,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1 }}>
          <span style={{
            fontFamily: 'monospace',
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            color: mutedFg,
          }}>
            Day {dayIndex + 1}
          </span>
          <input
            type="date"
            value={day.date}
            onChange={e => updateShootingDay(day.id, { date: e.target.value })}
            style={{
              fontFamily: 'monospace',
              fontSize: 12,
              border: 'none',
              background: 'none',
              color: fg,
              cursor: 'pointer',
              outline: 'none',
              padding: 0,
            }}
          />
          {!day.date && (
            <span style={{ fontSize: 11, color: mutedFg, fontStyle: 'italic' }}>
              No date set
            </span>
          )}
          <span style={{ fontSize: 11, color: mutedFg, fontFamily: 'monospace' }}>
            {enrichedDay.shotBlocks.length} shot{enrichedDay.shotBlocks.length !== 1 ? 's' : ''}
          </span>
        </div>
        <IconButton
          onClick={() => removeShootingDay(day.id)}
          title="Remove shooting day"
          danger
        >
          Remove Day
        </IconButton>
      </div>

      {/* Shot blocks */}
      {enrichedDay.shotBlocks.length === 0 ? (
        <div style={{
          padding: '14px',
          fontSize: 12,
          color: mutedFg,
          fontStyle: 'italic',
          fontFamily: 'monospace',
        }}>
          No shots scheduled yet.
        </div>
      ) : (
        enrichedDay.shotBlocks.map(block => (
          <ShotBlockRow
            key={block.id}
            block={block}
            dayId={day.id}
            isDark={isDark}
          />
        ))
      )}

      {/* Add shot to this day */}
      <div style={{ padding: '10px 14px', borderTop: `1px solid ${borderColor}` }}>
        <AddShotPanel dayId={day.id} isDark={isDark} />
      </div>
    </div>
  )
}

// ── Empty state ───────────────────────────────────────────────────────────────

function EmptyState({ isDark, onAddDay }) {
  const mutedFg = isDark ? '#666' : '#aaa'
  const fg = isDark ? '#ddd' : '#333'

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 16,
      padding: '80px 24px',
      textAlign: 'center',
    }}>
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke={mutedFg} strokeWidth="1.5">
        <rect x="3" y="4" width="18" height="18" rx="2" />
        <line x1="16" y1="2" x2="16" y2="6" />
        <line x1="8" y1="2" x2="8" y2="6" />
        <line x1="3" y1="10" x2="21" y2="10" />
        <line x1="8" y1="14" x2="16" y2="14" />
        <line x1="8" y1="18" x2="13" y2="18" />
      </svg>
      <p style={{ margin: 0, fontSize: 13, color: mutedFg, fontFamily: 'monospace' }}>
        No shooting days yet.
      </p>
      <button
        onClick={onAddDay}
        style={{
          padding: '8px 20px',
          fontFamily: 'monospace',
          fontSize: 12,
          fontWeight: 700,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          border: `1px solid ${isDark ? '#555' : '#bbb'}`,
          borderRadius: 4,
          background: 'none',
          color: fg,
          cursor: 'pointer',
        }}
      >
        + Add Shooting Day
      </button>
    </div>
  )
}

// ── Main ScheduleTab ──────────────────────────────────────────────────────────

export default function ScheduleTab() {
  const theme = useStore(s => s.theme)
  const schedule = useStore(s => s.schedule)
  const getScheduleWithShots = useStore(s => s.getScheduleWithShots)
  const addShootingDay = useStore(s => s.addShootingDay)

  const isDark = theme === 'dark'
  const fg = isDark ? '#ddd' : '#1a1a1a'
  const mutedFg = isDark ? '#888' : '#888'

  const enrichedSchedule = getScheduleWithShots()

  return (
    <div style={{
      flex: 1,
      overflowY: 'auto',
      padding: '24px',
      maxWidth: 900,
      margin: '0 auto',
      width: '100%',
    }}>
      {/* Header row */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 20,
      }}>
        <div>
          <h2 style={{
            margin: 0,
            fontFamily: 'monospace',
            fontSize: 14,
            fontWeight: 700,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            color: fg,
          }}>
            Schedule
          </h2>
          {schedule.length > 0 && (
            <p style={{ margin: '4px 0 0', fontSize: 12, color: mutedFg, fontFamily: 'monospace' }}>
              {schedule.length} shooting day{schedule.length !== 1 ? 's' : ''} &middot;{' '}
              {schedule.reduce((n, d) => n + d.shotBlocks.length, 0)} shot{
                schedule.reduce((n, d) => n + d.shotBlocks.length, 0) !== 1 ? 's' : ''
              } scheduled
            </p>
          )}
        </div>

        {schedule.length > 0 && (
          <button
            onClick={addShootingDay}
            style={{
              padding: '7px 16px',
              fontFamily: 'monospace',
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              border: `1px solid ${isDark ? '#555' : '#bbb'}`,
              borderRadius: 4,
              background: 'none',
              color: fg,
              cursor: 'pointer',
            }}
          >
            + Add Day
          </button>
        )}
      </div>

      {/* Day cards or empty state */}
      {schedule.length === 0 ? (
        <EmptyState isDark={isDark} onAddDay={addShootingDay} />
      ) : (
        enrichedSchedule.map((enrichedDay, dayIndex) => {
          const day = schedule[dayIndex]
          return (
            <ShootingDayCard
              key={day.id}
              day={day}
              dayIndex={dayIndex}
              enrichedDay={enrichedDay}
              isDark={isDark}
            />
          )
        })
      )}
    </div>
  )
}
