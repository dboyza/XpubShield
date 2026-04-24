import { AlertTriangle, Database, FileKey2, Upload, WalletCards } from "lucide-react";
import { FormEvent, useState } from "react";
import { importWallet, loadDemoWallet, looksLikePrivateMaterial } from "../api/tauri";
import { PrivacyWarning } from "../components/PrivacyWarning";
import type { BackendKind, ImportRequest, Network, ScriptType, WalletReport } from "../types/domain";

interface OnboardingImportProps {
  onImported: (report: WalletReport) => void;
}

export function OnboardingImport({ onImported }: OnboardingImportProps) {
  const [importKind, setImportKind] = useState<"descriptor" | "xpub">("descriptor");
  const [walletName, setWalletName] = useState("Cold storage watch-only");
  const [descriptor, setDescriptor] = useState("");
  const [xpub, setXpub] = useState("");
  const [network, setNetwork] = useState<Network>("mainnet");
  const [scriptType, setScriptType] = useState<ScriptType>("native_segwit");
  const [accountPath, setAccountPath] = useState("84h/0h/0h");
  const [gapLimit, setGapLimit] = useState(20);
  const [backend, setBackend] = useState<BackendKind>("mock");
  const [bitcoinCoreUrl, setBitcoinCoreUrl] = useState("http://127.0.0.1:8332");
  const [bitcoinCoreUsername, setBitcoinCoreUsername] = useState("");
  const [bitcoinCorePassword, setBitcoinCorePassword] = useState("");
  const [bitcoinCoreWallet, setBitcoinCoreWallet] = useState("");
  const [acknowledgedPublicApi, setAcknowledgedPublicApi] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const publicApiMode = backend === "public_esplora";

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const pasted = importKind === "descriptor" ? descriptor : xpub;
    if (looksLikePrivateMaterial(pasted)) {
      setError(
        "Private key material was rejected. This app is watch-only and does not process seeds, xprv values, WIF keys, or signing material."
      );
      return;
    }
    if (publicApiMode && !acknowledgedPublicApi) {
      setError("Public API mode requires acknowledging the privacy warning.");
      return;
    }

    const request: ImportRequest = {
      import_kind: importKind,
      wallet_name: walletName,
      descriptor: importKind === "descriptor" ? descriptor : undefined,
      xpub: importKind === "xpub" ? xpub : undefined,
      network,
      script_type: importKind === "xpub" ? scriptType : undefined,
      account_path_guess: importKind === "xpub" ? accountPath : undefined,
      gap_limit: gapLimit,
      backend,
      bitcoin_core_rpc:
        backend === "bitcoin_core_rpc"
          ? {
              url: bitcoinCoreUrl,
              username: bitcoinCoreUsername || undefined,
              password: bitcoinCorePassword || undefined,
              wallet: bitcoinCoreWallet || undefined
            }
          : undefined,
      public_api_acknowledged: acknowledgedPublicApi
    };

    setLoading(true);
    try {
      const report = await importWallet(request);
      onImported(report);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleDemo() {
    setError(null);
    setLoading(true);
    try {
      const report = await loadDemoWallet();
      onImported(report);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="import-layout">
      <section className="import-panel">
        <div className="section-heading">
          <WalletCards size={22} aria-hidden="true" />
          <div>
            <p>Phase 1</p>
            <h1>Import watch-only wallet</h1>
          </div>
        </div>

        <PrivacyWarning publicApiMode={publicApiMode} />

        <form onSubmit={handleSubmit} className="import-form">
          <div className="segmented-control" role="tablist" aria-label="Import type">
            <button
              type="button"
              className={importKind === "descriptor" ? "active" : ""}
              onClick={() => setImportKind("descriptor")}
            >
              <FileKey2 size={16} /> Descriptor
            </button>
            <button
              type="button"
              className={importKind === "xpub" ? "active" : ""}
              onClick={() => setImportKind("xpub")}
            >
              <Upload size={16} /> Xpub
            </button>
          </div>

          <label>
            Wallet name
            <input value={walletName} onChange={(event) => setWalletName(event.target.value)} />
          </label>

          {importKind === "descriptor" ? (
            <label>
              Descriptor
              <textarea
                value={descriptor}
                onChange={(event) => setDescriptor(event.target.value)}
                placeholder="wpkh([d34db33f/84h/0h/0h]xpub.../0/*)"
                rows={5}
              />
            </label>
          ) : (
            <label>
              Public extended key
              <textarea
                value={xpub}
                onChange={(event) => setXpub(event.target.value)}
                placeholder="xpub..."
                rows={4}
              />
            </label>
          )}

          <div className="form-grid">
            <label>
              Network
              <select value={network} onChange={(event) => setNetwork(event.target.value as Network)}>
                <option value="mainnet">Mainnet</option>
                <option value="testnet">Testnet</option>
                <option value="signet">Signet</option>
                <option value="regtest">Regtest</option>
              </select>
            </label>
            <label>
              Backend
              <select value={backend} onChange={(event) => setBackend(event.target.value as BackendKind)}>
                <option value="mock">Mock backend</option>
                <option value="bitcoin_core_rpc">Bitcoin Core RPC</option>
                <option value="electrum">Personal Electrum</option>
                <option value="esplora">Self-hosted Esplora</option>
                <option value="public_esplora">Public Esplora</option>
              </select>
            </label>
            {importKind === "xpub" ? (
              <>
                <label>
                  Script type
                  <select
                    value={scriptType}
                    onChange={(event) => setScriptType(event.target.value as ScriptType)}
                  >
                    <option value="legacy">Legacy</option>
                    <option value="nested_segwit">Nested SegWit</option>
                    <option value="native_segwit">Native SegWit</option>
                    <option value="taproot">Taproot</option>
                  </select>
                </label>
                <label>
                  Account path
                  <input value={accountPath} onChange={(event) => setAccountPath(event.target.value)} />
                </label>
              </>
            ) : null}
            <label>
              Gap limit
              <input
                type="number"
                min={5}
                max={1000}
                value={gapLimit}
                onChange={(event) => setGapLimit(Number(event.target.value))}
              />
            </label>
          </div>

          {publicApiMode ? (
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={acknowledgedPublicApi}
                onChange={(event) => setAcknowledgedPublicApi(event.target.checked)}
              />
              <span>I understand public API mode is weak privacy and must not receive raw xpubs or descriptors.</span>
            </label>
          ) : null}

          {backend === "bitcoin_core_rpc" ? (
            <section className="embedded-form">
              <div className="section-heading compact-heading">
                <Database size={18} aria-hidden="true" />
                <div>
                  <p>Local node</p>
                  <h2>Bitcoin Core RPC</h2>
                </div>
              </div>
              <div className="form-grid">
                <label>
                  RPC URL
                  <input value={bitcoinCoreUrl} onChange={(event) => setBitcoinCoreUrl(event.target.value)} />
                </label>
                <label>
                  RPC wallet
                  <input value={bitcoinCoreWallet} onChange={(event) => setBitcoinCoreWallet(event.target.value)} />
                </label>
                <label>
                  RPC username
                  <input value={bitcoinCoreUsername} onChange={(event) => setBitcoinCoreUsername(event.target.value)} />
                </label>
                <label>
                  RPC password
                  <input
                    type="password"
                    value={bitcoinCorePassword}
                    onChange={(event) => setBitcoinCorePassword(event.target.value)}
                  />
                </label>
              </div>
            </section>
          ) : null}

          {error ? (
            <div className="error-message" role="alert">
              <AlertTriangle size={18} /> {error}
            </div>
          ) : null}

          <div className="button-row">
            <button className="primary-button" disabled={loading}>
              <Upload size={17} /> {loading ? "Scanning mock data" : "Import and scan"}
            </button>
            <button type="button" className="secondary-button" onClick={handleDemo} disabled={loading}>
              <Database size={17} /> Demo wallet
            </button>
          </div>
        </form>
      </section>
    </main>
  );
}
