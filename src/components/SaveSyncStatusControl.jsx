import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery } from 'convex/react'
import useStore from '../store'
import { runtimeConfig } from '../config/runtimeConfig'
import { isCloudAuthConfigured } from '../auth/authConfig'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select'
import { Avatar, AvatarFallback } from './ui/avatar'
import { useConvexQueryDiagnostics } from '../utils/convexDiagnostics'

const useConvexQueryDiagnosticsSafe = typeof useConvexQueryDiagnostics === 'function'
  ? useConvexQueryDiagnostics
  : () => {}

function formatTimestamp(iso) {
  if (!iso) return 'Not recorded yet'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return 'Not recorded yet'
  return `${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} on ${date.toLocaleDateString()}`
}

function getStatusTheme(status, isCloudProject) {
  if (!isCloudProject) {
    return { toneLabel: 'Local only', pillBg: 'rgba(51,65,85,0.32)', border: 'rgba(148,163,184,0.45)', text: '#D1D5DB', dot: '#CBD5E1' }
  }
  if (status === 'cloud_sync_failed') {
    return { toneLabel: 'Cloud backup failed', pillBg: 'rgba(127,29,29,0.34)', border: 'rgba(248,113,113,0.52)', text: '#FCA5A5', dot: '#FCA5A5' }
  }
  if (status === 'syncing_to_cloud' || status === 'unsaved_changes') {
    return { toneLabel: 'Syncing', pillBg: 'rgba(30,58,138,0.32)', border: 'rgba(96,165,250,0.52)', text: '#BFDBFE', dot: '#93C5FD' }
  }
  if (status === 'synced_to_cloud') {
    return { toneLabel: 'Backed up', pillBg: 'rgba(21,128,61,0.28)', border: 'rgba(74,222,128,0.52)', text: '#86EFAC', dot: '#86EFAC' }
  }
  return { toneLabel: 'Cloud backup ready', pillBg: 'rgba(22,101,52,0.24)', border: 'rgba(134,239,172,0.4)', text: '#D1FAE5', dot: '#A7F3D0' }
}

function memberInitials(member) {
  const source = member?.name || member?.email || member?.userId || ''
  const parts = String(source).trim().split(/\s+/).slice(0, 2)
  const initials = parts.map(part => part[0]?.toUpperCase() || '').join('')
  return initials || 'U'
}

