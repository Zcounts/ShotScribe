import React from 'react'
import { Auth0Provider, useAuth0 } from '@auth0/auth0-react'
import { ConvexProvider, ConvexReactClient } from 'convex/react'
import { ConvexProviderWithAuth0 } from 'convex/react-auth0'
import { authConfig, isCloudAuthConfigured } from './authConfig'

const convexClient = authConfig.convexUrl
  ? new ConvexReactClient(authConfig.convexUrl)
  : null

function CloudAuthProviders({ children }) {
  return (
    <Auth0Provider
      domain={authConfig.domain}
      clientId={authConfig.clientId}
      authorizationParams={{
        audience: authConfig.audience,
        redirect_uri: window.location.origin,
      }}
      useRefreshTokens
      cacheLocation="localstorage"
    >
      <ConvexProviderWithAuth0 client={convexClient} useAuth0={useAuth0}>
        {children}
      </ConvexProviderWithAuth0>
    </Auth0Provider>
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
