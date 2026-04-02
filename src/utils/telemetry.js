import * as Sentry from '@sentry/browser'

function readEnv(key, fallback = '') {
  const env = (typeof import.meta !== 'undefined' && import.meta.env) ? import.meta.env : {}
  const value = env[key]
  return typeof value === 'string' ? value : fallback
}

const monitoringEndpoint = readEnv('VITE_MONITORING_ENDPOINT', '')
const monitoringEnabled = !!monitoringEndpoint
const sentryDsn = readEnv('VITE_SENTRY_DSN', '')
const clarityProjectId = readEnv('VITE_CLARITY_PROJECT_ID', '')
const appEnvironment = readEnv('VITE_APP_ENV', readEnv('MODE', 'development'))
const appRelease = readEnv('VITE_APP_RELEASE', '')
const isProduction = Boolean((typeof import.meta !== 'undefined' && import.meta.env?.PROD))
const sentryEnabled = isProduction && !!sentryDsn
const clarityEnabled = isProduction && !!clarityProjectId
let observabilityInitialized = false

function emitStructuredLog(level, eventName, payload = {}) {
  if (typeof console === 'undefined') return
  const time = new Date().toISOString()
  const event = {
    level,
    eventName,
    time,
    ...payload,
  }
  const sink = level === 'error' ? console.error : (level === 'warn' ? console.warn : console.info)
  sink('[telemetry]', JSON.stringify(event))
}

function sendMonitoringEvent(eventName, payload = {}) {
  if (!monitoringEnabled || typeof fetch !== 'function') return
  fetch(monitoringEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      eventName,
      createdAt: new Date().toISOString(),
      payload,
    }),
    keepalive: true,
  }).catch(() => {
    // Never throw from telemetry plumbing.
  })
}

export function logTelemetry(eventName, payload = {}, level = 'info') {
  emitStructuredLog(level, eventName, payload)
  sendMonitoringEvent(eventName, payload)
}

export function initializeErrorMonitoring() {
  if (typeof window === 'undefined' || observabilityInitialized) return
  observabilityInitialized = true

  if (sentryEnabled) {
    Sentry.init({
      dsn: sentryDsn,
      environment: appEnvironment,
      release: appRelease || undefined,
    })
  }

  if (clarityEnabled && typeof document !== 'undefined') {
    const existingTag = document.getElementById('clarity-script')
    if (!existingTag) {
      const script = document.createElement('script')
      script.id = 'clarity-script'
      script.async = true
      script.src = `https://www.clarity.ms/tag/${encodeURIComponent(clarityProjectId)}`
      document.head.appendChild(script)
    }
  }

  window.addEventListener('error', (event) => {
    logTelemetry('frontend.unhandled_error', {
      message: event.message || 'unknown',
      filename: event.filename || null,
      lineno: event.lineno || null,
      colno: event.colno || null,
    }, 'error')
  })

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason
    logTelemetry('frontend.unhandled_rejection', {
      message: reason?.message || String(reason || 'unknown'),
    }, 'error')
  })
}
