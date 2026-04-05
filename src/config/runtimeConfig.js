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
const legacyScriptTabFallbackEnabled = parseBooleanEnv(readOptionalEnv('VITE_ENABLE_LEGACY_SCRIPT_TAB', 'false'), false)
const draftCommitModeEnabled = parseBooleanEnv(readOptionalEnv('VITE_ENABLE_DRAFT_COMMIT_MODE', 'false'), false)
const draftCommitCheckpointMinutes = Math.max(
  1,
  Number.parseInt(readOptionalEnv('VITE_DRAFT_COMMIT_CHECKPOINT_MINUTES', '5'), 10) || 5,
)

export const APP_MODE_FLAGS = Object.freeze({
  localOnly: !cloudEnabledFromEnv,
  cloudEnabled: cloudEnabledFromEnv,
})

export const runtimeConfig = Object.freeze({
  appMode: APP_MODE_FLAGS,
  scriptDocument: Object.freeze({
    legacyFallbackEnabled: legacyScriptTabFallbackEnabled,
  }),
  sync: Object.freeze({
    draftCommitModeEnabled,
    draftCommitCheckpointMinutes,
  }),
  convexUrl: readOptionalEnv('VITE_CONVEX_URL', ''),
  clerkPublishableKey: readOptionalEnv('VITE_CLERK_PUBLISHABLE_KEY', ''),
})
