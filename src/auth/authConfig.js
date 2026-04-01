import { runtimeConfig } from '../config/runtimeConfig'

export const authConfig = Object.freeze({
  convexUrl: runtimeConfig.convexUrl,
  clerkPublishableKey: runtimeConfig.clerkPublishableKey,
  cloudEnabled: runtimeConfig.appMode.cloudEnabled,
})

export function isCloudAuthConfigured() {
  return Boolean(
    authConfig.cloudEnabled
    && authConfig.convexUrl
    && authConfig.clerkPublishableKey,
  )
}
