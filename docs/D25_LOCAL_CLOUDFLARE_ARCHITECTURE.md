> **Update (15 November 2026):** Google OAuth owner exemption, test payment UI and explicitly gated live Razorpay support are documented in [D25 owner Google + Razorpay](D25_RAZORPAY_OWNER_GOOGLE_SETUP.md). The original narrative below describes the initial TEST-only architecture and is not a live readiness claim.

# D25 Quantum Workspace: local quantum engine + zero-upfront licensing

**Date:** 15 November 2026. **Status:** DEVELOPMENT — NOT APPROVED FOR PAID MICROSOFT STORE RELEASE.

MAH Quantum is the owner and parent company. Devashri S Industries, a division of MAH Quantum, develops D25 Quantum Workspace.

## Confirmed compute architecture

The scientific quantum engine executes on the CUSTOMER'S Windows CPU/RAM. No circuit workload, vectors or quantum computation are sent to a server by this licensing design.

- Windows desktop Tauri: local circuit simulation, supported 1000+ research worker, equipment and scientific models
- Firebase Spark Authentication: email/password and Google account verification. Passwords stay in Firebase Authentication, never D1 or Firestore.
- Cloudflare Workers Free: validates signed Firebase ID tokens, verifies Razorpay TEST subscriptions and authorizes local execution launches
- Cloudflare D1 Free: per-user subscription, captured charge, refund, admin audit and shared 20-launch/five-hour cooldown
- Razorpay TEST: INR 500/month/one named user, 12 recurring billing periods per mandate. No live charge in this implementation.

**Intellectual property warning:** Quantum engine JavaScript shipped to customers is extractable. Minification, obfuscation, signed Windows packages, and login gates cannot guarantee secrecy or block a modified offline copy. Porting new unpublished solvers to compiled native Rust raises the cost of reverse engineering but cannot make it impossible. Previous source in public GitHub history is already publicly accessible.

## Cloudflare Free setup (local terminal)

A Cloudflare Worker and D1 database cannot be provisioned without your authorized Cloudflare account. Keep your plan Free. Do not enable paid Workers or cloud quantum compute.

1. In a command prompt opened inside the project's cloudflare directory:

    npx wrangler login
    npx wrangler d1 create d25-license --location apac

2. Copy the D1 database UUID from the result and replace REPLACE_WITH_D1_DATABASE_UUID in cloudflare/wrangler.toml.
3. The Firebase project ID is set to ds-quantum-267dd; verify this is the intended project. If the project is shared with another app, do not deploy the repository's deny-all Firestore rules. Cloudflare licensing does not require Firestore writes.
4. Create the D1 tables and deploy the Worker:

    npx wrangler d1 migrations apply d25-license --remote
    npx wrangler deploy

5. Your Cloudflare Worker URL will be similar to https://d25-license.YOUR_SUBDOMAIN.workers.dev. Test its /v1/health route. It does not require Blaze or Firebase Cloud Functions.

## Razorpay TEST setup

In the Razorpay dashboard, switch to TEST, enable Subscriptions and create a fixed plan: INR 500.00 per month, interval 1. The repository contains scripts/d25-razorpay-test-plan.mjs to verify/create a test-only plan using locally configured test credentials.

Set the actual plan ID (plan_...) in cloudflare/wrangler.toml under RAZORPAY_TEST_PLAN_ID. Use private Cloudflare secret prompts (do not write secrets into the public TOML file, chat, GitHub or customer desktop):

    npx wrangler secret put RAZORPAY_TEST_KEY_ID
    npx wrangler secret put RAZORPAY_TEST_KEY_SECRET
    npx wrangler secret put RAZORPAY_TEST_WEBHOOK_SECRET

Set D25_ENABLE_TEST_CHECKOUT to true only after configuring the three test secrets and test plan. Redeploy the Worker. Register the exact Razorpay TEST webhook URL https://d25-license.YOUR_SUBDOMAIN.workers.dev/v1/webhook, with a separate webhook HMAC secret, for subscription.charged, cancelled, halted, pending, completed, paused, and payment.refunded.

No live keys are accepted. Payment activation requires a signed webhook, mapped customer subscription and captured INR 500 monthly transaction. D1 records events and charges idempotently. Failed/ambiguous mandate creation locks the account for manual reconciliation.

## Windows commercial build configuration

Create a local gitignored apps/web/.env.production.local (PUBLIC client configuration ONLY):

    VITE_D25_FIREBASE_API_KEY=YOUR_FIREBASE_WEB_API_KEY
    VITE_D25_API_BASE=https://d25-license.YOUR_SUBDOMAIN.workers.dev/v1

Do not define VITE_D25_COMPUTE_API_BASE: there is no cloud quantum engine. Obtain the Firebase Web API key from Project settings → General → Your apps → Web app configuration. Firebase Web API keys are public client identifiers; never include service-account credentials or Razorpay secrets.

Then run these commands from repository root:

    npm ci
    npm run test:license
    npm test
    npm run desktop:build:connected
    node scripts/d25_store_preflight.mjs --enforce

The final gate is intentionally NO_GO until genuine payment and device acceptance, Store package identity/certification and IP protection limitations are accepted.

## Cloudflare administration

The browser-based Google admin screen uses VITE_D25_GOOGLE_CLIENT_ID, VITE_D25_FIREBASE_API_KEY and VITE_D25_ADMIN_API_BASE=https://d25-license.YOUR_SUBDOMAIN.workers.dev/v1/admin in its website configuration. Add that site's exact HTTPS origin to D25_ALLOWED_ORIGINS. The backend separately restricts administrators to explicitly verified Firebase UIDs in D25_ADMIN_GOOGLE_UIDS, configured using a private Cloudflare secret prompt (npx wrangler secret put D25_ADMIN_GOOGLE_UIDS), plus a signed Google sign-in token. Never grant admin access by email string alone.

D1 administration can view paid accounts, monthly collected payment and checkout-account charts, and disable D25 access, cancel renewals or revoke licenses with audit entries. It does NOT globally delete or disable Firebase Authentication identities. Firebase users who never logged in to the D25 licensing system are not listed.

## Security and billing limits

The official Windows application calls /v1/quota/reserve with a unique UUID before a local launch. D1 uses atomic SQL batches and a unique reservation ID, so the official client shares 20 reservations across devices, followed by five hours of cooldown. Client clock resets and clearing browser storage do not reset D1 quotas.

This is not tamperproof DRM: a technically capable person with the local JavaScript engine can extract and run it outside our interface.

Cloudflare Workers Free and D1 Free have traffic/storage/CPU limits, so there is no guarantee of zero operating costs at unlimited scale. Standard Razorpay transaction fees apply to real payments. Customers must not be billed until the paid-product flow, refunds, tax, support and privacy policies work reliably.

**Release blockers:** Cloudflare deployment not performed, no real Razorpay test transaction verified, no actual paid activation or WACK test, real Microsoft Store publisher identity not configured, and source extraction risk unresolved.

## Cloudflare Free request conservation

The commercial desktop checks the displayed execution allowance every 2 minutes and subscription status every 5 minutes (plus window-visibility updates); every actual execution still makes its own fresh D1 license and quota reservation request. This avoids the earlier 5-second idle polling that would unnecessarily exhaust Cloudflare Workers Free daily request quotas. Longer display refresh intervals do not bypass server enforcement.
