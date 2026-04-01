export async function writeOperationalEvent(ctx: any, {
  level = 'info',
  event,
  details,
}: {
  level?: 'info' | 'warn' | 'error',
  event: string,
  details?: Record<string, any>,
}) {
  const createdAt = Date.now()
  const payload = {
    level,
    event,
    details: details || null,
    createdAt,
  }

  console[level === 'error' ? 'error' : 'log']('[ops]', JSON.stringify(payload))

  try {
    await ctx.db.insert('operationalEvents', payload)
  } catch (error: any) {
    console.error('[ops] failed_to_persist_event', error?.message || String(error || 'unknown'))
  }
}
