# XpubShield Product Plan

XpubShield is the renamed project that began under the working title “UTXO Sentinel.”

## Product Vision

XpubShield is a local-first Bitcoin watch-only desktop app for personal custody observability. It lets users import a Bitcoin xpub or output descriptor, scan derived wallet addresses, audit UTXO privacy, fee, and operational risks, visualize wallet activity, lint PSBTs before signing, and understand how future spending decisions affect privacy and fees.

This is not a spending wallet.
This is not a chain-surveillance product.
This is not a hosted service.

The app is for Bitcoin users who want to understand and manage their UTXOs safely without exposing signing material.

## Primary User

A Bitcoin self-custody user with cold storage or hardware wallets, such as Sparrow, Specter, Bitcoin Core, Coldcard, Trezor, Ledger, or Passport, who wants to answer:

- Are my coins private?
- Are my UTXOs economical to spend?
- Am I accidentally linking unrelated coins?
- Is this PSBT safe to sign elsewhere?
- Can I recover this wallet correctly later?
- What does my wallet structure reveal on-chain?

## Core Security Rules

- Never ask for, import, store, transmit, or process seed phrases, mnemonics, private keys, xprv values, WIF keys, or signing material.
- Reject private key material immediately if pasted.
- The app is watch-only only.
- No transaction signing.
- No automatic broadcasting.
- No cloud sync.
- No user accounts.
- No telemetry by default.
- Treat xpubs, descriptors, labels, wallet history, addresses, and PSBTs as sensitive private data.
- Never send a raw xpub or descriptor to a third-party API.
- Derive addresses locally.
- Public API mode is allowed only if the user explicitly enables it after seeing a privacy warning.
- Store data locally only.
- Make all privacy warnings clear and unavoidable.

## Recommended Tech Stack

- Tauri desktop app
- React + TypeScript frontend
- Rust backend
- SQLite for persistence
- Rust Bitcoin ecosystem crates where appropriate:
  - `bitcoin`
  - `miniscript`
  - `bdk_wallet` or relevant BDK crates
  - `serde`
  - `rusqlite` or `sqlx`
- Graph visualization with React Flow, Cytoscape.js, or D3.js
- Clean modern UI with dark mode

## Architecture Boundaries

Keep clear separation between:

- Wallet import/parsing
- Address derivation
- Blockchain backends
- Audit engine
- PSBT linting
- Graph generation
- Frontend UI

Rust modules:

- `wallet_import`
- `descriptor_parser`
- `address_derivation`
- `blockchain_backend`
- `mock_backend`
- `esplora_backend`
- `bitcoin_core_backend`
- `audit_engine`
- `fee_estimator`
- `privacy_simulator`
- `consolidation_planner`
- `psbt_linter`
- `recovery_report`
- `descriptor_diff`
- `graph_builder`
- `database`
- `tauri_commands`

Frontend structure:

- `components/`
- `pages/`
- `hooks/`
- `lib/`
- `types/`
- `stores/`
- `api/`

## Supported Wallet Imports

Preferred import: Bitcoin output descriptors.

Examples:

- `wpkh([fingerprint/84h/0h/0h]xpub.../0/*)`
- `wpkh([fingerprint/84h/0h/0h]xpub.../1/*)`
- `sh(wpkh(...))`
- `tr(...)`
- `sortedmulti(...)`

Fallback import: bare xpub, ypub, or zpub import wizard.

For bare xpub import, ask the user to choose:

- Network: mainnet, testnet, signet, regtest
- Script type: legacy, nested SegWit, native SegWit, Taproot
- Account path guess: BIP44, BIP49, BIP84, BIP86
- Gap limit

Import requirements:

- Support external and change keychains.
- Validate all imports.
- Reject xprv and private key material.
- Prefer descriptor-based wallet identity internally.

## Blockchain Backends

Supported backend targets:

- Mock blockchain backend for development/testing
- Local Bitcoin Core RPC
- Local Electrum server or Esplora-compatible API
- Self-hosted Esplora-compatible API
- Public Esplora/mempool.space-compatible API as optional low-privacy mode

Design a backend trait/interface so sources can be swapped.

## Privacy Model

