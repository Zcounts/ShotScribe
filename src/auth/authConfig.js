import { runtimeConfig } from '../config/runtimeConfig'

export const authConfig = Object.freeze({
  convexUrl: runtimeConfig.convexUrl,
  issuerUrl: runtimeConfig.authIssuerUrl,
  audience: runtimeConfig.authAudience,
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
