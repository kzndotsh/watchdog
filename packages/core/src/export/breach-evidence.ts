import { Effect } from "effect";

import { isBreachCap, redactBreachArtifact } from "@watchdog/caps";
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
  producer_unknown:
    "A Job wrote this file, but that Job could not be found, so the file could not be checked for credentials and is not exported.",
} as const;

export type BreachEvidenceWithheldReason =
  keyof typeof BREACH_EVIDENCE_WITHHELD;

/** Most bytes of one breach Evidence file an Export reads to redact it; a Cap's sample is far smaller. Applies to breach files only, never to other Evidence. */
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
 * What an Export does with one Evidence file, decided by where it came from:
 *
 * - no Job produced it (an upload, an attestation, a paste): written as it is, whatever its size
 *   or shape;
 * - a breach Cap's Job produced it: redacted, using that Cap's snapshot schema;
 * - a Job produced it but that Job cannot be read back: withheld (`producer_unknown`), because
 *   nothing says it is not breach output.
 */
export type EvidenceOrigin =
  | { readonly kind: "breach"; readonly capabilityId: string }
  | { readonly kind: "unknown_producer" };

/**
 * The origin of each Evidence row of a page that needs a decision, keyed by Evidence id. A row
 * with no entry is written as it is. Read after the page, from the same committed state: a Job
 * lands its Evidence and its `job_evidence` link in one transaction.
 */
export function evidenceOriginsEffect(
  caseId: CaseId,
  evidenceIds: readonly string[]
): Effect.Effect<ReadonlyMap<string, EvidenceOrigin>, DomainTag, Db> {
  return Effect.gen(function* evidenceOriginsGen() {
    const links = yield* jobsRepoFxDb.listProducersForEvidence(
      caseId,
      evidenceIds
    );
    const origins = new Map<string, EvidenceOrigin>();
    for (const { evidenceId, capabilityId } of links) {
      if (capabilityId === null) {
        origins.set(evidenceId, { kind: "unknown_producer" });
      } else if (isBreachCap({ id: capabilityId })) {
        // A breach producer wins over anything else that linked the file.
        origins.set(evidenceId, { kind: "breach", capabilityId });
      }
    }
    return origins;
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
