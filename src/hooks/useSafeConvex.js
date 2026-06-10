import { useEffect, useMemo, useRef, useState } from 'react'
import { useConvex } from 'convex/react'
import useStore from '../store'

export const CLOUD_UNAVAILABLE_MESSAGE = 'Cloud services are temporarily unavailable. Local projects still work.'

export function describeConvexError(error) {
  const raw = String(error?.message || error || '').trim()
  if (!raw) return 'Cloud request failed.'
  if (/quota|limit|over quota|rate limit/i.test(raw)) return 'Cloud services are over quota or temporarily limited.'
  if (/network|fetch|failed to fetch|offline|unreachable|timeout|websocket|socket/i.test(raw)) return 'Cloud services are unreachable from this device.'
  if (/unauth|auth|clerk|not authenticated/i.test(raw)) return 'Cloud sign-in is unavailable or expired.'
  if (/server error|internal|500|called by client/i.test(raw)) return 'Cloud services returned a server error.'
  return raw
}

function useCloudStatusActions() {
  return {
    markAvailable: useStore(s => s.markConvexAvailable),
    markUnavailable: useStore(s => s.markConvexUnavailable),
  }
}

export function useSafeConvexQuery(queryName, argsOrSkip, options = {}) {
  const convex = useConvex()
  const { fallback = undefined, component = 'unknown' } = options || {}
  const fallbackRef = useRef(fallback)
  fallbackRef.current = fallback
  const enabled = argsOrSkip !== 'skip' && Boolean(queryName)
  const args = enabled ? (argsOrSkip || {}) : null
  const argsKey = useMemo(() => {
    if (!enabled) return 'skip'
    try {
      return JSON.stringify(args)
    } catch {
      return String(Date.now())
    }
  }, [args, enabled])
  const [state, setState] = useState(() => ({ data: fallback, error: null, isLoading: enabled, status: enabled ? 'loading' : 'skipped' }))
  const { markAvailable, markUnavailable } = useCloudStatusActions()

  useEffect(() => {
    let cancelled = false
    if (!enabled) {
      setState({ data: fallbackRef.current, error: null, isLoading: false, status: 'skipped' })
      return () => { cancelled = true }
    }
    if (!convex) {
      const error = new Error('Convex client is not configured.')
      markUnavailable(error, { queryName, component })
      setState({ data: fallbackRef.current, error, isLoading: false, status: 'unavailable' })
      return () => { cancelled = true }
    }

    setState(prev => ({ data: prev.data === undefined ? fallbackRef.current : prev.data, error: null, isLoading: true, status: 'loading' }))
    convex.query(queryName, args || {})
      .then((data) => {
        if (cancelled) return
        markAvailable({ queryName, component })
        setState({ data: data === undefined ? fallbackRef.current : data, error: null, isLoading: false, status: 'success' })
      })
      .catch((error) => {
        if (cancelled) return
        markUnavailable(error, { queryName, component })
        setState({ data: fallbackRef.current, error, isLoading: false, status: 'unavailable' })
      })

    return () => { cancelled = true }
  }, [argsKey, component, convex, enabled, markAvailable, markUnavailable, queryName])

  return state
}

export function useSafeConvexQueryData(queryName, argsOrSkip, fallback = undefined, options = {}) {
  return useSafeConvexQuery(queryName, argsOrSkip, { ...options, fallback }).data
}

export function useOptionalConvexMutation(mutationName) {
  const convex = useConvex()
  const markUnavailable = useStore(s => s.markConvexUnavailable)
  const markAvailable = useStore(s => s.markConvexAvailable)
  return useMemo(() => async (args = {}) => {
    if (!convex) {
      const error = new Error('Convex client is not configured.')
      markUnavailable(error, { mutationName })
      throw error
    }
    try {
      const result = await convex.mutation(mutationName, args)
      markAvailable({ mutationName })
      return result
    } catch (error) {
      markUnavailable(error, { mutationName })
      throw error
    }
  }, [convex, markAvailable, markUnavailable, mutationName])
}

export function useOptionalConvexAction(actionName) {
  const convex = useConvex()
  const markUnavailable = useStore(s => s.markConvexUnavailable)
  const markAvailable = useStore(s => s.markConvexAvailable)
  return useMemo(() => async (args = {}) => {
    if (!convex) {
      const error = new Error('Convex client is not configured.')
      markUnavailable(error, { actionName })
      throw error
    }
    try {
      const result = await convex.action(actionName, args)
      markAvailable({ actionName })
      return result
    } catch (error) {
      markUnavailable(error, { actionName })
      throw error
    }
  }, [actionName, convex, markAvailable, markUnavailable])
}
