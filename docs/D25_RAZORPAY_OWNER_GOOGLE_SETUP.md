# D25 owner Google access + ₹500/month Razorpay subscriptions

**MAH Quantum / Devashri S Industries — 15 November 2026**

STATUS: Source changes and local/CI checks only until GitHub Windows CI finishes. A public D25 Worker exists but the new code, new D1 mode migration, Google native OAuth client and Razorpay keys **have not been deployed or configured**. Do not begin charging customers until TEST acceptance is recorded.

## Product decisions

- **Owner exception:** exactly one approved Firebase UID using verified **Google** sign-in with the expected email has access without Razorpay payment. Both the email AND UID live as separate Cloudflare secrets. Neither is hardcoded in the public source, Windows installer, or D1. Email text alone or a password sign-in to the same address is never sufficient.
- **Other accounts:** Firebase verifies email/password or Google. Paid local quantum workspaces remain locked until a captured Razorpay INR 500 subscription charge is signed by the correct mode's webhook and recorded in D1.
- **Execution limit:** owner and subscribers have the same 20 locally executed jobs / five-hour server-enforced allowance (not a DRM guarantee for extracted worker code).
- **Mandate:** INR 500 every month for up to 12 cycles, with active user consent and a cancel-renewal control. No arbitrary real money is charged during TEST mode.
- **Computation:** ALL supported quantum circuit computations occur on the CUSTOMER Windows machine, never in Cloudflare.

## 1. Configure desktop Google sign-in (Google Cloud Console)

Firebase Web API key alone **does not enable native Google sign-in on Windows**. Google may block embedded WebView OAuth, so D25 launches the system browser with PKCE and a temporary loopback callback.

