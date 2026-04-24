# XpubShield

XpubShield is a local-first, watch-only Bitcoin desktop app for personal custody observability. It helps users inspect wallet structure, xpub-derived descriptors, UTXO fee burden, labeling gaps, and basic privacy risks without signing or broadcasting transactions.

This repository currently implements Phases 1-5 as local-first product slices. Phase 1 covers the Tauri + React shell, Rust data models and commands, SQLite schema/migrations, a mock blockchain backend, descriptor/xpub import validation, private-material rejection, mock UTXO scanning, a dashboard, a UTXO table, and a deterministic audit engine.

Phase 2 includes local label/quarantine editing, fee stress testing, a privacy impact simulator, and a consolidation planner using simulation-only mock wallet data.

Phase 3 includes a local PSBT linter, recovery health report, descriptor diff tool, and template-based transaction explanations. Phase 4 hardens persistence, descriptor derivation, descriptor diff previews, and raw PSBT parsing. Phase 5 adds a local Bitcoin Core RPC backend that scans derived addresses with `scantxoutset` `addr(...)` scan objects.

## Security Model

XpubShield is watch-only only.

- It must never ask for, import, store, transmit, or process seed phrases, mnemonics, private keys, xprv values, WIF keys, or signing material.
- Pasted private material is rejected before import.
- The app does not sign transactions.
- The app does not broadcast transactions.
- The app does not provide hosted accounts, cloud sync, or default telemetry.
- Xpubs, descriptors, labels, wallet history, addresses, and PSBTs are treated as sensitive local data.
- Raw xpubs and descriptors must never be sent to third-party APIs.

The app supports bundled mock data and local Bitcoin Core RPC scanning. Live backend code must preserve the same security boundary and must query derived addresses only.

## Privacy Model

Backend privacy is modeled as a user-visible score:

- Local Bitcoin Core RPC: best privacy.
- Personal Electrum server: good privacy.
- Self-hosted Esplora-compatible API: good privacy.
- Tor-routed public API: medium privacy.
- Public API without Tor: weak privacy.
- Uploading xpubs to third-party services: severe privacy leak and prohibited by the app.

The local SQLite database contains sensitive wallet metadata. It may include descriptors, xpub-derived descriptors, addresses, labels, transactions, UTXOs, audit findings, and backend settings. Keep the data directory private and backed up appropriately. Encrypted database support is a future feature.

## Development Setup

Prerequisites:

- Node.js 20+
- Rust stable with Cargo
- Platform dependencies required by Tauri

On Windows, install Rust through rustup:

1. Download and run `rustup-init.exe` from `https://rustup.rs`.
2. Choose the default installation.
3. Close and reopen PowerShell.
4. Verify Cargo is available:

```powershell
rustc --version
cargo --version
```

If `npm run tauri dev` fails with `program not found` while running `cargo metadata`, Rust/Cargo is not installed or is not on `PATH`.

Install dependencies:

```bash
npm install
```

Run the web UI in a browser:

```bash
npm run dev
```

Run the desktop app:

```powershell
npm run tauri dev
```

Build the frontend:

```bash
npm run build
```

Run Rust tests:

```bash
cd src-tauri
cargo test
```

## Architecture Overview

Frontend:

- `src/pages/OnboardingImport.tsx`: descriptor/xpub import flow, backend selection, privacy warning, client-side private-material rejection.
- `src/pages/Dashboard.tsx`: balance, UTXO count, risk scores, findings, wallet-shape summary.
- `src/pages/UtxoTable.tsx`: sortable/filterable UTXO table with fee-cost and audit flag visibility.
- `src/pages/FeeStressTest.tsx`: deterministic fee-rate stress test across wallet UTXOs.
- `src/pages/PrivacySimulator.tsx`: “What does the chain know?” selected-UTXO privacy simulator.
- `src/pages/ConsolidationPlanner.tsx`: label-aware consolidation simulation.
- `src/pages/PsbtLinter.tsx`: local PSBT fixture linter and raw PSBT parser handoff.
- `src/pages/RecoveryHealth.tsx`: watch-only recovery metadata report with JSON/Markdown export.
- `src/pages/DescriptorDiff.tsx`: descriptor/xpub identity comparison tool.
- `src/pages/TransactionExplanations.tsx`: deterministic transaction explanation templates.
- `src/pages/GraphView.tsx`: interactive wallet, lifecycle, label, privacy-risk, and fee heatmap views.
- `src/api/tauri.ts`: Tauri command bridge plus browser demo fallback.
- `src/types/domain.ts`: TypeScript domain model mirror of Rust structs.

