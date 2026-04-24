import type {
  ConfidenceLevel,
  Descriptor,
  Network,
  ScriptType,
  Severity,
  SourceCategory,
  Transaction,
  Utxo,
  WalletReport
} from "../types/domain";

export interface PsbtFixtureInput {
  outpoint: string;
  amount_sats?: number;
  script_type?: ScriptType;
}

export interface PsbtFixtureOutput {
  address: string;
  amount_sats: number;
}

export interface PsbtFixture {
  inputs?: PsbtFixtureInput[];
  outputs?: PsbtFixtureOutput[];
  fee_sats?: number;
  vsize?: number;
}

export interface PsbtWarning {
  id: string;
  severity: Severity;
  title: string;
  explanation: string;
  recommendedAction: string;
  confidence: ConfidenceLevel;
}

export interface PsbtOutputAnalysis extends PsbtFixtureOutput {
  kind: "change" | "recipient" | "unknown";
  reusedWalletAddress: boolean;
  dust: boolean;
}

export interface PsbtAnalysisResult {
  summary: string;
  format: "json_fixture" | "base64_psbt" | "hex_psbt" | "unknown";
  inputs: Array<PsbtFixtureInput & { walletUtxo?: Utxo }>;
  outputs: PsbtOutputAnalysis[];
  feeSats?: number;
  feeRate?: number;
  changeDetected: boolean;
  warnings: PsbtWarning[];
}

export interface RecoveryHealthField {
  label: string;
  value: string;
  status: "good" | "warn" | "bad";
}

export interface RecoveryHealthResult {
  score: number;
  fields: RecoveryHealthField[];
  warnings: string[];
  markdown: string;
  json: string;
}

export interface DescriptorIdentity {
  network: Network | "unknown";
  scriptType: ScriptType;
  masterFingerprint?: string;
  accountPath?: string;
  xpub?: string;
  branch?: "external" | "change" | "unknown";
  wildcard: boolean;
  checksum?: string;
  addressPreview: string[];
}

export interface DescriptorDiffResult {
  left: DescriptorIdentity;
  right: DescriptorIdentity;
  rows: Array<{
    label: string;
    left: string;
    right: string;
    match: boolean;
  }>;
  sameFirst20: boolean;
  summary: string;
}

export interface TransactionExplanation {
  txid: string;
  title: string;
  explanation: string;
  confidence: ConfidenceLevel;
}

const PRIVATE_MATERIAL_PATTERN =
  /(xprv|tprv|yprv|zprv|uprv|vprv|private key|privkey|mnemonic|seed phrase|wif)/i;

export function analyzePsbtText(input: string, report: WalletReport): PsbtAnalysisResult {
  const trimmed = input.trim();
  if (!trimmed) {
    return emptyPsbtAnalysis("Paste a PSBT or mock PSBT fixture to analyze it locally.");
  }
  if (PRIVATE_MATERIAL_PATTERN.test(trimmed) || looksLikeWif(trimmed)) {
    return {
      ...emptyPsbtAnalysis("Private key material was rejected before PSBT analysis."),
      warnings: [
        {
          id: "private_material_rejected",
          severity: "critical",
          title: "Private material rejected",
          explanation:
            "The pasted content looks like signing material. XpubShield is watch-only and does not process secrets.",
          recommendedAction: "Remove the pasted content and only import PSBTs or watch-only wallet metadata.",
          confidence: "high"
        }
      ]
    };
  }

  const fixture = parseFixture(trimmed);
  if (fixture) {
    return analyzeFixture(fixture, report);
  }

  if (trimmed.startsWith("cHNidP8")) {
    return {
      ...emptyPsbtAnalysis(
        "A base64 PSBT envelope was detected. Full PSBT parsing is planned for the Rust backend; this view currently reports metadata limitations only."
      ),
      format: "base64_psbt",
      warnings: [missingMetadataWarning()]
    };
  }

  if (/^70736274ff/i.test(trimmed.replace(/\s/g, ""))) {
    return {
      ...emptyPsbtAnalysis(
        "A hex PSBT envelope was detected. Full PSBT parsing is planned for the Rust backend; this view currently reports metadata limitations only."
      ),
      format: "hex_psbt",
      warnings: [missingMetadataWarning()]
    };
  }

  return {
    ...emptyPsbtAnalysis("The pasted content was not recognized as a supported PSBT format."),
    warnings: [
      {
        id: "unrecognized_psbt",
        severity: "medium",
        title: "Unrecognized PSBT input",
        explanation:
          "The linter could not identify a base64 PSBT, hex PSBT, or mock JSON PSBT fixture.",
        recommendedAction: "Paste a PSBT beginning with cHNidP8 or use the local JSON fixture format.",
        confidence: "medium"
      }
    ]
  };
}

