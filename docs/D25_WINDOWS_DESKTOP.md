> **SUPERSEDED ARCHITECTURE (15 November 2026):** The owner specified LOCAL quantum computation on customer Windows PCs, with Firebase Spark Authentication and Cloudflare Workers Free + D1 Free licensing. DO NOT deploy Firebase Cloud Functions or a server quantum engine based on older instructions in this document. See [current architecture](D25_LOCAL_CLOUDFLARE_ARCHITECTURE.md). The local JavaScript engine is extractable; publication is NOT YET APPROVED.

# D25 Quantum Workspace — Windows Desktop Release

**Product:** D25 Quantum Workspace  
**Published by:** Devashri S Industries, a division of **MAH Quantum**  
**Parent company and copyright holder:** **MAH Quantum**  
**Repository:** Niroop-H/1000-qubit. The original web application remains independently buildable.

## What this milestone includes

- Tauri 2 commercial desktop shell with **isolated** Firebase Auth + protected compute UI. It does **not ship the existing local quantum/worker algorithms**. See [D25 protected compute](D25_PROTECTED_COMPUTE.md).
- Branded D25 protected compute workbench and Windows application identity.
- Windows NSIS `-setup.exe` and WiX `.msi` packaging targets, with a reproducible Windows GitHub Actions workflow.
- A **server-side**, per-Firebase-user Firestore quota for protected compute requests. Client-side quotas are not the commercial purchase boundary.
- **20 protected execution reservations**, then a **five-hour** cooldown. A rejected 21st request does not execute. A reserved launch consumes a credit even if its compute fails.
- Existing browser/development mode remains separate and is not packed into commercial installers.

**Important limitations:** The new protected desktop requires online Firebase access and MAH-owned backend computation. This is not yet deployed, independently accepted or available for sale. Other existing web workbenches are NOT included in this commercial build until moved to protected endpoints. A copied UI can still be changed; server entitlement verification protects paid execution, not client pixels. See [protected compute security](D25_PROTECTED_COMPUTE.md) and [Firebase monthly setup](D25_FIREBASE_MONTHLY_SETUP.md). No unrestricted quantum processor or certified physical hardware control is claimed.

## Zero-cost Windows build requirements

Install the free versions of:

1. Node.js 22.
2. Rust using rustup (`stable-x86_64-pc-windows-msvc`).
3. Visual Studio 2022 Build Tools with **Desktop development with C++** (MSVC and Windows SDK).
4. Microsoft Edge WebView2 Runtime if missing.
5. The Windows **VBScript optional feature** only if WiX MSI creation reports a `light.exe`/VBScript error.

Refer to the official [Tauri Windows prerequisites](https://v2.tauri.app/start/prerequisites/) and [Windows installer guide](https://v2.tauri.app/distribute/windows-installer/).

In Windows CMD, from the repository root:

```bat
npm ci
npm test
npm run desktop:icons
npm run desktop:dev
```

The development command launches Vite and the Tauri desktop window. Stop it with Ctrl+C. Then build **both** Windows installers:

```bat
npm run desktop:build
```

The build runs `npm run build:desktop` from Tauri configuration and validates `dist-desktop` for any local simulation workers. The separate web/developer build continues to run `npm run build:web`. To avoid changing the web app lockfile, desktop scripts fetch a specifically pinned Tauri CLI (`@tauri-apps/cli@2.12.4`) using `npx`. Rust crates are currently resolved through Cargo's compatible 2.x constraints; a reviewed, committed `src-tauri/Cargo.lock` should be added after the first successful Windows build to pin them for release repeatability.

Expected outputs (actual version/arch-dependent filenames):

```text
src-tauri\target\release\bundle\nsis\D25 Quantum Workspace_1.0.0_x64-setup.exe
src-tauri\target\release\bundle\msi\D25 Quantum Workspace_1.0.0_x64_en-US.msi
```

You can also use **GitHub Actions → D25 Desktop Windows installers → Run workflow**, select the desired branch, then download the uploaded `D25-INTERNAL-ONLY-Development-Installers` artifact. For pull requests against main, this Windows build also runs automatically. A public repository's Actions artifacts should be treated as publicly accessible distribution materials.

## Commercial release checks — not yet completed

1. Confirm Firebase authentication, subscribed protected execution and JSON exports work in the actual installed commercial shell. Other browser-only workspaces are deliberately unavailable until securely migrated.
2. Verify Firestore server-side credits, concurrent 21st-launch rejection and five-hour renewal, across reinstall and different devices.
3. Verify the window can be resized, closed/reopened and uninstalled safely; check installed size and **honest offline failure**, since execution requires the service.
4. Audit all frontend/Rust dependencies, third-party licenses, the security boundary and supply-chain artifacts.
5. Issue a customer EULA, refund/privacy terms and sales license entitlements under MAH Quantum.
6. For wider distribution, consider code-signing and a signed update channel; an unsigned application may show Windows SmartScreen warnings.
7. Do not advertise unrestricted 1,000+ qubit universal simulation or industrial hardware control; the README documents the deliberately bounded, research-only model families.

**Branding / ownership:** D25 Quantum Workspace is a product from Devashri S Industries, **a division of MAH Quantum**. MAH Quantum is the parent company, not a subsidiary of Devashri S Industries.

## Microsoft Store: not ready to publish

See [D25 Microsoft Store Release Gates](D25_STORE_RELEASE_GATES.md). The basic NSIS EXE and MSI are useful for internal acceptance testing, but Store publication requires additional review. Microsoft Store does **not** sign EXE/MSI installers on your behalf; Microsoft Store **does** re-sign an eligible MSIX submission. The unsigned MSIX creation script is supplied for Partner Center packaging preparation, but no Store Partner Center identity or submission has been configured. 

Run `node scripts/d25_store_preflight.mjs` after `npm run desktop:build` to get a machine-readable release verdict on the isolated `dist-desktop` build. `node scripts/d25_store_preflight.mjs --enforce` deliberately exits unsuccessfully until backend deployment, actual payment verification, security and scientific qualification are resolved. Do not bypass this check just to obtain a green release badge.

## Commercial build configuration gate

The ordinary desktop:build command creates a development installer that can deliberately display the unconfigured Firebase sign-in screen. It is **not saleable**. The Windows CI artifact is labeled D25-INTERNAL-ONLY-Development-Installers. Once the *actual* Firebase Cloud Functions have been deployed, store the public Vite keys and function URLs in the gitignored apps/web/.env.production.local, and use the stricter command:

    npm run desktop:build:connected

This requires a well-formed Firebase public Web API key and matching d25Api / d25Compute Cloud Function URLs from the same project. It verifies configuration format only; it does NOT verify service availability, paid activation, refund handling or Microsoft Store certification. For Store MSIX, use the exact Partner Center product identity rather than the GitHub development placeholders.
