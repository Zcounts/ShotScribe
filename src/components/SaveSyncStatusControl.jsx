import React, { useEffect, useMemo, useRef, useState } from 'react'
import useStore from '../store'
import { runtimeConfig } from '../config/runtimeConfig'
import { isCloudAuthConfigured } from '../auth/authConfig'

function formatTimestamp(iso) {
  if (!iso) return 'Not recorded yet'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return 'Not recorded yet'
  return `${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} on ${date.toLocaleDateString()}`
}

function getStatusTheme(status, isCloudProject) {
  if (!isCloudProject) {
    return {
      toneLabel: 'Local only',
      pillBg: 'rgba(51,65,85,0.32)',
      border: 'rgba(148,163,184,0.45)',
      text: '#D1D5DB',
      dot: '#CBD5E1',
    }
  }
  if (status === 'cloud_sync_failed') {
    return {
      toneLabel: 'Cloud backup failed',
      pillBg: 'rgba(127,29,29,0.34)',
      border: 'rgba(248,113,113,0.52)',
      text: '#FCA5A5',
      dot: '#FCA5A5',
    }
  }
  if (status === 'syncing_to_cloud' || status === 'unsaved_changes') {
    return {
      toneLabel: 'Syncing',
      pillBg: 'rgba(30,58,138,0.32)',
      border: 'rgba(96,165,250,0.52)',
      text: '#BFDBFE',
      dot: '#93C5FD',
    }
  }
  if (status === 'synced_to_cloud') {
    return {
      toneLabel: 'Backed up',
      pillBg: 'rgba(21,128,61,0.28)',
      border: 'rgba(74,222,128,0.52)',
      text: '#86EFAC',
      dot: '#86EFAC',
    }
  }
  return {
    toneLabel: 'Cloud backup ready',
    pillBg: 'rgba(22,101,52,0.24)',
    border: 'rgba(134,239,172,0.4)',
    text: '#D1FAE5',
    dot: '#A7F3D0',
  }
}

