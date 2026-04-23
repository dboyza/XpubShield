import { ShieldAlert } from "lucide-react";

interface PrivacyWarningProps {
  publicApiMode?: boolean;
}

export function PrivacyWarning({ publicApiMode = false }: PrivacyWarningProps) {
  return (
    <section className={`privacy-warning ${publicApiMode ? "privacy-warning-public" : ""}`}>
      <ShieldAlert size={20} aria-hidden="true" />
      <div>
        <strong>{publicApiMode ? "Public API privacy warning" : "Watch-only security boundary"}</strong>
        <p>
          UTXO Sentinel rejects seed phrases, private keys, xprv values, WIF keys, and signing
          material. Xpubs, descriptors, addresses, labels, wallet history, and PSBTs are sensitive
          local data.
        </p>
        {publicApiMode ? (
          <p>
            Public API mode can reveal address queries and timing metadata. The app must never send
            a raw xpub or descriptor to a third-party API.
          </p>
        ) : null}
      </div>
    </section>
  );
}
