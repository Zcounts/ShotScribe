import React from 'react'
import { useAuth0 } from '@auth0/auth0-react'
import { useConvexAuth } from 'convex/react'
import { runtimeConfig } from '../config/runtimeConfig'
import { isCloudAuthConfigured } from './authConfig'

const barStyle = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 12,
  padding: '8px 16px',
  borderBottom: '1px solid #313338',
  background: '#111214',
  color: '#D0D4DC',
  fontSize: 12,
}

const buttonStyle = {
  border: '1px solid #4A5568',
  background: '#1F2937',
  color: '#FAF8F4',
  borderRadius: 6,
  padding: '4px 10px',
  fontSize: 11,
  fontWeight: 600,
  cursor: 'pointer',
}

function LocalModeBar() {
  return (
    <div style={barStyle}>
      <span>Local-only mode: no account required.</span>
    </div>
  )
}

function CloudAuthBar() {
  const { isAuthenticated, isLoading: auth0Loading, user, loginWithRedirect, logout } = useAuth0()
  const { isAuthenticated: hasConvexIdentity, isLoading: convexLoading } = useConvexAuth()

  const isLoading = auth0Loading || convexLoading
  const displayName = user?.name || user?.email || 'Signed-in user'

  return (
    <div style={barStyle}>
      <span>
        {isLoading
          ? 'Checking session…'
          : isAuthenticated
            ? `Signed in as ${displayName}${hasConvexIdentity ? '' : ' (syncing account…)'}`
            : 'Signed out. You can still use local projects.'}
      </span>
      {isAuthenticated ? (
        <button
          type="button"
          style={buttonStyle}
          onClick={() => logout({ logoutParams: { returnTo: window.location.origin } })}
        >
          Sign out
        </button>
      ) : (
        <button
          type="button"
          style={buttonStyle}
          onClick={() => loginWithRedirect()}
        >
          Sign in
        </button>
      )}
    </div>
  )
}

export default function AuthSessionBar() {
  if (!runtimeConfig.appMode.cloudEnabled || !isCloudAuthConfigured()) {
    return <LocalModeBar />
  }

  return <CloudAuthBar />
}
