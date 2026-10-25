import { Effect } from "effect";

import {
  CAPABILITIES,
  breachRedactorIds,
  isBreachCap,
  redactBreachArtifact,
} from "@watchdog/caps";
import type { CaseId } from "@watchdog/schemas/shared";
import type { CredentialFingerprint } from "@watchdog/tools/breach";

import type { Db } from "../infra/db-service";
import { jobsRepoFxDb } from "../infra/repos-fx";
import type { DomainTag } from "../infra/tagged-errors";

/**
 * Why a breach Evidence file is not in the Export. The README (`VERIFY.md`) lists each withheld
 * file with one of these fixed explanations, never a message that could carry the content.
 */
export const BREACH_EVIDENCE_WITHHELD = {
  unreadable:
    "The file did not match its Cap's format, so it could not be checked for credentials and is not exported.",
  too_large:
    "The file is larger than an Export reads to check for credentials, so it is not exported.",
} as const;

export type BreachEvidenceWithheldReason =
  keyof typeof BREACH_EVIDENCE_WITHHELD;

/** Most bytes of one breach Evidence file an Export reads to redact it; a Cap's sample is far smaller. */
export const BREACH_EVIDENCE_MAX_BYTES = 8 * 1024 * 1024;

/** What the Export did with breach Evidence, for the stats and the README. */
export type BreachExportNotes = {
  /** Whether an owner or admin included breach credentials in this Export. */
  readonly isCredentialsIncluded: boolean;
  /** Breach Evidence files written with their credential fields cut to attributes. */
  redacted: number;
  /** Breach Evidence files left out, by their path in the Case folder. */
  readonly withheld: { path: string; reason: BreachEvidenceWithheldReason }[];
};

export function newBreachExportNotes(
  isCredentialsIncluded: boolean
): BreachExportNotes {
  return { isCredentialsIncluded, redacted: 0, withheld: [] };
}

/**
 * The stored files a breach Cap's Jobs produced in this Case, as `uri` to the producing Cap's
 * id. Evidence is recognised as breach Evidence by this: the Cap of the Job that wrote the file,
 * not its name or its content.
 */
export function breachArtifactIndexEffect(
  caseId: CaseId
): Effect.Effect<ReadonlyMap<string, string>, DomainTag, Db> {
  return Effect.gen(function* breachArtifactIndexGen() {
    const breachCapIds = CAPABILITIES.filter((cap) => isBreachCap(cap)).map(
      (cap) => cap.id
    );
    const jobs = yield* jobsRepoFxDb.listOutputsForCapabilities(
      caseId,
      breachCapIds
    );
    const index = new Map<string, string>();
    for (const { capabilityId, output } of jobs) {
      for (const artifact of output ?? []) {
        index.set(artifact.uri, capabilityId);
      }
    }
    return index;
  });
}

export type BreachBodyResult =
  | { readonly kind: "redacted"; readonly text: string }
  | {
      readonly kind: "withheld";
      readonly reason: BreachEvidenceWithheldReason;
    };

/**
 * A breach Evidence file as the Export may write it: parsed with the producing Cap's snapshot
 * schema and its credential fields cut to the `safe`-mode attributes. Anything that does not
 * parse is withheld: unknown breach content is never written as it is.
 */
export function redactBreachBody(
  capabilityId: string,
  bytes: Uint8Array,
  fingerprint: CredentialFingerprint
): BreachBodyResult {
  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    return { kind: "withheld", reason: "unreadable" };
  }
  const text = redactBreachArtifact(capabilityId, value, fingerprint);
  return text === null
    ? { kind: "withheld", reason: "unreadable" }
    : { kind: "redacted", text };
}

export type BreachSniffResult = BreachBodyResult | { readonly kind: "plain" };

/**
 * A JSON file with no producing Job on record (its Job is not in the index): if it parses as the
 * snapshot of any breach Cap it is breach output whose producer could not be found, and is
 * redacted like one; anything else is not ours and is written as it is. The producing Job is the
 * rule (`redactBreachBody`); this is the fail-closed fallback for a file the rule cannot place.
 */
export function sniffBreachBody(
  bytes: Uint8Array,
  fingerprint: CredentialFingerprint
): BreachSniffResult {
  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    return { kind: "plain" };
  }
  for (const id of breachRedactorIds()) {
    const text = redactBreachArtifact(id, value, fingerprint);
    if (text !== null) return { kind: "redacted", text };
  }
  return { kind: "plain" };
}

/**
 * Read a body into memory, up to `maxBytes`. Returns null past the limit (the rest is not read),
 * so a huge file costs a bounded read, not its size.
 */
export async function readBounded(
  body: AsyncIterable<Uint8Array>,
  maxBytes: number
): Promise<Uint8Array | null> {
  const chunks: Uint8Array[] = [];
  let total = 0;
  for await (const chunk of body) {
    total += chunk.byteLength;
    if (total > maxBytes) return null;
    chunks.push(chunk);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}
