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
