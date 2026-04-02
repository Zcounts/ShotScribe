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

function getStatusTone(status) {
  if (status === 'cloud_sync_failed') {
    return { dot: '#FCA5A5', text: '#FCA5A5', border: 'rgba(248,113,113,0.45)', bg: 'rgba(127,29,29,0.3)' }
  }
  if (status === 'syncing_to_cloud' || status === 'unsaved_changes') {
    return { dot: '#BFDBFE', text: '#BFDBFE', border: 'rgba(96,165,250,0.45)', bg: 'rgba(30,58,138,0.26)' }
  }
  if (status === 'synced_to_cloud') {
    return { dot: '#86EFAC', text: '#86EFAC', border: 'rgba(74,222,128,0.45)', bg: 'rgba(20,83,45,0.28)' }
  }
  return { dot: '#CBD5E1', text: '#D0D4DC', border: 'rgba(148,163,184,0.4)', bg: 'rgba(30,41,59,0.28)' }
}

function getCollabLabel({ projectRef, cloudSyncContext }) {
  if (projectRef?.type !== 'cloud') return 'Collaboration off (local project)'
  if (!cloudSyncContext?.collaborationMode) return 'Collaboration off (solo cloud mode)'
  return 'Shared project (collaboration mode enabled)'
}

export default function SaveSyncStatusControl() {
  const projectRef = useStore((state) => state.projectRef)
  const hasUnsavedChanges = useStore((state) => state.hasUnsavedChanges)
  const saveSyncState = useStore((state) => state.saveSyncState)
  const cloudSyncContext = useStore((state) => state.cloudSyncContext)
  const lastSaved = useStore((state) => state.lastSaved)
  const [open, setOpen] = useState(false)
  const panelRef = useRef(null)

  const tone = getStatusTone(saveSyncState?.status)

  const modeLabel = projectRef?.type === 'cloud' ? 'Cloud project' : 'Local project'
  const cloudEnvEnabled = runtimeConfig.appMode.cloudEnabled
  const cloudAuthConfigured = isCloudAuthConfigured()
  const signedInForCloud = Boolean(cloudSyncContext?.currentUserId)

  const cloudAvailabilityLabel = useMemo(() => {
    if (!cloudEnvEnabled) return 'Cloud features are disabled for this environment.'
    if (!cloudAuthConfigured) return 'Cloud features are enabled, but auth/config is incomplete.'
    if (!signedInForCloud) return 'Cloud features are enabled, but no cloud user session is active.'
    return 'Cloud features are enabled and your session is ready.'
  }, [cloudAuthConfigured, cloudEnvEnabled, signedInForCloud])

  const saveSummary = saveSyncState?.message
    || (hasUnsavedChanges ? 'Changes not yet saved.' : 'Saved on this device.')

  const latestResult = useMemo(() => {
    if (saveSyncState?.status === 'cloud_sync_failed') {
      return saveSyncState?.error || 'Cloud backup failed. Changes remain on this device.'
    }
    if (saveSyncState?.status === 'synced_to_cloud') {
      return `Saved to cloud at ${formatTimestamp(saveSyncState?.lastSyncedAt)}`
    }
    if (saveSyncState?.status === 'syncing_to_cloud') {
      return `Sync in progress (started ${formatTimestamp(saveSyncState?.lastAttemptAt)})`
    }
    if (saveSyncState?.status === 'saved_locally' || projectRef?.type !== 'cloud') {
      return `Saved locally at ${formatTimestamp(lastSaved)}`
    }
    if (saveSyncState?.status === 'unsaved_changes') {
      return 'Changes are pending save.'
    }
    return 'Cloud status unavailable.'
  }, [lastSaved, projectRef?.type, saveSyncState?.error, saveSyncState?.lastAttemptAt, saveSyncState?.lastSyncedAt, saveSyncState?.status])

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
          gap: 6,
          borderRadius: 999,
          border: `1px solid ${tone.border}`,
          background: tone.bg,
          color: tone.text,
          padding: '4px 10px',
          fontSize: 11,
          fontFamily: 'Sora, sans-serif',
          cursor: 'pointer',
          maxWidth: 320,
        }}
      >
        <span style={{
          width: 7,
          height: 7,
          borderRadius: '50%',
          background: tone.dot,
          animation: saveSyncState?.status === 'syncing_to_cloud' ? 'pulse 1.2s ease-in-out infinite' : 'none',
          flexShrink: 0,
        }} />
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {modeLabel} · {saveSummary}
        </span>
      </button>

      {open ? (
        <div style={{
          position: 'absolute',
          right: 0,
          top: 'calc(100% + 8px)',
          zIndex: 600,
          width: 340,
          borderRadius: 10,
          border: '1px solid rgba(74,85,104,0.38)',
          background: '#171C24',
          boxShadow: '0 14px 30px rgba(0,0,0,0.35)',
          padding: 12,
          color: '#E2E8F0',
        }}>
          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>Save / Sync Status</div>
          <div style={{ display: 'grid', gap: 8, fontSize: 11, lineHeight: 1.45 }}>
            <div><strong>Project mode:</strong> {modeLabel}</div>
            <div><strong>Cloud environment:</strong> {cloudAvailabilityLabel}</div>
            <div><strong>Cloud sign-in:</strong> {signedInForCloud ? 'Signed in' : 'Signed out or unavailable'}</div>
            <div><strong>Current status:</strong> {saveSummary}</div>
            <div><strong>Latest result:</strong> {latestResult}</div>
            <div><strong>Collaboration:</strong> {getCollabLabel({ projectRef, cloudSyncContext })}</div>
            {cloudSyncContext?.collaborationMode ? (
              <div><strong>Presence / locks:</strong> Not surfaced in desktop state yet.</div>
            ) : null}
            {saveSyncState?.error ? (
              <div style={{ color: '#FCA5A5' }}><strong>Last error:</strong> {saveSyncState.error}</div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  )
}
