export function logTelemetry(eventName, payload = {}) {
  if (typeof console === 'undefined') return
  const time = new Date().toISOString()
  console.info('[telemetry]', eventName, { time, ...payload })
}
