# XpubShield Product Strategy

Last updated: 2026-04-25

## Purpose

XpubShield is a local-first Bitcoin operational security cockpit for watch-only wallet analysis. It exists to help an operator answer:

- What is the current risk posture of this wallet?
- Which coins need attention before I spend?
- What could an observer infer from a proposed spend?
- Is my recovery metadata complete enough to rely on?
- Does this PSBT deserve signer attention?

The product should feel decisive and operational, not like a generic wallet dashboard.

## Product Boundary

XpubShield is pre-sign software.

It must not:

- Store seed phrases, private keys, WIF keys, xprv values, or signer secrets.
- Create, sign, finalize, extract, or broadcast transactions.
- Act as custody infrastructure.
- Call remote attribution services for chain-surveillance-style labels.

It may:

- Analyze descriptors, xpubs, addresses, UTXOs, transactions, PSBT text, and local operator labels.
- Store local metadata such as labels, coin sets, quarantine state, provenance assessments, dismissed actions, and workspace state.
- Explain risk with evidence, confidence, and recommended next steps.

## Target User

The primary user is a sovereign Bitcoin operator managing cold storage, privacy boundaries, recovery posture, and pre-sign review.

The app should assume the user cares about:

- Avoiding accidental context merges.
- Separating exchange/KYC coins from unrelated sources.
- Understanding fee exposure before high-fee periods.
- Preserving local operational memory.
- Verifying recovery metadata before an emergency.
- Reviewing PSBTs before signing elsewhere.

## Current Product Shape

The focused primary navigation is:

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

Cockpit is the home surface. It replaces the old Dashboard concept and should lead with wallet risk posture, the top risk driver, affected coins, confidence, and the next safest action.

Older standalone concepts are now folded into stronger parent surfaces:

- Alerts -> Cockpit Action Center
- Explanations -> Documentation and contextual help
- Fee stress -> Coin Workbench fee lens and Spend Preflight
- Privacy/consolidation -> Spend Preflight scenario analysis
- Descriptor diff -> Recovery diagnostics

## Product Principles

### Lead With Decisions

Every major surface should help the user decide what to do next. Avoid presenting raw analytics without a clear operational consequence.

### Show Evidence

Warnings should answer:

- Why do we think this?
- How confident are we?
- Which coins are affected?
- What can the operator do?

### Stay Local First

Sensitive wallet metadata should remain local unless the operator explicitly chooses a backend that requires address queries. Browser demo behavior must remain visibly different from packaged desktop persistence.

### Keep the Safety Boundary Sharp

The app should reject private material and reinforce that descriptors and xpubs are still sensitive metadata.

### Prefer Focused Surfaces

Do not add new top-level pages for every risk category. If a concept informs a coin or spend decision, it belongs inside Coin Workbench, Spend Preflight, Cockpit, Recovery, or PSBT Preflight.

## Near-Term Roadmap

Closed beta should focus on trust and clarity:

- Complete a fresh watch-only security review.
- Improve import failure messages and backend-specific loading states.
- Exercise restart/resume state across packaged desktop sessions.
- Validate Bitcoin Core and Esplora behavior against real operator infrastructure.
- Decide whether SQLite metadata encryption is required before public beta.
- Expand live transaction history without adding signing or broadcasting.
- Keep Documentation aligned with the in-app workflow.

## Non-Goals

XpubShield should not become:

- A hot wallet.
- A signer.
- A transaction broadcaster.
- A remote surveillance client.
- A generic portfolio dashboard.
- A replacement for a full node, signer, or hardware wallet.

The app is strongest when it remains a disciplined pre-sign operational console.
