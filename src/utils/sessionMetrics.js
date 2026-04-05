export const isSessionMetricsEnabled = typeof process !== 'undefined' && process?.env?.NODE_ENV === 'development'
const LOG_INTERVAL_MS = 60 * 1000

const counters = {
  snapshotWrites: 0,
  domainCommits: 0,
  snapshotBytesLastWrite: 0,
  presenceHeartbeats: 0,
  collabSubscriptionsSuspended: 0,
  deferredSurfaceSubscriptions: 0,
  // Static count: how many per-component useQuery subscriptions for
  // users:currentUser / billing:getMyEntitlement were collapsed into a single
  // boot-time fetch cached in Zustand. Set once; never incremented at runtime.
  redundant_user_fetches_avoided: 5,
  // Project list pagination: increments each time the user loads another page
  // of the project list (i.e. clicks "Load more").
  project_list_pages_loaded: 0,
  // Snapshot hydration lifecycle: deferred = project opened without fetching
  // the full snapshot; triggered = deferred hydration actually fired.
  snapshot_hydrations_deferred: 0,
  snapshot_hydrations_triggered: 0,
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
    collab_subscriptions_suspended: counters.collabSubscriptionsSuspended,
    deferred_surface_subscriptions: counters.deferredSurfaceSubscriptions,
    redundant_user_fetches_avoided: counters.redundant_user_fetches_avoided,
    project_list_pages_loaded: counters.project_list_pages_loaded,
    snapshot_hydrations_deferred: counters.snapshot_hydrations_deferred,
    snapshot_hydrations_triggered: counters.snapshot_hydrations_triggered,
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

export function recordCollabSubscriptionSuspended() {
  ensureInitialized()
  if (!isSessionMetricsEnabled) return
  counters.collabSubscriptionsSuspended += 1
}

export function recordDeferredSurfaceSubscription() {
  ensureInitialized()
  if (!isSessionMetricsEnabled) return
  counters.deferredSurfaceSubscriptions += 1
}

export function recordProjectListPageLoaded() {
  ensureInitialized()
  if (!isSessionMetricsEnabled) return
  counters.project_list_pages_loaded += 1
}

export function recordSnapshotHydrationDeferred() {
  ensureInitialized()
  if (!isSessionMetricsEnabled) return
  counters.snapshot_hydrations_deferred += 1
}

export function recordSnapshotHydrationTriggered() {
  ensureInitialized()
  if (!isSessionMetricsEnabled) return
  counters.snapshot_hydrations_triggered += 1
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
