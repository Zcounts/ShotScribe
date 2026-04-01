function readEnv(name: string) {
  const value = process.env[name]
  if (typeof value !== 'string') return ''
  return value.trim()
}

export function getStripeSecretKey() {
  return readEnv('STRIPE_SECRET_KEY')
}

export function getStripeWebhookSecret() {
  return readEnv('STRIPE_WEBHOOK_SECRET')
}

export function getPrimaryStripePriceId() {
  return readEnv('STRIPE_PRICE_ID')
}

export function getStripeBillingConfig() {
  const secretKey = getStripeSecretKey()
  const priceId = getPrimaryStripePriceId()
  return {
    secretKey,
    priceId,
    checkoutAvailable: Boolean(secretKey && priceId),
    portalAvailable: Boolean(secretKey),
  }
}
