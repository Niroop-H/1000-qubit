> **SUPERSEDED ARCHITECTURE (15 November 2026):** The owner specified LOCAL quantum computation on customer Windows PCs, with Firebase Spark Authentication and Cloudflare Workers Free + D1 Free licensing. DO NOT deploy Firebase Cloud Functions or a server quantum engine based on older instructions in this document. See [current architecture](D25_LOCAL_CLOUDFLARE_ARCHITECTURE.md). The local JavaScript engine is extractable; publication is NOT YET APPROVED.

# D25 Quantum Workspace — Firebase accounts and ₹500/month Razorpay TEST subscriptions

**State:** CODE STAGED ON DEVELOPMENT BRANCH, NO CLOUD DEPLOYMENT OR REAL CHARGES.  
**Product:** D25 Quantum Workspace  
**Developed by:** Devashri S Industries, a division of **MAH Quantum**  
**Parent company:** **MAH Quantum**

## Pricing

- **₹500 INR per named-user account each month**, billed automatically only after the customer explicitly authorizes Razorpay recurring payments
- Quantity 1 user, monthly interval 1, 50,000 paise INR
- This implementation deliberately uses **12 recurring cycles (12 months total)**, requiring renewal/new authorization afterwards; it is **not unlimited billing**
- Customer can request cancellation of future billing; paid access remains available through the last verified paid-through date
- Terms, applicable GST, refunds, supported payment mandates, support levels, number of devices and software update policies must be finalized before publication
- Microsoft Store listing should say *free download with ₹500/month in-app subscription (third-party Razorpay)*; do not charge once at installation and again inside the application

