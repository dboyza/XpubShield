import { BookOpenText, Compass, FileSearch, Search, ShieldCheck } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { StatusPill } from "../components/StatusPill";
import type { DocumentationWorkspaceState } from "../lib/workspace";

interface DocumentationProps {
  reportLoaded: boolean;
  workspaceState?: DocumentationWorkspaceState;
  onWorkspaceChange?: (patch: Partial<DocumentationWorkspaceState>) => void;
}

interface QuickStartCard {
  title: string;
  body: string;
  signal: string;
}

interface DocumentationSection {
  id: string;
  group: string;
  title: string;
  summary: string;
  tags: string[];
  bullets: string[];
  deepDive: Array<{
    title: string;
    body: string;
  }>;
}

const QUICK_START: QuickStartCard[] = [
  {
    title: "1. Import watch-only data",
    body: "Use a descriptor or xpub only. Never paste seed words, xprv values, WIF keys, private keys, or signing material into XpubShield.",
    signal: "Safety boundary"
  },
  {
    title: "2. Read the Cockpit",
    body: "Start from Risk Posture. It tells you what is most concerning, why it matters, and where to go next before you read the full action queue.",
    signal: "Posture"
  },
  {
    title: "3. Review coins before spending",
    body: "Use the Coin Workbench and Spend Preflight together: label provenance, keep contexts separated, and understand what an observer could learn.",
    signal: "Coin control"
  },
  {
    title: "4. Verify before signing",
    body: "Use Recovery and PSBT Preflight before external signing. The app analyzes, warns, and explains; it does not construct, sign, or broadcast transactions.",
    signal: "Preflight only"
  }
];

