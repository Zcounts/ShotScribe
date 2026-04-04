import React, { useMemo, useState } from 'react'
import { useMutation, useQuery } from 'convex/react'
import useStore from '../../store'
import useCloudAccessPolicy from '../billing/useCloudAccessPolicy'

const cardStyle = {
  border: '1px solid #374151',
  borderRadius: 8,
  padding: 10,
  marginTop: 10,
}

export default function SharingSettingsSection() {
  const projectRef = useStore(s => s.projectRef)
  const projectId = projectRef?.type === 'cloud' ? projectRef.projectId : null
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState('viewer')
  const [lastInviteUrl, setLastInviteUrl] = useState('')
  const cloudAccessPolicy = useCloudAccessPolicy()

  const membersResult = useQuery(
    'projectMembers:listProjectMembers',
    projectId ? { projectId } : 'skip',
  )

  const inviteProjectMember = useMutation('projectMembers:inviteProjectMember')
  const updateProjectMemberRole = useMutation('projectMembers:updateProjectMemberRole')
  const revokeProjectMember = useMutation('projectMembers:revokeProjectMember')

  const canManage = useMemo(() => membersResult?.currentUserRole === 'owner', [membersResult?.currentUserRole])

  if (!projectId) {
    return (
      <div style={cardStyle}>
        <div className="text-xs font-semibold text-gray-300 uppercase tracking-wide mb-1">Project Sharing</div>
        <div className="text-xs text-gray-400">Open a cloud project to manage collaborators and roles.</div>
      </div>
    )
  }

  // Viewers have no collaboration management access and no editor role.
  // Show a role-aware message rather than always blaming billing.
  const memberRole = membersResult?.currentUserRole || null
  if (!cloudAccessPolicy.canCollaborateOnCloudProject) {
    const isViewerRole = memberRole === 'viewer'
    return (
      <div style={cardStyle}>
        <div className="text-xs font-semibold text-gray-300 uppercase tracking-wide mb-1">Project Sharing</div>
        {isViewerRole ? (
          <div className="text-xs text-gray-400">
            You have <strong>viewer</strong> access to this project. Ask the owner to upgrade your role to editor if you need to make changes.
          </div>
        ) : (
          <>
            <div className="text-xs text-amber-300 mb-2">
              Collaboration management is unavailable while your paid cloud access is inactive.
            </div>
            <div className="text-xs text-gray-400">
              You can still view existing project data. Local-only projects and local import/export continue to work normally.
            </div>
          </>
        )}
      </div>
    )
  }

  const handleInvite = async () => {
    if (!inviteEmail.trim()) return
    const result = await inviteProjectMember({
      projectId,
      email: inviteEmail.trim(),
      role: inviteRole,
    })
    setInviteEmail('')
    setLastInviteUrl(result?.inviteUrl || '')
  }

  const handleRoleChange = async (userId, role) => {
    await updateProjectMemberRole({ projectId, userId, role })
  }

  const handleRevoke = async (userId) => {
    await revokeProjectMember({ projectId, userId })
  }

  const members = membersResult?.members || []

  return (
    <div style={cardStyle}>
      <div className="text-xs font-semibold text-gray-300 uppercase tracking-wide mb-2">Project Sharing</div>
      {!canManage && (
        <div className="text-xs text-gray-400 mb-2">You have {membersResult?.currentUserRole || 'viewer'} access to this project.</div>
      )}

      {canManage && (
        <div className="mb-3" style={{ display: 'grid', gap: 6 }}>
          <input
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            placeholder="collaborator@email.com"
            className="w-full bg-gray-700 text-white border border-gray-600 rounded px-2 py-1 text-sm outline-none focus:border-blue-400"
          />
          <div style={{ display: 'flex', gap: 6 }}>
            <select
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value)}
              className="bg-gray-700 text-white border border-gray-600 rounded px-2 py-1 text-sm"
            >
              <option value="viewer">Viewer</option>
              <option value="editor">Editor</option>
            </select>
            <button type="button" onClick={handleInvite} className="ss-btn primary" style={{ padding: '4px 10px' }}>Invite</button>
          </div>
          {lastInviteUrl && (
            <div className="text-xs text-gray-400 break-all">Invite link: {lastInviteUrl}</div>
          )}
        </div>
      )}

      <div style={{ display: 'grid', gap: 6 }}>
        {members.map((member) => (
          <div key={member.userId} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
            <div className="text-xs text-gray-300">
              <div>{member.name || member.email || member.userId}</div>
              <div className="text-gray-500">{member.email || 'No email'}</div>
            </div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              {member.role === 'owner' ? (
                <span className="text-xs text-gray-400">Owner</span>
              ) : canManage ? (
                <>
                  <select
                    value={member.role}
                    onChange={(e) => handleRoleChange(member.userId, e.target.value)}
                    className="bg-gray-700 text-white border border-gray-600 rounded px-2 py-1 text-xs"
                  >
                    <option value="viewer">Viewer</option>
                    <option value="editor">Editor</option>
                  </select>
                  <button type="button" onClick={() => handleRevoke(member.userId)} className="text-xs text-red-300">Revoke</button>
                </>
              ) : (
                <span className="text-xs text-gray-400" style={{ textTransform: 'capitalize' }}>{member.role}</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