export default function SaveSyncStatusControl({
  cloudAccessPolicy,
  onEnableCloudBackup,
  onSaveToCloudNow,
  onWorkLocalOnly,
  actionBusy = false,
  onOpenChange,
}) {
  const projectRef = useStore((state) => state.projectRef)
  const hasUnsavedChanges = useStore((state) => state.hasUnsavedChanges)
  const saveSyncState = useStore((state) => state.saveSyncState)
  const cloudSyncContext = useStore((state) => state.cloudSyncContext)
  const lastSaved = useStore((state) => state.lastSaved)
  const openCloudProject = useStore((state) => state.openCloudProject)
  const cloudRepositoryReady = useStore((state) => state.cloudRepositoryReady)
  const pendingRemoteSnapshot = useStore((state) => state.pendingRemoteSnapshot)
  const applyPendingRemoteSnapshot = useStore((state) => state.applyPendingRemoteSnapshot)
  const clearPendingRemoteSnapshot = useStore((state) => state.clearPendingRemoteSnapshot)

  const [open, setOpen] = useState(false)
  const [showDetails, setShowDetails] = useState(false)
  const [openCloudList, setOpenCloudList] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState('viewer')
  const [shareBusy, setShareBusy] = useState(false)
  const [shareMessage, setShareMessage] = useState('')
  const panelRef = useRef(null)

  const isCloudProject = projectRef?.type === 'cloud'
  const projectId = isCloudProject ? projectRef.projectId : null
  const cloudEnvEnabled = runtimeConfig.appMode.cloudEnabled
  const cloudAuthConfigured = isCloudAuthConfigured()
  const signedInForCloud = Boolean(cloudSyncContext?.currentUserId)
  const cloudAvailableButNotEnabled = cloudEnvEnabled && !isCloudProject

  const shouldSubscribeCloudLists = open && cloudEnvEnabled && signedInForCloud
  const shouldSubscribeProjectCollab = open && Boolean(projectId)
  const cloudProjectsArgs = shouldSubscribeCloudLists ? {} : 'skip'
  const membersArgs = shouldSubscribeProjectCollab ? { projectId } : 'skip'
  const presenceArgs = shouldSubscribeProjectCollab ? { projectId } : 'skip'
  const locksArgs = shouldSubscribeProjectCollab ? { projectId } : 'skip'
  const cloudProjects = useQuery('projects:listProjectsForCurrentUserLite', cloudProjectsArgs)
  const membersResult = useQuery('projectMembers:listProjectMembers', membersArgs)
  const presenceRows = useQuery('presence:listProjectPresence', presenceArgs)
  const lockRows = useQuery('screenplayLocks:listProjectLocks', locksArgs)

  useConvexQueryDiagnosticsSafe({
    component: 'SaveSyncStatusControl',
    queryName: 'projects:listProjectsForCurrentUserLite',
    args: cloudProjectsArgs,
    result: cloudProjects,
    active: cloudProjectsArgs !== 'skip',
    hidden: !open,
  })
  useConvexQueryDiagnosticsSafe({
    component: 'SaveSyncStatusControl',
    queryName: 'projectMembers:listProjectMembers',
    args: membersArgs,
    result: membersResult,
    active: membersArgs !== 'skip',
    hidden: !open,
  })
  useConvexQueryDiagnosticsSafe({
    component: 'SaveSyncStatusControl',
    queryName: 'presence:listProjectPresence',
    args: presenceArgs,
    result: presenceRows,
    active: presenceArgs !== 'skip',
    hidden: !open,
  })
  useConvexQueryDiagnosticsSafe({
    component: 'SaveSyncStatusControl',
    queryName: 'screenplayLocks:listProjectLocks',
    args: locksArgs,
    result: lockRows,
    active: locksArgs !== 'skip',
    hidden: !open,
  })

  const inviteProjectMember = useMutation('projectMembers:inviteProjectMember')
  const updateProjectMemberRole = useMutation('projectMembers:updateProjectMemberRole')
  const revokeProjectMember = useMutation('projectMembers:revokeProjectMember')

  const canManageMembers = membersResult?.currentUserRole === 'owner'
  const members = membersResult?.members || []
  const activeCollaborators = Array.isArray(presenceRows) ? presenceRows.length : 0
  const sceneLockCount = Array.isArray(lockRows) ? lockRows.length : 0

  const statusTheme = getStatusTheme(saveSyncState?.status, isCloudProject)
  const modeLabel = isCloudProject ? 'Cloud Backup' : 'Local Only'
  const canEnableCloudBackup = !isCloudProject && cloudAccessPolicy?.paidCloudAccess && signedInForCloud && cloudRepositoryReady
  const canSaveToCloudNow = isCloudProject && cloudAccessPolicy?.canEditCloudProject

  const currentStatus = useMemo(() => {
    if (!isCloudProject) return 'Saved locally'
    if (saveSyncState?.status === 'syncing_to_cloud') return 'Syncing to cloud'
    if (saveSyncState?.status === 'synced_to_cloud') return 'Backed up to cloud'
    if (saveSyncState?.status === 'cloud_sync_failed') return 'Cloud backup failed'
    if (saveSyncState?.status === 'cloud_sync_conflict') return 'Conflict requires reload'
    if (saveSyncState?.status === 'remote_update_pending') return 'Remote update pending'
    if (saveSyncState?.status === 'saved_locally') return 'Saved locally, cloud sync pending'
    if (saveSyncState?.status === 'unsaved_changes') return 'Changes pending sync'
    return 'Cloud status unavailable'
  }, [isCloudProject, saveSyncState?.status])

  const latestResult = useMemo(() => {
    if (!isCloudProject) return `Saved locally at ${formatTimestamp(lastSaved)}`
    if (saveSyncState?.status === 'cloud_sync_failed') {
      return saveSyncState?.error || 'Cloud backup failed. Local copy is still safe on this device.'
    }
    if (saveSyncState?.status === 'cloud_sync_conflict') {
      return saveSyncState?.error || 'Conflict detected. Reload collaborator updates before saving again.'
    }
    if (saveSyncState?.status === 'remote_update_pending') {
      return 'A collaborator saved newer changes. Reload remote updates to continue safely.'
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

  useEffect(() => {
    if (!open) return
    setShowDetails(false)
    const onPointerDown = (event) => {
      const target = event.target instanceof Element ? event.target : null
      if (!target) return
      // Radix Select content is portaled outside panelRef. Treat those clicks as
      // internal so role selection does not close the dialog before onValueChange
      // applies, which could otherwise revert to default viewer role.
      if (target.closest('[data-save-sync-select-content="true"]')) return
      if (panelRef.current && !panelRef.current.contains(target)) setOpen(false)
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

  useEffect(() => {
    onOpenChange?.(open)
  }, [open, onOpenChange])

  const handleOpenCloudProject = async (cloudProjectId) => {
    if (!cloudProjectId) return
    try {
      await openCloudProject({ projectId: cloudProjectId })
      setOpenCloudList(false)
      setShareMessage('')
    } catch (error) {
      setShareMessage(error?.message || 'Could not open cloud project.')
    }
  }

  const handleInvite = async () => {
    if (!projectId || !inviteEmail.trim() || !canManageMembers) return
    setShareBusy(true)
    setShareMessage('')
    try {
      const result = await inviteProjectMember({ projectId, email: inviteEmail.trim(), role: inviteRole })
      setInviteEmail('')
      setShareMessage(result?.inviteUrl ? `Invite link: ${result.inviteUrl}` : 'Invitation created.')
    } catch (error) {
      setShareMessage(error?.message || 'Could not invite collaborator.')
    } finally {
      setShareBusy(false)
    }
  }

  const handleRoleUpdate = async (userId, role) => {
    if (!projectId || !canManageMembers) return
    try {
      await updateProjectMemberRole({ projectId, userId, role })
      setShareMessage(`Updated member role to ${role}.`)
    } catch (error) {
      setShareMessage(error?.message || 'Could not update member role.')
    }
  }

  const handleRevokeMember = async (userId) => {
    if (!projectId || !canManageMembers) return
    try {
      await revokeProjectMember({ projectId, userId })
    } catch (error) {
      setShareMessage(error?.message || 'Could not revoke member.')
    }
  }

  const handleReloadRemote = async () => {
    try {
      const result = await applyPendingRemoteSnapshot()
      if (!result?.applied) {
        setShareMessage('Remote update is queued until local edits are cleared.')
      } else {
        setShareMessage('Loaded latest collaborator changes.')
      }
    } catch (error) {
      setShareMessage(error?.message || 'Could not load collaborator changes.')
    }
  }

  return (
    <div ref={panelRef} style={{ position: 'relative', flexShrink: 0 }}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        title={saveSyncState?.error || ''}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 7, borderRadius: 999, border: `1px solid ${statusTheme.border}`, background: statusTheme.pillBg, color: statusTheme.text, padding: '4px 11px', fontSize: 11, fontFamily: 'Sora, sans-serif', cursor: 'pointer', maxWidth: 360 }}
      >
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: statusTheme.dot, animation: saveSyncState?.status === 'syncing_to_cloud' ? 'pulse 1.2s ease-in-out infinite' : 'none', flexShrink: 0 }} />
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {modeLabel} · {statusTheme.toneLabel}
        </span>
      </button>

      {open ? (
        <div style={{ position: 'absolute', right: 0, top: 'calc(100% + 8px)', zIndex: 600, width: 380, borderRadius: 10, border: '1px solid rgba(74,85,104,0.36)', background: '#171C24', boxShadow: '0 14px 30px rgba(0,0,0,0.35)', padding: 12, color: '#E2E8F0' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <div style={{ fontSize: 12, fontWeight: 700 }}>Save / Sync Status</div>
            <span style={{ fontSize: 10, color: statusTheme.text }}>{modeLabel}</span>
          </div>
          <button
            type="button"
            onClick={() => setShowDetails((prev) => !prev)}
            aria-expanded={showDetails}
            aria-controls="save-sync-status-details"
            style={{ border: '1px solid rgba(148,163,184,0.35)', background: 'rgba(15,23,42,0.46)', color: '#CBD5E1', borderRadius: 6, fontSize: 11, padding: '4px 8px', cursor: 'pointer' }}
          >
            {showDetails ? 'Hide details' : 'Show details'}
          </button>
          {showDetails ? (
            <div id="save-sync-status-details" style={{ display: 'grid', gap: 8, fontSize: 11, lineHeight: 1.45, marginTop: 10 }}>
              <div><strong>Project mode:</strong> {modeLabel}</div>
              <div><strong>Cloud environment:</strong> {cloudEnvironmentLabel}</div>
              <div><strong>Cloud project adapter:</strong> {cloudRepositoryReady ? 'Connected' : 'Not ready yet'}</div>
              <div><strong>Cloud sign-in:</strong> {signedInForCloud ? 'Signed in' : 'Signed out'}</div>
              <div><strong>Current status:</strong> {currentStatus}</div>
              <div><strong>Latest result:</strong> {latestResult}</div>
              <div><strong>Collaboration:</strong> {members.length > 1 ? `Shared (${members.length} members)` : (isCloudProject ? 'Solo cloud project' : 'Collaboration off')}</div>
              {isCloudProject ? (<div><strong>Live activity:</strong> {activeCollaborators} active · {sceneLockCount} scene lock{sceneLockCount === 1 ? '' : 's'}</div>) : null}
              {saveSyncState?.error ? (<div style={{ color: '#FCA5A5' }}><strong>Last error:</strong> {saveSyncState.error}</div>) : null}
              {pendingRemoteSnapshot ? (
                <div style={{ color: '#FCD34D' }}>
                  <strong>Pending remote update:</strong> Snapshot {String(pendingRemoteSnapshot.snapshotId || '')}
                </div>
              ) : null}
            </div>
          ) : null}

          <div style={{ display: 'flex', gap: 8, marginTop: 11, flexWrap: 'wrap' }}>
            {!isCloudProject ? (
              <button type="button" onClick={onEnableCloudBackup} disabled={!canEnableCloudBackup || actionBusy} style={{ border: '1px solid rgba(74,222,128,0.42)', background: canEnableCloudBackup && !actionBusy ? 'rgba(22,101,52,0.34)' : 'rgba(51,65,85,0.34)', color: canEnableCloudBackup && !actionBusy ? '#A7F3D0' : 'rgba(226,232,240,0.5)', borderRadius: 6, fontSize: 11, padding: '5px 9px', cursor: canEnableCloudBackup && !actionBusy ? 'pointer' : 'not-allowed' }}>
                {actionBusy ? 'Turning on cloud backup…' : 'Turn on cloud backup'}
              </button>
            ) : (
              <>
                <button type="button" onClick={onSaveToCloudNow} disabled={!canSaveToCloudNow || actionBusy} style={{ border: '1px solid rgba(96,165,250,0.45)', background: canSaveToCloudNow && !actionBusy ? 'rgba(30,58,138,0.34)' : 'rgba(51,65,85,0.34)', color: canSaveToCloudNow && !actionBusy ? '#BFDBFE' : 'rgba(226,232,240,0.5)', borderRadius: 6, fontSize: 11, padding: '5px 9px', cursor: canSaveToCloudNow && !actionBusy ? 'pointer' : 'not-allowed' }}>
                  {actionBusy ? 'Saving to cloud…' : 'Save to cloud now'}
                </button>
                <button type="button" onClick={onWorkLocalOnly} disabled={actionBusy} style={{ border: '1px solid rgba(251,191,36,0.45)', background: 'rgba(120,53,15,0.36)', color: '#FCD34D', borderRadius: 6, fontSize: 11, padding: '5px 9px', cursor: actionBusy ? 'not-allowed' : 'pointer', opacity: actionBusy ? 0.6 : 1 }}>
                  Work local only
                </button>
              </>
            )}
          </div>

          {pendingRemoteSnapshot ? (
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <button
                type="button"
                onClick={handleReloadRemote}
                style={{ border: '1px solid rgba(251,191,36,0.45)', background: 'rgba(120,53,15,0.36)', color: '#FCD34D', borderRadius: 6, fontSize: 11, padding: '5px 9px', cursor: 'pointer' }}
              >
                Reload collaborator changes
              </button>
              <button
                type="button"
                onClick={clearPendingRemoteSnapshot}
                style={{ border: '1px solid rgba(148,163,184,0.35)', background: 'rgba(15,23,42,0.46)', color: '#CBD5E1', borderRadius: 6, fontSize: 11, padding: '5px 9px', cursor: 'pointer' }}
              >
                Dismiss notice
              </button>
            </div>
          ) : null}

          {cloudEnvEnabled && signedInForCloud && (cloudProjects?.length || 0) > 0 ? (
            <div style={{ marginTop: 12, borderTop: '1px solid rgba(74,85,104,0.35)', paddingTop: 10 }}>
              <button type="button" onClick={() => setOpenCloudList((prev) => !prev)} style={{ border: '1px solid rgba(96,165,250,0.35)', background: 'rgba(30,58,138,0.25)', color: '#BFDBFE', borderRadius: 6, fontSize: 11, padding: '4px 8px', cursor: 'pointer' }}>
                {openCloudList ? 'Hide cloud projects' : `Open cloud project (${cloudProjects.length})`}
              </button>
              {openCloudList ? (
                <div style={{ marginTop: 8, display: 'grid', gap: 6, maxHeight: 140, overflowY: 'auto' }}>
                  {cloudProjects.map((project) => (
                    <button key={project._id} type="button" onClick={() => handleOpenCloudProject(String(project._id))} style={{ border: '1px solid rgba(148,163,184,0.3)', background: 'rgba(15,23,42,0.46)', color: '#E2E8F0', borderRadius: 6, padding: '6px 8px', textAlign: 'left', fontSize: 11, cursor: 'pointer' }}>
                      {project.emoji || '☁️'} {project.name}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}

          {isCloudProject ? (
            <div style={{ marginTop: 12, borderTop: '1px solid rgba(74,85,104,0.35)', paddingTop: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 700, marginBottom: 6 }}>Collaboration</div>
              {canManageMembers ? (
                <div style={{ display: 'grid', gap: 6, marginBottom: 8 }}>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <input value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} placeholder="collaborator@email.com" style={{ flex: 1, background: 'rgba(15,23,42,0.5)', color: '#E2E8F0', border: '1px solid rgba(148,163,184,0.35)', borderRadius: 6, fontSize: 11, padding: '5px 7px', outline: 'none' }} />
                    <Select value={inviteRole} onValueChange={setInviteRole}>
                      <SelectTrigger className="h-[30px] w-[96px] border-[rgba(148,163,184,0.35)] bg-[rgba(15,23,42,0.5)] text-[11px] text-[#E2E8F0]">
                        <SelectValue placeholder="Role" />
                      </SelectTrigger>
                      <SelectContent data-save-sync-select-content="true">
                        <SelectItem value="viewer">Viewer</SelectItem>
                        <SelectItem value="editor">Editor</SelectItem>
                      </SelectContent>
                    </Select>
                    <button type="button" onClick={handleInvite} disabled={shareBusy} style={{ border: '1px solid rgba(74,222,128,0.45)', background: 'rgba(22,101,52,0.32)', color: '#A7F3D0', borderRadius: 6, fontSize: 11, padding: '5px 8px', cursor: shareBusy ? 'not-allowed' : 'pointer', opacity: shareBusy ? 0.6 : 1 }}>
                      Invite
                    </button>
                  </div>
                </div>
              ) : (
                <div style={{ fontSize: 11, color: '#94A3B8', marginBottom: 8 }}>
                  You have {membersResult?.currentUserRole || 'viewer'} access. Owner can invite and manage members.
                </div>
              )}
              <div style={{ display: 'grid', gap: 6, maxHeight: 150, overflowY: 'auto' }}>
                {members.map((member) => (
                  <div key={member.userId} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, fontSize: 11 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                      <Avatar className="h-6 w-6 border-[rgba(148,163,184,0.35)]">
                        <AvatarFallback className="text-[9px]">{memberInitials(member)}</AvatarFallback>
                      </Avatar>
                      <div>
                      <div>{member.name || member.email || member.userId}</div>
                      <div style={{ color: '#94A3B8' }}>{member.role}</div>
                      </div>
                    </div>
                    {canManageMembers && member.role !== 'owner' ? (
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <Select value={member.role} onValueChange={(value) => handleRoleUpdate(member.userId, value)}>
                          <SelectTrigger className="h-[24px] w-[84px] border-[rgba(148,163,184,0.35)] bg-[rgba(15,23,42,0.5)] px-1.5 text-[10px] text-[#E2E8F0]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent data-save-sync-select-content="true">
                            <SelectItem value="viewer">viewer</SelectItem>
                            <SelectItem value="editor">editor</SelectItem>
                          </SelectContent>
                        </Select>
                        <button type="button" onClick={() => handleRevokeMember(member.userId)} style={{ border: '1px solid rgba(248,113,113,0.45)', background: 'rgba(127,29,29,0.32)', color: '#FCA5A5', borderRadius: 6, fontSize: 10, padding: '3px 6px', cursor: 'pointer' }}>
                          Revoke
                        </button>
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
              {shareMessage ? <div style={{ marginTop: 8, fontSize: 10, color: '#93C5FD', wordBreak: 'break-word' }}>{shareMessage}</div> : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
