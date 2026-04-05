import React, { useMemo, useState } from 'react'
import { useAction } from 'convex/react'
import useStore from '../../store'

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
  const entitlement = useStore(s => s.entitlement)
  const createCheckoutSession = useAction('billing:createCheckoutSession')
  const createPortalSession = useAction('billing:createPortalSession')
  const [isLoading, setIsLoading] = useState(false)
  const [isPortalLoading, setIsPortalLoading] = useState(false)

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

  const openPortal = async () => {
    setIsPortalLoading(true)
    try {
      const origin = window.location.origin
      const result = await createPortalSession({
        returnUrl: `${origin}/?billing=portal-return`,
      })
      if (result?.url) {
        window.location.assign(result.url)
      }
    } catch (error) {
      // eslint-disable-next-line no-alert
      alert(error?.message || 'Unable to open billing portal')
    } finally {
      setIsPortalLoading(false)
    }
  }

  const showPortal = Boolean(entitlement?.portalAvailable && entitlement?.subscriptionStatus)
  if (showPortal) {
    return (
      <button
        type="button"
        style={buttonStyle}
        onClick={openPortal}
        disabled={isPortalLoading}
        title="Manage payment method, invoices, and cancellation in Stripe"
      >
        {isPortalLoading ? 'Opening portal…' : compact ? 'Manage billing' : 'Open billing portal'}
      </button>
    )
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