const DOC_SECTIONS: DocumentationSection[] = [
  {
    id: "start-here",
    group: "Start Here",
    title: "What XpubShield is",
    summary: "A local-first Bitcoin operational security cockpit for watch-only wallet analysis.",
    tags: ["overview", "watch-only", "local-first", "demo wallet"],
    bullets: [
      "Use it to inspect wallet posture, UTXO risk, provenance signals, fee exposure, recovery readiness, and PSBT warnings.",
      "It is deliberately preflight-only: it does not create transactions, sign transactions, broadcast transactions, or hold private keys.",
      "The demo wallet is safe for learning the interface before importing real watch-only metadata."
    ],
    deepDive: [
      {
        title: "What it is not",
        body: "XpubShield is not a hot wallet, signer, transaction builder, exchange account, remote chain surveillance tool, or custody service. It should sit before your signing workflow as an analysis surface."
      },
      {
        title: "The core habit",
        body: "Open Cockpit first, handle the highest-priority action, then move into the specific module that explains the evidence and recommended next step."
      }
    ]
  },
  {
    id: "watch-only-boundary",
    group: "Start Here",
    title: "Watch-only safety boundary",
    summary: "Only import data that can observe wallet activity without spending coins.",
    tags: ["descriptor", "xpub", "private key", "seed phrase", "safety"],
    bullets: [
      "Safe inputs are descriptors, xpubs, derived addresses, labels, wallet metadata, and PSBT text for analysis.",
      "Unsafe inputs are seed phrases, private keys, xprv values, WIF keys, hardware-wallet PINs, passphrases, and signing-device secrets.",
      "Descriptors and xpubs are still sensitive because they reveal wallet history and future receive addresses."
    ],
    deepDive: [
      {
        title: "Why xpubs are sensitive",
        body: "An xpub can reveal a broad set of derived addresses. Anyone who sees it may be able to monitor payments, cluster activity, and infer future receives even though they cannot spend."
      },
      {
        title: "Public backend caution",
        body: "A public backend can learn the addresses or Electrum script hashes you ask about, plus timing metadata around those queries. Prefer self-hosted infrastructure when operating with real wallet metadata."
      }
    ]
  },
  {
    id: "electrum-light-client",
    group: "Start Here",
    title: "Electrum light-client mode",
    summary: "Fetch watch-only UTXO data without running a node, with explicit privacy tradeoffs.",
    tags: ["electrum", "light client", "public backend", "network lock", "script hash"],
    bullets: [
      "XpubShield derives addresses and Electrum script hashes locally; raw xpubs and descriptors are not uploaded.",
      "Private Electrum is intended for a server you control. Public Electrum is convenient but weak privacy because the server can infer wallet activity from script-hash queries.",
      "Network Lock restricts future imports to mock/offline mode or localhost Bitcoin Core RPC."
    ],
    deepDive: [
      {
        title: "No broadcast path",
        body: "Electrum mode queries blockchain.scripthash.listunspent for watch-only data. XpubShield does not call transaction broadcast methods, and Spend Preflight remains analysis-only."
      },
      {
        title: "Tor and TLS status",
        body: "Tor is recommended when using public Electrum, but XpubShield does not route proxy traffic yet. This pass supports tcp:// Electrum endpoints; TLS and proxy routing are deferred."
      }
    ]
  },
  {
    id: "sovereign-ops-flow",
    group: "Sovereign Ops Workflow",
    title: "Recommended operating loop",
    summary: "A repeatable loop for triage, labeling, preflight analysis, and verification.",
    tags: ["cockpit", "action center", "workflow", "triage"],
    bullets: [
      "Import or load demo data, then start from Cockpit rather than jumping directly into tables.",
      "Resolve high-severity actions before medium or informational findings.",
      "Treat labels, quarantine state, and spend status as local operational memory."
    ],
    deepDive: [
      {
        title: "Cockpit",
        body: "The Cockpit answers what should I do next. Each action includes severity, confidence, affected coins, rationale, and a CTA into the relevant module."
      },
      {
        title: "Module rhythm",
        body: "Use Workbench for coin metadata, Spend Preflight for observer inference, Recovery for emergency-readiness checks, and PSBT Preflight before signer review."
      },
      {
        title: "Contextual explanations",
        body: "Plain-English explanations belong next to the evidence they describe: Cockpit actions, UTXO details, Lineage context, Recovery checks, and PSBT warnings. The handbook is the reference layer when you need the deeper concept."
      }
    ]
  },
  {
    id: "coin-workbench",
    group: "Sovereign Ops Workflow",
    title: "Coin Workbench operations",
    summary: "Use the Workbench to inspect, label, quarantine, and preserve coin sets.",
    tags: ["utxo", "coin control", "labels", "quarantine", "coin sets"],
    bullets: [
      "Review amount, source category, provenance, risk flags, spend status, and detail evidence for each UTXO.",
      "Label known sources such as exchange withdrawals, peer payments, mining payouts, business income, donations, and cold-storage change.",
      "Quarantine dust, unknown-source coins, suspicious deposits, or coins you do not want casually merged."
    ],
    deepDive: [
      {
        title: "Manual labels beat guesses",
        body: "Manual source labels and categories should represent what you know. Heuristics can suggest, but operator knowledge is stronger than a registry or pattern match."
      },
      {
        title: "Saved coin sets",
        body: "Saved sets help preserve review intent such as KYC stack, do-not-merge, unknown source, or spend candidate. They are local metadata, not wallet policy enforced on-chain."
      }
    ]
  },
  {
    id: "spend-preflight",
    group: "Sovereign Ops Workflow",
    title: "Spend Preflight",
    summary: "Preview what an observer could infer before you sign somewhere else.",
    tags: ["spending", "preflight", "change", "common input", "fees"],
    bullets: [
      "Select candidate coins and an amount to review common-input ownership, source mixing, toxic change, dust exposure, and fee efficiency.",
      "Prefer coin groups with similar context and provenance when privacy matters.",
      "Use warnings as decision support before external wallet construction and signing."
    ],
    deepDive: [
      {
        title: "Common-input ownership",
        body: "When multiple UTXOs are spent together, observers often infer they share an owner. This heuristic is not perfect, but it is common enough to matter."
      },
      {
        title: "Toxic change",
        body: "Change can link the spent coins, receiver payment, and your remaining wallet activity. Preflight helps you spot change that inherits unwanted context."
      }
    ]
  },
  {
    id: "recovery-psbt",
    group: "Sovereign Ops Workflow",
    title: "Recovery and PSBT review",
    summary: "Verify recoverability and transaction safety before you need them under pressure.",
    tags: ["recovery", "psbt", "descriptor", "fingerprint", "signer"],
    bullets: [
      "Recovery checks descriptor completeness, derivation path coverage, fingerprints, gap risk, multisig metadata, and export readiness.",
      "PSBT Preflight analyzes pasted PSBT text for suspicious inputs, outputs, warnings, and change assumptions.",
      "A clean PSBT lint result is useful, but it does not prove a transaction is safe."
    ],
    deepDive: [
      {
        title: "Recovery exports",
        body: "Exports are created locally. Review where you store them because descriptors, addresses, labels, and transaction history are sensitive metadata."
      },
      {
        title: "Signer boundary",
        body: "Keep signing on dedicated wallets or hardware devices. XpubShield should help you decide whether a proposed spend deserves signer attention."
      }
    ]
  },
  {
    id: "bitcoin-primer",
    group: "Bitcoin Primer",
    title: "Core concepts",
    summary: "The terms that matter when using XpubShield as an ops console.",
    tags: ["xpub", "descriptor", "utxo", "psbt", "change", "fees"],
    bullets: [
      "A UTXO is an individual spendable coin. Wallet balances are collections of UTXOs, not one pooled account balance.",
      "A descriptor describes how addresses are derived and what script policy they use. It is more complete than a bare xpub.",
      "A PSBT is a partially signed Bitcoin transaction format used to coordinate review and signing across tools."
    ],
    deepDive: [
      {
        title: "Descriptors vs xpubs",
        body: "A descriptor can include script type, derivation path, key origin, and checksum. A bare xpub may require guesses about account path or script type."
      },
      {
        title: "Fees and vbytes",
        body: "Bitcoin fees depend on transaction weight, not just value sent. Small UTXOs can become uneconomical when fee rates rise."
      }
    ]
  },
  {
    id: "provenance-primer",
    group: "Bitcoin Primer",
    title: "Provenance and coin control",
    summary: "How source context shapes privacy and operational decisions.",
    tags: ["provenance", "exchange", "kyc", "coin control", "heuristics"],
    bullets: [
      "Provenance is the app's local assessment of where a coin may have come from, with evidence and confidence.",
      "Exchange-linked coins may carry KYC context; unknown coins may deserve review before merging.",
      "Coin control means selecting which UTXOs fund a spend rather than letting a wallet merge contexts automatically."
    ],
    deepDive: [
      {
        title: "Heuristics are not verdicts",
        body: "Registry and pattern evidence can be helpful, but it is not definitive. Keep evidence visible and let manual labels override guesses."
      },
      {
        title: "Do-not-merge policy",
        body: "The simplest privacy rule is to avoid merging coins from contexts you would not want publicly linked."
      }
    ]
  },
  {
    id: "privacy-safety",
    group: "Privacy and Safety",
    title: "Sensitive metadata and privacy risk",
    summary: "The main ways watch-only analysis can still leak information.",
    tags: ["privacy", "metadata", "public backend", "dust", "exchange"],
    bullets: [
      "Wallet metadata can reveal balances, address clusters, labels, source context, and future receives.",
      "Public backends can observe queried addresses or script hashes. Self-hosted Bitcoin Core, Electrum, or Esplora is stronger for real operations.",
      "Dust and unsolicited deposits can be used to bait merges or mark wallet clusters."
    ],
    deepDive: [
      {
        title: "KYC separation",
        body: "Keep exchange-linked coins separated from peer, donation, business, mining, or unknown-source contexts unless you explicitly accept the linkage."
      },
      {
        title: "Label hygiene",
        body: "Useful labels are specific enough to guide decisions but should be treated as sensitive. Export and store them with the same care as wallet history."
      }
    ]
  },
  {
    id: "local-first",
    group: "Local-First Model",
    title: "What stays local",
    summary: "XpubShield's product stance is local-first analysis with explicit export actions.",
    tags: ["local", "exports", "labels", "tutorial", "storage"],
    bullets: [
      "Wallet reports, labels, coin sets, recovery exports, and tutorial state are local app data.",
      "Browser demo mode keeps optimistic local UI state when Tauri IPC is unavailable.",
      "Network Lock is local UI state that blocks future public or remote imports inside the app.",
      "There is no analytics, telemetry, remote attribution lookup, signing, or broadcasting."
    ],
    deepDive: [
      {
        title: "Exports",
        body: "Export buttons create files locally. Once exported, you control where that file goes and should review it before storing or sharing."
      },
      {
        title: "Tutorial state",
        body: "The tutorial uses local browser or WebView storage so it can be dismissed and restarted without affecting wallet data."
      }
    ]
  },
  {
    id: "closed-beta-script",
    group: "Closed Beta",
    title: "Operator test script",
    summary: "A local checklist for validating that XpubShield is ready for a real tester session.",
    tags: ["closed beta", "testing", "release", "operator script", "smoke test"],
    bullets: [
      "Start fresh, load the demo wallet, and confirm Cockpit Risk Posture is the first obvious read.",
      "Try Private Electrum and Public Electrum import paths with test metadata; confirm Public Electrum requires the privacy acknowledgement.",
      "Enable Network Lock and confirm public or remote backends are blocked before import.",
      "Move through Workbench, Spend Preflight, Lineage, Recovery, PSBT Preflight, Documentation, and Settings without console errors.",
      "Restart or reload and confirm the last page, selected coins, filters, scenario inputs, graph viewport, and documentation search restore for the same wallet.",
      "Clear local cache and confirm wallet/workspace state resets while Tutorial can still be restarted separately."
    ],
    deepDive: [
      {
        title: "Desktop persistence checks",
        body: "In the Tauri desktop app, import or demo wallet state should reload from the local SQLite database. Browser demo mode may not have the same persistence guarantees when Tauri IPC is unavailable."
      },
      {
        title: "Release confidence",
        body: "Before sharing a closed beta build, run npm run build, cargo test, and cargo tauri build, then smoke test the first-run flow, cache clear, and reduced-motion behavior."
      }
    ]
  },
  {
    id: "troubleshooting",
    group: "Troubleshooting",
    title: "Common issues",
    summary: "How to reason about import failures, missing data, and demo limitations.",
    tags: ["troubleshooting", "import", "gap limit", "demo", "xpub"],
    bullets: [
      "If import fails, confirm you pasted a descriptor or xpub, not private material.",
      "If an xpub import looks incomplete, the account path, script type, network, or gap limit may be wrong.",
      "If Electrum import fails, use a tcp://host:port endpoint. TLS, SSL, Tor, and proxy routing are not implemented in this pass.",
      "If data is missing in browser demo mode, load the demo wallet and remember that persistent desktop storage may not be available."
    ],
    deepDive: [
      {
        title: "Ambiguous xpub paths",
        body: "Bare xpubs often need a script type and account path guess. Descriptors are preferred because they carry more recovery and scanning context."
      },
      {
        title: "No active wallet",
        body: "Operational modules are disabled until a wallet report exists. Documentation, Import, and Tutorial stay available so you can learn before importing."
      }
    ]
  }
];