export function examplePsbtFixture(report: WalletReport): string {
  const spendable = report.utxos.slice(0, 2);
  return JSON.stringify(
    {
      inputs: spendable.map((utxo) => ({
        outpoint: utxo.outpoint,
        amount_sats: utxo.amount_sats,
        script_type: utxo.script_type
      })),
      outputs: [
        {
          address: "bc1qrecipientphase3example000000000000",
          amount_sats: Math.max(1_000, spendable.reduce((sum, utxo) => sum + utxo.amount_sats, 0) - 25_000)
        },
        {
          address: report.derived_addresses.find((address) => address.keychain === "change")?.address,
          amount_sats: 20_000
        }
      ].filter((output) => output.address),
      fee_sats: 5_000,
      vsize: 180
    },
    null,
    2
  );
}

export function buildRecoveryHealth(report: WalletReport): RecoveryHealthResult {
  const external = report.descriptors.some((descriptor) => descriptor.keychain === "external");
  const change = report.descriptors.some((descriptor) => descriptor.keychain === "change");
  const checksummed = report.descriptors.every((descriptor) => Boolean(descriptor.checksum));
  const hasFingerprint = report.descriptors.every((descriptor) => Boolean(descriptor.master_fingerprint));
  const hasPath = report.descriptors.every((descriptor) => Boolean(descriptor.account_path));
  const lastExternal = maxIndex(report, "external");
  const lastChange = maxIndex(report, "change");
  const multisig = report.descriptors.some((descriptor) => descriptor.script_type === "multisig");
  const warnings: string[] = [];
  let score = 100;

  if (!change) {
    score -= 15;
    warnings.push("No change descriptor is present. Recovery elsewhere could miss change addresses.");
  }
  if (!hasFingerprint) {
    score -= 10;
    warnings.push("One or more descriptors are missing a master fingerprint.");
  }
  if (!hasPath) {
    score -= 10;
    warnings.push("One or more descriptors are missing account derivation path metadata.");
  }
  if (!checksummed) {
    score -= 5;
    warnings.push("One or more descriptors are missing checksums.");
  }
  if (!report.wallet.descriptor_based) {
    score -= 12;
    warnings.push("This wallet came from a bare xpub import, so script/path metadata may be ambiguous.");
  }
  if (report.wallet.gap_limit < 20) {
    score -= 8;
    warnings.push("The configured gap limit is below the common default of 20.");
  }
  if (multisig) {
    score -= 10;
    warnings.push("Multisig recovery requires complete cosigner and policy metadata.");
  }

  score = Math.max(0, Math.min(100, score));

  const fields: RecoveryHealthField[] = [
    field("Wallet name", report.wallet.name, "good"),
    field("Network", report.wallet.network, "good"),
    field("Script type", descriptorValue(report.descriptors, "script_type"), "good"),
    field("Master fingerprint", descriptorValue(report.descriptors, "master_fingerprint"), hasFingerprint ? "good" : "warn"),
    field("Account path", descriptorValue(report.descriptors, "account_path"), hasPath ? "good" : "warn"),
    field("External descriptor", external ? "Present" : "Missing", external ? "good" : "bad"),
    field("Change descriptor", change ? "Present" : "Missing", change ? "good" : "warn"),
    field("Descriptor checksum", checksummed ? "Present" : "Missing", checksummed ? "good" : "warn"),
    field("Last external index", String(lastExternal), "good"),
    field("Last change index", String(lastChange), "good"),
    field("Gap limit", String(report.wallet.gap_limit), report.wallet.gap_limit >= 20 ? "good" : "warn"),
    field("Multisig policy", multisig ? "Review manually" : "Not detected", multisig ? "warn" : "good")
  ];

  const markdown = [
    `# XpubShield Recovery Report`,
    ``,
    `Wallet: ${report.wallet.name}`,
    `Network: ${report.wallet.network}`,
    `Recovery score: ${score}/100`,
    ``,
    `## Warnings`,
    ...(warnings.length ? warnings.map((warning) => `- ${warning}`) : ["- No major recovery metadata warnings."]),
    ``,
    `## Descriptors`,
    ...report.descriptors.map((descriptor) => `- ${descriptor.keychain}: \`${descriptor.descriptor}\``)
  ].join("\n");

  return {
    score,
    fields,
    warnings,
    markdown,
    json: JSON.stringify({ score, fields, warnings, descriptors: report.descriptors }, null, 2)
  };
}