1. In [Firebase project settings](https://console.firebase.google.com/project/ds-quantum-267dd/settings/general) confirm project ID `ds-quantum-267dd`. In Firebase Authentication → Sign-in method, enable the Google provider (already enabled in the owner's setup).
2. Open the corresponding [Google Cloud Console OAuth clients](https://console.cloud.google.com/auth/clients?project=ds-quantum-267dd). Configure the Google Auth Platform consent/branding screen as required. If in *Testing*, add your intended test Google accounts to the OAuth test users.
3. Create a client with **Application type: Desktop app** (not Web application). Call it **D25 Quantum Workspace Windows**. Copy its public client ID, ending in `.apps.googleusercontent.com`.
4. In GitHub → `Niroop-H/1000-qubit` → Settings → Secrets and variables → Actions → **Variables**, add:
   - `D25_FIREBASE_WEB_API_KEY`: Firebase Web API key (public client config, already provided during prior work).
   - `D25_GOOGLE_DESKTOP_CLIENT_ID`: new **Desktop** OAuth Client ID.
   - `D25_GOOGLE_DESKTOP_CLIENT_SECRET`: only if the Google Desktop OAuth token endpoint requires it. A desktop client secret **is not actually confidential** once shipped to users. Do not supply a Firebase service-account key or a merchant secret here.
   - `D25_LICENSE_API_URL`: leave unset while testing the current Cloudflare Worker, or set the public `https://d25-license.mahquantum.workers.dev/v1`.
5. Re-run the Windows GitHub Actions workflow after setting variables and install the **new** development installer. Old installers are immutable.
6. Choose **Continue with Google**. Google opens in your normal browser, then returns you to D25 using a 127.0.0.1 callback. Firebase exchanges the verified Google ID token for a Firebase identity.
7. In Firebase Console → Authentication → Users, find the newly created Google account and copy its **UID**, not the email and not a Google password.

## 2. Authorize the single owner exemption securely

Open CMD in your local folder `%USERPROFILE%\Downloads\d25-release\cloudflare`. Pull the latest feature branch before deploying, then apply the NEW migration 0003:

    git pull --ff-only
    npx wrangler d1 migrations apply d25-license --remote

The existing D1 database name is `d25-license`. Migration 0003 binds it explicitly to `test`. It does not delete accounts or existing data.

On the Cloudflare TEST Worker, add BOTH secrets using interactive Wrangler prompts (paste values into the terminal, never into chat or GitHub):

    npx wrangler secret put D25_OWNER_GOOGLE_UID
    npx wrangler secret put D25_OWNER_GOOGLE_EMAIL

The first is the Firebase Auth UID copied in step 1; the second is the exact verified Google email designated by the owner. For the intended exempt account, this should match the owner-requested Google login address. The backend validates the signed Firebase JWT, `firebase.sign_in_provider=google.com`, email-verified flag, exact UID and exact email, plus account enabled/not revoked.

Deploy the updated test Worker:

    npx wrangler deploy

Then log out and back in through Google on the newly rebuilt desktop. A successful response shows `ownerAccess: true` and no subscription payment request. Other accounts must remain locked without paid entitlement. If the owner sees a ₹500 checkout, do **not** mark the UID as paid or set an insecure permanent paid-through date; instead review the Google sign-in provider and both secrets.

## 3. Configure Razorpay TEST checkout before any live money

In [Razorpay Dashboard](https://dashboard.razorpay.com/) enter **Test Mode** and enable the Subscriptions product. Create a subscription plan with:

- Amount: **INR 500.00** per cycle (50,000 paise)
- Period: **monthly**, interval **1**
- Currency: **INR**
- No trial, no arbitrary extra charges, quantity 1
- D25 sets **12 billing cycles** when making the user's subscription
- Subscription payments must be enabled for the Razorpay merchant account in test mode.

Generate a Test API Key ID and Test API Key Secret, and configure a separate Razorpay TEST webhook secret. Set the Razorpay TEST webhook URL to:

    https://d25-license.mahquantum.workers.dev/v1/webhook

Enable events: `subscription.charged`, `subscription.cancelled`, `subscription.halted`, `subscription.pending`, `subscription.completed`, `subscription.paused`, and `payment.refunded`. Verify the correct signed payloads and actual provider events before enabling live mode. Do not send the credentials to ChatGPT or commit them to GitHub.

In CMD from `cloudflare`:

    npx wrangler secret put RAZORPAY_TEST_KEY_ID
    npx wrangler secret put RAZORPAY_TEST_KEY_SECRET
    npx wrangler secret put RAZORPAY_TEST_WEBHOOK_SECRET

Edit **only public values** in `cloudflare/wrangler.toml`:

    D25_BILLING_MODE = "test"
    D25_ENABLE_TEST_CHECKOUT = "true"
    RAZORPAY_TEST_PLAN_ID = "plan_YOUR_REAL_TEST_PLAN_ID"

(The plan ID is not an API secret.) Then deploy:

    npx wrangler deploy

The desktop sees `billingMode: "test"`, and the payment panel prominently warns no real money is taken. Non-owner users can select and explicitly consent to ₹500/month TEST mandate authorization, open the signed Razorpay `rzp.io` link in their default browser, then select **Check license**.

**TEST acceptance criteria:** signed Google owner bypass; password login to owner address *does not bypass*; unrelated verified account sees checkout; explicit checkbox required; active subscription only after the real signed captured TEST payment; expired/unpaid/refunded accounts denied; duplicate HMAC event and request replay denied; 20 jobs followed by five hours; cancellation stops future mandate charges; existing access stays until covered period ends; test mode never accepts live API keys.

## 4. Prepare real Razorpay LIVE billing — separate Worker and D1

**Do not use the existing TEST D1 database for live mode.** It contains test subscription and quota state. The runtime verifies a D1 environment marker and refuses to process mismatched billing modes.

Razorpay LIVE subscriptions require merchant KYC/account activation, approved website/business details, Subscriptions access, **separate live API keys**, a **separate live webhook secret**, and a live INR 500 monthly plan. Confirm disclosures, receipts, support, cancellation, privacy and refund policy. This is real recurring debit authorization and can cause actual customer charges.

After TEST checks pass:

1. Create a **separate** Free D1 database named `d25-license-live`.
2. Copy `cloudflare/wrangler.live.example.toml` to `cloudflare/wrangler.live.toml`. Change only its *new* live database UUID and, after merchant activation, `RAZORPAY_LIVE_PLAN_ID`. Keep `D25_ENABLE_LIVE_CHECKOUT="false"` for now.
3. Run migrations on the NEW database:

       npx wrangler d1 migrations apply d25-license-live --remote --config wrangler.live.toml

4. Mark ONLY the new empty LIVE database's environment after validating its UUID. Do not run this on `d25-license`:

       npx wrangler d1 execute d25-license-live --remote --config wrangler.live.toml --command "UPDATE d25_runtime_environment SET mode='live' WHERE id=1;"

5. Provision the owner's two secrets and the following **LIVE-only** secrets for the `d25-license-live` Worker, using `--config wrangler.live.toml` with each Wrangler command:

       RAZORPAY_LIVE_KEY_ID
       RAZORPAY_LIVE_KEY_SECRET
       RAZORPAY_LIVE_WEBHOOK_SECRET
       D25_OWNER_GOOGLE_UID
       D25_OWNER_GOOGLE_EMAIL

6. Set Razorpay's **Live Mode** webhook to the deployed **LIVE** Worker endpoint `https://d25-license-live.YOUR_SUBDOMAIN.workers.dev/v1/webhook`. Never reuse TEST webhook credentials. Signatures are computed over the raw request bytes.
7. Only after test acceptance, merchant activation and explicit owner approval set:

       D25_ENABLE_LIVE_CHECKOUT = "true"
       D25_CONFIRMED_LIVE_CHARGING = "I_CONFIRM_REAL_RECURRING_CHARGES"

8. Deploy using `npx wrangler deploy --config wrangler.live.toml`. The live API and test API remain separate.
9. For production desktop CI, set GitHub Actions variable `D25_LICENSE_API_URL` to the **actual** `https://d25-license-live.YOUR_SUBDOMAIN.workers.dev/v1`; rebuild the installer and validate again. Rebuilding with a different backend URL is required. Verify no embedded secret, Store identity, code signing, WebView2 compatibility, clean Windows installation and lifetime receipts before submitting.

The test checkout flag never authorizes live charges. Live is disabled unless all live credentials, a valid live plan, signed webhook secret, approved separate DB and explicit live enable/confirmation are configured.

## Outstanding limitations

- End-to-end Google OAuth, provider webhooks, subscription renewals, refunds, Tauri browser flow and concurrent D1 operations need verification on real accounts and a clean Windows device.
- Local JavaScript quantum engines are extractable and can be executed by modified applications. A server-side quota cannot guarantee DRM.
- Cloudflare Free and Firebase Spark have quotas; Razorpay charges payment processing fees after successful live transactions; ₹0 upfront does not mean unlimited free operation.
- This branch is **draft, not merged or Microsoft Store certified**.