- Local Bitcoin Core: best privacy
- Personal Electrum server: good privacy
- Self-hosted Esplora: good privacy
- Tor-routed public API: medium privacy
- Public API without Tor: weak privacy
- Uploading xpubs to third-party services: severe privacy leak and must never be done by this app

## Core Data Models

- Wallet
- Descriptor
- DerivedAddress
- Transaction
- UTXO
- Label
- AuditFinding
- FeeEstimate
- SpendSimulation
- ConsolidationPlan
- PSBTAnalysis
- RecoveryHealthReport
- GraphNode
- GraphEdge
- BackendPrivacyScore
- Alert

## UTXO Fields

- `txid`
- `vout`
- `outpoint`
- `amount_sats`
- `address`
- `script_pubkey`
- `script_type`
- `derivation_path`
- `confirmations`
- `block_height`
- `block_time`
- `label`
- `source_label`
- `source_category`
- `is_change`
- `source_txid`
- `spend_vbytes_estimate`
- `spend_cost_by_fee_rate`
- `audit_flags`
- `quarantine_status`
- `spendability_status`

## Labels

Implement local wallet labels for:

- UTXO labels
- Address labels
- Transaction labels
- Source labels
- Category labels

Suggested source categories:

- Exchange
- Mining
- P2P
- Business
- Donation
- Gift
- Unknown
- Cold storage
- Consolidation
- Change
- Other

## UTXO Status System

Each UTXO can be marked:

- Spendable
- Do not spend
- Quarantined
- Consolidate later
- Cold storage only
- Needs accounting review
- Unknown

## Quarantine System

Add a quarantine feature for UTXOs that should not be casually spent or merged.

Quarantine reasons:

- Dust attack suspicion
- Unknown source
- Unlabeled deposit
- Too small to spend economically
- Received to reused address
- Should not be combined with KYC coins
- Should not be combined with non-KYC coins
- Suspicious external spend/change pattern
- Manually quarantined by user

## Audit Engine

Implement deterministic audit checks.

Required checks:

1. Address reuse
   - Flag addresses with more than one receive transaction.
2. Tiny UTXO
   - Flag UTXOs whose estimated spend cost is high relative to value.
   - Calculate spend cost at fee rates: 5, 10, 25, 50, 100, 200 sats/vB.
3. Uneconomical-to-spend
   - Flag if spend cost exceeds configurable percentage of UTXO value.
   - Default threshold: 25%.
4. UTXO sprawl
   - Flag wallets with many small UTXOs under configurable thresholds.
5. Over-consolidation risk
   - Warn when combining UTXOs with different labels, source categories, or clusters.
6. Old script type
   - Warn for legacy P2PKH UTXOs because they are more expensive to spend.
7. Unconfirmed UTXO
   - Flag 0-confirmation UTXOs.
   - Show parent transaction status if available.
8. Derivation gap risk
   - Warn if activity appears near the configured gap limit.
9. Label hygiene
   - Warn for unlabeled UTXOs.
10. Privacy leak warning
   - Warn when public API mode is enabled.
11. Quarantined coin risk
   - Warn if a selected spend includes quarantined coins.
12. Toxic change risk
   - Warn when a simulated transaction would produce change that links unrelated UTXOs.
13. Label mixing risk
   - Warn when a simulated spend combines coins from different labels/categories.
14. Dust attack suspicion
   - Flag tiny unexpected UTXOs from unknown sources.

## Risk Scoring

Produce scores from 0 to 100.

Categories:

- Privacy
- Fee efficiency
- Operational clarity
- Spend readiness
- Recovery readiness
- Backend privacy

Each audit finding should include:

- `id`
- `severity`: info, low, medium, high, critical
- `title`
- `explanation`
- `recommended_action`
- `affected_utxos`
- `affected_transactions`
- `confidence_level`
- `heuristic_notes`

Use careful heuristic language:

- “This may indicate...”
- “This likely links...”
- “This could reveal...”
- “This heuristic is not definitive...”

Avoid unsupported certainty:

- Do not say “This coin is safe.”
- Do not say “This address belongs to X.”
- Do not say “This transaction proves Y.”

## Privacy Impact Simulator

Feature name: “What does the chain know?”

Given selected UTXOs, show what a chain observer could reasonably infer:

