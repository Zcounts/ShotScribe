import React, { useMemo, useState } from 'react'
import { useAction, useQuery } from 'convex/react'
import { useAuth, useClerk, useUser } from '@clerk/clerk-react'
import { runtimeConfig } from '../../config/runtimeConfig'
import { isCloudAuthConfigured } from '../../auth/authConfig'

const containerStyle = { flex: 1, overflow: 'auto', background: '#111318', color: '#E7ECF3', padding: '24px 20px 32px' }
const cardStyle = { border: '1px solid #2A313D', borderRadius: 10, background: '#171C24', padding: 16 }
const labelStyle = { fontSize: 12, color: '#9AA6BC', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }
const valueStyle = { fontSize: 14, color: '#F5F7FA', fontWeight: 600 }
const buttonStyle = { border: '1px solid #4A5568', background: '#1F2937', color: '#FAF8F4', borderRadius: 6, padding: '8px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }

function formatDate(timestamp) {
  if (!timestamp) return '—'
  try {
    return new Date(timestamp).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
  } catch {
    return '—'
  }
}

function summarizeState(entitlement) {
  if (!entitlement) return 'Checking billing and access…'
  if (entitlement.grandfatheredOrComped) return 'Grandfathered/comped account: cloud access is active by manual override.'
  if (entitlement.canUseCloudFeatures) return 'Paid account: cloud access is active.'
  if (!entitlement.subscriptionStatus) return 'Free/local-only account: use local workflows now, or upgrade for cloud projects and collaboration.'
  return 'Read-only cloud access: billing is inactive. You can view, but cloud writes stay blocked until billing is restored.'
}

export default function AccountPage() {
  const { isSignedIn } = useAuth()
  const { user, isLoaded: userLoaded } = useUser()
  const { signOut, openSignIn } = useClerk()
  const entitlement = useQuery('billing:getMyEntitlement')
  const cloudUser = useQuery('users:currentUser')
  const createCheckoutSession = useAction('billing:createCheckoutSession')
  const createPortalSession = useAction('billing:createPortalSession')
  const [isCheckoutLoading, setIsCheckoutLoading] = useState(false)
  const [isPortalLoading, setIsPortalLoading] = useState(false)
  const [billingError, setBillingError] = useState('')
  const navigateTo = (path) => {
    if (typeof window === 'undefined') return
    if (window.location.pathname === path) return
    window.history.pushState({}, '', path)
    window.dispatchEvent(new PopStateEvent('popstate'))
  }

  const canUseCloudAuth = runtimeConfig.appMode.cloudEnabled && isCloudAuthConfigured()
  const profileName = user?.fullName || cloudUser?.user?.name || cloudUser?.user?.email || 'Member'
  const accountEmail = user?.primaryEmailAddress?.emailAddress || cloudUser?.user?.email || '—'
  const accessType = useMemo(() => {
    if (!entitlement) return 'Loading…'
    if (entitlement.grandfatheredOrComped) return 'Grandfathered/Comped'
    return entitlement.canUseCloudFeatures ? 'Paid' : 'Free / Local-only'
  }, [entitlement])

  const planName = entitlement?.canUseCloudFeatures ? 'ShotScribe Pro' : 'ShotScribe Free'
  const renewalLabel = entitlement?.cancelAtPeriodEnd
    ? `Cancels at period end (${formatDate(entitlement.currentPeriodEnd)})`
    : `Renews on ${formatDate(entitlement.currentPeriodEnd)}`

  const openCheckout = async () => {
    setBillingError('')
    setIsCheckoutLoading(true)
    try {
      const origin = window.location.origin
      const result = await createCheckoutSession({ successUrl: `${origin}/account?billing=success`, cancelUrl: `${origin}/account?billing=cancelled` })
      if (result?.url) window.location.assign(result.url)
    } catch (error) {
      setBillingError(error?.message || 'Unable to start checkout.')
    } finally {
      setIsCheckoutLoading(false)
    }
  }

  const openPortal = async () => {
    setBillingError('')
    setIsPortalLoading(true)
    try {
      const origin = window.location.origin
      const result = await createPortalSession({ returnUrl: `${origin}/account?billing=portal-return` })
      if (result?.url) window.location.assign(result.url)
    } catch (error) {
      setBillingError(error?.message || 'Unable to open billing portal.')
    } finally {
      setIsPortalLoading(false)
    }
  }

  if (!canUseCloudAuth) return <div style={containerStyle}><div style={{ maxWidth: 860, margin: '0 auto' }}><div style={cardStyle}>Cloud auth is not configured. Local-only workflows remain available.</div></div></div>
  if (!userLoaded || entitlement === undefined || cloudUser === undefined) return <div style={containerStyle}><div style={{ maxWidth: 860, margin: '0 auto' }}><div style={cardStyle}>Loading account details…</div></div></div>

  if (!isSignedIn) {
    return (
      <div style={containerStyle}>
        <div style={{ maxWidth: 860, margin: '0 auto', display: 'grid', gap: 12 }}>
          <h2 style={{ margin: 0 }}>Account & Billing</h2>
          <div style={cardStyle}>Sign in to view account profile and billing status.</div>
          <div><button type="button" style={buttonStyle} onClick={() => openSignIn({ afterSignInUrl: '/account', afterSignUpUrl: '/account' })}>Sign in</button></div>
        </div>
      </div>
    )
  }

  return (
    <div style={containerStyle}>
      <div style={{ maxWidth: 860, margin: '0 auto', display: 'grid', gap: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
          <h2 style={{ margin: 0 }}>Account & Billing</h2>
          <button type="button" style={buttonStyle} onClick={() => navigateTo('/')}>Back to app</button>
        </div>
        <div style={{ ...cardStyle, display: 'grid', gap: 10 }}><div style={labelStyle}>Status summary</div><div>{summarizeState(entitlement)}</div></div>
        <div style={{ ...cardStyle, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
          <div><div style={labelStyle}>Profile</div><div style={valueStyle}>{profileName}</div></div>
          <div><div style={labelStyle}>Email</div><div style={valueStyle}>{accountEmail}</div></div>
          <div><div style={labelStyle}>Plan</div><div style={valueStyle}>{planName}</div></div>
          <div><div style={labelStyle}>Access type</div><div style={valueStyle}>{accessType}</div></div>
          <div><div style={labelStyle}>Billing status</div><div style={valueStyle}>{entitlement?.billingState || 'none'}</div></div>
          <div><div style={labelStyle}>Subscription status</div><div style={valueStyle}>{entitlement?.subscriptionStatus || 'none'}</div></div>
          <div><div style={labelStyle}>Renewal</div><div style={valueStyle}>{entitlement?.currentPeriodEnd ? renewalLabel : '—'}</div></div>
          <div><div style={labelStyle}>Cloud access</div><div style={valueStyle}>{entitlement?.canUseCloudFeatures ? 'Active' : 'Local-only / read-only'}</div></div>
        </div>
        <div style={{ ...cardStyle, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {entitlement?.checkoutAvailable && !entitlement?.canUseCloudFeatures ? <button type="button" style={buttonStyle} onClick={openCheckout} disabled={isCheckoutLoading}>{isCheckoutLoading ? 'Starting checkout…' : 'Upgrade'}</button> : null}
          {entitlement?.portalAvailable ? <button type="button" style={buttonStyle} onClick={openPortal} disabled={isPortalLoading}>{isPortalLoading ? 'Opening portal…' : 'Manage billing'}</button> : null}
          <button type="button" style={buttonStyle} onClick={() => signOut({ redirectUrl: '/account' })}>Sign out</button>
        </div>
        {billingError ? <div style={{ ...cardStyle, borderColor: '#7F1D1D', color: '#FCA5A5' }}>{billingError}</div> : null}
      </div>
    </div>
  )
}
