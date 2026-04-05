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
const scriptDocPaginationEnabled = parseBooleanEnv(readOptionalEnv('VITE_ENABLE_SCRIPT_DOC_PAGINATION', 'false'), false)

export const APP_MODE_FLAGS = Object.freeze({
  localOnly: !cloudEnabledFromEnv,
  cloudEnabled: cloudEnabledFromEnv,
})

export const runtimeConfig = Object.freeze({
  appMode: APP_MODE_FLAGS,
  scriptDocument: Object.freeze({
    paginationPhase1Enabled: scriptDocPaginationEnabled,
  }),
  convexUrl: readOptionalEnv('VITE_CONVEX_URL', ''),
  clerkPublishableKey: readOptionalEnv('VITE_CLERK_PUBLISHABLE_KEY', ''),
})
