# Fix an unconfigured D25 Windows installer (GitHub Actions)

**Problem:** GitHub Actions compiled a development installer without your local
`apps/web/.env.production.local`. The local file is deliberately gitignored;
the workflow has its own clean Windows machine. A green build means compilation
passed — not that Firebase authentication is usable in that installer.

## Configure the public Firebase key for CI

1. Open `Niroop-H/1000-qubit` on GitHub.
2. Navigate to **Settings → Secrets and variables → Actions → Variables**.
3. Add a **repository variable** named exactly `D25_FIREBASE_WEB_API_KEY`.
4. Paste only the **Firebase Web API key** for Firebase project `ds-quantum-267dd`,
   as shown in Firebase Console → Project settings → General → Web API Key.
   Firebase Web API keys are published in client application bundles; do **not**
   enter a service-account private key, an Admin SDK JSON file, or a Razorpay secret.
5. The workflow already supplies the licensing base URL:
   `https://d25-license.mahquantum.workers.dev/v1`.
   No Cloudflare bearer token or private credential is needed in GitHub.
6. Trigger an updated development PR build (the feature branch PR automatically
   rebuilds when committed); download the **NEW** `D25-INTERNAL-ONLY-Development-Installers`
   artifact from that successful Windows workflow and reinstall.
   **Older installers are immutable** and will continue showing the setup error.
7. On launch, the Firebase account sign-in screen should appear. This is only
   the first end-to-end check: an active paid TEST entitlement is still needed to
   enter the local scientific workspaces. Razorpay TEST is disabled until
   configured on Cloudflare.

## Alternative: local installer build

`apps/web/.env.production.local` is sufficient for a **local** build, but
Windows Smart App Control may block Rust's unsigned intermediate build scripts
and unsigned installer files. Prefer GitHub-hosted Windows runners for builds;
do not turn off Smart App Control, Defender, or application-control policies.

## Release boundaries

- Worker health returned HTTP 200, D1 migrations exist, and the desktop frontend
  and licensing tests passed.
- Those checks do **not** prove paid activation, webhook delivery, real login,
  cancellation, reverse-engineering resistance, or Store approval.
- The new installer remains an unsigned, internal development build.
- Quantum simulation runs on the customer's Windows PC. Cloudflare handles
  authentication verification and subscription authorization only.
- Never distribute the development build as an approved Microsoft Store product.
