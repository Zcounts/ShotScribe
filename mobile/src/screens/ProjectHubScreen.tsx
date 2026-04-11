import { useMemo, useState } from 'react'
import type { MobileScheduleItem, MobileStoryboardReference } from '@shotscribe/shared'
import type { MobileTabKey, ShotFieldEdit, ShotStatus, StoredDayEntry, StoredProjectEntry } from '../types'

interface ProjectHubScreenProps {
  mode: 'local' | 'cloud'
  projects: StoredProjectEntry[]
  project: StoredProjectEntry
  day: StoredDayEntry
  selectedTab: MobileTabKey
  shotEdits: Record<string, ShotFieldEdit>
  onSelectTab: (tab: MobileTabKey) => void
  onSelectDay: (dayId: string) => void
  onSelectProject: (projectId: string) => void
  onImport: () => void
  onDeleteProject: (projectId: string) => void
  onCycleShotStatus: (shotId: string) => void
  onUpdateShotFields: (shotId: string, patch: Partial<Omit<ShotFieldEdit, 'updatedAt'>>) => void
  onExportCurrentProject?: () => void
  exportBusy?: boolean
}

const TAB_ITEMS: Array<{ key: MobileTabKey; label: string }> = [
  { key: 'overview', label: 'Overview' },
  { key: 'schedule', label: 'Schedule' },
  { key: 'shotlist', label: 'Shotlist' },
  { key: 'storyboard', label: 'Storyboard' },
  { key: 'callsheet', label: 'Callsheet' },
  { key: 'script_supervisor', label: 'Script Supervisor' },
  { key: 'project', label: 'Project / More' },
]

function toShotKey(projectId: string, dayId: string, shotId: string) {
  return `${projectId}::${dayId}::${shotId}`
}

function getStatus(item: MobileScheduleItem, edit?: ShotFieldEdit): ShotStatus {
  return edit?.status ?? item.status ?? 'todo'
}

