import React from 'react'
import { useAuth, useClerk, useUser } from '@clerk/clerk-react'
import { useConvexAuth } from 'convex/react'
import { runtimeConfig } from '../config/runtimeConfig'
import { isCloudAuthConfigured } from './authConfig'
import BillingActions from '../features/billing/BillingActions'
import { useAdminAccess } from '../features/admin/useAdminAccess'

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
  const { isSignedIn } = useAuth()
  const { user, isLoaded: userLoaded } = useUser()
  const { signOut, openSignIn } = useClerk()
  const { isAuthenticated: hasConvexIdentity, isLoading: convexLoading } = useConvexAuth()

  const { isAdmin } = useAdminAccess()
  const isLoading = !userLoaded || convexLoading
  const displayName = user?.fullName || user?.primaryEmailAddress?.emailAddress || 'Signed-in user'
  const onAccountPage = typeof window !== 'undefined' && window.location.pathname === '/account'

  return (
    <div style={barStyle}>
      <span>
        {isLoading
          ? 'Checking session…'
          : isSignedIn
            ? `Signed in as ${displayName}${isAdmin ? ' (admin)' : ''}${hasConvexIdentity ? '' : ' (syncing account…)'}`
            : 'Signed out.'}
      </span>
      {isSignedIn ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            type="button"
            style={buttonStyle}
            onClick={() => window.location.assign(onAccountPage ? '/' : '/account')}
          >
            {onAccountPage ? 'Back to app' : 'Account'}
          </button>
          <BillingActions compact />
          <button
            type="button"
            style={buttonStyle}
            onClick={() => signOut({ redirectUrl: '/' })}
          >
            Sign out
          </button>
        </div>
      ) : (
        <button
          type="button"
          style={buttonStyle}
          onClick={() => openSignIn({ afterSignInUrl: '/', afterSignUpUrl: '/' })}
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
