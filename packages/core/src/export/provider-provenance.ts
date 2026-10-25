import { Effect } from "effect";
import { strToU8 } from "fflate";

import type { ProviderCallWithOutcome } from "@watchdog/db";
import type { CaseId, ProvenanceState } from "@watchdog/schemas/shared";

import type { BlobStore } from "../infra/blob-store";
import type { Db } from "../infra/db-service";
import { logSwallowed } from "../infra/process-log";
import { providerCallsRepoFxDb } from "../infra/repos-fx";
import type { DomainTag } from "../infra/tagged-errors";
import {
  readStoredResponseEffect,
  toProviderCallRecordsEffect,
  type ProviderCallRecord,
} from "../jobs/provider-call-view";
import {
  buildAttributionMarkdown,
  buildVerifyMarkdown,
  providerResponsePath,
} from "./provenance-docs";
import {
  RAW_BODY_WITHHELD,
  rawBodyDecision,
  type CaseExportOptions,
  type RawBodyWithheldReason,
} from "./provider-body-policy";
import { step } from "./zip-step";
import type { ZipWriter } from "./zip-writer";

/** Calls read from the database at a time. */
const CALL_PAGE = 100;

/** What the provenance part of an export added to the archive. */
export type ProvenanceStats = {
  readonly providerCalls: number;
  readonly rawBodiesIncluded: number;
  readonly rawBodiesWithheld: number;
  /** Bytes of raw responses written (before compression). */
  readonly rawBodyBytes: number;
};

/** The body of one envelope: in the archive, or withheld with a fixed reason. */
type RawBodyField =
  | { readonly status: "included"; readonly path: string }
  | {
      readonly status: "withheld";
      readonly reason: RawBodyWithheldReason;
      readonly explanation: string;
    };

/** One line of `provider-calls.jsonl`: the read surfaces' call record, plus what the Export adds. */
export type ProviderCallEnvelope = ProviderCallRecord & {
  /** The exported Evidence this call backs. */
  readonly evidenceIds: readonly string[];
  /** `incomplete` says calls or outcomes of this call's Job were lost. */
  readonly jobProvenance: ProvenanceState;
  readonly rawBody: RawBodyField;
};

function withheld(reason: RawBodyWithheldReason): RawBodyField {
  return { status: "withheld", reason, explanation: RAW_BODY_WITHHELD[reason] };
}

/**
 * How many bytes of raw responses an export with these options would carry, counted from the
 * recorded sizes (no body is read); counting stops once the total passes `limit`, so it is a
 * floor then. This is the size the inline-versus-Job decision adds to the Evidence bytes, and
 * it uses the same rule as the export itself (`rawBodyDecision`).
 */
export function measureRawBodyBytesEffect(
  caseId: CaseId,
  options: CaseExportOptions,
  limit: number
): Effect.Effect<number, DomainTag, Db> {
  return Effect.gen(function* measureRawBodyBytesGen() {
    if (!options.shouldIncludeRawBodies) return 0;
    let bytes = 0;
    let after: string | undefined;
    // `limit` is what room is left under the inline limit: past it the answer is already "a
    // Job", so no page is read once the room is gone (a limit of 0 included).
    while (bytes <= limit) {
      const page = yield* providerCallsRepoFxDb.listForExport(caseId, {
        after,
        limit: CALL_PAGE,
        storedOnly: true,
        activeOnly: true,
      });
      const last = page.at(-1);
      if (last === undefined) break;
      after = last.row.call.id;
      for (const { row } of page) {
        if (rawBodyDecision(row, options).include) {
          bytes += row.outcome?.bodyBytes ?? 0;
        }
        if (bytes > limit) break;
      }
    }
    return bytes;
  });
}

type CallWithEvidence = {
  row: ProviderCallWithOutcome;
  evidenceIds: string[];
};

/**
 * The calls of a page that back an Evidence item the export selected (once, when it wrote the
 * Evidence files), each with only those ids. Evidence hidden after that selection keeps its
 * envelopes; Evidence added after it gets none, so the files and the envelopes describe one set.
 */
function inExportedEvidence(
  page: readonly CallWithEvidence[],
  exportedEvidence: ReadonlySet<string>
): CallWithEvidence[] {
  return page.flatMap(({ row, evidenceIds }) => {
    const kept = evidenceIds.filter((id) => exportedEvidence.has(id));
    return kept.length === 0 ? [] : [{ row, evidenceIds: kept }];
  });
}

/**
 * The raw responses the export carries, as `provider-responses/<callId>.bin`, one after another.
 * Each is read through `readStoredResponseEffect` (size and SHA-256 checked); one that cannot be
 * read back is left out and logged, and its envelope says `unreadable`. Returns the ids written.
 */
function writeRawBodiesEffect(
  zip: ZipWriter,
  caseId: CaseId,
  caseSlug: string,
  options: CaseExportOptions,
  exportedEvidence: ReadonlySet<string>
): Effect.Effect<
  { written: Set<string>; bytes: number },
  DomainTag,
  Db | BlobStore