- Common input ownership risk
- Address reuse
- Change address likelihood
- Label/category mixing
- UTXO merge risk
- Source linkage risk
- Consolidation fingerprint
- Toxic change creation
- Future spend privacy damage

Output should include:

- Plain-English explanation
- Risk level
- Confidence level
- Affected UTXOs
- Suggested alternatives

## Spend Preview Simulator

Let the user simulate a future spend without signing or broadcasting.

Inputs:

- Destination amount
- Selected UTXOs
- Optional manual fee rate
- Optional change address policy
- Optional label/category constraints

Outputs:

- Estimated fee
- Estimated vsize
- Change amount
- Whether change is likely created
- Privacy risk
- Label mixing risk
- Quarantine warnings
- Better UTXO suggestions
- Fee cost at multiple fee rates

Do not create, sign, or broadcast a transaction in MVP.

## Consolidation Planner

Let the user select UTXOs and simulate consolidation.

Show:

- Current UTXO count
- Proposed post-consolidation UTXO count
- Fee cost at selected fee rate
- Future fee savings estimate
- Privacy damage
- Labels/categories being merged
- Whether quarantined coins are included
- Whether KYC/non-KYC categories are being mixed
- Suggested safer consolidation groups

Do not simply recommend “consolidate everything.” Consolidation advice must be label-aware and privacy-aware.

## Fee Stress Testing

For fee rates 5, 10, 25, 50, 100, 200, and 300 sats/vB, show:

- Total cost to spend all UTXOs
- Number of uneconomical UTXOs
- Percentage of wallet value consumed by fees
- Which UTXOs become problematic
- Suggested actions:
  - leave alone
  - consolidate later
  - mark do-not-spend
  - label source
  - review manually

## PSBT Linter

Build a PSBT analysis feature.

Users can import a PSBT file or paste PSBT text. The app parses it locally and runs checks before the user signs elsewhere.

PSBT lint checks:

1. Fee sanity
2. Unknown outputs
3. Change verification
4. Quarantined UTXO spend
5. Label mixing
6. Address reuse
7. Dust output
8. Legacy input cost
9. Suspicious amount pattern
10. Missing metadata

PSBT analysis output:

- Summary
- Inputs
- Outputs
- Fee estimate
- Fee-rate estimate
- Change detection
- Privacy impact
- Warnings
- Recommended manual review items

Do not sign PSBTs.
Do not broadcast PSBTs.
Optional future feature: export reviewed PSBT unchanged.

## Wallet Recovery Health Report

Evaluate whether the watch-only wallet can be reconstructed elsewhere.

Report fields:

- Wallet name
- Network
- Descriptor(s)
- Descriptor checksum if available
- Script type
- Master fingerprint
- Account derivation path
- External descriptor present
- Change descriptor present
- Last scanned external index
- Last scanned change index
- Gap limit
- Multisig policy if applicable
- Number of cosigners if applicable
- Sortedmulti or not
- Miniscript policy if applicable
- Import compatibility notes
- Missing metadata warnings

Recovery score: 0 to 100.

Warn if:

- No change descriptor
- Unknown derivation path
- Unknown master fingerprint
- Missing descriptor checksum
- Bare xpub imported without complete metadata
- Multisig wallet lacks cosigner info
- Gap limit too low
- Wallet type ambiguous

## Descriptor Diff Tool

Compare two descriptors or xpub imports.

Compare:

- Network
- Script type
- Master fingerprint
- Derivation path
- Xpub
- Branch
- Wildcard index
- Descriptor checksum
- First 20 generated addresses
- External/change identity

Use case: verify that Sparrow exports, Bitcoin Core descriptors, and hardware wallet watch-only exports describe the same wallet.

## Transaction Explanation Engine

For each transaction, generate deterministic plain-English explanations from templates.

Examples:

- “This transaction received 0.031 BTC to address index /0/42. It appears to be an external receive. The output is confirmed, unlabeled, and economical to spend above 25 sats/vB. No address reuse was detected.”
- “This transaction appears to consolidate 14 UTXOs from 4 different labels. This may reduce future fees but links those histories together.”
- “This PSBT spends 3 UTXOs: 2 labeled Exchange and 1 labeled P2P. Signing this transaction may link those sources.”

Do not require an LLM.
Avoid unsupported certainty.

## Wallet Monitoring And Alerts

Add local-only alert support.

