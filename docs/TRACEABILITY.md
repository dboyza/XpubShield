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
| SQLite schema/migrations | Phase 1 / Phase 4 | Partial | `src-tauri/migrations/001_initial_schema.sql`, `src-tauri/src/database.rs` | Schema exists, but app state is not loaded/saved through SQLite | Wire app state to local SQLite and persist current wallet metadata | Rust tests that initialize DB, save data, and reload it |
| Descriptor/xpub import flow | Phase 1 | Partial | `src/pages/OnboardingImport.tsx`, `src-tauri/src/wallet_import.rs` | Descriptor validation is shape-based, not full Bitcoin descriptor parsing | Replace lightweight parser with Rust Bitcoin/miniscript-backed validation | Valid descriptor/xpub fixtures and invalid/private-material tests |
| Mock backend and demo wallet | Phase 1 | Implemented | `src-tauri/src/mock_backend.rs`, browser fallback in `src/api/tauri.ts` | Mock data should remain available after live backends | Keep mock backend as test/demo source | Mock backend tests and browser smoke test |
| Dashboard, UTXO table, audit score summaries | Phase 1 | Implemented | `src/pages/Dashboard.tsx`, `src/pages/UtxoTable.tsx`, `src-tauri/src/audit_engine.rs` | UI depends on current in-memory report | Reuse same UI with persisted wallet state | UI smoke test and Rust audit tests |
| Deterministic audit checks | Phase 1 / Phase 2 | Partial | `src-tauri/src/audit_engine.rs`, `src/lib/phase2.ts` | Some simulation-specific risks are frontend-only and not persisted | Keep deterministic checks local and add backend support as data matures | Unit tests for address reuse, tiny UTXO, label mixing, quarantine |
| Local labels, source labels, categories, quarantine, spendability | Phase 2 / Phase 4 | Partial | `src/pages/UtxoTable.tsx`, `src/App.tsx`, `src/types/domain.ts` | Edits are session-local React state | Persist UTXO metadata edits in SQLite and reload them on app start | Edit UTXO metadata, restart app, confirm values survive |
| Fee stress testing | Phase 2 | Implemented for mock data | `src/pages/FeeStressTest.tsx`, `src/lib/phase2.ts` | Uses current wallet report only | Reuse with persisted/live wallet reports | Frontend build and UI smoke test |
| Privacy impact simulator | Phase 2 | Partial | `src/pages/PrivacySimulator.tsx`, `src/lib/phase2.ts`, `src-tauri/src/privacy_simulator.rs` | Frontend mock-data logic; Rust command not wired | Move or mirror stable simulation logic behind Tauri when persistence is mature | Unit tests for common-input, label mixing, quarantine risks |
| Consolidation planner | Phase 2 | Partial | `src/pages/ConsolidationPlanner.tsx`, `src/lib/phase2.ts`, `src-tauri/src/consolidation_planner.rs` | Simulation only; no persisted plans | Persist or export plans only after durable wallet state exists | Unit tests for fee estimate and privacy grouping |
| PSBT linter | Phase 3 / Phase 4 | Partial | `src/pages/PsbtLinter.tsx`, `src/lib/phase3.ts`, `src-tauri/src/psbt_linter.rs` | Mock JSON/envelope detection only; no real PSBT internals | Parse PSBTs in Rust and expose analysis through Tauri | Fixtures for high fee, unknown change, mixed labels, quarantined input |
| Recovery health report | Phase 3 | Partial | `src/pages/RecoveryHealth.tsx`, `src/lib/phase3.ts`, `src-tauri/src/recovery_report.rs` | Uses current lightweight descriptor metadata | Recompute from real descriptors and scan state after Phase 4 derivation | Recovery scoring tests and export smoke test |
| Descriptor diff tool | Phase 3 / Phase 4 | Partial | `src/pages/DescriptorDiff.tsx`, `src/lib/phase3.ts`, `src-tauri/src/descriptor_diff.rs` | Deterministic placeholder previews, not real addresses | Use Rust-backed derivation for first 20 addresses | Fixture comparison against known wallet exports |
| Transaction explanations | Phase 3 | Implemented for mock data | `src/pages/TransactionExplanations.tsx`, `src/lib/phase3.ts` | Needs richer live transaction data later | Reuse templates with persisted/live transactions | Template unit tests when backend data expands |
| Phase 4 durable persistence | Phase 4 | Missing | SQLite tables exist, but commands use `Mutex<Option<WalletReport>>` only | No app-data database, no save/load commands | Add SQLite-backed current wallet and UTXO metadata persistence | Rust DB round-trip tests; UI smoke test |
| Phase 4 real address derivation | Phase 4 | Missing | `src-tauri/src/address_derivation.rs` uses mock addresses | No Bitcoin descriptor address derivation | Add Rust Bitcoin/miniscript/BDK derivation for descriptors/xpub templates | Known-address fixtures |
| Phase 4 real PSBT parsing | Phase 4 | Missing | `src-tauri/src/psbt_linter.rs` rejects private material only | No PSBT input/output/fee/change parsing | Parse PSBT locally with Rust Bitcoin crates | PSBT fixture tests |
| Bitcoin Core local backend | Phase 5 | Missing | `src-tauri/src/bitcoin_core_backend.rs` has local URL helper only | No RPC client or scan flow | Implement local RPC config and scan derived addresses only | Mocked RPC integration tests |
| Graph visualization | Phase 6 | Partial | `src-tauri/src/graph_builder.rs` scaffold only | No graph page or interactive UI | Add graph builder output and frontend graph view | Graph builder tests and UI smoke test |
| Local alerts and monitoring | Phase 7 | Missing | `Alert` model and `alerts` table only | No alert engine, commands, or page | Add local alert rules, persistence, and acknowledgement UI | Alert rule tests and persistence tests |
| Esplora backend and public API mode | Phase 8 | Partial scaffold | `src-tauri/src/esplora_backend.rs`, import warning in `OnboardingImport.tsx` | No HTTP backend or scan flow | Implement self-hosted Esplora first, then optional public mode | Mocked Esplora tests; public API acknowledgement test |
| Demo preview to beta readiness | Phase 9 | Missing | README and handoff exist | Needs audit decisions, expanded fixtures, docs refresh, final packaging checks | Add release-readiness checklist and satisfy beta gates | Build, test, package, dependency audit review |

## Earliest Incomplete Work

The earliest incomplete roadmap item is Phase 4 durable SQLite persistence for UTXO metadata. This is the safest first implementation slice because it removes the current session-local limitation without changing descriptor derivation, backend scanning, or PSBT parsing.