export function Documentation({ reportLoaded, workspaceState, onWorkspaceChange }: DocumentationProps) {
  const [query, setQuery] = useState(workspaceState?.query ?? "");
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});
  const normalizedQuery = query.trim().toLowerCase();

  useEffect(() => {
    setQuery(workspaceState?.query ?? "");
  }, [workspaceState?.query]);

  useEffect(() => {
    onWorkspaceChange?.({ query });
  }, [query]);

  const filteredSections = useMemo(
    () =>
      DOC_SECTIONS.filter((section) => {
        if (!normalizedQuery) return true;
        const haystack = [
          section.group,
          section.title,
          section.summary,
          ...section.tags,
          ...section.bullets,
          ...section.deepDive.flatMap((item) => [item.title, item.body])
        ]
          .join(" ")
          .toLowerCase();
        return haystack.includes(normalizedQuery);
      }),
    [normalizedQuery]
  );

  function jumpToSection(sectionId: string) {
    const section = sectionRefs.current[sectionId];
    if (!section) return;
    section.focus({ preventScroll: true });
    section.scrollIntoView({ behavior: "auto", block: "start" });
  }

  return (
    <main className="page-shell docs-shell">
      <section className="page-header docs-hero">
        <div>
          <p>XpubShield handbook</p>
          <h1>Documentation</h1>
        </div>
        <StatusPill label={reportLoaded ? "Wallet loaded" : "Always available"} tone={reportLoaded ? "good" : "neutral"} />
      </section>

      <section className="docs-quickstart" aria-label="Recommended operator workflow">
        {QUICK_START.map((card) => (
          <article className="docs-quick-card" key={card.title}>
            <span>{card.signal}</span>
            <h2>{card.title}</h2>
            <p>{card.body}</p>
          </article>
        ))}
      </section>

      <section className="docs-layout">
        <aside className="docs-index" aria-label="Documentation sections">
          <div className="docs-search">
            <Search size={17} aria-hidden="true" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search docs"
              aria-label="Search documentation"
            />
          </div>
          <div className="docs-index-list">
            {filteredSections.map((section) => (
              <button type="button" key={section.id} onClick={() => jumpToSection(section.id)}>
                <span>{section.group}</span>
                <strong>{section.title}</strong>
              </button>
            ))}
          </div>
        </aside>

        <div className="docs-content">
          {filteredSections.length ? (
            filteredSections.map((section) => (
              <article
                className="docs-section"
                id={section.id}
                key={section.id}
                ref={(element) => {
                  sectionRefs.current[section.id] = element;
                }}
                tabIndex={-1}
              >
                <div className="docs-section-header">
                  <div>
                    <span>{section.group}</span>
                    <h2>{section.title}</h2>
                    <p>{section.summary}</p>
                  </div>
                  <StatusPill label={`${section.tags.length} tags`} />
                </div>
                <ul className="docs-bullet-list">
                  {section.bullets.map((bullet) => (
                    <li key={bullet}>{bullet}</li>
                  ))}
                </ul>
                <div className="docs-tags" aria-label={`${section.title} tags`}>
                  {section.tags.map((tag) => (
                    <button type="button" key={tag} onClick={() => setQuery(tag)}>
                      {tag}
                    </button>
                  ))}
                </div>
                <div className="docs-deep-dive">
                  {section.deepDive.map((item) => (
                    <details key={item.title}>
                      <summary>{item.title}</summary>
                      <p>{item.body}</p>
                    </details>
                  ))}
                </div>
              </article>
            ))
          ) : (
            <div className="panel docs-empty">
              <FileSearch size={24} aria-hidden="true" />
              <h2>No documentation matches</h2>
              <p>Try searching for UTXO, PSBT, descriptor, provenance, recovery, public backend, or coin control.</p>
              <button type="button" className="secondary-button" onClick={() => setQuery("")}>
                Clear search
              </button>
            </div>
          )}
        </div>
      </section>

      <section className="docs-footer panel">
        <div>
          <Compass size={18} aria-hidden="true" />
          <strong>Operational default</strong>
          <p>When unsure, keep coins separated, preserve local labels, preflight before signing, and never paste private material.</p>
        </div>
        <div>
          <ShieldCheck size={18} aria-hidden="true" />
          <strong>Local-first stance</strong>
          <p>Documentation is bundled with the app and does not fetch remote content, telemetry, or external references.</p>
        </div>
      </section>
    </main>
  );
}