export function compareDescriptorInputs(leftInput: string, rightInput: string): DescriptorDiffResult {
  const left = parseDescriptorIdentity(leftInput);
  const right = parseDescriptorIdentity(rightInput);
  const rows = [
    row("Network", left.network, right.network),
    row("Script type", left.scriptType, right.scriptType),
    row("Master fingerprint", left.masterFingerprint, right.masterFingerprint),
    row("Derivation path", left.accountPath, right.accountPath),
    row("Xpub", left.xpub, right.xpub),
    row("Branch", left.branch, right.branch),
    row("Wildcard", left.wildcard ? "Yes" : "No", right.wildcard ? "Yes" : "No"),
    row("Checksum", left.checksum, right.checksum)
  ];
  const sameFirst20 = left.addressPreview.every((address, index) => address === right.addressPreview[index]);

  return {
    left,
    right,
    rows,
    sameFirst20,
    summary:
      rows.every((item) => item.match) && sameFirst20
        ? "The two inputs appear to describe the same watch-only identity in this deterministic comparison."
        : "The two inputs differ. Review the mismatched fields before relying on them for recovery."
  };
}

export function buildTransactionExplanations(report: WalletReport): TransactionExplanation[] {
  return report.transactions.map((transaction) => {
    const outputs = report.utxos.filter((utxo) => utxo.txid === transaction.txid);
    const totalReceived = outputs.reduce((sum, utxo) => sum + utxo.amount_sats, 0);
    const labels = distinct(outputs.map((utxo) => utxo.label || "Unlabeled"));
    const categories = distinct(outputs.map((utxo) => utxo.source_category));
    const hasDust = outputs.some((utxo) => utxo.audit_flags.includes("dust_attack_suspicion"));
    const hasReuse = outputs.some((utxo) => utxo.audit_flags.includes("address_reuse"));
    const unconfirmed = outputs.some((utxo) => utxo.confirmations === 0) || transaction.confirmations === 0;

    let title = "Wallet activity";
    let explanation = transaction.explanation;
    let confidence: ConfidenceLevel = "medium";

    if (outputs.length > 1 && (labels.length > 1 || categories.length > 1)) {
      title = "Multiple outputs with mixed context";
      explanation = `This transaction created ${outputs.length} wallet UTXOs across ${labels.length} labels and ${categories.length} source categories. This may indicate separate receive contexts or change; the heuristic is not definitive.`;
      confidence = "medium";
    } else if (hasDust) {
      title = "Possible dust receive";
      explanation =
        "This transaction created a tiny unlabeled UTXO from an unknown source. This may indicate dusting, but the heuristic is not definitive.";
      confidence = "medium";
    } else if (unconfirmed) {
      title = "Unconfirmed receive";
      explanation =
        "This transaction has zero confirmations. Treat the related UTXO as pending until the backend reports confirmations.";
      confidence = "high";
    } else if (hasReuse) {
      title = "Receive to reused address";
      explanation =
        "This transaction appears to involve a reused wallet address. This could link deposits that were meant to remain separate.";
      confidence = "high";
    } else if (outputs.length > 0) {
      title = "External receive";
      explanation = `This transaction received ${formatBtc(totalReceived)} to ${outputs[0].derivation_path}. It appears to be a wallet receive. No unsupported ownership claims are made.`;
      confidence = "medium";
    }

    return {
      txid: transaction.txid,
      title,
      explanation,
      confidence
    };
  });
}

