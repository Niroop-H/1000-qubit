# D25 Quantum Workspace — ₹500 / named user Razorpay commerce plan

**Status: TESTED SIGNATURE VALIDATION PRIMITIVES ONLY — NO LIVE CHECKOUT OR LICENSE ISSUANCE.**
No customer should be charged until licensing, privacy, refund and support flows are operational.

**Product:** D25 Quantum Workspace  
**Developed by:** Devashri S Industries, a division of **MAH Quantum**  
**Parent company and copyright holder:** **MAH Quantum**

## Sales model (proposed, subject to final terms)

- One-time checkout of **₹500 per named user**, charged in INR as **50,000 paise**.
- One purchase licenses one user account/seat; not a floating shared-license pool. License duration, transfer policy, number of devices, future upgrades, refund policy, support and taxation must be agreed before sales start. One-time payment must not be marketed as a guaranteed lifetime service.
- Users install D25 Quantum Workspace for free through the Microsoft Store and choose an optional secure **Activate/Buy ₹500** flow after initial install. The Store listing and in-app purchase confirmation must explicitly mention price and third-party Razorpay processing.
- Microsoft Store **non-game Windows applications** can use secure third-party commerce for digital in-app purchases, subject to Microsoft Store Policy 10.8. The purchase flow must authenticate the user, identify Razorpay, obtain confirmation and comply with refund/privacy rules. During Partner Center submission declare the third-party purchasing functionality.
- A direct paid Microsoft Store app listing uses Store checkout for the *initial download*; do **not** also charge the user ₹500 through Razorpay for the same entitlement.

## Provenance of the payment dashboard screenshot

The supplied screenshot shows a Razorpay dashboard with a payment handle and payment products. It does **not** establish completion of Razorpay KYC, production API credentials, account settlement readiness, supported international billing, or whether the linked merchant legal name matches the Microsoft Partner Center publisher. Verify all of those in the business dashboard before enabling live checkout.

## Target implementation (NOT yet shipped)

1. **Accounts:** An authenticated, email-verified D25 user account hosted on a trusted MAH Quantum service. No desktop-embedded secrets. Treat app installations and user identities separately.
2. **Checkout:** A MAH server creates a Razorpay order, binds the generated `order_id` to the signed-in user and fixed price 50,000 paise, currency INR, product SKU and unique purchase ID in a durable database. Serve official Razorpay Checkout or a secure hosted Razorpay Payment Link in the user's browser. Never accept client-provided price or entitlement.
3. **Validation:** Server verifies Razorpay checkout signature using the *persisted server order ID* and then independently retrieves actual **captured** payment status/amount/currency/order ID from Razorpay, or processes a signature-verified webhook. Never unlock based on a redirect URL or a browser callback alone.
4. **Webhook:** Validate HMAC-SHA256 against the **raw** bytes using a different Razorpay webhook secret; record the `x-razorpay-event-id` in durable storage to ignore duplicates; handle late/out-of-order events, refunded/reversed payments and verification retries.
5. **License:** In one database transaction, associate a uniquely captured payment with exactly one verified user, create a revocable entitlement and audit log. Protect against webhook duplicates and payment replays. Never email long-lived signing keys or store them in client code.
6. **Execution:** Entitlements and any **enforceable** usage limit must be checked at the server-side execution boundary. The existing 20-run/5-hour local counter can remain a convenient UX indicator but is not secure against a patched app. Valuable proprietary simulation routines should run only on MAH-managed infrastructure.
7. **Recovery:** Customer can sign back in and restore the license after a new PC install. Document reasonable device limits and support-assisted transfer; do not bind to raw IP address. Include delete/export/privacy requests and a refund entitlement-revocation process.
8. **Reliability:** Payment state must survive restarts, deploys and multiple instances; don't rely on an in-memory map or a local SQLite file on an ephemeral serverless host. Add a durable store, concurrency control, reconciliation jobs, logs and tested disaster recovery.

## Server secrets required later (NEVER in desktop, GitHub or chat)

In the **server deployment's environment variables** only:

```text
RAZORPAY_KEY_ID=(live/test key identifier)
RAZORPAY_KEY_SECRET=(matching server-only Razorpay secret)
RAZORPAY_WEBHOOK_SECRET=(independent server-only webhook secret)
D25_DATABASE_URL=(durable server-only database connection)
D25_LICENSE_SIGNING_KEY=(server-only signing secret)
```

The key identifier is not a signing secret, but it should still be distributed through configuration rather than copied into public examples with active credentials. Keep test/live environment values separate. Never use a payment handle screenshot as a substitute for API credentials.

**Current code:** `apps/engine/src/commerce/d25-razorpay.ts` verifies Razorpay checkout and webhook HMAC and verifies captured payment fields; tests in `apps/engine/src/test/d25-commerce.test.ts`. They do NOT connect to Razorpay, create or capture payments, grant licenses or enable live charging. A secure server-side purchase API, persistent schema, authenticated UI and test/live Razorpay configuration must be implemented and verified separately.

## ₹500 arithmetic and fees

Razorpay currently advertises standard **2% platform processing fees plus GST on those fees**, with method-specific and promotional exceptions. The amount settled may be less than ₹500. Legal GST collection on the **software sale itself** is a separate decision: determine customer tax-inclusive/exclusive pricing, invoicing, refund rules, international pricing and merchant tax status with the business's accountant before publishing.

## Official documents

- [Microsoft Store Policies 7.20, section 10.8](https://learn.microsoft.com/en-us/windows/apps/publish/store-policies-and-code-of-conduct)
- [Microsoft Win32 app distribution](https://learn.microsoft.com/en-us/windows/apps/distribute-through-store/how-to-distribute-your-win32-app-through-microsoft-store)
- [Razorpay quick integration: signature verification](https://github.com/razorpay/markdown-docs/blob/master/payments/payment-gateway/quick-integration/integration-steps.md)
- [Razorpay webhooks: raw-body signature and event deduplication](https://github.com/razorpay/markdown-docs/blob/master/webhooks/validate-test.md)
- [Razorpay pricing](https://razorpay.com/pricing/)
