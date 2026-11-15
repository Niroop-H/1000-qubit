> **SUPERSEDED ARCHITECTURE (15 November 2026):** The owner specified LOCAL quantum computation on customer Windows PCs, with Firebase Spark Authentication and Cloudflare Workers Free + D1 Free licensing. DO NOT deploy Firebase Cloud Functions or a server quantum engine based on older instructions in this document. See [current architecture](D25_LOCAL_CLOUDFLARE_ARCHITECTURE.md). The local JavaScript engine is extractable; publication is NOT YET APPROVED.

# D25 Quantum Workspace — launch-day owner checklist (15 Nov 2026)

**Product:** D25 Quantum Workspace
**Parent company and copyright owner:** MAH Quantum
**Developer:** Devashri S Industries (division of MAH Quantum)
**Pricing:** ₹500 per named user per month (INR, 50,000 paise)
**Store distribution:** proposed free MSIX download, Razorpay subscription activation inside the non-game PC application
**Current verdict:** NO-GO until the actual accounts, payment flow, user-license enforcement and Store acceptance pass.

## Already staged and tested in the D25 branch

- Protected Tauri commercial frontend does not import local simulation engines or Web Workers.
- Bounded circuit and MaxCut computation run through an authenticated Firebase Cloud Function when deployed.
- Firebase Authentication manages customer passwords; Firestore stores only subscription/charge data.
- Firestore transaction reserves the 20-run, five-hour quota on the trusted server.
- Razorpay TEST-only monthly subscription creation and HMAC-verified captured-charge webhooks with idempotent records.
- A failed provider-to-Firestore subscription creation no longer silently permits repeat auto-debit mandates.
- Google administrator role checked again at the backend; active-user views, subscription management, revenue charts and audit records.
- GitHub Actions builds Windows EXE/MSI and an unsigned development MSIX and performs scientific/security regression checks.

These are code and automated-test facts, NOT proof of a deployed and accepted customer payment system.

## Owner actions required in Firebase

1. Create a **dedicated** D25 Firebase project (do not use a project shared with unrelated MAH systems). Enable email/password and Google Authentication, verified email actions and approved domains.
2. Provision Cloud Firestore and Cloud Functions gen 2 in the relevant region. Verify the Blaze billing plan, service cost ceilings, IAM roles and outbound connectivity. Cloud compute is not guaranteed to cost ₹0.
3. From a trusted device authenticate the Firebase CLI to the intended project. Review the Firestore deny-all client rules and deployment source before deploying. Never deploy those rules onto a shared project.
4. Configure the publicly distributable Firebase Web API key and the exact d25Api, d25Compute, d25Admin endpoints as public Vite build environment variables. Keep Firebase service-account and Razorpay secret keys exclusively in server-side Secret Manager, not in GitHub or client bundles.
5. Assign the first admin role through the trusted administrator grant script after verifying the Google-linked UID.

## Owner actions required in Razorpay TEST mode

1. Confirm the merchant account supports Razorpay Subscriptions and switch to TEST mode.
2. Generate a TEST Key ID and Key Secret. Do **not** paste or upload the secret here.
3. Create a plan: D25 Quantum Workspace; monthly interval 1; INR 500.00. The repository includes scripts/d25-razorpay-test-plan.mjs to create or verify the plan once credentials are set in a trusted shell. This script deliberately rejects live keys.
4. Store the TEST plan identifier on the Firebase server in D25_RAZORPAY_PLAN_ID_TEST and store TEST Key ID/Secret in Firebase Secret Manager.
5. After deploying d25RazorpayWebhook, register its exact HTTPS address in Razorpay Test Mode and configure a **separate** webhook secret. Subscribe to subscription.charged, pending, halted, cancelled, paused, completed and payment.refunded.
6. Perform actual TEST subscription authorization and captured-payment webhook tests. Verify no paid access on mandate authorization alone; exactly ₹500 captured unlocks only one account for the verified paid period. Verify cancellation, expiry, refunds, duplicates and network failures.
7. Do not enable LIVE charges until merchant/KYC approvals, customer terms, refunds, taxes and the acceptance test are completed.

## Owner actions required in Microsoft Partner Center

1. Register/verify the appropriate legal publisher. Microsoft's current onboarding offers free Individual/Company registration, but the verified account type and publisher display name must legitimately represent the owner. For a sole proprietor confirm which legal publisher identity Microsoft will accept.
2. Reserve D25 Quantum Workspace. Copy the exact Package Identity Name, Publisher and PublisherDisplayName from Partner Center. Placeholder identities from GitHub Actions are **development-only**.
3. Assemble Store MSIX with the real identity. Microsoft can sign/host eligible Store MSIX packages. Do not submit the unsigned development-identity MSIX or unsigned EXE/MSI.
4. Provide a verifiable privacy-policy URL, company/product support contact, subscription/refund/cancellation terms, age rating, system requirements (including internet access), accessibility and real screenshots of the protected commercial workbench.
5. Run Windows 10/11 clean-install, Firebase login, test checkout, Store identity, WebView2, upgrade/uninstall and Windows App Certification Kit acceptance. Store review time is outside MAH Quantum's control.
6. Disclose that the protected desktop currently contains bounded OpenQASM/MaxCut, not the full local browser laboratory/industry suite or an unrestricted physical QPU. Do not claim independent certification that has not happened.

## Acceptance evidence required for GO

- Non-paying, expired, refunded and revoked customers cannot execute quantum jobs.
- Concurrent 21st execution launch is rejected; a five-hour wait restores only the allowed 20.
- A copied installer or modified browser session without a valid current subscription gains no protected compute.
- Webhook replay, wrong-price payments, mismatched plan, duplicate subscription and refund events cannot grant extra access.
- Test merchant receipt, user account and server charge records reconcile.
- Windows package extracted and verified to contain no confidential solver source, source maps, local quota bypass or private keys.
- Store identity, signed packaging, privacy disclosure, scientific supported-workload claims and customer support are accepted.

**Non-negotiable:** the original GitHub repo is public. Future confidentiality requires a private repository/compute service, and prior clones cannot be recalled. No desktop installer can be made literally impossible to copy or reverse engineer.

## Reference documentation

- docs/D25_PROTECTED_COMPUTE.md
- docs/D25_FIREBASE_MONTHLY_SETUP.md
- docs/D25_STORE_RELEASE_GATES.md
- https://learn.microsoft.com/en-us/windows/apps/publish/store-policies-and-code-of-conduct
- https://learn.microsoft.com/en-us/windows/apps/distribute-through-store/how-to-distribute-your-win32-app-through-microsoft-store
- https://razorpay.com/docs/api/payments/subscriptions/create-plan/