Alerts:

- New incoming UTXO detected
- UTXO spent externally
- Wallet balance changed
- Unknown address activity
- Activity near gap limit
- New address reuse detected
- Public API mode enabled
- Quarantined UTXO appears in a simulated spend
- PSBT attempts to spend quarantined UTXO

## Blockchain Visualization

Build interactive graph views.

Graph types:

1. Wallet graph
   - Transactions, addresses, UTXOs
   - Receives, spends, creates, change edges
2. UTXO lifecycle graph
   - Deposit -> UTXO -> simulated spend/consolidation/change
3. Label cluster graph
   - Group UTXOs by source label/category
4. Privacy risk graph
   - Highlight linked UTXOs, reused addresses, consolidation clusters, toxic change
5. Fee heatmap
   - Show which UTXOs become uneconomical at different fee rates

Graph requirements:

- Transaction nodes show txid prefix, date, fee, confirmation count.
- UTXO nodes show amount and risk state.
- Address nodes show address prefix and whether reused.
- Clicking a node opens a detail panel.
- Filters:
  - label
  - source category
  - date
  - amount
  - script type
  - risk flag
  - confirmation count
- Add graph pagination or viewport rendering for large wallets.
- Avoid trying to render huge wallets all at once.

## Frontend Pages

1. Onboarding / Import Wallet
2. Dashboard
3. UTXO Table
4. UTXO Detail Drawer
5. Privacy Simulator
6. Fee Stress Test
7. Consolidation Planner
8. PSBT Linter
9. Descriptor Diff Tool
10. Recovery Health Report
11. Graph View
12. Settings

## Database Requirements

Create migrations for:

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

The local DB contains sensitive metadata. Document this clearly.
Optional future feature: encrypted database.

## Testing Plan

Add unit tests for:

- Descriptor parsing
- Xpub acceptance
- Xprv/private key rejection
- Address derivation
- Descriptor diff
- Spend cost estimation
- Tiny UTXO detection
- Address reuse detection
- Label mixing detection
- Quarantine behavior
- Privacy simulation
- Consolidation planner
- PSBT fee detection
- PSBT change detection
- Recovery report scoring

Add integration tests using mocked blockchain data.

Add fixture data:

- Simple native SegWit wallet
- Wallet with address reuse
- Wallet with many tiny UTXOs
- Wallet with mixed labels
- Wallet with legacy UTXOs
- Wallet with unconfirmed UTXO
- Wallet with simulated dust attack
- PSBT with normal change
- PSBT with unknown change
- PSBT with high fee
- PSBT spending mixed labels
- PSBT spending quarantined UTXO

## MVP Scope And Phases

### Phase 1

- Project skeleton
- Tauri + React frontend
- Rust backend commands
- SQLite schema/migrations
- Mock backend
- Descriptor/xpub import flow
- Private key rejection
- Mock UTXO loading
- Dashboard
- UTXO table
- Basic audit engine

Initial deliverables:

1. Working Tauri app shell
2. React dashboard
3. SQLite schema and migrations
4. Rust data models
5. Mock blockchain backend
6. Descriptor/xpub import screen
7. Private key rejection
8. Mock UTXO scanner
9. UTXO audit engine
10. UTXO table
11. Basic risk scoring
12. README with security model, privacy model, development setup, architecture overview, MVP limitations, roadmap

### Phase 2

- Labeling
- Quarantine status
- Fee stress testing
- Privacy simulator
- Consolidation planner using simulation only

### Phase 3

- PSBT linter
- Recovery health report
- Descriptor diff tool
- Transaction explanation templates

### Phase 4

- Graph visualization
- Esplora-compatible backend
- Bitcoin Core backend
- Alerts

## Non-Goals For MVP

- No seed phrase import
- No private key import
- No xprv support
- No signing
- No broadcasting
- No cloud account
- No hosted backend
- No automatic financial advice
- No address attribution service
- No chain-surveillance vendor integrations

## UX Principles

- Be explicit about privacy tradeoffs.
- Explain findings in plain English.
- Never overstate confidence.
- Prefer “may/could/likely” language for heuristics.
- Make dangerous actions obvious.
- Make public API mode visually distinct from local-node mode.
- Make labels central to the product.
- Optimize for self-custody users, not traders.
