import React, { useMemo, useState } from 'react'
import { useAction, useQuery } from 'convex/react'

const buttonStyle = {
  border: '1px solid #6B7280',
  background: '#111827',
  color: '#FAF8F4',
  borderRadius: 6,
  padding: '4px 10px',
  fontSize: 11,
  fontWeight: 600,
  cursor: 'pointer',
}

export default function BillingActions({ compact = false }) {
  const entitlement = useQuery('billing:getMyEntitlement')
  const createCheckoutSession = useAction('billing:createCheckoutSession')
  const [isLoading, setIsLoading] = useState(false)

  const label = useMemo(() => {
    if (entitlement?.canUseCloudFeatures) return compact ? 'Pro active' : 'Cloud access active'
    if (entitlement?.subscriptionStatus) return `Status: ${entitlement.subscriptionStatus}`
    return compact ? 'Upgrade' : 'Upgrade for cloud'
  }, [compact, entitlement?.canUseCloudFeatures, entitlement?.subscriptionStatus])

  const openCheckout = async () => {
    setIsLoading(true)
    try {
      const origin = window.location.origin
      const result = await createCheckoutSession({
        successUrl: `${origin}/?billing=success`,
        cancelUrl: `${origin}/?billing=cancelled`,
      })
      if (result?.url) {
        window.location.assign(result.url)
      }
    } catch (error) {
      // eslint-disable-next-line no-alert
      alert(error?.message || 'Unable to start checkout')
    } finally {
      setIsLoading(false)
    }
  }

  if (!entitlement?.checkoutAvailable || entitlement?.canUseCloudFeatures) {
    return null
  }

  return (
    <button
      type="button"
      style={buttonStyle}
      onClick={openCheckout}
      disabled={isLoading}
      title="Upgrade to enable cloud creation, sharing, and sync"
    >
      {isLoading ? 'Starting checkout…' : label}
    </button>
  )
}