function analyzeFixture(fixture: PsbtFixture, report: WalletReport): PsbtAnalysisResult {
  const inputs = (fixture.inputs ?? []).map((input) => ({
    ...input,
    walletUtxo: report.utxos.find((utxo) => utxo.outpoint === input.outpoint)
  }));
  const walletAddresses = new Set(report.derived_addresses.map((address) => address.address));
  const reusedAddresses = new Set(
    report.derived_addresses.filter((address) => address.receive_count > 1).map((address) => address.address)
  );
  const outputs = (fixture.outputs ?? []).map((output): PsbtOutputAnalysis => {
    const walletOwned = walletAddresses.has(output.address);
    return {
      ...output,
      kind: walletOwned ? "change" : "recipient",
      reusedWalletAddress: reusedAddresses.has(output.address),
      dust: output.amount_sats < 1_000
    };
  });
  const feeRate =
    typeof fixture.fee_sats === "number" && typeof fixture.vsize === "number" && fixture.vsize > 0
      ? fixture.fee_sats / fixture.vsize
      : undefined;
  const warnings = lintFixture(inputs, outputs, fixture, feeRate);

  return {
    summary: `Analyzed ${inputs.length} inputs and ${outputs.length} outputs locally from a mock PSBT fixture.`,
    format: "json_fixture",
    inputs,
    outputs,
    feeSats: fixture.fee_sats,
    feeRate,
    changeDetected: outputs.some((output) => output.kind === "change"),
    warnings
  };
}

function lintFixture(
  inputs: Array<PsbtFixtureInput & { walletUtxo?: Utxo }>,
  outputs: PsbtOutputAnalysis[],
  fixture: PsbtFixture,
  feeRate?: number
): PsbtWarning[] {
  const warnings: PsbtWarning[] = [];
  const walletInputs = inputs.map((input) => input.walletUtxo).filter(Boolean) as Utxo[];
  const labels = distinct(walletInputs.map((utxo) => utxo.label || "Unlabeled"));
  const categories = distinct(walletInputs.map((utxo) => utxo.source_category));

  if (feeRate === undefined || fixture.fee_sats === undefined) {
    warnings.push(missingMetadataWarning());
  } else if (feeRate > 100 || fixture.fee_sats > 100_000) {
    warnings.push({
      id: "fee_sanity",
      severity: "high",
      title: "High fee estimate",
      explanation: `The fixture reports a fee rate of ${feeRate.toFixed(1)} sats/vB. This may be unusually high.`,
      recommendedAction: "Review the fee in the signing wallet before signing.",
      confidence: "medium"
    });
  }

  const recipientOutputs = outputs.filter((output) => output.kind !== "change");
  if (recipientOutputs.length > 0) {
    warnings.push({
      id: "unknown_outputs",
      severity: "info",
      title: "Recipient outputs present",
      explanation: "Outputs that are not recognized as wallet change are shown as recipients or unknowns.",
      recommendedAction: "Verify each recipient address out of band before signing elsewhere.",
      confidence: "medium"
    });
  }

  if (!outputs.some((output) => output.kind === "change")) {
    warnings.push({
      id: "change_verification",
      severity: "medium",
      title: "No verified change output",
      explanation: "No output matched the derived wallet address set. This may be normal for a no-change spend.",
      recommendedAction: "Confirm the signing wallet's change detection before signing.",
      confidence: "medium"
    });
  }

  const quarantined = walletInputs.filter((utxo) => utxo.quarantine_status !== "none");
  if (quarantined.length > 0) {
    warnings.push({
      id: "quarantined_input",
      severity: "high",
      title: "Quarantined UTXO spend",
      explanation: "The PSBT fixture spends one or more UTXOs marked as quarantined in XpubShield.",
      recommendedAction: "Remove quarantined coins unless you intentionally reviewed the policy exception.",
      confidence: "high"
    });
  }

  if (labels.length > 1 || categories.length > 1) {
    warnings.push({
      id: "label_mixing",
      severity: "high",
      title: "Label mixing",
      explanation: "The selected inputs merge different labels or source categories. This may link histories.",
      recommendedAction: "Consider a coin selection from one label/category.",
      confidence: "high"
    });
  }

  if (outputs.some((output) => output.reusedWalletAddress)) {
    warnings.push({
      id: "address_reuse",
      severity: "high",
      title: "Output to reused wallet address",
      explanation: "One output matches a wallet address that has reuse history.",
      recommendedAction: "Avoid sending to reused wallet addresses.",
      confidence: "high"
    });
  }

  if (outputs.some((output) => output.dust)) {
    warnings.push({
      id: "dust_output",
      severity: "medium",
      title: "Dust-like output",
      explanation: "One or more outputs are very small. This may create uneconomical or suspicious wallet state.",
      recommendedAction: "Review small outputs before signing.",
      confidence: "medium"
    });
  }

  if (walletInputs.some((utxo) => utxo.script_type === "legacy")) {
    warnings.push({
      id: "legacy_input_cost",
      severity: "low",
      title: "Legacy input cost",
      explanation: "One or more wallet inputs use legacy script assumptions, which may increase fees.",
      recommendedAction: "Review fee burden before signing.",
      confidence: "high"
    });
  }

  return warnings;
}

