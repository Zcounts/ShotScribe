function readEnv(key, fallback = '') {
  const env = (typeof import.meta !== 'undefined' && import.meta.env) ? import.meta.env : {}
  const value = env[key]
  return typeof value === 'string' ? value : fallback
}

const monitoringEndpoint = readEnv('VITE_MONITORING_ENDPOINT', '')
const monitoringEnabled = !!monitoringEndpoint

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
  if (typeof window === 'undefined') return
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
