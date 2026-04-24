# XpubShield Handoff

Last updated: 2026-04-24

## Current State

Phases 1 through 8 are implemented as local-first product slices. Current release posture is **Demo Preview**, not beta.

The app is a Tauri + React + TypeScript + Rust project with SQLite persistence, deterministic audit logic, local descriptor/address derivation, local PSBT parsing, graph views, local alerts, Bitcoin Core RPC scanning, and Esplora-compatible address scanning.

The app remains watch-only. It does not process seed phrases, private keys, xprv values, WIF keys, signing material, transaction signing, PSBT finalization, transaction extraction, transaction broadcasting, cloud sync, user accounts, or telemetry.

## Completed

Phase 1:

- Tauri/React app shell
- Rust backend commands
- SQLite schema/migrations
- Rust data models
- Mock blockchain backend
- Descriptor/xpub import screen
- Private-material rejection
- Mock UTXO scanner
- Dashboard
- UTXO table
- Basic audit engine and risk scoring

Phase 2:

- Editable UTXO labels/source labels/source categories
- Editable spendability and quarantine status
- Fee stress test page
- Privacy simulator page
- Consolidation planner page

Phase 3:

- PSBT linter page
- Recovery health report page with JSON/Markdown export
- Descriptor diff page
- Transaction explanation page using templates

Phase 4:

- Durable SQLite persistence for wallet report and UTXO metadata
- Rust-backed public descriptor parsing and address derivation
- Rust-derived descriptor diff previews
- Local raw PSBT parsing/linting

Phase 5:

- Local Bitcoin Core RPC backend
- Local-only URL enforcement
- Derived-address-only `scantxoutset` scan objects

Phase 6:

- Graph view page
- Wallet graph, UTXO lifecycle, label cluster, privacy risk, and fee heatmap views
- Graph filters, node detail panel, and bounded rendering

Phase 7:

- Local alert engine
- SQLite alert persistence
- Alert acknowledgement commands and UI
- Alerts for public API mode, address reuse, gap/unconfirmed findings, wallet activity, and quarantined PSBT attempts

Phase 8:

- Esplora-compatible backend configuration
- Self-hosted/public Esplora address UTXO scanning
- Public API acknowledgement enforcement
- Derived-address-only Esplora requests

Phase 9:

- Release-readiness note added in `docs/RELEASE_READINESS.md`
- Dependency audit decision documented
- README and traceability updated

## Verification

Last known passing checks:

```powershell
npm run build
cd src-tauri
cargo test
cd ..
npm run tauri -- build
```

Generated artifacts:

- `src-tauri/target/release/xpubshield.exe`
- `src-tauri/target/release/bundle/msi/XpubShield_0.1.0_x64_en-US.msi`
- `src-tauri/target/release/bundle/nsis/XpubShield_0.1.0_x64-setup.exe`

## Known Limitations

- Current release posture is Demo Preview, not beta.
- `npm audit` still reports the Vite/esbuild moderate dev-server advisory; see `docs/RELEASE_READINESS.md`.
- Electrum scanning is not implemented.
- Bare ypub/zpub alternate-prefix normalization remains an import-hardening follow-up.
- Bitcoin Core and Esplora backends focus on UTXO discovery; richer transaction history and spent-output monitoring need more work.
- Background scan scheduling is not implemented.
- Address, transaction, source, and category label records exist in the schema but do not all have dedicated editing surfaces.
- SQLite database encryption is not implemented.
- Graph rendering is bounded in-app and does not yet use a dedicated graph library for very large wallets.

## Recommended Next Step

Move from Demo Preview toward beta readiness:

1. Decide whether to upgrade Vite now or explicitly defer the dev-server advisory until a compatibility pass.
2. Add fixture coverage for backend scans, PSBT edge cases, graph data, alerts, and ypub/zpub normalization.
3. Add richer live transaction history and background scan scheduling.
4. Run a fresh watch-only security review before any beta tag.

## Git Notes

Remote:

- `origin` is `https://dboyza@github.com/dboyza/XpubShield.git`
- Local Git Credential Manager is configured to prefer `dboyza` for GitHub.
- Do not push unless explicitly asked.