function parseFixture(input: string): PsbtFixture | null {
  try {
    const parsed = JSON.parse(input) as PsbtFixture;
    if (Array.isArray(parsed.inputs) || Array.isArray(parsed.outputs)) {
      return parsed;
    }
  } catch {
    return null;
  }
  return null;
}

function parseDescriptorIdentity(input: string): DescriptorIdentity {
  const value = input.trim();
  const scriptType = detectScriptType(value);
  const network = detectNetwork(value);
  const masterFingerprint = value.match(/\[([0-9a-fA-F]{8})(?:\/|\])/i)?.[1]?.toLowerCase();
  const accountPath = value.match(/\[[0-9a-fA-F]{8}\/([^\]]+)\]/)?.[1];
  const xpub = value.match(/\b([xyzuvt]pub[A-Za-z0-9]+)\b/)?.[1];
  const branch = value.includes("/1/*") ? "change" : value.includes("/0/*") ? "external" : "unknown";
  const wildcard = value.includes("*");
  const checksum = value.split("#")[1];
  const seed = `${network}:${scriptType}:${masterFingerprint ?? ""}:${accountPath ?? ""}:${xpub ?? value}:${branch}:${wildcard}`;

  return {
    network,
    scriptType,
    masterFingerprint,
    accountPath,
    xpub,
    branch,
    wildcard,
    checksum,
    addressPreview: Array.from({ length: 20 }, (_, index) => `preview_${hashString(`${seed}:${index}`).slice(0, 18)}`)
  };
}

function detectScriptType(input: string): ScriptType {
  if (input.startsWith("pkh(")) return "legacy";
  if (input.startsWith("sh(wpkh(")) return "nested_segwit";
  if (input.startsWith("wpkh(")) return "native_segwit";
  if (input.startsWith("tr(")) return "taproot";
  if (input.includes("sortedmulti(") || input.includes("multi(")) return "multisig";
  if (/^ypub/.test(input)) return "nested_segwit";
  if (/^zpub/.test(input)) return "native_segwit";
  if (/^xpub/.test(input)) return "legacy";
  return "unknown";
}

function detectNetwork(input: string): Network | "unknown" {
  if (/\b(tpub|upub|vpub)\b/.test(input) || /\/1h\//.test(input)) return "testnet";
  if (/\b(xpub|ypub|zpub)\b/.test(input) || /\/0h\//.test(input)) return "mainnet";
  return "unknown";
}

function emptyPsbtAnalysis(summary: string): PsbtAnalysisResult {
  return {
    summary,
    format: "unknown",
    inputs: [],
    outputs: [],
    changeDetected: false,
    warnings: []
  };
}

function missingMetadataWarning(): PsbtWarning {
  return {
    id: "missing_metadata",
    severity: "medium",
    title: "Missing PSBT metadata",
    explanation:
      "The linter could not verify amounts, derivation paths, or change details from the available data.",
    recommendedAction: "Review the PSBT in the signing wallet and verify fee/change metadata before signing.",
    confidence: "high"
  };
}

function descriptorValue<K extends keyof Descriptor>(descriptors: Descriptor[], key: K): string {
  const values = distinct(descriptors.map((descriptor) => String(descriptor[key] ?? "Missing")));
  return values.join(", ");
}

function field(label: string, value: string, status: RecoveryHealthField["status"]): RecoveryHealthField {
  return { label, value, status };
}

function maxIndex(report: WalletReport, keychain: "external" | "change"): number {
  return Math.max(
    0,
    ...report.derived_addresses
      .filter((address) => address.keychain === keychain && address.used)
      .map((address) => address.index)
  );
}

function row(label: string, left: unknown, right: unknown): DescriptorDiffResult["rows"][number] {
  const leftValue = String(left ?? "Missing");
  const rightValue = String(right ?? "Missing");
  return {
    label,
    left: leftValue,
    right: rightValue,
    match: leftValue === rightValue
  };
}

function distinct<T extends string>(values: T[]): T[] {
  return Array.from(new Set(values)).sort();
}

function hashString(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function looksLikeWif(input: string): boolean {
  return /\b[5KLc9][A-Za-z0-9]{50,51}\b/.test(input);
}

function formatBtc(sats: number): string {
  return `${(sats / 100_000_000).toFixed(8)} BTC`;
}