function formatTime(iso?: string) {
  if (!iso) return '—'
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

type StoryboardShotData = {
  shotId: string
  shotDisplayName?: string
  shotCameraName?: string
  focalLength?: string
  shotSize?: string
  shotType?: string
  shotMove?: string
  shotEquipment?: string
  shotNotes?: string
  shotImageUrl?: string
  shotColor?: string
  sceneId?: string
}

function resolveStoryboardShotData(shot: MobileScheduleItem, ref?: MobileStoryboardReference): StoryboardShotData {
  return {
    shotId: shot.shotId as string,
    shotDisplayName: ref?.shotDisplayName ?? shot.shotDisplayName,
    shotCameraName: ref?.shotCameraName ?? shot.shotCameraName,
    focalLength: ref?.focalLength ?? shot.focalLength,
    shotSize: ref?.shotSize ?? shot.shotSize,
    shotType: ref?.shotType ?? shot.shotType,
    shotMove: ref?.shotMove ?? shot.shotMove,
    shotEquipment: ref?.shotEquipment ?? shot.shotEquipment,
    shotNotes: ref?.shotNotes ?? shot.shotNotes,
    shotImageUrl: ref?.thumbnailUrl ?? shot.shotImageUrl,
    shotColor: ref?.shotColor ?? shot.shotColor,
    sceneId: shot.sceneId,
  }
}

function renderOverview(day: StoredDayEntry, doneShots: number, totalShots: number) {
  return (
    <article className="project-card overview-card">
      <div className="section-heading">
        <h3>Day at a glance</h3>
        <span className="status-chip status-chip-quiet">{totalShots ? Math.round((doneShots / totalShots) * 100) : 0}% complete</span>
      </div>
      <div className="stats-grid">
        <p className="stat-tile stat-tile-slate"><span>Schedule blocks</span><strong>{day.dayPackage.scheduleItems.length}</strong></p>
        <p className="stat-tile stat-tile-blue"><span>Shots done</span><strong>{doneShots}/{totalShots}</strong></p>
      </div>
    </article>
  )
}

export function ProjectHubScreen(props: ProjectHubScreenProps) {
  const {
    mode,
    projects,
    project,
    day,
    selectedTab,
    shotEdits,
    onSelectTab,
    onSelectDay,
    onSelectProject,
    onImport,
    onDeleteProject,
    onCycleShotStatus,
    onUpdateShotFields,
    onExportCurrentProject,
    exportBusy,
  } = props

  const [focusedShotId, setFocusedShotId] = useState<string | null>(null)
  const dayList = Object.values(project.days).sort((a, b) => a.shootDate.localeCompare(b.shootDate))
  const shots = useMemo(() => day.dayPackage.scheduleItems.filter((item) => item.type === 'shot' && item.shotId), [day])
  const storyboardRefsByShotId = useMemo(() => {
    const map = new Map<string, MobileStoryboardReference>()
    ;(Array.isArray(day.dayPackage.storyboardRefs) ? day.dayPackage.storyboardRefs : []).forEach((ref) => {
      map.set(ref.shotId, ref)
    })
    return map
  }, [day])

  const doneShots = shots.filter((item) => {
    const edit = shotEdits[toShotKey(project.projectId, day.dayId, item.shotId as string)]
    return getStatus(item, edit) === 'done'
  }).length

  const focusedShot = focusedShotId ? shots.find((item) => item.shotId === focusedShotId) : null
  const focusedEdit = focusedShotId ? shotEdits[toShotKey(project.projectId, day.dayId, focusedShotId)] : undefined
  const focusedStoryboard = focusedShot ? resolveStoryboardShotData(focusedShot, storyboardRefsByShotId.get(focusedShot.shotId as string)) : null

  return (
    <section className="screen project-hub-screen">
      <header className="project-header hero-card">
        <div className="section-heading">
          <h1>{project.projectName}</h1>
          <span className={`status-chip ${mode === 'cloud' ? 'status-in_progress' : 'status-chip-quiet'}`}>
            {mode === 'cloud' ? 'Cloud Project Mode' : 'Local File Mode'}
          </span>
        </div>
        <select className="day-select" value={day.dayId} onChange={(event) => onSelectDay(event.target.value)}>
          {dayList.map((entry) => (
            <option key={entry.dayId} value={entry.dayId}>{entry.dayId} — {entry.shootDate}</option>
          ))}
        </select>
      </header>

      <nav className="tab-strip" aria-label="Project sections">
        {TAB_ITEMS.map((tab) => (
          <button type="button" key={tab.key} className={`tab-button ${selectedTab === tab.key ? 'tab-button-active' : ''}`} onClick={() => onSelectTab(tab.key)}>{tab.label}</button>
        ))}
      </nav>

      {selectedTab === 'overview' ? renderOverview(day, doneShots, shots.length) : null}

      {selectedTab === 'schedule' ? (
        <div className="stacked-list">
          {day.dayPackage.scheduleItems.map((item) => {
            const shotId = item.shotId
            const edit = shotId ? shotEdits[toShotKey(project.projectId, day.dayId, shotId)] : undefined
            const status = getStatus(item, edit)
            const shotNotes = edit?.shotNotes ?? item.shotNotes ?? ''
            return (
              <article key={item.scheduleItemId} className={`timeline-card status-outline-${status}`}>
                <div>
                  <p className="timeline-type">{item.type}</p>
                  <h4>{item.shotDisplayName ?? item.title ?? item.scheduleItemId}</h4>
                  {shotId ? <p className="hint-text">{shotNotes || 'No notes yet'}</p> : null}
                </div>
                {shotId ? <button type="button" className="touch-button" onClick={() => setFocusedShotId(shotId)}>Details</button> : <span className={`status-chip status-${status}`}>{status}</span>}
              </article>
            )
          })}
        </div>
      ) : null}

      {selectedTab === 'shotlist' ? (
        <div className="stacked-list">
          {shots.map((shot) => {
            const shotId = shot.shotId as string
            const edit = shotEdits[toShotKey(project.projectId, day.dayId, shotId)]
            const status = getStatus(shot, edit)
            return (
              <article key={shot.scheduleItemId} className={`mobile-shot-card status-outline-${status}`}>
                <h4>{shot.shotDisplayName ?? shotId}</h4>
                <p className="hint-text">{edit?.scriptSupervisorNotes || edit?.shotNotes || shot.shotNotes || 'No notes'}</p>
                <div className="mobile-shot-actions">
                  <button type="button" className="shot-action-button shot-action-button-secondary" onClick={() => setFocusedShotId(shotId)}>Details</button>
                  <button type="button" className={`shot-action-button shot-action-button-${status === 'done' ? 'done' : status === 'skipped' ? 'skipped' : 'neutral'}`} onClick={() => onCycleShotStatus(shotId)}>
                    {status === 'done' ? 'Done' : status === 'skipped' ? 'Skipped' : 'Mark Done'}
                  </button>
                </div>
              </article>
            )
          })}
        </div>
      ) : null}

      {selectedTab === 'storyboard' ? (
        <div className="stacked-list">
          {shots.map((shot) => {
            const shotId = shot.shotId as string
            const edit = shotEdits[toShotKey(project.projectId, day.dayId, shotId)]
            const status = getStatus(shot, edit)
            const storyboard = resolveStoryboardShotData(shot, storyboardRefsByShotId.get(shotId))
            return (
              <article key={shot.scheduleItemId} className={`storyboard-card status-outline-${status}`}>
                {storyboard.shotImageUrl ? (
                  <img className="storyboard-preview-image-thumb" src={storyboard.shotImageUrl} alt={storyboard.shotDisplayName ?? shotId} loading="lazy" />
                ) : (
                  <div className="storyboard-preview-fallback"><span>No storyboard image</span></div>
                )}
                <h4>{storyboard.shotDisplayName ?? shotId}</h4>
                <div className="shot-spec-grid">
                  <p><span>Camera</span><strong>{storyboard.shotCameraName || '—'}</strong></p>
                  <p><span>Lens</span><strong>{storyboard.focalLength || '—'}</strong></p>
                  <p><span>Size</span><strong>{storyboard.shotSize || '—'}</strong></p>
                  <p><span>Type</span><strong>{storyboard.shotType || '—'}</strong></p>
                  <p><span>Move</span><strong>{storyboard.shotMove || '—'}</strong></p>
                  <p><span>Equipment</span><strong>{storyboard.shotEquipment || '—'}</strong></p>
                </div>
                <p className="shot-notes"><span>Storyboard notes</span><strong>{edit?.shotNotes || storyboard.shotNotes || 'No notes yet'}</strong></p>
                <div className="mobile-shot-actions">
                  <button type="button" className="shot-action-button shot-action-button-secondary" onClick={() => setFocusedShotId(shotId)}>Details</button>
                  <button type="button" className={`shot-action-button shot-action-button-${status === 'done' ? 'done' : status === 'skipped' ? 'skipped' : 'neutral'}`} onClick={() => onCycleShotStatus(shotId)}>
                    {status === 'done' ? 'Done' : status === 'skipped' ? 'Skipped' : 'Mark Done'}
                  </button>
                </div>
              </article>
            )
          })}
        </div>
      ) : null}

      {selectedTab === 'script_supervisor' ? (
        <div className="stacked-list">
          {shots.map((shot) => {
            const shotId = shot.shotId as string
            const edit = shotEdits[toShotKey(project.projectId, day.dayId, shotId)]
            return (
              <article key={shot.scheduleItemId} className="project-card">
                <h4>{shot.shotDisplayName ?? shotId}</h4>
                <p className="hint-text">Actual: {formatTime(edit?.actualStartTime)} - {formatTime(edit?.actualEndTime)}</p>
                <textarea className="text-editor" placeholder="Script supervisor notes" value={edit?.scriptSupervisorNotes ?? ''} onChange={(event) => onUpdateShotFields(shotId, { scriptSupervisorNotes: event.target.value })} />
              </article>
            )
          })}
        </div>
      ) : null}

      {selectedTab === 'callsheet' ? <article className="project-card"><p className="hint-text">Callsheet remains view-only on mobile.</p></article> : null}

      {selectedTab === 'project' ? (
        <div className="stacked-list">
          <article className="project-card">
            <h3>Switch project</h3>
            <div className="project-switch-list">
              {projects.map((entry) => (
                <button type="button" key={entry.projectId} className={`touch-button ${entry.projectId === project.projectId ? 'is-selected' : ''}`} onClick={() => onSelectProject(entry.projectId)}>
                  <span>{entry.projectName}</span>
                  <small>{Object.keys(entry.days).length} day(s)</small>
                </button>
              ))}
            </div>
          </article>
          <article className="project-card">
            {mode === 'local' ? (
              <>
                <button type="button" className="touch-button" onClick={onImport}>Import another file</button>
                <button type="button" className="touch-button" disabled={exportBusy} onClick={onExportCurrentProject}>{exportBusy ? 'Exporting…' : 'Export updated file'}</button>
                <button type="button" className="touch-button touch-button-danger" onClick={() => onDeleteProject(project.projectId)}>Delete this project from device</button>
              </>
            ) : (
              <p className="hint-text">Cloud mode syncs edits directly to your shared cloud project.</p>
            )}
          </article>
        </div>
      ) : null}

      {focusedShot && focusedShotId ? (
        <div className="mobile-shot-modal-backdrop" role="presentation" onClick={() => setFocusedShotId(null)}>
          <div className="mobile-shot-modal" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <div className="mobile-shot-modal-top">
              <h3>{focusedShot.shotDisplayName ?? focusedShotId}</h3>
              <button type="button" className="inline-button" onClick={() => setFocusedShotId(null)}>Close</button>
            </div>
            {focusedStoryboard ? (
              <div className="mobile-shot-detail">
                {focusedStoryboard.shotImageUrl ? (
                  <img className="storyboard-preview-image" src={focusedStoryboard.shotImageUrl} alt={focusedStoryboard.shotDisplayName ?? focusedShotId} loading="lazy" />
                ) : null}
                <div className="shot-spec-grid">
                  <p><span>Camera</span><strong>{focusedStoryboard.shotCameraName || '—'}</strong></p>
                  <p><span>Lens</span><strong>{focusedStoryboard.focalLength || '—'}</strong></p>
                  <p><span>Size</span><strong>{focusedStoryboard.shotSize || '—'}</strong></p>
                  <p><span>Type</span><strong>{focusedStoryboard.shotType || '—'}</strong></p>
                  <p><span>Move</span><strong>{focusedStoryboard.shotMove || '—'}</strong></p>
                  <p><span>Equipment</span><strong>{focusedStoryboard.shotEquipment || '—'}</strong></p>
                </div>
              </div>
            ) : null}
            <textarea className="text-editor" placeholder="Shot / production notes" value={focusedEdit?.shotNotes ?? focusedShot.shotNotes ?? ''} onChange={(event) => onUpdateShotFields(focusedShotId, { shotNotes: event.target.value })} />
            <textarea className="text-editor" placeholder="Script supervisor notes" value={focusedEdit?.scriptSupervisorNotes ?? ''} onChange={(event) => onUpdateShotFields(focusedShotId, { scriptSupervisorNotes: event.target.value })} />
            <label className="hint-text">Actual start<input className="touch-input" type="datetime-local" value={(focusedEdit?.actualStartTime ?? '').slice(0, 16)} onChange={(event) => onUpdateShotFields(focusedShotId, { actualStartTime: event.target.value ? new Date(event.target.value).toISOString() : '' })} /></label>
            <label className="hint-text">Actual end<input className="touch-input" type="datetime-local" value={(focusedEdit?.actualEndTime ?? '').slice(0, 16)} onChange={(event) => onUpdateShotFields(focusedShotId, { actualEndTime: event.target.value ? new Date(event.target.value).toISOString() : '' })} /></label>
            <button type="button" className="touch-button" onClick={() => onCycleShotStatus(focusedShotId)}>Cycle status</button>
          </div>
        </div>
      ) : null}
    </section>
  )
}
