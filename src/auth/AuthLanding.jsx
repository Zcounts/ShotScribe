import React, { useMemo } from 'react'
import { ClerkProvider, SignedIn, SignedOut, useClerk } from '@clerk/clerk-react'
import { authConfig, isCloudAuthConfigured } from './authConfig'

const layoutStyle = {
  minHeight: '100dvh',
  display: 'grid',
  placeItems: 'center',
  padding: '2rem',
  margin: 0,
  fontFamily: 'Inter, system-ui, sans-serif',
  background: '#101319',
  color: '#e7ebf5',
}

const cardStyle = {
  width: 'min(720px, 100%)',
  border: '1px solid #2c3445',
  borderRadius: '14px',
  background: '#171b22',
  padding: '2rem',
}

const buttonBaseStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: '10px',
  padding: '.72rem 1rem',
  textDecoration: 'none',
  fontWeight: 600,
  border: 'none',
  cursor: 'pointer',
  fontSize: '1rem',
}

function RedirectToApp() {
  React.useEffect(() => {
    window.location.replace('/')
  }, [])

  return null
}

function AuthActions() {
  const { openSignIn, openSignUp } = useClerk()

  const afterAuth = useMemo(() => ({
    afterSignInUrl: '/',
    afterSignUpUrl: '/',
  }), [])

  return (
    <main style={layoutStyle}>
      <section style={cardStyle}>
        <h1 style={{ margin: '0 0 .75rem' }}>ShotScribe public beta</h1>
        <p style={{ margin: '0 0 1.25rem', color: '#aab4c8' }}>
          Plan from script to shoot with connected screenplay, storyboard, shot list, schedule, and callsheet workflows.
        </p>
        <div style={{ display: 'flex', gap: '.75rem', flexWrap: 'wrap' }}>
          <button
            type="button"
            style={{ ...buttonBaseStyle, background: '#5265ec', color: '#fff' }}
            onClick={() => openSignUp(afterAuth)}
          >
            Create account
          </button>
          <button
            type="button"
            style={{ ...buttonBaseStyle, border: '1px solid #3c4760', background: 'transparent', color: '#e7ebf5' }}
            onClick={() => openSignIn(afterAuth)}
          >
            Sign in
          </button>
        </div>
      </section>
    </main>
  )
}

function LocalFallbackLanding() {
  return (
    <main style={layoutStyle}>
      <section style={cardStyle}>
        <h1 style={{ margin: '0 0 .75rem' }}>ShotScribe public beta</h1>
        <p style={{ margin: '0 0 1.25rem', color: '#aab4c8' }}>
          Cloud auth is not configured in this environment.
        </p>
      </section>
    </main>
  )
}

export default function AuthLanding() {
  if (!isCloudAuthConfigured()) {
    return <LocalFallbackLanding />
  }

  return (
    <ClerkProvider publishableKey={authConfig.clerkPublishableKey}>
      <SignedIn>
        <RedirectToApp />
      </SignedIn>
      <SignedOut>
        <AuthActions />
      </SignedOut>
    </ClerkProvider>
  )
}
