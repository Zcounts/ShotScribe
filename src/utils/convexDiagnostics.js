import { useEffect, useMemo, useRef } from 'react'

const DIAG_KEY = 'ss_convex_diag'
const DEFAULT_LARGE_PAYLOAD_BYTES = 40 * 1024
const activeSubscriptions = new Map()

function canUseWindow() {
  return typeof window !== 'undefined'
}

function isDiagnosticsEnabled() {
  if (!import.meta.env.DEV || !canUseWindow()) return false
  try {
    if (window.__SS_CONVEX_DIAG__ === true) return true
    return window.localStorage?.getItem(DIAG_KEY) === '1'
  } catch {
    return false
  }
}

function safeJsonSize(value) {
  if (value == null) return 0
  try {
    return new TextEncoder().encode(JSON.stringify(value)).length
  } catch {
    return -1
  }
}

function makeKey(name, args, routeLabel) {
  return `${name}::${JSON.stringify(args ?? null)}::${routeLabel || 'unknown'}`
}

/**
 * Temporary dev-only diagnostics for Convex query churn.
 * Enable with:
 *   localStorage.setItem('ss_convex_diag', '1')
 * Disable with:
 *   localStorage.removeItem('ss_convex_diag')
 */
export function useConvexQueryDiagnostics({
  queryName,
  args,
  result,
  component,
  active = true,
  hidden = false,
  largePayloadBytes = DEFAULT_LARGE_PAYLOAD_BYTES,
}) {
  const enabled = isDiagnosticsEnabled()
  const renderCountRef = useRef(0)
  const resultCountRef = useRef(0)
  const prevSizeRef = useRef(null)

  const routeLabel = useMemo(
    () => (canUseWindow() ? window.location?.pathname || 'unknown' : 'unknown'),
    [],
  )
  const subscriptionKey = useMemo(
    () => makeKey(queryName, args, routeLabel),
    [args, queryName, routeLabel],
  )

  useEffect(() => {
    if (!enabled || !active) return
    const count = Number(activeSubscriptions.get(subscriptionKey) || 0) + 1
    activeSubscriptions.set(subscriptionKey, count)
    if (count > 1) {
      // eslint-disable-next-line no-console
      console.warn('[convex-diag] duplicate subscription', {
        component,
        queryName,
        args,
        routeLabel,
        subscribers: count,
        hidden,
      })
    }
    return () => {
      const next = Number(activeSubscriptions.get(subscriptionKey) || 0) - 1
      if (next <= 0) activeSubscriptions.delete(subscriptionKey)
      else activeSubscriptions.set(subscriptionKey, next)
    }
  }, [active, args, component, enabled, hidden, queryName, routeLabel, subscriptionKey])

  useEffect(() => {
    if (!enabled || !active) return
    renderCountRef.current += 1
    if (renderCountRef.current <= 3 || renderCountRef.current % 25 === 0) {
      // eslint-disable-next-line no-console
      console.debug('[convex-diag] query render', {
        component,
        queryName,
        routeLabel,
        renderCount: renderCountRef.current,
        hidden,
      })
    }
  })

  useEffect(() => {
    if (!enabled || !active || result === undefined) return
    resultCountRef.current += 1
    const nextSize = safeJsonSize(result)
    const sizeChanged = prevSizeRef.current !== nextSize
    const shouldLog = resultCountRef.current <= 3 || resultCountRef.current % 20 === 0 || sizeChanged

    if (shouldLog) {
      // eslint-disable-next-line no-console
      console.debug('[convex-diag] query result', {
        component,
        queryName,
        routeLabel,
        resultCount: resultCountRef.current,
        payloadBytes: nextSize,
        hidden,
      })
    }
    if (nextSize >= largePayloadBytes) {
      // eslint-disable-next-line no-console
      console.warn('[convex-diag] large query payload', {
        component,
        queryName,
        routeLabel,
        payloadBytes: nextSize,
        thresholdBytes: largePayloadBytes,
      })
    }
    prevSizeRef.current = nextSize
  }, [active, component, enabled, hidden, largePayloadBytes, queryName, result, routeLabel])
}

/**
 * App-safe diagnostics hook for production stability.
 * Diagnostics are optional; this wrapper guarantees a callable hook even if
 * callers import the safe symbol only.
 */
export const useConvexQueryDiagnosticsSafe = typeof useConvexQueryDiagnostics === 'function'
  ? useConvexQueryDiagnostics
  : () => {}
