import { runtimeConfig } from '../config/runtimeConfig'

function readIssuerDomain(authIssuerUrl) {
  if (!authIssuerUrl) return ''
  try {
    return new URL(authIssuerUrl).hostname
  } catch {
    return ''
  }
}

export const authConfig = Object.freeze({
  convexUrl: runtimeConfig.convexUrl,
  issuerUrl: runtimeConfig.authIssuerUrl,
  domain: readIssuerDomain(runtimeConfig.authIssuerUrl),
  audience: runtimeConfig.authAudience,
  clientId: runtimeConfig.authClientId,
  cloudEnabled: runtimeConfig.appMode.cloudEnabled,
})

export function isCloudAuthConfigured() {
  return Boolean(
    authConfig.cloudEnabled
    && authConfig.convexUrl
    && authConfig.domain
    && authConfig.clientId
    && authConfig.audience,
  )
}
