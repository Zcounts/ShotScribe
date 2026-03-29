import { useEffect, useRef } from 'react'

const isDev = import.meta.env.DEV

export function devPerfLog(label, payload = {}) {
  if (!isDev) return
  console.debug(`[perf] ${label}`, payload)
}

export function useDevRenderCounter(label, instanceId) {
  const countRef = useRef(0)
  useEffect(() => {
    if (!isDev) return
    countRef.current += 1
    if (countRef.current <= 5 || countRef.current % 25 === 0) {
      console.debug(`[perf] render:${label}`, { instanceId, count: countRef.current })
    }
  })
}
