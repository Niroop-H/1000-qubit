# D25 Quantum Workspace — Microsoft Store release decision

**Product:** D25 Quantum Workspace  
**Developer:** Devashri S Industries, a division of **MAH Quantum**  
**Parent company and original proprietary copyright holder:** **MAH Quantum**  
**Status: NO GO for paid Microsoft Store publication until all release blockers are closed.**

## Evidence and scope

[Windows build 43673699804](https://github.com/Niroop-H/1000-qubit/actions/runs/43673699804) passed Tauri/Rust quota tests and produced an NSIS EXE and MSI. [Quantum Studio CI 43673699785](https://github.com/Niroop-H/1000-qubit/actions/runs/43673699785) passed its mathematical regressions, independent Python checks, visual browser release gate and SDK checks. Its Node engine test suite reported 176 tests. These are encouraging *tested scopes*, not exhaustive proof for customers or safety certification.

| System | Automated evidence | Remaining limitation |
| --- | --- | --- |
| Dense 1–20 qubit simulator | Mathematical unit tests, independent oracle, bounded 20-qubit regression | Exact supported classical ideal states, not a physical QPU; installed-app tests pending |
| 21–100 logical qubit studio | Clifford, separable and bounded partitioned solver tests | Not a universal simulator for all circuits; external validation pending |
| 1,000–4,096 logical research | Bounded high-width supported circuit family tests | Not universal thousands-of-qubits simulation; independent performance review pending |
| Lab Twin and cryogenics | Lab/physics regression and Python parity | Not physically calibrated or industrial equipment certified |
| Sensing/metrology | Numerical model and Python parity checks | Not a validated real-world measurement instrument |
| Communication / cryptography | Lab and communication numerical model tests | Not certified for real security-grade QKD |
| QAOA / Hamiltonian | Limited MaxCut, diagonal-energy numerical experiments | Not unrestricted quantum chemistry, VQE, or industrial optimizer |
| SCPI/Modbus physical bridges | SDK unit and mock transport/integrity tests | Actual instrument/site safety qualification NOT completed |
| Desktop 20-launch/5-hour cooldown | Rust native quota unit tests | Local storage can be changed; NOT license verification |
| Windows executable | Windows CI compiled EXE+MSI | Clean-machine Store install, updates and WACK NOT completed |

## Critical confidentiality finding

The web-based quantum engine runs in **JavaScript Web Workers**. Even inside a Tauri executable, a buyer can inspect or extract JavaScript, patch controls and run copied code elsewhere. Disabling `.map` files and minifying JS reduces casual visibility but **cannot keep proprietary algorithms secret**. Native Rust adds friction but is still reverse-engineerable.

The source repository is also currently **public**, so its historical content has already been exposed; changing visibility cannot undo cloned copies. The owner should review GitHub → Settings → General → Danger Zone → Change repository visibility. Do not add further proprietary algorithms to a public repository if trade-secret protection is required.

**Required design:** move truly confidential execution to a private, authenticated MAH Quantum compute service; apply account-level entitlements, server-side usage accounting and quotas, job isolation and audit logging. Keep local workspaces for public educational features or migrate certain algorithms to Rust with clear residual disclosure risk. Offline-only applications cannot guarantee source secrecy or tamper-resistant rate limits.

The existing visitor access-code format is validated in client JavaScript; any client-only code pattern is unsuitable for commercial purchase authorization. An offline quota file is a convenience allowance, not DRM.

## Microsoft Store approach

**Prefer MSIX for Store-only distribution.** Microsoft handles qualifying MSIX distribution, signing and updates. Unlike MSIX, **EXE/MSI Store submissions require the publisher to sign installers (and applicable binaries) using a trusted code-signing certificate and host a permanent offline installer URL**. This makes the current unsigned EXE/MSI unsuitable for direct Store submission. MSIX is usually the lowest-cost route.

Tauri 2 does not build MSIX directly; `scripts/build-store-msix.ps1` uses the free Windows SDK MakeAppx to package its compiled executable into an **unsigned MSIX candidate**. The precise `Identity Name` and `Publisher` strings must be taken from **Microsoft Partner Center**; the script cannot invent or register them. Microsoft signs compliant MSIX submissions after certification. Local MSIX install testing requires a trusted development certificate matched to the manifest. Never submit the development-identity MSIX from CI.

### Build with real identity (Windows PowerShell)

After `npm ci`, `npm run desktop:icons` and `npm run desktop:build`:

```powershell
./scripts/build-store-msix.ps1 -IdentityName "REPLACE.WITH.RESERVED.IDENTITY" -Publisher "CN=EXACT PARTNER CENTER PUBLISHER" -Version "1.0.0.0"
```

The script creates `artifacts/store/D25-Quantum-Workspace-UNSIGNED.msix`, which still requires acceptance testing and Store approval. CI builds an **unsigned development-only package**, solely to check packaging mechanics.

## Machine-verifiable release preflight

```bat
node scripts/d25_store_preflight.mjs
node scripts/d25_store_preflight.mjs --enforce
```

The first command produces `artifacts/d25-store-preflight.json` listing build hygiene passes and explicit release blockers. The second command **fails while the release verdict is NO_GO**. Do not bypass or hide that result for marketing.

## Required independent acceptance before GO

1. Source protection architecture reviewed; confidentiality boundary is trusted service/native code with stated limits; review public repo copies and third-party license obligations.
2. Real license issuance and verification completed, with reasonable offline grace policy, support, account recovery and fair rate enforcement.
3. Independent reference numerical validation for supported solvers and quantum model families (different platforms, random circuits, seeds, tolerances, unsupported inputs).
4. Memory, cancellation, CPU usage, responsiveness and reliability on representative customer machines; deliberate resource-exhaustion tests and worker error handling.
5. Windows 10/11 clean installs and first-run, WebView2 dependencies, keyboard/accessibility, every route, offline mode, files/exports, upgrades, uninstall, app-data privacy, WACK.
6. App security review: frontend CSP, file/protocol input validation, IPC capabilities, production dependency + Rust audits, dynamic testing, update-signature validation and privacy notice.
7. Physical hardware bridges independently qualified at the site before actual operation; avoid advertising certified machine controls or general QPU hardware connectivity.
8. Partner Center publisher identity, authentic registered legal entity, name reservation, four-part version, screenshots, support contact, public privacy policy, EULA, refunds and Store certification.
9. Production monitoring, abuse response, incident response, rollback, customer support, tested recovery and staged release strategy; SLAs require empirical evidence.

Official Microsoft references: [Store distribution paths](https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/choose-distribution-path), [Win32 Store requirements](https://learn.microsoft.com/en-us/windows/apps/publish/publish-your-app/msi/app-package-requirements), [Store readiness](https://learn.microsoft.com/en-us/windows/apps/publish/store-readiness-checklist), [Microsoft's MSIX packaging for Tauri](https://learn.microsoft.com/en-us/windows/apps/dev-tools/winapp-cli/guides/tauri), [Tauri security](https://tauri.app/security/).

## Razorpay commercial entitlement proposal

The revised plan is **₹500 per named user per month** (12 billing cycles). Firebase Auth email/password and Cloud Functions/Firestore Razorpay **TEST** subscriptions are staged; see [current implementation and setup](D25_FIREBASE_MONTHLY_SETUP.md). No Firebase project or Razorpay keys have been connected or deployed yet, so no real checkout or activation has been verified. No customer payments should be accepted until verified purchase-to-account linking, durable entitlements, refund workflows and customer terms are operational. The current release remains **NO GO**.
