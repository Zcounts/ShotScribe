import React, { useMemo, useState } from 'react'
import { useMutation } from 'convex/react'
import useStore from '../../store'

function readInviteToken() {
  if (typeof window === 'undefined') return ''
  const params = new URLSearchParams(window.location.search)
  return String(params.get('token') || '').trim()
}

export default function AcceptInvitePage() {
  const token = useMemo(() => readInviteToken(), [])
  const openCloudProject = useStore(s => s.openCloudProject)
  const acceptProjectInvite = useMutation('projectMembers:acceptProjectInvite')
  const [status, setStatus] = useState('idle')
  const [message, setMessage] = useState('')

  const handleAccept = async () => {
    if (!token) {
      setStatus('error')
      setMessage('Missing invite token.')
      return
    }

    setStatus('loading')
    setMessage('')

    try {
      const result = await acceptProjectInvite({ token })
      await openCloudProject({ projectId: result.projectId })
      setStatus('success')
      setMessage(result?.alreadyAccepted ? 'Invite already accepted. Project opened.' : 'Invite accepted. Project opened.')
      window.history.replaceState({}, '', '/')
    } catch (error) {
      setStatus('error')
      setMessage(error?.message || 'Could not accept invite.')
    }
  }

  return (
    <div style={{ padding: 24, maxWidth: 560, margin: '0 auto', color: '#e5e7eb' }}>
      <h1 style={{ fontSize: 22, marginBottom: 10 }}>Accept Project Invite</h1>
      <p style={{ fontSize: 14, color: '#9ca3af', marginBottom: 16 }}>
        Collaboration is available for paid cloud users on shared cloud projects.
      </p>
      <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 16, wordBreak: 'break-all' }}>
        Token: {token || 'missing'}
      </div>
      <button
        type="button"
        className="ss-btn primary"
        onClick={handleAccept}
        disabled={status === 'loading'}
      >
        {status === 'loading' ? 'Accepting…' : 'Accept Invite'}
      </button>
      {message && (
        <div style={{ marginTop: 12, fontSize: 13, color: status === 'error' ? '#fca5a5' : '#86efac' }}>
          {message}
        </div>
      )}
    </div>
  )
}