Microsoft Store allows a secure third-party recurring API for a **non-game Windows app** subject to policy 10.8, including disclosure in Partner Center. See [current policies](https://learn.microsoft.com/windows/apps/publish/store-policies).

## Where are customers' user IDs and passwords stored?

- **Firebase Authentication** securely manages user credentials. Use Email/Password sign-in in Firebase Console → Authentication → Sign-in method. Firebase generates the user UID and manages password hashing/verification; **the developer must not store passwords, even encrypted or hashed copies, in Firestore**
- **Firestore d25Accounts/{firebaseUid}** holds minimal account metadata: UID, email, subscription reference, purchase state, paid-through date, customer cancellation request, never a password
- **Firestore d25Subscriptions/{subscriptionId}** maps Razorpay subscription to a Firebase UID with price plan and status
- **Firestore d25Charges/{paymentId}** records unique verified captured payments once
- **Firestore d25WebhookEvents/{eventId}** ensures webhooks are handled idempotently
- Firestore rules block all client reads/writes of these collections. The Firebase Admin SDK runs ONLY in Cloud Functions with server credentials
- Desktop sessions currently retain a Firebase **refresh token in sessionStorage**, not a password. The user signs in again on a fresh app session. Treat any token in a desktop client as potentially retrievable: this is not a machine-bound DRM entitlement

## Architecture

```text
D25 Quantum Workspace Windows (Tauri + React)
   Firebase REST Authentication (email/password, reset, verify)
       ↓ ID token on authenticated HTTPS requests
Firebase Cloud Function d25Api (verifyIdToken + verified email)
       ↓ Firestore transactions
d25Accounts / d25Subscriptions / d25Charges / d25WebhookEvents
       ↓ Razorpay TEST API (private Key ID + Key Secret)
Razorpay-hosted subscription link (opened in normal browser)
       ↓ customer approves recurring monthly billing
Razorpay verified HTTPS webhook (raw body signature)
       ↓ Firestore idempotent charge transaction
Paid-through entitlement verified by d25Api/status
       ↓
Desktop screen unlocks for current paid period
```

**Important:** The existing quantum engine still ships in frontend JavaScript. The new account gate and quota are not tamper-proof. Confidential algorithms require a private MAH Quantum execution service or a reviewed native-code compromise; paid authentication itself cannot prevent copied executable code.

## Step 1 — Set up a dedicated Firebase project (not yet done)

1. Create a **dedicated** Firebase project named e.g. *D25 Quantum Workspace* and note the real Project ID.
2. In Firebase → Build → Authentication → Sign-in method, turn on **Email/Password**. Configure email action links, authorized domains and branding, and enable verification emails.
3. Enable **Cloud Firestore** for the same project. Choose an India region aligned with your supported deployment (a created Firestore database's location cannot casually be changed later).
4. Enable **Cloud Functions**. Deployable outbound HTTPS functions generally require Firebase **Blaze/pay-as-you-go** billing. A cloud account may consume paid resources; no zero-cost guarantee is made. Set Google Cloud Billing budgets/alerts, abuse limits and quotas first. This is independent of free local EXE/MSI/MSIX packaging.
5. Install the Firebase CLI locally via `npm install -g firebase-tools`, then `firebase login` and `firebase use --add`. Choose your exact D25 project. Do **not** commit a project-bound `.firebaserc` unless desired.
6. These `firestore.rules` DENY ALL client access, including to unrelated collections. **Do not deploy them into an existing shared Firebase project.**

## Step 2 — Get TEST Razorpay credentials later

Your screenshot shows **TEST** at the top and a **Generate Key** button. When ready:

1. In Razorpay Test Mode, generate a **test** API Key ID and Key Secret. Never paste either in chat or commit to GitHub.
2. Create a Razorpay **monthly plan** charging ₹500.00 / INR (50,000 paise), period `monthly`, interval `1`. Note the real `plan_...` ID.
3. Ensure recurring *Subscriptions* feature and the selected payment mandate are enabled in your Razorpay TEST account. A payment handle by itself is NOT an auto-renewing plan.
4. In Razorpay → Account & Settings → Webhooks, register your **test** HTTPS Firebase Cloud Functions webhook after deploying it. Subscribe to at least:
   `subscription.charged`, `subscription.pending`, `subscription.halted`, `subscription.cancelled`, `subscription.paused`, `subscription.completed`, `payment.refunded`.
   Generate a **separate** webhook secret and keep it only in Firebase.
5. The account's live API key is **not accepted by this integration**. The server requires a Key ID prefixed `rzp_test_`; live charging is deliberately disabled.

## Step 3 — Configure the Firebase backend

The backend is in `functions/`. In the **Firebase CLI** for your selected project, set these *secret values* interactively (not into Git):

```bat
firebase functions:secrets:set D25_RAZORPAY_TEST_KEY_ID
firebase functions:secrets:set D25_RAZORPAY_TEST_KEY_SECRET
firebase functions:secrets:set D25_RAZORPAY_TEST_WEBHOOK_SECRET
```

Create a local `functions/.env.<YOUR_PROJECT_ID>` from `functions/.env.example`; configure:

```text
D25_RAZORPAY_PLAN_ID_TEST=plan_YOUR_REAL_TEST_PLAN
D25_ALLOWED_ORIGINS=https://your-verified-website.example
```

Never put secret key values in a `VITE_` frontend variable. The plan ID itself is not secret.

Deploy the **dedicated** Firebase project:

```bat
npm install --prefix functions
npm run test --prefix functions
firebase deploy --only functions,firestore:rules
```

Cloud Functions use Node 22 and the `asia-south1` region. The resulting URLs should resemble:

```text
https://asia-south1-YOUR_PROJECT_ID.cloudfunctions.net/d25Api
https://asia-south1-YOUR_PROJECT_ID.cloudfunctions.net/d25RazorpayWebhook
```

These are **examples**, not live URLs. Confirm exact URLs from the Firebase deployment output.

The webhook function validates HMAC-SHA256 from **raw request bytes**, checks the event ID, uses Firestore transactions to deduplicate, and only grants access for a correctly priced **captured** `subscription.charged` event, never for the initial authorization alone. A full refund disables the affected active entitlement. Do not configure a browser client as an administrative writer.

## Step 4 — Configure the Windows frontend (after backend)

From your Firebase project settings, register a **Web app** and find its **Web API key**. Firebase Web API keys are public configuration, not Razorpay secrets. Configure these two values when building the Windows desktop application:

```text
VITE_D25_FIREBASE_API_KEY=<firebase web API key>
VITE_D25_API_BASE=https://asia-south1-YOUR_PROJECT_ID.cloudfunctions.net/d25Api
```

For a local Windows production build, put them in `apps/web/.env.production.local` (**gitignored**) and run from the repository root:

```bat
npm ci
npm run desktop:icons
npm run desktop:build
```

Without these variables, D25 displays a **not configured** screen and does not unlock the simulator. This intentional fail-closed behavior means existing CI builds are only packaging checks and are not commercially functional releases.

For cloud GitHub Actions packaging use correctly scoped repository Actions **Variables** for public Firebase web configuration and approved environment-specific build settings. Do not put Razorpay server-side secret values into GitHub build arguments.

## Step 5 — Validate before accepting real payments

- Create an account, verify email, sign in, sign out, reset password; confirm Firebase Auth has UID and email; **no user password is written to Firestore**.
- Confirm that a user without verified email or paid entitlement cannot open the desktop workspace through the regular UI. A patched local app can still bypass the UI, so confidential compute cannot rely on this gate.
- Create a test subscription, receive a Razorpay link, authorize in the browser. Check `d25Api/status`: an authorization-only event must **NOT** activate an entitlement.
- Process a full ₹500 captured subscription charge: exactly one entitlement, paid through the period shown by Razorpay. Replay the same webhook and a different event ID for the same payment: never issue a duplicate grant.
- Send wrong-secret or tampered webhooks and wrong plan/amount/currency: no entitlement.
- Test out-of-order events, cancellation, failed renewal, elapsed paid period, refund, sign-in on a second device, service unavailability, Firestore outages, corrupted local sessions and updates.
- Confirm administrative reconciliations, retry processing, billing histories, transaction receipts/invoices, support workflow and user access restoration.
- Confirm all test purchases make **no real charges**. Test and production must have separate plans, credentials and projects.

## Release limitations

This is a real server/client code foundation but **has not been deployed**, tested with a configured Razorpay account, or independently certified. Store release status remains **NO GO**. Firestore/Cloud Functions may incur charges at scale. Firebase Test Mode and authentication do not prevent client-side reverse engineering.

**Security architecture:** End users must never receive Razorpay secrets, Firebase Admin service account keys, payment webhook secrets, or a raw password list. Admin console user IDs are not equivalent to public license numbers. The Firebase/Auth user UID is an internal identifier; all payment access checks happen server side.

Official references: [Firebase password authentication](https://firebase.google.com/docs/auth/web/password-auth), [Firebase Cloud Functions secrets](https://firebase.google.com/docs/functions/config-env), [Razorpay Subscriptions API](https://razorpay.com/docs/api/payments/subscriptions/), [Razorpay subscription webhooks](https://razorpay.com/docs/webhooks/subscriptions/), [Microsoft Store 10.8.6 policy](https://learn.microsoft.com/windows/apps/publish/store-policies).

## First-launch visibility

The branded desktop product homepage remains publicly viewable after installation. Selecting a computational workspace opens the Firebase account/subscription gate, which fails closed when Firebase configuration, payment verification or connectivity is unavailable. This is **not** a cryptographically secure executable-code boundary.

## Admin console, marketing charts and Google sign-in

The administrator portal is the web route `/admin` on the Vercel-hosted site (not a Tauri embedded Google login). Enable Google as a Firebase Authentication provider, register the exact HTTPS domain as an authorized domain, and register the same origin with Google Identity Services (Google OAuth Web client). Build the web app with the public environment variables `VITE_D25_FIREBASE_API_KEY`, `VITE_D25_GOOGLE_CLIENT_ID` and `VITE_D25_ADMIN_API_BASE` (the Cloud Function URL ending in `/d25Admin`). Set server-only `D25_ADMIN_ALLOWED_ORIGINS` to the exact HTTPS website origin.

Admin privileges require BOTH a Google sign-in AND the Firebase Admin SDK custom claim `d25Admin: true`. Sign in to create the Google-linked Firebase user, then run `functions/scripts/grant-d25-admin.cjs` using trusted Google Application Default Credentials and the dedicated project ID, with `D25_ADMIN_GRANT_CONFIRM` set to the user's confirmed Firebase UID. Never set roles based only on email strings or from client-supplied values. Granting access can take a token refresh or re-login. The script requires verified Google provider linkage.

The admin dashboard reads only server-authorized aggregated collections and paged users. Its revenue graph is recorded captured transaction amounts **before fees/refunds**, and recurring revenue is identified as an **upper bound**, not an audited finance statement. Visitor analytics/conversion attribution are not connected. Staff can disable/enable normal users, revoke a license (after requesting subscription cancellation), request cancellation of future renewals, and inspect recent audit entries. Every admin mutation requires a confirmation and leaves a Firestore audit record.

The admin portal cannot grant itself administrator status, change prices, or create arbitrary paid access. The only trusted role-grant mechanism is the operator script. Deployments and actual Google OAuth have not yet been validated against a live project.

## Commercial protected compute endpoint

The new `d25Compute` Firebase function runs the permitted quantum algorithm **server-side** after verifying the Firebase user, Firestore subscription and 20-execution/five-hour transactional allowance. The Windows installer now uses an isolated `dist-desktop` build with no quantum engine workers. Add `VITE_D25_COMPUTE_API_BASE=https://asia-south1-YOUR_PROJECT_ID.cloudfunctions.net/d25Compute` to the public web build settings. For allowed website origins use `D25_COMPUTE_ALLOWED_ORIGINS` in the Firebase project environment. The Firebase predeploy hook compiles `functions/private-engine.cjs` exclusively for the protected backend; never upload that generated file as a downloadable artifact. Full details: [D25 protected compute](D25_PROTECTED_COMPUTE.md). Server compute requires an eligible Firebase paid billing environment, and cost caps/load validation are essential.

## Orphan-subscription reconciliation safeguard (15 November 2026)

If Razorpay accepts subscription creation but Firestore cannot confirm the mapping, the backend attempts immediate cancellation and does not permit another subscription unless the cancellation is confirmed. Unknown provider responses, failed cancellations and expired creation leases require manual reconciliation. MAH Quantum support must review the Razorpay mandate before clearing the account lock. The checkoutLeaseGuard regression tests cover ambiguous timeouts and the manual-review state. This safeguard is not a substitute for real payment provider test-mode acceptance.
