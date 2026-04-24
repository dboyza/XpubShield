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

## Security Review Notes

- No seed phrase, mnemonic, private key, xprv, WIF, signing, finalization, extraction, or broadcast command was added.
- Raw xpubs/descriptors are stored locally as sensitive wallet metadata but are not sent to Bitcoin Core, Esplora, or public APIs.
- Bitcoin Core backend rejects non-local RPC URLs.
- Public Esplora mode remains weak privacy and requires explicit acknowledgement.
- SQLite data remains unencrypted; users must protect the local app data directory.

## Verification

Last passing checks:

```powershell
npm run build
cd src-tauri
cargo test
cd ..
npm run tauri -- build
```

Package artifacts:

- `src-tauri/target/release/xpubshield.exe`
- `src-tauri/target/release/bundle/msi/XpubShield_0.1.0_x64_en-US.msi`
- `src-tauri/target/release/bundle/nsis/XpubShield_0.1.0_x64-setup.exe`

## Dependency Audit Decision

`npm audit` reports 2 moderate findings through Vite/esbuild:

- Advisory: `GHSA-67mh-4wv8-2f99`
- Scope: Vite development server exposure through vulnerable `esbuild`
- Automated fix: `npm audit fix --force`, which currently jumps to `vite@8.0.10` and is a breaking upgrade

Decision for Demo Preview: document and defer the forced Vite major upgrade. The packaged Tauri app uses the built static frontend, not the Vite dev server. Before beta, either upgrade Vite with compatibility testing or replace the affected dev-server path.

## Remaining Beta Blockers

- Decide and execute the Vite/esbuild audit remediation path.
- Add broader fixture coverage for descriptor imports, ypub/zpub normalization, backend scans, alerts, graph data, and PSBT edge cases.
- Add richer live transaction history for Bitcoin Core/Esplora backends.
- Add background scan scheduling before claiming monitoring completeness.
- Review whether encrypted database support is required for beta.
- Perform a fresh watch-only security review before tagging a beta release.