export default function SaveSyncStatusControl({
  cloudAccessPolicy,
  onEnableCloudBackup,
  onSaveToCloudNow,
  onWorkLocalOnly,
  actionBusy = false,
}) {
  const projectRef = useStore((state) => state.projectRef)
  const hasUnsavedChanges = useStore((state) => state.hasUnsavedChanges)
  const saveSyncState = useStore((state) => state.saveSyncState)
  const cloudSyncContext = useStore((state) => state.cloudSyncContext)
  const lastSaved = useStore((state) => state.lastSaved)
  const [open, setOpen] = useState(false)
  const panelRef = useRef(null)

  const isCloudProject = projectRef?.type === 'cloud'
  const cloudEnvEnabled = runtimeConfig.appMode.cloudEnabled
  const cloudAuthConfigured = isCloudAuthConfigured()
  const signedInForCloud = Boolean(cloudSyncContext?.currentUserId)
  const cloudAvailableButNotEnabled = cloudEnvEnabled && !isCloudProject

  const statusTheme = getStatusTheme(saveSyncState?.status, isCloudProject)

  const modeLabel = isCloudProject ? 'Cloud Backup' : 'Local Only'
  const currentStatus = useMemo(() => {
    if (!isCloudProject) return 'Saved locally'
    if (saveSyncState?.status === 'syncing_to_cloud') return 'Syncing to cloud'
    if (saveSyncState?.status === 'synced_to_cloud') return 'Backed up to cloud'
    if (saveSyncState?.status === 'cloud_sync_failed') return 'Cloud backup failed'
    if (saveSyncState?.status === 'saved_locally') return 'Saved locally, cloud sync pending'
    if (saveSyncState?.status === 'unsaved_changes') return 'Changes pending sync'
    return 'Cloud status unavailable'
  }, [isCloudProject, saveSyncState?.status])

  const latestResult = useMemo(() => {
    if (!isCloudProject) return `Saved locally at ${formatTimestamp(lastSaved)}`
    if (saveSyncState?.status === 'cloud_sync_failed') {
      return saveSyncState?.error || 'Cloud backup failed. Local copy is still safe on this device.'
    }
    if (saveSyncState?.status === 'synced_to_cloud') {
      return `Cloud backup completed at ${formatTimestamp(saveSyncState?.lastSyncedAt)}`
    }
    if (saveSyncState?.status === 'syncing_to_cloud') {
      return `Sync in progress (started ${formatTimestamp(saveSyncState?.lastAttemptAt)})`
    }
    if (saveSyncState?.status === 'saved_locally') {
      return `Saved locally at ${formatTimestamp(lastSaved)}${cloudAvailableButNotEnabled ? ' · cloud backup not enabled for this project' : ''}`
    }
    if (hasUnsavedChanges) {
      return 'Changes are queued for local save and cloud sync (when enabled).'
    }
    return 'Status unavailable'
  }, [cloudAvailableButNotEnabled, hasUnsavedChanges, isCloudProject, lastSaved, saveSyncState?.error, saveSyncState?.lastAttemptAt, saveSyncState?.lastSyncedAt, saveSyncState?.status])

  const cloudEnvironmentLabel = useMemo(() => {
    if (!cloudEnvEnabled) return 'Cloud features disabled in this environment.'
    if (!cloudAuthConfigured) return 'Cloud enabled, but auth setup is incomplete.'
    if (!signedInForCloud) return 'Cloud enabled, but you are signed out for cloud usage.'
    if (!cloudAccessPolicy?.paidCloudAccess) return 'Signed in, but this account is local-only until upgraded.'
    return 'Cloud available and account is cloud-capable.'
  }, [cloudAccessPolicy?.paidCloudAccess, cloudAuthConfigured, cloudEnvEnabled, signedInForCloud])

  const canEnableCloudBackup = !isCloudProject && cloudAccessPolicy?.paidCloudAccess && signedInForCloud
  const canSaveToCloudNow = isCloudProject && cloudAccessPolicy?.canEditCloudProject

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event) => {
      if (panelRef.current && !panelRef.current.contains(event.target)) {
        setOpen(false)
      }
    }
    const onEsc = (event) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onEsc)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onEsc)
    }
  }, [open])

  return (
    <div ref={panelRef} style={{ position: 'relative', flexShrink: 0 }}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        title={saveSyncState?.error || ''}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 7,
          borderRadius: 999,
          border: `1px solid ${statusTheme.border}`,
          background: statusTheme.pillBg,
          color: statusTheme.text,
          padding: '4px 11px',
          fontSize: 11,
          fontFamily: 'Sora, sans-serif',
          cursor: 'pointer',
          maxWidth: 360,
        }}
      >
        <span style={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: statusTheme.dot,
          animation: saveSyncState?.status === 'syncing_to_cloud' ? 'pulse 1.2s ease-in-out infinite' : 'none',
          flexShrink: 0,
        }} />
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {modeLabel} · {statusTheme.toneLabel}
        </span>
      </button>

      {open ? (
        <div style={{
          position: 'absolute',
          right: 0,
          top: 'calc(100% + 8px)',
          zIndex: 600,
          width: 356,
          borderRadius: 10,
          border: '1px solid rgba(74,85,104,0.36)',
          background: '#171C24',
          boxShadow: '0 14px 30px rgba(0,0,0,0.35)',
          padding: 12,
          color: '#E2E8F0',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <div style={{ fontSize: 12, fontWeight: 700 }}>Save / Sync Status</div>
            <span style={{ fontSize: 10, color: statusTheme.text }}>{modeLabel}</span>
          </div>
          <div style={{ display: 'grid', gap: 8, fontSize: 11, lineHeight: 1.45 }}>
            <div><strong>Project mode:</strong> {modeLabel}</div>
            <div><strong>Cloud environment:</strong> {cloudEnvironmentLabel}</div>
            <div><strong>Cloud sign-in:</strong> {signedInForCloud ? 'Signed in' : 'Signed out'}</div>
            <div><strong>Current status:</strong> {currentStatus}</div>
            <div><strong>Latest result:</strong> {latestResult}</div>
            <div><strong>Collaboration:</strong> {isCloudProject && cloudSyncContext?.collaborationMode ? 'Shared project mode' : 'Collaboration off'}</div>
            {isCloudProject && cloudSyncContext?.collaborationMode ? (
              <div><strong>Presence / locks:</strong> Not surfaced in desktop state yet.</div>
            ) : null}
            {saveSyncState?.error ? (
              <div style={{ color: '#FCA5A5' }}><strong>Last error:</strong> {saveSyncState.error}</div>
            ) : null}
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 11, flexWrap: 'wrap' }}>
            {!isCloudProject ? (
              <button
                type="button"
                onClick={onEnableCloudBackup}
                disabled={!canEnableCloudBackup || actionBusy}
                style={{
                  border: '1px solid rgba(74,222,128,0.42)',
                  background: canEnableCloudBackup && !actionBusy ? 'rgba(22,101,52,0.34)' : 'rgba(51,65,85,0.34)',
                  color: canEnableCloudBackup && !actionBusy ? '#A7F3D0' : 'rgba(226,232,240,0.5)',
                  borderRadius: 6,
                  fontSize: 11,
                  padding: '5px 9px',
                  cursor: canEnableCloudBackup && !actionBusy ? 'pointer' : 'not-allowed',
                }}
              >
                {actionBusy ? 'Turning on cloud backup…' : 'Turn on cloud backup'}
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={onSaveToCloudNow}
                  disabled={!canSaveToCloudNow || actionBusy}
                  style={{
                    border: '1px solid rgba(96,165,250,0.45)',
                    background: canSaveToCloudNow && !actionBusy ? 'rgba(30,58,138,0.34)' : 'rgba(51,65,85,0.34)',
                    color: canSaveToCloudNow && !actionBusy ? '#BFDBFE' : 'rgba(226,232,240,0.5)',
                    borderRadius: 6,
                    fontSize: 11,
                    padding: '5px 9px',
                    cursor: canSaveToCloudNow && !actionBusy ? 'pointer' : 'not-allowed',
                  }}
                >
                  {actionBusy ? 'Saving to cloud…' : 'Save to cloud now'}
                </button>
                <button
                  type="button"
                  onClick={onWorkLocalOnly}
                  disabled={actionBusy}
                  style={{
                    border: '1px solid rgba(251,191,36,0.45)',
                    background: 'rgba(120,53,15,0.36)',
                    color: '#FCD34D',
                    borderRadius: 6,
                    fontSize: 11,
                    padding: '5px 9px',
                    cursor: actionBusy ? 'not-allowed' : 'pointer',
                    opacity: actionBusy ? 0.6 : 1,
                  }}
                >
                  Work local only
                </button>
              </>
            )}
          </div>
        </div>
      ) : null}
    </div>
  )
}
