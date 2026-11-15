# D25 Quantum Workspace — Windows Desktop Release

**Product:** D25 Quantum Workspace  
**Published by:** Devashri S Industries, a division of **MAH Quantum**  
**Parent company and copyright holder:** **MAH Quantum**  
**Repository:** Niroop-H/1000-qubit. The original web application remains independently buildable.

## What this milestone includes

- Tauri 2 desktop shell wrapping the *existing local-first* React/Vite UI and quantum worker code.
- Branded D25 start screen and Windows application identity.
- Windows NSIS `-setup.exe` and WiX `.msi` packaging targets, with a reproducible Windows GitHub Actions workflow.
- A native, per-user quota record stored in Windows application data, shared between Studio, 1000+ research and QAOA run buttons through their existing budget hook.
- The same **20 successful execution reservations**, then a **five-hour** cooldown. A rejected 21st reservation does not run the job. An eligible 20th reservation runs and starts the timer.
- Existing browser access-code behavior is unchanged. Existing browser quotas and hosted industry API quotas are unchanged.

**Important limitations:** Native quota files, device clocks and a local JavaScript simulation worker can be modified by a sufficiently capable user. This is an offline *usage policy*, not purchase/license enforcement, network-address rate limiting or tamper-proof DRM. A production sales platform needs a MAH-controlled license issuance and activation service (or signed offline entitlements) with documented customer terms. No customer account, payment processor, activation service, hardware driver or automatic updater is provided by this change.

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

The build itself runs `npm run build:web` from the Tauri configuration. To avoid changing the web app lockfile, desktop scripts fetch a specifically pinned Tauri CLI (`@tauri-apps/cli@2.12.4`) using `npx`. Rust crates are currently resolved through Cargo's compatible 2.x constraints; a reviewed, committed `src-tauri/Cargo.lock` should be added after the first successful Windows build to pin them for release repeatability.

Expected outputs (actual version/arch-dependent filenames):

```text
src-tauri\target\release\bundle\nsis\D25 Quantum Workspace_1.0.0_x64-setup.exe
src-tauri\target\release\bundle\msi\D25 Quantum Workspace_1.0.0_x64_en-US.msi
```

You can also use **GitHub Actions → D25 Desktop Windows installers → Run workflow**, select the desired branch, then download the uploaded `D25-Quantum-Workspace-Windows-installers` artifact. For pull requests against main, this Windows build also runs automatically. A public repository's Actions artifacts should be treated as publicly accessible distribution materials.

## Commercial release checks — not yet completed

1. Confirm each route loads when installed (Studio, 1000+, Lab, Sensing, Communication) and exports/downloads work in WebView2.
2. Reboot and verify the remaining native credits, 21st-launch rejection and five-hour renewal without relying on browser data.
3. Verify the window can be resized, closed/reopened and uninstalled safely; check installed size and offline startup on Windows 10/11.
4. Audit all frontend/Rust dependencies, third-party licenses, the security boundary and supply-chain artifacts.
5. Issue a customer EULA, refund/privacy terms and sales license entitlements under MAH Quantum.
6. For wider distribution, consider code-signing and a signed update channel; an unsigned application may show Windows SmartScreen warnings.
7. Do not advertise unrestricted 1,000+ qubit universal simulation or industrial hardware control; the README documents the deliberately bounded, research-only model families.

**Branding / ownership:** D25 Quantum Workspace is a product from Devashri S Industries, **a division of MAH Quantum**. MAH Quantum is the parent company, not a subsidiary of Devashri S Industries.

## Microsoft Store: not ready to publish

See [D25 Microsoft Store Release Gates](D25_STORE_RELEASE_GATES.md). The basic NSIS EXE and MSI are useful for internal acceptance testing, but Store publication requires additional review. Microsoft Store does **not** sign EXE/MSI installers on your behalf; Microsoft Store **does** re-sign an eligible MSIX submission. The unsigned MSIX creation script is supplied for Partner Center packaging preparation, but no Store Partner Center identity or submission has been configured. 

Run `node scripts/d25_store_preflight.mjs` after `npm run desktop:build` to get a machine-readable, honest release verdict. `node scripts/d25_store_preflight.mjs --enforce` deliberately exits unsuccessfully until business-critical engine secrecy, activation and external qualification are resolved. Do not bypass this check just to obtain a green release badge.
