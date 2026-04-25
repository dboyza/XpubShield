import type { NetworkPolicy } from "../types/domain";

const NETWORK_POLICY_STORAGE_KEY = "xpubshield.network_policy.v1";

export function readNetworkPolicy(): NetworkPolicy {
  try {
    return window.localStorage.getItem(NETWORK_POLICY_STORAGE_KEY) === "local_only"
      ? "local_only"
      : "normal";
  } catch {
    return "normal";
  }
}

export function writeNetworkPolicy(policy: NetworkPolicy): NetworkPolicy {
  try {
    window.localStorage.setItem(NETWORK_POLICY_STORAGE_KEY, policy);
  } catch {
    // Network Lock state is a local UI preference; import validation still enforces request policy.
  }
  return policy;
}

export function networkLockEnabled(policy: NetworkPolicy): boolean {
  return policy === "local_only";
}
