import type { BackendKind } from "../types/domain";
import { ShieldAlert } from "lucide-react";

interface PrivacyWarningProps {
  publicApiMode?: boolean;
  publicBackendKind?: BackendKind;
}

export function PrivacyWarning({ publicApiMode = false, publicBackendKind }: PrivacyWarningProps) {
  const publicElectrum = publicBackendKind === "public_electrum";
  return (
    <section className={`privacy-warning ${publicApiMode ? "privacy-warning-public" : ""}`}>
      <ShieldAlert size={20} aria-hidden="true" />
      <div>
        <strong>{publicApiMode ? "Public backend privacy warning" : "Watch-only security boundary"}</strong>
        <p>
          XpubShield rejects seed phrases, private keys, xprv values, WIF keys, and signing
          material. Xpubs, descriptors, addresses, labels, wallet history, and PSBTs are sensitive
          local data.
        </p>
        {publicApiMode ? (
          <p>
            {publicElectrum
              ? "Public Electrum can reveal script-hash queries and timing metadata. XpubShield derives script hashes locally and never sends a raw xpub or descriptor."
              : "Public API mode can reveal address queries and timing metadata. The app must never send a raw xpub or descriptor to a third-party API."}
          </p>
        ) : null}
      </div>
    </section>
  );
}
