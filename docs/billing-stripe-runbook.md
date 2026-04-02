# Stripe Billing Runbook (Public Beta)

Date: 2026-04-01
Scope: Stable Stripe-hosted subscription billing for ShotScribe public beta.

## Billing model (beta)

- One Clerk user maps to one ShotScribe billing owner.
- Launch pricing is a single paid subscription plan (`STRIPE_PRICE_ID`) plus the free local-only tier.
- Stripe-hosted Checkout is used for subscription purchase.
- Stripe-hosted Customer Portal is used for payment-method updates/cancel/reactivate.
- Promo/discount codes are managed in Stripe and entered in Stripe Checkout.
- ShotScribe does not implement a custom promo-code engine.

## Required environment variables

Set these in Convex deployment env:

- `STRIPE_SECRET_KEY` — Stripe secret key for server-side API calls.
- `STRIPE_WEBHOOK_SECRET` — signing secret for the Stripe webhook endpoint.
- `STRIPE_PRICE_ID` — default recurring price ID used by hosted Checkout.

Also required for auth/cloud mode:

- `AUTH_ISSUER_URL`
- `AUTH_AUDIENCE`

## Required Stripe dashboard setup

1. Create (or reuse) a product for ShotScribe cloud access.
2. Create a recurring price and copy its `price_...` ID into `STRIPE_PRICE_ID`.
3. Enable Customer Portal in Stripe Dashboard:
   - Configure subscription management.
   - Configure payment method updates.
   - Configure cancellation/reactivation policy for beta.
4. Configure webhook endpoint pointing to Convex HTTP route:
   - `https://<your-convex-deployment>/stripe/webhook`
5. Subscribe endpoint to events:
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
6. Copy endpoint signing secret into `STRIPE_WEBHOOK_SECRET`.

## Promo-code behavior

- Checkout sessions set `allow_promotion_codes=true`.
- Promotions are created and managed entirely in Stripe Dashboard.
- If a promo is valid, Stripe applies discount and resulting subscription status still syncs through webhooks.

## App-facing billing representation

`billing:getMyEntitlement` is the canonical app-facing snapshot for account billing/access UI:

- `canUseCloudFeatures`
- `subscriptionStatus`
- `billingState` (`none`, `active`, `inactive`, `manual_override_active`)
- `grandfatheredOrComped`
- `checkoutAvailable`
- `portalAvailable`

`billing:syncMyBillingState` is used by `/account` after Checkout success and Portal return to quickly reconcile Stripe state even if webhook delivery is delayed.

Webhook entitlement state is sourced from `customer.subscription.*` events only so subscription price checks are always applied before granting access.

## Manual admin overrides + Stripe coexistence

Account profile override flags:

- `grandfatheredAccess`
- `compedAccess`

Behavior:

- Overrides grant paid-equivalent access even when Stripe subscription is inactive.
- Stripe webhook updates still persist to `billingSubscriptions`.
- Effective access is computed from both sources (Stripe + overrides).
- Account `planTier` is re-synced from effective access (not Stripe-only status), so overrides do not get unintentionally downgraded.

## Manual QA checklist

- [ ] New paid signup: start Checkout, complete payment, return to app root, cloud access enabled.
- [ ] Returning active subscriber: app shows active access and BillingActions opens Stripe portal.
- [ ] Canceled subscription: Stripe cancellation event syncs, access moves to inactive/read-only policy.
- [ ] Payment failure/inactive: failed payment updates subscription status and disables paid cloud capabilities.
- [ ] Comped/grandfathered user: with override enabled and inactive Stripe status, paid cloud access remains enabled.
- [ ] Promo-code checkout: promo code field appears in Stripe Checkout and valid code is applied.
- [ ] Non-launch Stripe price event does not grant entitlement (launch only price id is accepted).

For launch/support operation, also run:
- `docs/public-beta-launch-checklist.md`
- `docs/public-beta-support-checklist.md`

## SiteGround/domain-root compatibility notes

- Checkout success/cancel and portal return URLs use domain root routing (`/?billing=...`).
- No custom billing form/UI is required for hosted Stripe flows.
- Existing local-only mode remains unchanged; billing actions only appear for cloud-auth sessions.
