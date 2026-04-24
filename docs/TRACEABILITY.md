# XpubShield Traceability Matrix

Last updated: 2026-04-24

Status legend:

- Implemented: working product slice exists and is wired into the app.
- Partial: useful slice exists, but it does not meet the full product-plan requirement.
- Missing: no working implementation yet.
- Blocked: needs a prerequisite before implementation should begin.

| Feature / requirement | Planned phase | Current status | Evidence | Gap | Proposed implementation task | Verification required |
| --- | --- | --- | --- | --- | --- | --- |
| Watch-only security boundary | Cross-cutting | Implemented | `src-tauri/src/wallet_import.rs`, `src/api/tauri.ts`, `src/components/PrivacyWarning.tsx` | Must remain enforced as new PSBT/backend code lands | Keep private material rejection in every import/PSBT path; never add sign/broadcast commands | Unit tests for xprv/WIF rejection; source scan for sign/broadcast paths |
| Tauri + React desktop shell | Phase 1 | Implemented | `src-tauri/src/lib.rs`, `src/App.tsx`, `src-tauri/tauri.conf.json` | None for current shell | Maintain existing shell while adding pages/commands | `npm run build`; `npm run tauri -- build` when shell changes |
| SQLite schema/migrations | Phase 1 / Phase 4 | Implemented for current wallet state | `src-tauri/migrations/001_initial_schema.sql`, `src-tauri/src/database.rs`, `src-tauri/src/tauri_commands.rs` | Future schema changes still need versioned migrations | Keep current wallet persistence local-only and add migrations as new stored features land | Rust DB round-trip tests; desktop package build |
| Descriptor/xpub import flow | Phase 1 / Phase 4 | Partial | `src/pages/OnboardingImport.tsx`, `src-tauri/src/wallet_import.rs`, `src-tauri/src/descriptor_parser.rs` | Public descriptors are parsed with miniscript; bare ypub/zpub imports still use shape validation and explicit script metadata | Add version translation or stricter parsing for alternate public extended key prefixes | Valid descriptor/xpub fixtures and invalid/private-material tests |
| Mock backend and demo wallet | Phase 1 | Implemented | `src-tauri/src/mock_backend.rs`, browser fallback in `src/api/tauri.ts` | Mock data should remain available after live backends | Keep mock backend as test/demo source | Mock backend tests and browser smoke test |
| Dashboard, UTXO table, audit score summaries | Phase 1 | Implemented | `src/pages/Dashboard.tsx`, `src/pages/UtxoTable.tsx`, `src-tauri/src/audit_engine.rs` | UI depends on current in-memory report | Reuse same UI with persisted wallet state | UI smoke test and Rust audit tests |
| UTXO detail drawer | Frontend pages | Missing | No `UtxoDetail` page/component in `src/pages`; `src/App.tsx` routes directly to the table only | Users cannot inspect one UTXO's derivation, spend costs, labels, quarantine status, related graph context, and explanation from a drawer | Add a local detail drawer to the UTXO table with deterministic explanation and all required UTXO fields | Frontend build; manual table/detail smoke test |
| Deterministic audit checks | Phase 1 / Phase 2 | Partial | `src-tauri/src/audit_engine.rs`, `src/lib/phase2.ts` | Some simulation-specific risks are frontend-only and not persisted | Keep deterministic checks local and add backend support as data matures | Unit tests for address reuse, tiny UTXO, label mixing, quarantine |
| Local labels, source labels, categories, quarantine, spendability | Phase 2 / Phase 4 | Partial | `src/pages/UtxoTable.tsx`, `src/App.tsx`, `src/api/tauri.ts`, `src-tauri/src/database.rs`, `src-tauri/src/tauri_commands.rs` | UTXO metadata persists locally; generic address, transaction, source, and category label records are not wired to UI commands yet | Add generic label table commands when those label targets have editing surfaces | DB round-trip tests; edit UTXO metadata, restart app, confirm values survive |
| Fee stress testing | Phase 2 | Implemented for mock data | `src/pages/FeeStressTest.tsx`, `src/lib/phase2.ts` | Uses current wallet report only | Reuse with persisted/live wallet reports | Frontend build and UI smoke test |
| Spend preview simulator | Phase 2 | Missing | No spend preview route/page in `src/App.tsx`; no dedicated spend preview command | Users can run privacy and consolidation simulations, but not a destination-amount spend preview with fee/change outputs | Add a simulation-only spend preview page and local/Rust-backed calculation; do not create, sign, or broadcast transactions | Unit tests for fee/change/label/quarantine outputs; frontend build |
| Privacy impact simulator | Phase 2 | Partial | `src/pages/PrivacySimulator.tsx`, `src/lib/phase2.ts`, `src-tauri/src/privacy_simulator.rs` | Frontend mock-data logic; Rust command not wired | Move or mirror stable simulation logic behind Tauri when persistence is mature | Unit tests for common-input, label mixing, quarantine risks |
| Consolidation planner | Phase 2 | Partial | `src/pages/ConsolidationPlanner.tsx`, `src/lib/phase2.ts`, `src-tauri/src/consolidation_planner.rs` | Simulation only; no persisted plans | Persist or export plans only after durable wallet state exists | Unit tests for fee estimate and privacy grouping |
| PSBT linter | Phase 3 / Phase 4 | Partial | `src/pages/PsbtLinter.tsx`, `src/api/tauri.ts`, `src-tauri/src/psbt_linter.rs` | Base64/hex PSBTs are parsed locally for fee/output/change/label/quarantine warnings; suspicious amount-pattern heuristics and richer derivation-origin review can still expand | Add focused fixtures for additional PSBT edge cases as parser coverage grows | Fixtures for high fee, unknown change, mixed labels, quarantined input |
| Recovery health report | Phase 3 | Partial | `src/pages/RecoveryHealth.tsx`, `src/lib/phase3.ts`, `src-tauri/src/recovery_report.rs` | Uses current lightweight descriptor metadata | Recompute from real descriptors and scan state after Phase 4 derivation | Recovery scoring tests and export smoke test |
| Descriptor diff tool | Phase 3 / Phase 4 | Partial | `src/pages/DescriptorDiff.tsx`, `src/api/tauri.ts`, `src-tauri/src/descriptor_diff.rs`, `src-tauri/src/address_derivation.rs` | Real Rust-derived previews work for parseable descriptors; bare xpub imports still need explicit script/path handling | Add xpub-import comparison mode with network/script/path controls | Fixture comparison against known wallet exports |
| Transaction explanations | Phase 3 | Implemented for mock data | `src/pages/TransactionExplanations.tsx`, `src/lib/phase3.ts` | Needs richer live transaction data later | Reuse templates with persisted/live transactions | Template unit tests when backend data expands |
| Phase 4 durable persistence | Phase 4 | Partial | `src-tauri/src/lib.rs`, `src-tauri/src/database.rs`, `src-tauri/src/tauri_commands.rs`, `src/App.tsx` | Current wallet and UTXO metadata are persisted; remaining label target tables and saved simulations/plans are not wired yet | Add narrowly scoped persistence commands as UI surfaces require them | Rust DB round-trip tests; desktop package build |
| Phase 4 real address derivation | Phase 4 | Partial | `src-tauri/src/address_derivation.rs`, `src-tauri/src/mock_backend.rs`, `src-tauri/src/descriptor_diff.rs` | Miniscript-backed derivation is available for parseable public descriptors; mock backend still falls back for demo placeholders and bare alternate xpub prefixes need normalization | Add alternate public xpub version normalization and use real derivation in live backends | Known-address fixtures |
| Phase 4 real PSBT parsing | Phase 4 | Implemented for raw PSBT envelopes | `src-tauri/src/psbt_linter.rs`, `src-tauri/src/tauri_commands.rs`, `src/pages/PsbtLinter.tsx` | Parser does not sign, finalize, extract for broadcast, or mutate PSBTs; future hardening can add more review heuristics | Keep analysis read-only and expand fixtures for missing metadata/change edge cases | PSBT parser tests for fee and quarantine warnings |
| Bitcoin Core local backend | Phase 5 | Implemented for local `scantxoutset` scanning | `src-tauri/src/bitcoin_core_backend.rs`, `src-tauri/src/tauri_commands.rs`, `src/pages/OnboardingImport.tsx` | Requires local Bitcoin Core RPC credentials; richer transaction history and spent-output monitoring still belong to later monitoring work | Keep RPC local-only and expand mocked scan fixtures for address activity/spent-output cases | Rust tests for local URL rejection, address-only scan objects, and UTXO mapping |
| Graph visualization | Phase 6 | Implemented | `src-tauri/src/graph_builder.rs`, `src/pages/GraphView.tsx`, `src/App.tsx` | Uses bounded in-app rendering rather than a dedicated graph library; future large-wallet work can add virtualization or React Flow/Cytoscape if needed | Keep graph modes backed by persisted wallet/audit data and add richer transaction edges as live history expands | Graph builder tests; frontend build; desktop package build |
| Local alerts and monitoring | Phase 7 | Implemented | `src-tauri/src/alert_engine.rs`, `src-tauri/src/database.rs`, `src/pages/Alerts.tsx`, `src/App.tsx` | Background polling and richer spent-output monitoring are deferred until backend scan scheduling matures | Keep alerts local-only; add rules as new scan/simulation events become durable | Alert rule tests, persistence tests, frontend build, desktop package build |
| Esplora backend and public API mode | Phase 8 | Implemented | `src-tauri/src/esplora_backend.rs`, `src/pages/OnboardingImport.tsx`, `src-tauri/src/tauri_commands.rs` | Address UTXO scanning is implemented; richer transaction history details can expand later | Keep public API acknowledgement unavoidable and continue querying derived addresses only | Esplora URL/privacy tests, frontend build, desktop package build |
| Settings page | Frontend pages / Phase 4+ | Missing | No Settings route/page in `src/App.tsx`; no settings UI in `src/pages` | Users cannot inspect backend configuration, privacy mode, data directory note, cache/label/report actions from the required Settings page | Add a local Settings page with backend/network/gap/privacy summary and local-data export/clear-cache placeholders that do not sync or transmit data | Frontend build; manual Settings smoke test |
| Testing fixture coverage | Testing plan | Partial | Rust unit tests cover 32 focused cases; no dedicated fixture directory for all required wallet and PSBT shapes | Required fixture set is incomplete for address reuse, many tiny UTXOs, mixed labels, legacy UTXOs, unconfirmed UTXO, dust attack, and PSBT edge cases | Add fixture files and focused tests without live network dependency | `cargo test`; fixture inventory review |
| Dependency audit baseline | Phase 9 | Implemented | `package.json`, `package-lock.json`; `npm audit` on 2026-04-24 reports 0 vulnerabilities after Vite/plugin upgrade | None for current npm advisory baseline | Keep dependency audit in final verification | `npm audit`; `npm ls vite @vitejs/plugin-react`; `npm run build`; `npm run tauri -- build` |
| Demo preview to beta readiness | Phase 9 | Partial | `README.md`, `docs/HANDOFF.md`, `docs/RELEASE_READINESS.md`, this audit | Baseline builds/tests pass and dependency audit is resolved, but beta blockers remain: missing pages, partial persistence/analysis, broader fixtures, richer live history, background scan scheduling, and security review | Remediate confirmed blockers in milestone commits | `npm audit`, `npm run build`, `cargo test`, `npm run tauri -- build`, UI smoke test |

