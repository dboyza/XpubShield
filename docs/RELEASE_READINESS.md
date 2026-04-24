# XpubShield Release Readiness

Last updated: 2026-04-24

## Release Posture

Current posture: **Demo Preview**.

XpubShield has the planned Phase 1 through Phase 8 product slices implemented, but it should not be called beta until the remaining review items below are either fixed or explicitly accepted.

## Completed Readiness Gates

- Durable SQLite persistence exists for the current wallet report and UTXO metadata.
- Public descriptor parsing and descriptor address derivation run locally in Rust.
- Descriptor diff previews use Rust-derived addresses when descriptors are parseable.
- Raw base64/hex PSBT envelopes are parsed locally and linted without signing, finalizing, extracting, or broadcasting.
- Bitcoin Core RPC backend scans derived addresses only through local `scantxoutset` `addr(...)` scan objects.
- Esplora backend scans derived address UTXO endpoints only and requires explicit acknowledgement for public API mode.
- Graph visualization, local alerts, and Windows desktop packaging are implemented.
- UTXO detail, spend preview, Settings, generic local labels, saved spend simulations, saved consolidation plans, and fixture manifests are implemented.

## Security Review Notes

- No seed phrase, mnemonic, private key, xprv, WIF, signing, finalization, extraction, or broadcast command was added.
- Raw xpubs/descriptors are stored locally as sensitive wallet metadata but are not sent to Bitcoin Core, Esplora, or public APIs.
- Bitcoin Core backend rejects non-local RPC URLs.
- Public Esplora mode remains weak privacy and requires explicit acknowledgement.
- SQLite data remains unencrypted; users must protect the local app data directory.

## Verification

Last passing checks:

```powershell
npm audit
npm ls vite @vitejs/plugin-react
npm run build
cd src-tauri
cargo test
cd ..
npm run tauri -- build
```

Last UI smoke test:

- Demo wallet import loaded.
- Dashboard, UTXO table/detail drawer, fee stress, spend preview, privacy, consolidation, PSBT linter, recovery, descriptor diff, explanations, graph, alerts, and settings routes rendered.
- Import private-material rejection displayed for xprv-like input.
- Browser console reported no errors during the smoke test.

Package artifacts:

- `src-tauri/target/release/xpubshield.exe`
- `src-tauri/target/release/bundle/msi/XpubShield_0.1.0_x64_en-US.msi`
- `src-tauri/target/release/bundle/nsis/XpubShield_0.1.0_x64-setup.exe`

## Dependency Audit Decision

The Vite/esbuild advisory has been remediated for the current dependency baseline:

- Vite was upgraded to `8.0.10`.
- `@vitejs/plugin-react` was upgraded to `6.0.1` so its peer dependency supports Vite 8.
- `npm audit` reports 0 vulnerabilities after the upgrade.

The compatibility check passed through `npm run build`, `cargo test`, and `npm run tauri -- build`.

## Remaining Beta Blockers

- Add richer live transaction history for Bitcoin Core/Esplora backends.
- Add background scan scheduling before claiming monitoring completeness.
- Decide whether the frontend privacy simulator needs a Rust Tauri command to match the richer TypeScript presentation.
- Review whether encrypted database support is required for beta.
- Perform a fresh watch-only security review before tagging a beta release.