> {
  return Effect.gen(function* writeRawBodiesGen() {
    const written = new Set<string>();
    let bytes = 0;
    if (!options.shouldIncludeRawBodies) return { written, bytes };
    let after: string | undefined;
    for (;;) {
      const page = yield* providerCallsRepoFxDb.listForExport(caseId, {
        after,
        limit: CALL_PAGE,
        storedOnly: true,
      });
      const last = page.at(-1);
      if (last === undefined) break;
      after = last.row.call.id;
      for (const { row } of inExportedEvidence(page, exportedEvidence)) {
        if (!rawBodyDecision(row, options).include) continue;
        const callId = row.call.id;
        const response = yield* readStoredResponseEffect(
          caseId,
          row,
          callId
        ).pipe(
          Effect.catch((error) => {
            logSwallowed("case-export-provider-response", error, { callId });
            return Effect.succeed(null);
          })
        );
        if (response === null) continue;
        yield* step("writing a provider response", (signal) =>
          zip.addStream(
            `${caseSlug}/${providerResponsePath(callId)}`,
            [response.bytes],
            signal
          )
        );
        written.add(callId);
        bytes += response.bytes.byteLength;
      }
    }
    return { written, bytes };
  });
}

/** Whether the body is in the archive, or why it is not. A body promised but not written is `unreadable`. */
function rawBodyField(
  row: ProviderCallWithOutcome,
  options: CaseExportOptions,
  written: ReadonlySet<string>
): RawBodyField {
  const decision = rawBodyDecision(row, options);
  if (!decision.include) return withheld(decision.reason);
  return written.has(row.call.id)
    ? { status: "included", path: providerResponsePath(row.call.id) }
    : withheld("unreadable");
}

/** One line of `provider-calls.jsonl`. */
function envelopeLine(
  { row, evidenceIds }: { row: ProviderCallWithOutcome; evidenceIds: string[] },
  record: ProviderCallRecord,
  options: CaseExportOptions,
  written: ReadonlySet<string>
): string {
  const envelope: ProviderCallEnvelope = {
    ...record,
    evidenceIds,
    jobProvenance: row.job.provenanceState,
    rawBody: rawBodyField(row, options, written),
  };
  return `${JSON.stringify(envelope)}\n`;
}

/**
 * `provider-calls.jsonl`: one envelope per call that backs an exported Evidence item, in call
 * id order, a page at a time. Returns the stats and the Cap ids that made the calls.
 */
function writeEnvelopesEffect(
  zip: ZipWriter,
  caseId: CaseId,
  caseSlug: string,
  options: CaseExportOptions,
  written: ReadonlySet<string>,
  exportedEvidence: ReadonlySet<string>
): Effect.Effect<
  {
    calls: number;
    included: number;
    storedWithheld: number;
    capabilityIds: Set<string>;
  },
  DomainTag,
  Db
> {
  return Effect.gen(function* writeEnvelopesGen() {
    const entry = zip.startEntry(`${caseSlug}/provider-calls.jsonl`);
    const capabilityIds = new Set<string>();
    let calls = 0;
    let included = 0;
    let storedWithheld = 0;
    let after: string | undefined;
    for (;;) {
      const page = yield* providerCallsRepoFxDb.listForExport(caseId, {
        after,
        limit: CALL_PAGE,
      });
      const last = page.at(-1);
      if (last === undefined) break;
      after = last.row.call.id;
      const kept = inExportedEvidence(page, exportedEvidence);
      const records = yield* toProviderCallRecordsEffect(
        caseId,
        kept.map(({ row }) => row)
      );
      const lines = kept.flatMap((entryRow, index): string[] => {
        const record = records[index];
        return record === undefined
          ? []
          : [envelopeLine(entryRow, record, options, written)];
      });
      for (const { row } of kept) {
        capabilityIds.add(row.job.capabilityId);
        if (written.has(row.call.id)) included += 1;
        else if (row.outcome?.bodyState === "stored") storedWithheld += 1;
      }
      calls += kept.length;
      yield* step("writing provider calls", (signal) =>
        entry.push(strToU8(lines.join("")), signal)
      );
    }
    yield* step("writing provider calls", () => entry.end());
    return { calls, included, storedWithheld, capabilityIds };
  });
}

/**
 * The provenance part of an export, always: the raw responses the options and the terms allow,
 * then `provider-calls.jsonl`, `ATTRIBUTION.md` and `VERIFY.md`. Entries are written one at a
 * time (a streaming zip cannot interleave them), so the bodies go first and the envelopes, which
 * must say which bodies made it in, follow.
 */
export function writeProviderProvenanceEffect(
  zip: ZipWriter,
  caseId: CaseId,
  caseSlug: string,
  exportedAt: string,
  options: CaseExportOptions,
  exportedEvidence: ReadonlySet<string>
): Effect.Effect<ProvenanceStats, DomainTag, Db | BlobStore> {
  return Effect.gen(function* writeProviderProvenanceGen() {
    const bodies = yield* writeRawBodiesEffect(
      zip,
      caseId,
      caseSlug,
      options,
      exportedEvidence
    );
    const envelopes = yield* writeEnvelopesEffect(
      zip,
      caseId,
      caseSlug,
      options,
      bodies.written,
      exportedEvidence
    );
    yield* step("writing ATTRIBUTION.md", (signal) =>
      zip.addText(
        `${caseSlug}/ATTRIBUTION.md`,
        buildAttributionMarkdown(caseSlug, exportedAt, envelopes.capabilityIds),
        signal
      )
    );
    yield* step("writing VERIFY.md", (signal) =>
      zip.addText(
        `${caseSlug}/VERIFY.md`,
        buildVerifyMarkdown(caseSlug),
        signal
      )
    );
    return {
      providerCalls: envelopes.calls,
      rawBodiesIncluded: envelopes.included,
      rawBodiesWithheld: envelopes.storedWithheld,
      rawBodyBytes: bodies.bytes,
    };
  });
}
