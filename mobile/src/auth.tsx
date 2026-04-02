import type { ReactNode } from 'react'
import { ClerkProvider, SignInButton, SignedIn, SignedOut, useAuth, UserButton } from '@clerk/clerk-react'
import { ConvexReactClient } from 'convex/react'
import { ConvexProviderWithClerk } from 'convex/react-clerk'

function readEnv(name: string): string {
  const value = import.meta.env[name]
  return typeof value === 'string' ? value : ''
}

export const mobileRuntime = Object.freeze({
  convexUrl: readEnv('VITE_CONVEX_URL'),
  clerkPublishableKey: readEnv('VITE_CLERK_PUBLISHABLE_KEY'),
  cloudEnabled: String(readEnv('VITE_ENABLE_CLOUD_FEATURES')).toLowerCase() === 'true',
})

const convexClient = mobileRuntime.convexUrl ? new ConvexReactClient(mobileRuntime.convexUrl) : null

export function MobileProviders({ children }: { children: ReactNode }) {
  if (!mobileRuntime.cloudEnabled || !mobileRuntime.clerkPublishableKey) {
    return <>{children}</>
  }

  if (!convexClient) {
    return <>{children}</>
  }

  return (
    <ClerkProvider publishableKey={mobileRuntime.clerkPublishableKey}>
      <ConvexProviderWithClerk client={convexClient} useAuth={useAuth}>{children}</ConvexProviderWithClerk>
    </ClerkProvider>
  )
}

export function CloudAuthPanel() {
  return (
    <div className="project-card">
      <SignedOut>
        <p className="hint-text">Sign in to access cloud projects.</p>
        <SignInButton mode="modal">
          <button type="button" className="touch-button touch-button-primary">Sign in for Cloud Project Mode</button>
        </SignInButton>
      </SignedOut>
      <SignedIn>
        <div className="section-heading">
          <p className="hint-text">Signed in for cloud projects.</p>
          <UserButton afterSignOutUrl="/" />
        </div>
      </SignedIn>
    </div>
  )
}
