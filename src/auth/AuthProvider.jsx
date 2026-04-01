import React from 'react'
import { ClerkProvider, RedirectToSignIn, SignedIn, SignedOut, useAuth } from '@clerk/clerk-react'
import { ConvexProvider, ConvexReactClient } from 'convex/react'
import { ConvexProviderWithClerk } from 'convex/react-clerk'
import { authConfig, isCloudAuthConfigured } from './authConfig'

const convexClient = authConfig.convexUrl
  ? new ConvexReactClient(authConfig.convexUrl)
  : null

function CloudAuthProviders({ children }) {
  return (
    <ClerkProvider publishableKey={authConfig.clerkPublishableKey} afterSignOutUrl="/app/">
      <ConvexProviderWithClerk client={convexClient} useAuth={useAuth}>
        <SignedIn>{children}</SignedIn>
        <SignedOut>
          <RedirectToSignIn />
        </SignedOut>
      </ConvexProviderWithClerk>
    </ClerkProvider>
  )
}

export default function AppAuthProvider({ children }) {
  if (isCloudAuthConfigured() && convexClient) {
    return <CloudAuthProviders>{children}</CloudAuthProviders>
  }

  if (convexClient) {
    return <ConvexProvider client={convexClient}>{children}</ConvexProvider>
  }

  return <>{children}</>
}
