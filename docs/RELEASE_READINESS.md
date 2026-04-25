# XpubShield Release Readiness

Last updated: 2026-04-25

## Release Posture

Current posture: **Closed beta candidate**.

XpubShield is ready for controlled tester feedback and demo workflows, but it should not be presented as public stable software. Closed beta should validate the watch-only security boundary, local persistence, backend behavior, restart/resume state, and the clarity of the Cockpit-led workflow.

## Current App Shape

Primary navigation:

- Import
- Cockpit
- Lineage
- Coin Workbench
- Spend Preflight
- PSBT Preflight
- Recovery
- Documentation
- Tutorial
- Settings

Legacy route aliases should continue to redirect instead of breaking existing CTAs:

- `dashboard` -> `cockpit`
- `alerts` -> `cockpit`
- `explanations` -> `docs`
- `fees` -> `utxos`
- `privacy` -> `spend_preflight`
- `consolidation` -> `spend_preflight`
- `descriptor_diff` -> `recovery`

## Closed Beta Gates Met

- The app remains pre-sign only: no signing, finalization, extraction, broadcast, custody, or transaction construction.
- Import rejects obvious private material such as seed phrases, private keys, WIF keys, and xprv-like inputs.
- Cockpit is the primary command surface with Risk Posture, Action Center, Mission Queue, and concise wallet posture instruments.
- Coin Workbench supports UTXO inspection, labels, provenance evidence, quarantine/spend status, coin decision states, and saved coin sets.
- Spend Preflight explains observer inference for candidate coin groups without constructing transactions.
- Recovery surfaces descriptor, fingerprint, path, gap-risk, and export-readiness checks.
- PSBT Preflight parses and warns on pasted PSBT text without signing or broadcasting.
- Documentation and Tutorial are local-first learning surfaces available before or after import.
- Workspace resume state is stored locally so key page and workflow context can survive reloads.
- Browser demo mode visibly differs from packaged desktop/Tauri persistence.
- Windows desktop packaging is configured through Tauri.

## Security Review Notes

- No seed phrase, mnemonic, private key, xprv, WIF, signing, finalization, extraction, or broadcast command should be added.
- Descriptors, xpubs, derived addresses, labels, PSBT text, and transaction history are sensitive wallet metadata.
- Raw xpubs/descriptors are stored locally and should not be sent to public APIs.
- Bitcoin Core RPC mode should stay local-only.
- Public Esplora mode is weak privacy and must require explicit acknowledgement.
- SQLite metadata remains unencrypted; closed beta users must protect the local app data directory.
- Provenance is heuristic and local, not definitive chain-surveillance attribution.

## Release Configuration

- Package name: `xpubshield`
- Product name: `XpubShield`
- Version: `0.1.0`
- Tauri identifier: `com.xpubshield.desktop`
- Default window: `1280x860`
- Minimum window: `1040x720`
- Icon path: `src-tauri/icons/icon.ico`
- Frontend build output: `dist`
- Tauri frontend distribution path: `../dist`
- Packaged desktop database: platform app data directory, `xpubshield.sqlite3`

## Verification Commands

Run this before tagging a closed beta build:

```powershell
npm audit
npm ls vite @vitejs/plugin-react
npm run build
Set-Location src-tauri
cargo test
Set-Location ..
npm run tauri -- build
```

Expected package artifacts on Windows:

- `src-tauri/target/release/xpubshield.exe`
- `src-tauri/target/release/bundle/msi/XpubShield_0.1.0_x64_en-US.msi`
- `src-tauri/target/release/bundle/nsis/XpubShield_0.1.0_x64-setup.exe`

## Closed Beta Smoke Script

- Fresh launch with no saved wallet opens Import.
- Demo wallet import opens Cockpit.
- Cockpit Risk Posture is the obvious first read.
- Mission Queue can collapse and stays secondary to Risk Posture.
- Action CTAs navigate to the correct parent modules.
- Coin Workbench filters, selected coins, drawer state, labels, quarantine, and coin sets work.
- Spend Preflight selected coins, amount, fee, and change assumptions remain editable.
- Lineage pan, zoom, and selected node behavior work without breaking scroll.
- Recovery renders descriptor and metadata diagnostics.
- PSBT Preflight accepts valid PSBT text and rejects/flags invalid text clearly.
- Documentation opens before wallet import, search works, and the closed beta operator script is present.
- Tutorial can be opened, dismissed, and reset without clearing wallet cache.
- Settings cache clear removes wallet/workspace state but does not break Tutorial reset behavior.
- Reduced-motion mode disables decorative transitions.
- Desktop and narrow widths below `1100px` and `720px` have no clipped text or unusable toolbar wrapping.
- Browser console reports no errors during the smoke pass.

## Remaining Public Beta Blockers

- Perform a fresh watch-only security review.
- Validate Bitcoin Core and Esplora behavior against real operator infrastructure.
- Add richer live transaction history for Bitcoin Core/Esplora backends.
- Decide whether SQLite metadata encryption is required before public beta.
- Decide whether background scan scheduling is required before claiming monitoring completeness.
- Re-run dependency audit and packaging checks immediately before release tagging.
