import React, { useMemo, useState } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { useAuth, useClerk } from '@clerk/clerk-react'
import { runtimeConfig } from '../../config/runtimeConfig'
import { isCloudAuthConfigured } from '../../auth/authConfig'
import AdminFeatureGuard from './AdminFeatureGuard'

const containerStyle = { flex: 1, overflow: 'auto', background: '#0f141b', color: '#E7ECF3', padding: '24px 20px 40px' }
const cardStyle = { border: '1px solid #2A313D', borderRadius: 10, background: '#171C24', padding: 16 }
const buttonStyle = { border: '1px solid #4A5568', background: '#1F2937', color: '#FAF8F4', borderRadius: 6, padding: '8px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }
const inputStyle = { width: '100%', border: '1px solid #374151', background: '#0f172a', color: '#f9fafb', borderRadius: 6, padding: '8px 10px', fontSize: 12 }

function formatDateTime(timestamp) {
  if (!timestamp) return '—'
  try {
    return new Date(timestamp).toLocaleString()
  } catch {
    return '—'
  }
}

function StatTile({ label, value }) {
  return (
    <div style={{ ...cardStyle, padding: 14 }}>
      <div style={{ fontSize: 11, color: '#9AA6BC', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700 }}>{value}</div>
    </div>
  )
}

export default function AdminConsolePage() {
  const { isSignedIn } = useAuth()
  const { openSignIn } = useClerk()
  const [emailInput, setEmailInput] = useState('')
  const [selectedUserId, setSelectedUserId] = useState(null)
  const [feedback, setFeedback] = useState('')
  const [opReason, setOpReason] = useState('')

  const canUseCloudAuth = runtimeConfig.appMode.cloudEnabled && isCloudAuthConfigured()
  const overview = useQuery('admin:getAdminDashboardOverview', { recentLimit: 10 })
  const opsControls = useQuery('admin:getSafeOperationalControls')
  const adminState = useQuery('admin:getMyAdminState')

  const searchedUser = useQuery(
    'admin:findUserByEmailForAdmin',
    emailInput.trim() ? { email: emailInput.trim() } : 'skip',
  )

  const userDetail = useQuery(
    'admin:getAdminUserDetail',
    selectedUserId ? { userId: selectedUserId } : 'skip',
  )

  const setCompedAccess = useMutation('admin:setCompedAccessForUser')
  const setGrandfatheredAccess = useMutation('admin:setGrandfatheredAccessForUser')
  const setAdminRole = useMutation('admin:setAdminRole')
  const setCloudWritesEnabled = useMutation('admin:setCloudWritesEnabled')

  const isAdmin = Boolean(adminState?.isAdmin)

  const loading = overview === undefined || opsControls === undefined || adminState === undefined

  const selectSearchedUser = () => {
    if (!searchedUser?.userId) return
    setSelectedUserId(searchedUser.userId)
    setFeedback('Loaded user details.')
  }

  const currentEmail = userDetail?.user?.email || searchedUser?.email || ''

  const updateComped = async (enabled) => {
    if (!userDetail?.user?.userId) return
    const confirmText = enabled ? 'Grant comped cloud access for this user?' : 'Remove comped cloud access for this user?'
    if (!window.confirm(confirmText)) return
    await setCompedAccess({ userId: userDetail.user.userId, enabled })
    setFeedback(`Comped access ${enabled ? 'enabled' : 'cleared'} for ${userDetail.user.email || 'user'}.`)
  }

  const updateGrandfathered = async (enabled) => {
    if (!userDetail?.user?.userId) return
    const confirmText = enabled ? 'Grant grandfathered cloud access for this user?' : 'Remove grandfathered cloud access for this user?'
    if (!window.confirm(confirmText)) return
    await setGrandfatheredAccess({ userId: userDetail.user.userId, enabled })
    setFeedback(`Grandfathered access ${enabled ? 'enabled' : 'cleared'} for ${userDetail.user.email || 'user'}.`)
  }

  const updateAdmin = async (enabled) => {
    const targetEmail = currentEmail
    if (!targetEmail) return
    const confirmText = enabled ? `Grant admin role to ${targetEmail}?` : `Revoke admin role from ${targetEmail}?`
    if (!window.confirm(confirmText)) return
    await setAdminRole({ email: targetEmail, isAdmin: enabled })
    setFeedback(`Admin role ${enabled ? 'granted' : 'revoked'} for ${targetEmail}.`)
  }

  const toggleCloudWrites = async (enabled) => {
    const confirmText = enabled
      ? 'Enable cloud writes globally?'
      : 'Disable cloud writes globally for incident mitigation?'
    if (!window.confirm(confirmText)) return
    await setCloudWritesEnabled({ enabled, reason: opReason.trim() || undefined })
    setFeedback(`cloud_writes_enabled set to ${enabled ? 'ON' : 'OFF'}.`)
  }

  const summary = useMemo(() => {
    if (!overview?.totals) return []
    return [
      { label: 'Total signups', value: overview.totals.totalSignups },
      { label: 'Total paid users', value: overview.totals.totalPaidUsers },
      { label: 'Active subscriptions', value: overview.totals.totalActiveSubscriptions },
      { label: 'Grandfathered/comped users', value: overview.totals.totalGrandfatheredOrCompedUsers },
      { label: 'Cloud projects (all)', value: overview.totals.totalCloudProjects },
      { label: 'Cloud projects (active)', value: overview.totals.totalActiveCloudProjects },
      { label: 'Shared projects', value: overview.totals.totalSharedProjects },
      { label: 'Shared memberships', value: overview.totals.totalSharedMemberships },
    ]
  }, [overview])

  if (!canUseCloudAuth) {
    return <div style={containerStyle}><div style={{ maxWidth: 1080, margin: '0 auto' }}><div style={cardStyle}>Cloud auth is not configured. Admin console is unavailable.</div></div></div>
  }

  if (!isSignedIn) {
    return (
      <div style={containerStyle}>
        <div style={{ maxWidth: 1080, margin: '0 auto', display: 'grid', gap: 12 }}>
          <h2 style={{ margin: 0 }}>Internal Admin Console</h2>
          <div style={cardStyle}>Sign in as an admin to access this page.</div>
          <div><button type="button" style={buttonStyle} onClick={() => openSignIn({ afterSignInUrl: '/admin', afterSignUpUrl: '/admin' })}>Sign in</button></div>
        </div>
      </div>
    )
  }

  return (
    <AdminFeatureGuard
      loadingFallback={<div style={containerStyle}><div style={{ maxWidth: 1080, margin: '0 auto' }}><div style={cardStyle}>Loading admin access…</div></div></div>}
      fallback={<div style={containerStyle}><div style={{ maxWidth: 1080, margin: '0 auto' }}><div style={{ ...cardStyle, borderColor: '#7f1d1d', color: '#fca5a5' }}>Forbidden: admin role required.</div></div></div>}
    >
      <div style={containerStyle}>
        <div style={{ maxWidth: 1080, margin: '0 auto', display: 'grid', gap: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
            <h2 style={{ margin: 0 }}>Internal Admin Console</h2>
            <button type="button" style={buttonStyle} onClick={() => window.location.assign('/')}>Back to app</button>
          </div>

          {feedback ? <div style={{ ...cardStyle, borderColor: '#14532d', color: '#bbf7d0' }}>{feedback}</div> : null}

          {loading ? <div style={cardStyle}>Loading dashboard metrics…</div> : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
              {summary.map((item) => <StatTile key={item.label} label={item.label} value={item.value} />)}
            </div>
          )}

          <div style={{ ...cardStyle, display: 'grid', gap: 10 }}>
            <div style={{ fontSize: 12, color: '#9AA6BC', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Safe operational controls</div>
            <div style={{ fontSize: 13 }}><strong>cloud_writes_enabled:</strong> {opsControls?.cloudWritesEnabled ? 'ON' : 'OFF'} (last updated {formatDateTime(opsControls?.cloudWritesUpdatedAt)})</div>
            <input style={inputStyle} value={opReason} onChange={(e) => setOpReason(e.target.value)} placeholder="Reason (recommended for audit trail)" />
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" style={buttonStyle} onClick={() => toggleCloudWrites(true)}>Enable cloud writes</button>
              <button type="button" style={buttonStyle} onClick={() => toggleCloudWrites(false)}>Disable cloud writes</button>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div style={{ ...cardStyle, display: 'grid', gap: 8 }}>
              <div style={{ fontSize: 12, color: '#9AA6BC', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Recent signups</div>
              {(overview?.recentSignups || []).map((entry) => (
                <div key={entry.userId} style={{ borderTop: '1px solid #2A313D', paddingTop: 8 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{entry.email || '(no email)'}</div>
                  <div style={{ fontSize: 12, color: '#9AA6BC' }}>Joined {formatDateTime(entry.createdAt)}</div>
                </div>
              ))}
            </div>

            <div style={{ ...cardStyle, display: 'grid', gap: 8 }}>
              <div style={{ fontSize: 12, color: '#9AA6BC', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Recent subscription changes</div>
              {(overview?.recentSubscriptionChanges || []).length === 0 ? <div style={{ fontSize: 12, color: '#9AA6BC' }}>No subscription records yet.</div> : null}
              {(overview?.recentSubscriptionChanges || []).map((entry) => (
                <div key={entry.subscriptionId} style={{ borderTop: '1px solid #2A313D', paddingTop: 8 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{entry.status}</div>
                  <div style={{ fontSize: 12, color: '#9AA6BC' }}>Updated {formatDateTime(entry.updatedAt)}</div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ ...cardStyle, display: 'grid', gap: 8 }}>
            <div style={{ fontSize: 12, color: '#9AA6BC', textTransform: 'uppercase', letterSpacing: '0.06em' }}>User search by email</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input style={inputStyle} value={emailInput} onChange={(e) => setEmailInput(e.target.value)} placeholder="user@shot-scribe.com" />
              <button type="button" style={buttonStyle} onClick={selectSearchedUser} disabled={!searchedUser?.userId}>Inspect user</button>
            </div>
            {emailInput.trim() && !searchedUser ? <div style={{ fontSize: 12, color: '#9AA6BC' }}>Searching…</div> : null}
            {searchedUser?.userId ? <div style={{ fontSize: 12, color: '#bbf7d0' }}>Found: {searchedUser.email} ({searchedUser.name || 'No name'})</div> : null}
          </div>

          {userDetail ? (
            <div style={{ ...cardStyle, display: 'grid', gap: 10 }}>
              <div style={{ fontSize: 15, fontWeight: 700 }}>User detail: {userDetail.user.email || userDetail.user.userId}</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 8 }}>
                <div><strong>Billing state:</strong> {userDetail.billing.billingState}</div>
                <div><strong>Subscription:</strong> {userDetail.billing.subscriptionStatus || 'none'}</div>
                <div><strong>Cloud access:</strong> {userDetail.cloudAccess.canUseCloudFeatures ? 'Active' : 'Local-only / read-only'}</div>
                <div><strong>Plan tier:</strong> {userDetail.planFlags.planTier}</div>
                <div><strong>Comped:</strong> {userDetail.planFlags.compedAccess ? 'Yes' : 'No'}</div>
                <div><strong>Grandfathered:</strong> {userDetail.planFlags.grandfatheredAccess ? 'Yes' : 'No'}</div>
                <div><strong>Owned projects:</strong> {userDetail.projectCounts.owned}</div>
                <div><strong>Shared projects:</strong> {userDetail.projectCounts.shared}</div>
                <div><strong>Admin:</strong> {userDetail.admin.isAdmin ? 'Yes' : 'No'}</div>
              </div>
              <div style={{ borderTop: '1px solid #2A313D', paddingTop: 8, fontSize: 12, color: '#9AA6BC' }}>
                Joined {formatDateTime(userDetail.user.createdAt)} · Last seen {formatDateTime(userDetail.user.lastSeenAt)}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                <button type="button" style={buttonStyle} onClick={() => updateComped(true)}>Set comped</button>
                <button type="button" style={buttonStyle} onClick={() => updateComped(false)}>Clear comped</button>
                <button type="button" style={buttonStyle} onClick={() => updateGrandfathered(true)}>Set grandfathered</button>
                <button type="button" style={buttonStyle} onClick={() => updateGrandfathered(false)}>Clear grandfathered</button>
                <button type="button" style={buttonStyle} onClick={() => updateAdmin(true)}>Grant admin</button>
                <button type="button" style={buttonStyle} onClick={() => updateAdmin(false)}>Revoke admin</button>
              </div>
            </div>
          ) : null}

          {isAdmin ? <div style={{ fontSize: 12, color: '#9AA6BC' }}>Stripe promo/coupon creation remains in Stripe Dashboard by design.</div> : null}
        </div>
      </div>
    </AdminFeatureGuard>
  )
}
