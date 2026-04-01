function parseBooleanEnv(value, fallback = false) {
  if (typeof value !== 'string') return fallback
  const normalized = value.trim().toLowerCase()
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false
  return fallback
}

function readOptionalEnv(key, fallback = '') {
  const env = (typeof import.meta !== 'undefined' && import.meta.env) ? import.meta.env : {}
  const value = env[key]
  return typeof value === 'string' ? value : fallback
}

const cloudEnabledFromEnv = parseBooleanEnv(readOptionalEnv('VITE_ENABLE_CLOUD_FEATURES', 'false'), false)

export const APP_MODE_FLAGS = Object.freeze({
  localOnly: !cloudEnabledFromEnv,
  cloudEnabled: cloudEnabledFromEnv,
})

export const runtimeConfig = Object.freeze({
  appMode: APP_MODE_FLAGS,
  convexUrl: readOptionalEnv('VITE_CONVEX_URL', ''),
  stripePublishableKey: readOptionalEnv('VITE_STRIPE_PUBLISHABLE_KEY', ''),
  authIssuerUrl: readOptionalEnv('VITE_AUTH_ISSUER_URL', ''),
  authAudience: readOptionalEnv('VITE_AUTH_AUDIENCE', ''),
  authClientId: readOptionalEnv('VITE_AUTH_CLIENT_ID', ''),
  clerkPublishableKey: readOptionalEnv('VITE_CLERK_PUBLISHABLE_KEY', ''),
})
