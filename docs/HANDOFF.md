# XpubShield Handoff

Last updated: 2026-04-24

## Current State

Phases 1, 2, and 3 are implemented as local/mock-data product slices.

The app is a Tauri + React + TypeScript + Rust project with SQLite schema scaffolding. It currently uses mock wallet data and deterministic frontend/Rust logic. It does not sign transactions, broadcast transactions, transmit xpubs/descriptors, or connect to live Bitcoin backends yet.

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
- README and product plan

Phase 2:

- Editable local labels/source labels/source categories in UTXO table
- Editable spendability and quarantine status in UTXO table
- Fee stress test page
- Privacy simulator page
- Consolidation planner page
- Deterministic Phase 2 helper logic

Phase 3:

- PSBT linter page for mock JSON fixtures and raw PSBT envelope detection
- Recovery health report page with JSON/Markdown export
- Descriptor diff page with metadata comparison and deterministic previews
- Transaction explanation page using templates
- Mock PSBT fixture

Packaging/setup:

- Rust/Cargo setup documented in README
- Tauri Windows icon added
- Windows MSI and NSIS setup EXE build successfully

## Verification

Last known passing checks:

```powershell
npm run build
cd src-tauri
cargo test
```

Tauri packaging also passed:

```powershell
npm run tauri build
```

Generated artifacts:

- `src-tauri/target/release/xpubshield.exe`
- `src-tauri/target/release/bundle/msi/XpubShield_0.1.0_x64_en-US.msi`
- `src-tauri/target/release/bundle/nsis/XpubShield_0.1.0_x64-setup.exe`

## Known Limitations

- Live Bitcoin Core, Electrum, and Esplora backends are not implemented yet.
- Label/quarantine edits are session-local mock wallet state; durable SQLite persistence is still needed.
- Address derivation is mocked for demo purposes.
- PSBT linter does not yet parse real PSBT internals through Rust Bitcoin crates.
- Descriptor diff uses deterministic previews, not real Bitcoin address derivation.
- No graph visualization yet.
- No local alerts yet.
- Build artifacts are ignored and not tracked in Git.
- The public backend privacy score is wired to the selected backend mode even while scan data remains mocked.

## Recommended Next Step

Move to Phase 4 or harden the existing Phase 2/3 features before Phase 4.

Most valuable next implementation order:

1. Add durable SQLite persistence for labels, source labels, categories, quarantine status, and spendability status.
2. Replace mock descriptor preview/address derivation with Rust-backed `bitcoin`/`miniscript`/BDK-derived addresses.
3. Implement real PSBT parsing in Rust and expose it through Tauri commands.
4. Add graph visualization pages.
5. Add live backend support, starting with local Bitcoin Core RPC or self-hosted Esplora.

## Git Notes

Recent commits:

- `f55e1ff add phase 3 wallet review tools`
- `dd91192 add phase 2 wallet simulations`
- `bc43620 fix Tauri Windows packaging`
- `ed945fd document Rust setup for Tauri`

Remote:

- `origin` is `https://dboyza@github.com/dboyza/XpubShield.git`
- Local Git Credential Manager is configured to prefer `dboyza` for GitHub.
- `main` was synced with `origin/main` before the Phase 4 verification pass.