## Earliest Incomplete Work

The earliest incomplete remediation item is product-surface completeness. Close gaps in this order: UTXO detail drawer, spend preview simulator, Settings page, generic label persistence, backend scan enrichment, analysis hardening, and fixture expansion.

## Full Audit Baseline

Audit date: 2026-04-24.

Verification results before remediation:

- `npm audit`: failed with 2 moderate findings through Vite/esbuild advisory `GHSA-67mh-4wv8-2f99`.
- `npm run build`: passed with Vite 5.4.21.
- `cargo test` in `src-tauri`: passed, 32 tests.
- `npm run tauri -- build`: passed and produced Windows MSI/NSIS bundles.

Dependency remediation result:

- Upgraded Vite to `8.0.10` and `@vitejs/plugin-react` to `6.0.1`.
- `npm audit`: passed with 0 vulnerabilities.
- `npm ls vite @vitejs/plugin-react`: passed with valid Vite 8 peer dependencies.
- `npm run build`, `cargo test`, and `npm run tauri -- build`: passed after the upgrade.

Static review notes:

- No signing, finalization, extraction-for-broadcast, broadcast, cloud sync, telemetry, or raw xpub/descriptor upload command was found in the exposed Tauri command set.
- Private-material rejection exists in frontend import/PSBT helpers and Rust import/descriptor/derivation paths.
- The code still contains browser-demo and mock fallbacks; these are acceptable for demo/testing only and should not be confused with live scan completeness.
- The term `extract` appears in descriptor parsing helper names, not transaction extraction for broadcast.
