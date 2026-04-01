# Account & Billing Page

## Route
- Path: `/account`
- Production URL: `https://app.shot-scribe.com/account`
- Routing model: domain-root SPA fallback (`public/_redirects` keeps `/* -> /index.html`), so direct loads on `/account` resolve in the app shell.

## Entry points
- Session bar button: **Account**
- Direct URL open: `/account`
- In-page back navigation: **Back to app** button returns to `/`

## Data sources
- Entitlement/billing state: `billing:getMyEntitlement`
- Profile basics: Clerk user identity + `users:currentUser`

## What members can do here
- View profile basics (name/email)
- See plan, access type, billing state, subscription status, renewal/cancel-at-period-end, and cloud access state
- Upgrade (when eligible)
- Open Stripe customer portal via **Manage billing**
- Sign out

## Manual QA checklist
1. Signed-out user opens `/account` and sees sign-in prompt.
2. Free/local-only user sees clear free/local-only explanation and **Upgrade** action (if checkout configured).
3. Paid active user sees paid state and cloud access active.
4. Grandfathered/comped user sees manual override explanation.
5. Inactive subscription user sees read-only explanation.
6. **Manage billing** opens Stripe customer portal and returns to `/account`.
7. **Sign out** works from `/account`.
8. **Back to app** returns to `/` and normal project tabs still function.
