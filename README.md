# XpubShield

XpubShield is a local-first, watch-only Bitcoin desktop app for personal custody observability. It helps users inspect wallet structure, xpub-derived descriptors, UTXO fee burden, labeling gaps, and basic privacy risks without signing or broadcasting transactions.

This repository currently implements the Phase 1 MVP with a Tauri + React shell, Rust data models and commands, SQLite schema/migrations, a mock blockchain backend, descriptor/xpub import validation, private-material rejection, mock UTXO scanning, a dashboard, a UTXO table, and a deterministic audit engine.

## Security Model

XpubShield is watch-only only.

- It must never ask for, import, store, transmit, or process seed phrases, mnemonics, private keys, xprv values, WIF keys, or signing material.
- Pasted private material is rejected before import.
- The app does not sign transactions.
- The app does not broadcast transactions.
- The app does not provide hosted accounts, cloud sync, or default telemetry.
- Xpubs, descriptors, labels, wallet history, addresses, and PSBTs are treated as sensitive local data.
- Raw xpubs and descriptors must never be sent to third-party APIs.

Phase 1 only scans bundled mock data. Future live backends must preserve the same security boundary.

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

Install dependencies:

```bash
npm install
```

Run the web UI in a browser:

```bash
npm run dev
```

Run the desktop app:

```bash
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
- `src/api/tauri.ts`: Tauri command bridge plus browser demo fallback.
- `src/types/domain.ts`: TypeScript domain model mirror of Rust structs.

Rust backend:

- `src-tauri/src/wallet_import.rs`: descriptor/xpub validation and private-material rejection.
- `src-tauri/src/descriptor_parser.rs`: Phase 1 descriptor metadata extraction.
- `src-tauri/src/address_derivation.rs`: mock address derivation surface.
- `src-tauri/src/blockchain_backend.rs`: backend trait.
- `src-tauri/src/mock_backend.rs`: deterministic mock scan data.
- `src-tauri/src/audit_engine.rs`: deterministic Phase 1 checks and risk scoring.
- `src-tauri/src/fee_estimator.rs`: script-type spend-cost estimates.
- `src-tauri/src/database.rs`: SQLite migration bootstrap.
- `src-tauri/src/tauri_commands.rs`: app commands exposed to React.

Scaffolded future modules:

- Esplora backend
- Bitcoin Core backend
- Privacy simulator
- Consolidation planner
- PSBT linter
- Recovery report
- Descriptor diff
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

- Mock blockchain backend only.
- Descriptor parsing is intentionally lightweight in Phase 1.
- Address derivation uses mock addresses for demonstration.
- No live Bitcoin Core, Electrum, or Esplora scanning yet.
- No PSBT linting beyond private-material rejection scaffold.
- No transaction signing.
- No transaction broadcasting.
- No encrypted database yet.
- No graph visualization yet.

## Roadmap

Phase 2:

- Local labeling workflow
- Quarantine status editing
- Fee stress testing
- Privacy simulator
- Consolidation planner simulation

Phase 3:

- PSBT linter
- Recovery health report
- Descriptor diff tool
- Transaction explanation templates

Phase 4:

- Interactive graph visualization
- Esplora-compatible backend
- Bitcoin Core RPC backend
- Local-only alerts
