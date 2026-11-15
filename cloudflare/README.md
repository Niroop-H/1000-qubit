> **Updated plan (15 November 2026):** TEST and LIVE Razorpay support now use separate Workers and D1 databases. Exactly one Google-verified Firebase UID can be exempted from payment via Cloudflare secrets; customer simulation stays local. See [Owner Google and Razorpay setup](../docs/D25_RAZORPAY_OWNER_GOOGLE_SETUP.md). LIVE mode is OFF until merchant KYC and acceptance.

# D25 Cloudflare Workers Free licensing service

All quantum simulation stays on the customer's machine. This Worker handles Firebase Auth, ₹500 monthly Razorpay TEST payments, durable D1 entitlements, server-side launch quotas and Google-admin controls.

Setup: see ../docs/D25_LOCAL_CLOUDFLARE_ARCHITECTURE.md.

Run from this directory on an authorized computer:

    npx wrangler login
    npx wrangler d1 create d25-license --location apac
    # Copy the returned D1 UUID into wrangler.toml
    npx wrangler d1 migrations apply d25-license --remote
    npx wrangler deploy
    npx wrangler secret put RAZORPAY_TEST_KEY_ID
    npx wrangler secret put RAZORPAY_TEST_KEY_SECRET
    npx wrangler secret put RAZORPAY_TEST_WEBHOOK_SECRET

No live keys are allowed. No cloud quantum compute. Don't enable test checkout until the test plan and webhook have been configured.

Tests: node --test test/*.test.mjs

The repo remains public and client-side quantum workers can be copied; this is *not* trade-secret encryption or anti-reverse-engineering certification.
