import { MessageSquareText } from "lucide-react";
import { useMemo } from "react";
import { StatusPill } from "../components/StatusPill";
import { txidPrefix } from "../lib/format";
import { buildTransactionExplanations } from "../lib/phase3";
import type { WalletReport } from "../types/domain";

interface TransactionExplanationsProps {
  report: WalletReport;
}

export function TransactionExplanations({ report }: TransactionExplanationsProps) {
  const explanations = useMemo(() => buildTransactionExplanations(report), [report]);

  return (
    <main className="page-shell">
      <section className="page-header">
        <div>
          <p>{report.wallet.name}</p>
          <h1>Transaction explanations</h1>
        </div>
        <StatusPill label="Template based" tone="good" />
      </section>

      <section className="privacy-warning">
        <MessageSquareText size={20} aria-hidden="true" />
        <div>
          <strong>No LLM required</strong>
          <p>
            Explanations are deterministic templates based on wallet metadata, audit flags, labels,
            and confirmation state. They avoid unsupported certainty.
          </p>
        </div>
      </section>

      <section className="panel">
        <div className="panel-heading">
          <h2>Transactions</h2>
          <StatusPill label={`${explanations.length} explanations`} />
        </div>
        <div className="risk-list">
          {explanations.map((item) => (
            <article className="risk-card" key={item.txid}>
              <div className="finding-title">
                <StatusPill label={txidPrefix(item.txid)} />
                <strong>{item.title}</strong>
              </div>
              <p>{item.explanation}</p>
              <span>Confidence: {item.confidence}</span>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
