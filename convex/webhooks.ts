import { httpAction } from './_generated/server'
import { internal } from './_generated/api'
import { getStripeWebhookSecret } from './stripeConfig'

function parseStripeSignature(header: string | null) {
  if (!header) return { timestamp: null, signatures: [] as string[] }
  const parts = header.split(',').map(part => part.trim())
  const timestampPart = parts.find(part => part.startsWith('t='))
  const signatures = parts.filter(part => part.startsWith('v1=')).map(part => part.slice(3))
  return {
    timestamp: timestampPart ? Number(timestampPart.slice(2)) : null,
    signatures,
  }
}

async function computeHmacSha256(secret: string, payload: string) {
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(payload))
  return Array.from(new Uint8Array(signature)).map((b) => b.toString(16).padStart(2, '0')).join('')
}

function extractSubscriptionData(event: any) {
  const object = event?.data?.object || {}
  const type = String(event?.type || '')

  if (!type.startsWith('customer.subscription.')) {
    return null
  }

  const priceId = object?.items?.data?.[0]?.price?.id || undefined

  return {
    customerId: object.customer || undefined,
    subscriptionId: object.id || undefined,
    status: object.status || undefined,
    priceId,
    currentPeriodEnd: object.current_period_end ? Number(object.current_period_end) * 1000 : undefined,
    cancelAtPeriodEnd: Boolean(object.cancel_at_period_end),
    userId: object.metadata?.userId || undefined,
    customerEmail: object.customer_email || undefined,
  }
}

export const stripeWebhook = httpAction(async (ctx, request) => {
  const secret = getStripeWebhookSecret()
  if (!secret) return new Response('Missing STRIPE_WEBHOOK_SECRET', { status: 500 })

  const signatureHeader = request.headers.get('stripe-signature')
  const body = await request.text()
  const { timestamp, signatures } = parseStripeSignature(signatureHeader)

  if (!timestamp || signatures.length === 0) {
    return new Response('Invalid signature header', { status: 400 })
  }

  const signedPayload = `${timestamp}.${body}`
  const expectedSignature = await computeHmacSha256(secret, signedPayload)
  const signatureMatched = signatures.some(sig => sig === expectedSignature)

  if (!signatureMatched) {
    return new Response('Invalid webhook signature', { status: 400 })
  }

  const fiveMinutesInSeconds = 5 * 60
  const nowSeconds = Math.floor(Date.now() / 1000)
  if (Math.abs(nowSeconds - timestamp) > fiveMinutesInSeconds) {
    return new Response('Webhook timestamp outside tolerance', { status: 400 })
  }

  const event = JSON.parse(body)
  const data = extractSubscriptionData(event)
  if (!data) {
    return new Response(JSON.stringify({ received: true, ignored: true }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  }

  await ctx.runMutation(internal.billing.syncStripeSubscription, {
    eventId: String(event.id || `evt_${Date.now()}`),
    customerId: data.customerId,
    subscriptionId: data.subscriptionId,
    status: data.status,
    priceId: data.priceId,
    currentPeriodEnd: data.currentPeriodEnd,
    cancelAtPeriodEnd: data.cancelAtPeriodEnd,
    userId: data.userId,
    customerEmail: data.customerEmail,
  })

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
})
