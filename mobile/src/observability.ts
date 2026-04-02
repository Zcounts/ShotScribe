import * as Sentry from '@sentry/browser'

function readEnv(key: string, fallback = ''): string {
  const env = (typeof import.meta !== 'undefined' && import.meta.env) ? import.meta.env : {}
  const value = env[key]
  return typeof value === 'string' ? value : fallback
}

const sentryDsn = readEnv('VITE_SENTRY_DSN', '')
const clarityProjectId = readEnv('VITE_CLARITY_PROJECT_ID', '')
const appEnvironment = readEnv('VITE_APP_ENV', readEnv('MODE', 'development'))
const appRelease = readEnv('VITE_APP_RELEASE', '')
const isProduction = Boolean((typeof import.meta !== 'undefined' && import.meta.env?.PROD))

let initialized = false

export function initializeObservability() {
  if (typeof window === 'undefined' || initialized) return
  initialized = true

  if (isProduction && sentryDsn) {
    Sentry.init({
      dsn: sentryDsn,
      environment: appEnvironment,
      release: appRelease || undefined,
    })
  }

  if (isProduction && clarityProjectId && typeof document !== 'undefined' && !document.getElementById('clarity-script')) {
    const script = document.createElement('script')
    script.id = 'clarity-script'
    script.async = true
    script.src = `https://www.clarity.ms/tag/${encodeURIComponent(clarityProjectId)}`
    document.head.appendChild(script)
  }
}
