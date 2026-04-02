import { useEffect, useRef } from 'react'
import { useAuth, useUser } from '@clerk/clerk-react'
import { useConvexAuth, useMutation } from 'convex/react'
import { runtimeConfig } from '../config/runtimeConfig'
import { isCloudAuthConfigured } from './authConfig'

function CloudAuthSessionBootstrap() {
  const { isSignedIn } = useAuth()
  const { user, isLoaded: userLoaded } = useUser()
  const { isAuthenticated: hasConvexIdentity } = useConvexAuth()
  const upsertCurrentUser = useMutation('users:upsertCurrentUser')
  const bootstrapAttemptedForUser = useRef(null)

  useEffect(() => {
    if (!isSignedIn || !userLoaded || !hasConvexIdentity || !user?.id) {
      return
    }

    if (bootstrapAttemptedForUser.current === user.id) {
      return
    }

    bootstrapAttemptedForUser.current = user.id

    upsertCurrentUser({
      email: user.primaryEmailAddress?.emailAddress || undefined,
      name: user.fullName || undefined,
      pictureUrl: user.imageUrl || undefined,
    }).catch((error) => {
      bootstrapAttemptedForUser.current = null
      console.error('Failed to bootstrap Convex user from Clerk session', error)
    })
  }, [hasConvexIdentity, isSignedIn, upsertCurrentUser, user, userLoaded])

  return null
}

export default function AuthSessionBar() {
  if (!runtimeConfig.appMode.cloudEnabled || !isCloudAuthConfigured()) {
    return null
  }

  return <CloudAuthSessionBootstrap />
}
