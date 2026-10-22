import {
  catalogGate,
  type CredentialSpecWire,
} from "@/domains/jobs/lib/credential-gate";
import type {
  LibraryReadiness,
  LibraryReadinessState,
} from "@/domains/library/types";

/** What the viewer sees when the vault could not be read: unknown is not "ready". */
export const KEYS_UNKNOWN_REASON = "Couldn't check your keys";

/**
 * Readiness for the viewer, from the same gate Collect's run forms use (`catalogGate`):
 * the operator setting first, then the vault. `configured` is the set of vault slots with a
 * key, or `null` while the vault could not be read. The Case's third-party egress switch is
 * per Case, so the Library shows egress as its own mark instead.
 */
export function libraryReadiness(
  entry: {
    disabledReason?: "breach_disabled";
    credentials: readonly CredentialSpecWire[] | undefined;
  },
  configured: ReadonlySet<string> | null
): LibraryReadiness {
  if (configured === null) {
    return entry.disabledReason === "breach_disabled"
      ? { state: "off_by_operator" }
      : { state: "unavailable", reason: KEYS_UNKNOWN_REASON };
  }
  const gate = catalogGate(entry, configured);
  if (gate.isBreachOff) return { state: "off_by_operator" };
  if (gate.missingCredentials !== undefined) {
    return { state: "needs_key", slots: gate.missingCredentials };
  }
  return { state: "ready" };
}

export const READINESS_LABELS: Record<LibraryReadinessState, string> = {
  ready: "Ready",
  needs_key: "Needs a key",
  off_by_operator: "Off by the operator",
  unavailable: "Unavailable",
};

/** Ready entries first; the rest by how fixable they are. */
const READINESS_RANK: Record<LibraryReadinessState, number> = {
  ready: 0,
  needs_key: 1,
  unavailable: 2,
  off_by_operator: 3,
};

export function readinessRank(readiness: LibraryReadiness): number {
  return READINESS_RANK[readiness.state];
}
