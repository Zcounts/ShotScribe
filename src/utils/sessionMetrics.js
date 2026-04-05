export const isSessionMetricsEnabled = typeof process !== 'undefined' && process?.env?.NODE_ENV === 'development'
const LOG_INTERVAL_MS = 60 * 1000

const counters = {
  snapshotWrites: 0,
  domainCommits: 0,
  snapshotBytesLastWrite: 0,
  presenceHeartbeats: 0,
}

let initialized = false
let startedAt = Date.now()
let intervalId = null
let unloadHandler = null
let pagehideHandler = null

function buildPayload() {
  const sessionDurationSeconds = Math.max(0, Math.round((Date.now() - startedAt) / 1000))
  return {
    snapshot_writes: counters.snapshotWrites,
    domain_commits: counters.domainCommits,
    snapshot_bytes: counters.snapshotBytesLastWrite,
    presence_heartbeats: counters.presenceHeartbeats,
    session_s: sessionDurationSeconds,
  }
}

function logMetrics() {
  if (!isSessionMetricsEnabled) return
  // eslint-disable-next-line no-console
  console.info('[ShotScribe Metrics]', buildPayload())
}

function ensureInitialized() {
  if (!isSessionMetricsEnabled || initialized || typeof window === 'undefined') return
  initialized = true
  startedAt = Date.now()
  intervalId = window.setInterval(() => {
    logMetrics()
  }, LOG_INTERVAL_MS)

  unloadHandler = () => logMetrics()
  pagehideHandler = () => logMetrics()
  window.addEventListener('beforeunload', unloadHandler)
  window.addEventListener('pagehide', pagehideHandler)
}

export function recordSnapshotWrite(payloadBytes = 0) {
  ensureInitialized()
  if (!isSessionMetricsEnabled) return
  counters.snapshotWrites += 1
  counters.snapshotBytesLastWrite = Math.max(0, Number(payloadBytes) || 0)
}

export function recordDomainCommit() {
  ensureInitialized()
  if (!isSessionMetricsEnabled) return
  counters.domainCommits += 1
}

export function recordPresenceHeartbeat() {
  ensureInitialized()
  if (!isSessionMetricsEnabled) return
  counters.presenceHeartbeats += 1
}

export function startSessionMetrics() {
  ensureInitialized()
}

export function stopSessionMetrics() {
  if (!initialized || typeof window === 'undefined') return
  if (intervalId) {
    window.clearInterval(intervalId)
    intervalId = null
  }
  if (unloadHandler) {
    window.removeEventListener('beforeunload', unloadHandler)
    unloadHandler = null
  }
  if (pagehideHandler) {
    window.removeEventListener('pagehide', pagehideHandler)
    pagehideHandler = null
  }
  initialized = false
}