Rust backend:

- `src-tauri/src/wallet_import.rs`: descriptor/xpub validation and private-material rejection.
- `src-tauri/src/descriptor_parser.rs`: descriptor metadata extraction and miniscript-backed public descriptor validation.
- `src-tauri/src/address_derivation.rs`: mock demo derivation plus miniscript-backed descriptor address derivation.
- `src-tauri/src/blockchain_backend.rs`: backend trait.
- `src-tauri/src/mock_backend.rs`: deterministic mock scan data.
- `src-tauri/src/bitcoin_core_backend.rs`: local-only Bitcoin Core RPC scan flow using derived address scan objects.
- `src-tauri/src/audit_engine.rs`: deterministic Phase 1 checks and risk scoring.
- `src-tauri/src/fee_estimator.rs`: script-type spend-cost estimates.
- `src-tauri/src/database.rs`: SQLite migration bootstrap and current wallet/UTXO metadata persistence.
- `src-tauri/src/graph_builder.rs`: bounded wallet graph node/edge construction.
- `src-tauri/src/tauri_commands.rs`: app commands exposed to React.

Rust modules scaffolded for current and future phases:

- Esplora backend
- Privacy simulator
- Consolidation planner
- Recovery report
- Graph builder

## SQLite Schema

The initial migration is in `src-tauri/migrations/001_initial_schema.sql` and creates:

- `wallets`
- `descriptors`
- `derived_addresses`
- `transactions`
- `transaction_inputs`
- `transaction_outputs`
- `utxos`
- `labels`
- `audit_findings`
- `spend_simulations`
- `consolidation_plans`
- `psbt_analyses`
- `alerts`
- `settings`
- `backend_configs`

## Phase 1 Audit Checks

Implemented:

- Address reuse
- Tiny UTXO
- Uneconomical-to-spend threshold
- UTXO sprawl
- Legacy script type fee warning
- Unconfirmed UTXO
- Derivation gap risk
- Label hygiene
- Public API privacy warning
- Dust attack suspicion

Findings use heuristic language and avoid claiming certainty about ownership, safety, or counterparty identity.

## MVP Limitations

- Bitcoin Core RPC scanning requires a local node and local RPC credentials; it rejects non-local RPC URLs.
- Electrum and Esplora scanning are not implemented yet.
- Bare ypub/zpub alternate-prefix normalization remains an import-hardening follow-up.
- Address, transaction, source, and category label records are scaffolded in SQLite but do not yet have full editing UI.
- No transaction signing.
- No transaction broadcasting.
- No encrypted database yet.
- Graph rendering is bounded in-app and does not yet use a dedicated graph library for very large wallets.

## Roadmap

Phase 2:

- Local labeling workflow: implemented for UTXO metadata with SQLite persistence
- Quarantine status editing: implemented for UTXO metadata with SQLite persistence
- Fee stress testing: implemented for mock wallet data
- Privacy simulator: implemented for selected mock UTXOs
- Consolidation planner simulation: implemented for selected mock UTXOs

Phase 3:

- PSBT linter: implemented for mock fixtures and local raw PSBT parsing
- Recovery health report: implemented for current watch-only metadata
- Descriptor diff tool: implemented with Rust-derived descriptor previews when descriptors are parseable
- Transaction explanation templates: implemented for mock transaction data

Phase 4:

- Durable wallet/UTXO metadata persistence: implemented
- Rust-backed descriptor parsing/address derivation: implemented for parseable public descriptors
- Raw PSBT parsing/linting: implemented

Phase 5:

- Bitcoin Core RPC backend: implemented for local `scantxoutset` address scanning

Phase 6:

- Graph visualization: implemented with wallet, lifecycle, label cluster, privacy risk, and fee heatmap views

Next:

- Local-only alerts
- Esplora-compatible backend
