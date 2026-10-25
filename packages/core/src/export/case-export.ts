import { GetObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { Effect } from "effect";
import { strToU8 } from "fflate";

import type { EvidenceRow } from "@watchdog/db";
import type { CaseId, OrganizationId } from "@watchdog/schemas/shared";

import { getCaseByIdEffect } from "../cases/cases";
import { BlobStore, type BlobStoreApi } from "../infra/blob-store";
import { nowIsoStringEffect } from "../infra/clock";
import { instanceCredentialFingerprint } from "../infra/credential-fingerprint";
import type { Db } from "../infra/db-service";
import { renderEntityMarkdownEffect } from "../infra/export";
import {
  attestationSection,
  attestationsHeader,
  buildCaseMarkdown,
} from "../infra/export-sections";
import {
  casesRepoFxDb,
  entitiesRepoFxDb,
  evidenceRepoFxDb,
} from "../infra/repos-fx";
import {
  NotFoundError,
  type DomainTag,
  type InternalError,
} from "../infra/tagged-errors";
import {
  BREACH_EVIDENCE_MAX_BYTES,
  breachArtifactIndexEffect,
  newBreachExportNotes,
  readBounded,
  redactBreachBody,
  type BreachExportNotes,
} from "./breach-evidence";
import { evidenceZipPath } from "./evidence-paths";
import { NO_OPT_INS, type CaseExportOptions } from "./provider-body-policy";
import {
  measureRawBodyBytesEffect,
  writeProviderProvenanceEffect,
} from "./provider-provenance";
import { caseExportSettings, type CaseExportSettings } from "./settings";
import { exportFailure, step } from "./zip-step";
import { ZipWriter, type ZipEntryWriter, type ZipSink } from "./zip-writer";

/** What a finished export contains, for the log and the Job's summary. */
export type CaseExportStats = {
  readonly markdownFiles: number;
  readonly evidenceIncluded: number;
  readonly evidenceSkipped: number;
  /** Bytes of Evidence read (before compression). */
  readonly evidenceBytes: number;
  /** Calls with an envelope in `provider-calls.jsonl`. */
  readonly providerCalls: number;
  /** Raw responses written, and the calls whose response is withheld (with its hash). */
  readonly rawBodiesIncluded: number;
  readonly rawBodiesWithheld: number;
  /** Bytes of raw responses written (before compression). */
  readonly rawBodyBytes: number;
  /** Breach Evidence files written with credential fields cut to attributes, and files left out. */
  readonly breachEvidenceRedacted: number;
  readonly breachEvidenceWithheld: number;
};

export type CaseExportMeasure =
  | { readonly kind: "missing_case" }
  | {
      readonly kind: "ok";
      readonly caseSlug: string;
      /** Evidence bytes counted; counting stops once it passes the limit, so this is a floor then. */
      readonly evidenceBytes: number;
      /** Raw response bytes the export would add (0 unless opted in); a floor past the limit. */
      readonly rawBodyBytes: number;
      /** Evidence plus raw responses over `inlineMaxBytes`: the export belongs in a Job. */
      readonly overLimit: boolean;
    };

/** How many stored-file keys one page of the size pass holds (no bodies: just keys). */
const URI_PAGE = 200;

function blobSizeEffect(
  store: BlobStoreApi,
  uri: string
): Effect.Effect<number> {
  return Effect.tryPromise({
    try: (signal) =>
      store.client.send(
        new HeadObjectCommand({ Bucket: store.bucket, Key: uri }),
        { abortSignal: signal }
      ),
    catch: exportFailure("Couldn't read an Evidence file's size"),
  }).pipe(
    Effect.map((head) => head.ContentLength ?? 0),
    // An object that cannot be read is skipped by the export, so it adds nothing.
    Effect.orElseSucceed(() => 0)
  );
}

/**
 * Size up a Case's export without reading any body. Text is measured in the database
 * (`octet_length`, nothing fetched); stored files are HEADed `concurrency` at a time, from pages
 * of keys, and the count stops as soon as the total passes the limit (a huge Case costs a few
 * requests, not all of them). Memory is one page of keys.
 */
export function measureCaseExportEffect(
  caseId: CaseId,
  organizationId: OrganizationId,
  settings: CaseExportSettings = caseExportSettings(),
  options: CaseExportOptions = NO_OPT_INS
): Effect.Effect<CaseExportMeasure, DomainTag, Db | BlobStore> {
  return Effect.gen(function* measureCaseExportGen() {
    const activeCase = yield* getCaseByIdEffect(caseId, organizationId).pipe(
      Effect.catchTag("NotFoundError", () => Effect.succeed(null))
    );
    if (activeCase === null) return { kind: "missing_case" as const };
    const store = yield* BlobStore;
    const sizes = yield* evidenceRepoFxDb.exportSizesForCase(caseId);
    let evidenceBytes = sizes.textBytes;
    let after: string | undefined;
    while (evidenceBytes <= settings.inlineMaxBytes) {
      const page = yield* evidenceRepoFxDb.listExportUrisPage(caseId, {
        after,
        limit: URI_PAGE,
      });
      const last = page.at(-1);
      if (last === undefined) break;
      after = last.id;
      for (
        let start = 0;
        start < page.length && evidenceBytes <= settings.inlineMaxBytes;
        start += settings.concurrency
      ) {
        const heads = yield* Effect.forEach(
          page.slice(start, start + settings.concurrency),
          ({ uri }) => blobSizeEffect(store, uri),
          { concurrency: settings.concurrency }
        );
        for (const size of heads) evidenceBytes += size;
      }
    }
    // Raw responses count toward the same limit, by the rule the export itself applies.
    // Evidence alone over the limit already means a Job: no call is read for the answer.
    const rawBodyBytes =
      evidenceBytes > settings.inlineMaxBytes
        ? 0
        : yield* measureRawBodyBytesEffect(
            caseId,
            options,
            settings.inlineMaxBytes - evidenceBytes
          );
    return {
      kind: "ok" as const,
      caseSlug: activeCase.slug,
      evidenceBytes,
      rawBodyBytes,
      overLimit: evidenceBytes + rawBodyBytes > settings.inlineMaxBytes,
    };
  });
}

type EvidencePart =
  | { readonly kind: "skipped" }
  | { readonly kind: "none" }
  | { readonly kind: "text"; readonly path: string; readonly text: string }
  | {
      readonly kind: "blob";
      readonly path: string;
      readonly body: AsyncIterable<Uint8Array>;
      readonly destroy: () => void;
      /** Set when a breach Cap's Job wrote this file and its credentials are to be redacted. */
      readonly breachCapabilityId?: string;
    };

/** Open one Evidence file for reading: nothing is buffered, the body is a stream to pull from. */
function openEvidenceEffect(
  caseSlug: string,
  store: BlobStoreApi,
  ev: EvidenceRow,
  redactFor: ReadonlyMap<string, string>
): Effect.Effect<EvidencePart> {
  if (ev.uri !== null && ev.uri !== "") {
    const uri = ev.uri;
    return Effect.tryPromise({
      try: (signal) =>
        store.client.send(
          new GetObjectCommand({ Bucket: store.bucket, Key: uri }),
          { abortSignal: signal }
        ),
      catch: exportFailure("Couldn't open an Evidence file"),
    }).pipe(
      Effect.map((res): EvidencePart => {
        const body = res.Body;
        if (body === undefined || !(Symbol.asyncIterator in body)) {
          return { kind: "skipped" };
        }
        const breachCapabilityId = redactFor.get(uri);
        return {
          kind: "blob",
          ...(breachCapabilityId === undefined ? {} : { breachCapabilityId }),
          path: evidenceZipPath(caseSlug, ev, "blob"),
          body: body as AsyncIterable<Uint8Array>,
          destroy: () => {
            if ("destroy" in body && typeof body.destroy === "function") {
              body.destroy();
            }
          },
        };
      }),
      // A file that cannot be opened is left out and counted, as it always was.
      Effect.orElseSucceed((): EvidencePart => ({ kind: "skipped" }))
    );
  }
  if (ev.text && ev.kind !== "attestation") {
    return Effect.succeed({
      kind: "text",
      path: evidenceZipPath(caseSlug, ev, "text"),
      text: ev.text,
    });
  }
  return Effect.succeed({ kind: "none" });
}

function counting(
  body: AsyncIterable<Uint8Array>,
  onBytes: (n: number) => void
): AsyncIterable<Uint8Array> {
  return (async function* countBytes() {
    for await (const chunk of body) {
      onBytes(chunk.byteLength);
      yield chunk;
    }
  })();
}

/** What the Evidence batches added to the archive so far. */
type EvidenceTally = { included: number; skipped: number; bytes: number };

/** What breach Evidence needs while the batches run: which files are breach files, and the notes. */
type BreachRedaction = {
  /** `uri` to the breach Cap that wrote it; empty when an owner or admin included credentials. */
  readonly redactFor: ReadonlyMap<string, string>;
  readonly notes: BreachExportNotes;
};

/**
 * Write one breach Evidence file with its credentials cut to attributes. The file is read whole
 * (bounded), parsed with the producing Cap's snapshot schema and rewritten through the same
 * transform `safe` mode uses. A file that is too large or does not parse is withheld: it is
 * counted, listed in the README and never written as it is.
 */
function writeRedactedBreachEvidenceEffect(
  zip: ZipWriter,
  caseSlug: string,
  part: Extract<EvidencePart, { kind: "blob" }>,
  capabilityId: string,
  tally: EvidenceTally,
  breach: BreachExportNotes
): Effect.Effect<void, InternalError> {
  return Effect.gen(function* writeRedactedBreachGen() {
    const bytes = yield* Effect.tryPromise({
      try: () => readBounded(part.body, BREACH_EVIDENCE_MAX_BYTES),
      catch: exportFailure("Couldn't read an Evidence file"),
    });
    const relative = part.path.slice(caseSlug.length + 1);
    if (bytes === null) {
      breach.withheld.push({ path: relative, reason: "too_large" });
      return;
    }
    const result = redactBreachBody(
      capabilityId,
      bytes,
      instanceCredentialFingerprint()
    );
    if (result.kind === "withheld") {
      breach.withheld.push({ path: relative, reason: result.reason });
      return;
    }
    tally.bytes += Buffer.byteLength(result.text, "utf-8");
    tally.included += 1;
    breach.redacted += 1;
    yield* step("writing Evidence text", (signal) =>
      zip.addText(part.path, result.text, signal)
    );
  });
}

/**
 * Open one batch of Evidence files together (bounded by `concurrency`), then write them to the
 * archive one after another. The scope destroys every opened body when the batch ends or fails.
 */
function writeEvidenceBatchEffect(
  zip: ZipWriter,
  caseSlug: string,
  store: BlobStoreApi,
  batch: readonly EvidenceRow[],
  tally: EvidenceTally,
  settings: CaseExportSettings,
  breach: BreachRedaction
): Effect.Effect<void, InternalError> {
  return Effect.scoped(
    Effect.gen(function* writeEvidenceBatchGen() {
      const parts = yield* Effect.forEach(
        batch,
        (ev) =>
          Effect.acquireRelease(
            openEvidenceEffect(caseSlug, store, ev, breach.redactFor),
            (part) =>
              Effect.sync(() => {
                if (part.kind === "blob") part.destroy();
              })
          ),
        { concurrency: settings.concurrency }
      );
      for (const part of parts) {
        switch (part.kind) {
          case "skipped": {
            tally.skipped += 1;
            break;
          }
          case "none": {
            break;
          }
          case "text": {
            tally.bytes += Buffer.byteLength(part.text, "utf-8");
            tally.included += 1;
            yield* step("writing Evidence text", (signal) =>
              zip.addText(part.path, part.text, signal)
            );
            break;
          }
          case "blob": {
            if (part.breachCapabilityId !== undefined) {
              yield* writeRedactedBreachEvidenceEffect(
                zip,
                caseSlug,
                part,
                part.breachCapabilityId,
                tally,
                breach.notes
              );
              break;
            }
            tally.included += 1;
            yield* step("reading an Evidence file", (signal) =>
              zip.addStream(
                part.path,
                counting(part.body, (n) => {
                  tally.bytes += n;
                }),
                signal
              )
            );
            break;
          }
          default: {
            part satisfies never;
          }
        }
      }
    })
  );
}

/**
 * `evidence/attestations.md`, written as one entry a page of attestations at a time. Returns how
 * many attestations it holds (the entry is left out when there are none).
 */
function writeAttestationsEffect(
  zip: ZipWriter,
  caseId: CaseId,
  caseSlug: string,
  exportedAt: string,
  settings: CaseExportSettings
): Effect.Effect<number, DomainTag, Db> {
  return Effect.gen(function* writeAttestationsGen() {
    let entry: ZipEntryWriter | undefined;
    let count = 0;
    let after: string | undefined;
    for (;;) {
      const page = yield* evidenceRepoFxDb.listExportPage(caseId, {
        after,
        limit: settings.concurrency,
        attestationsOnly: true,
      });
      const last = page.at(-1);
      if (last === undefined) break;
      after = last.id;
      if (entry === undefined) {
        const started = zip.startEntry(`${caseSlug}/evidence/attestations.md`);
        entry = started;
        yield* step("writing attestations", (signal) =>
          started.push(
            strToU8(attestationsHeader(caseSlug, exportedAt)),
            signal
          )
        );
      }
      const open = entry;
      for (const att of page) {
        count += 1;
        yield* step("writing attestations", (signal) =>
          open.push(strToU8(attestationSection(att)), signal)
        );
      }
    }
    const done = entry;
    if (done !== undefined) {
      yield* step("writing attestations", () => done.end());
    }
    return count;
  });
}

/**
 * Write the Case's export zip to `sink`, as a stream: entities are rendered and Evidence files
 * are read `concurrency` at a time and go straight into the archive, so memory does not grow
 * with the Case (one batch of rendered notes, a read buffer per open file, one zip chunk). A file
 * that cannot be opened is skipped and counted; a read that fails halfway fails the export,
 * because a truncated file in an archive is worse than none.
 */
export function writeCaseExportZipEffect(
  caseId: CaseId,
  sink: ZipSink,
  settings: CaseExportSettings = caseExportSettings(),
  options: CaseExportOptions = NO_OPT_INS
): Effect.Effect<CaseExportStats, DomainTag, Db | BlobStore> {
  return Effect.gen(function* writeCaseExportZipGen() {
    const store = yield* BlobStore;
    const caseRow = yield* casesRepoFxDb.getByIdUnchecked(caseId);
    if (caseRow === null) {
      return yield* new NotFoundError({ entity: "Case", id: caseId });
    }
    const { slug: caseSlug } = caseRow;
    const zip = new ZipWriter(sink);

    const peers = yield* entitiesRepoFxDb.listPeersForCase(caseId);
    const peerMap = new Map(peers.map((e) => [e.id, e]));
    const entityPaths: string[] = [];
    for (let start = 0; start < peers.length; start += settings.concurrency) {
      const notes = yield* Effect.forEach(
        peers.slice(start, start + settings.concurrency),
        ({ id }) => renderEntityMarkdownEffect(id, peerMap),
        { concurrency: settings.concurrency }
      );
      for (const note of notes) {
        if (note === null) continue;
        const path = `${note.kind}s/${note.entitySlug}.md`;
        entityPaths.push(path);
        yield* step("writing a note", (signal) =>
          zip.addText(`${caseSlug}/${path}`, note.markdown, signal)
        );
      }
    }

    const tally: EvidenceTally = { included: 0, skipped: 0, bytes: 0 };
    // Breach Evidence is written with its credentials cut to attributes unless an owner or admin
    // included them. Which files are breach files comes from the Jobs that wrote them.
    const breachNotes = newBreachExportNotes(
      options.shouldIncludeBreachCredentials
    );
    const breach: BreachRedaction = {
      redactFor: options.shouldIncludeBreachCredentials
        ? new Map()
        : yield* breachArtifactIndexEffect(caseId),
      notes: breachNotes,
    };
    let evidenceRows = 0;
    // The Evidence set, selected once: the provider calls are written for these ids and no others.
    const exportedEvidence = new Set<string>();
    let after: string | undefined;
    for (;;) {
      const page = yield* evidenceRepoFxDb.listExportPage(caseId, {
        after,
        limit: settings.concurrency,
      });
      const last = page.at(-1);
      if (last === undefined) break;
      after = last.id;
      evidenceRows += page.length;
      for (const { id } of page) exportedEvidence.add(id);
      for (let start = 0; start < page.length; start += settings.concurrency) {
        const batch = page.slice(start, start + settings.concurrency);
        yield* writeEvidenceBatchEffect(
          zip,
          caseSlug,
          store,
          batch,
          tally,
          settings,
          breach
        );
      }
    }

    const exportedAt = yield* nowIsoStringEffect;
    let markdownFiles = entityPaths.length + 1;
    yield* step("writing CASE.md", (signal) =>
      zip.addText(
        `${caseSlug}/CASE.md`,
        buildCaseMarkdown(caseRow, entityPaths, evidenceRows, exportedAt),
        signal
      )
    );
    const attestationCount = yield* writeAttestationsEffect(
      zip,
      caseId,
      caseSlug,
      exportedAt,
      settings
    );
    if (attestationCount > 0) markdownFiles += 1;
    const provenance = yield* writeProviderProvenanceEffect(
      zip,
      caseId,
      caseSlug,
      exportedAt,
      options,
      exportedEvidence,
      breachNotes
    );
    yield* step("finishing the archive", () => zip.finish());
    return {
      markdownFiles,
      evidenceIncluded: tally.included,
      evidenceSkipped: tally.skipped,
      evidenceBytes: tally.bytes,
      breachEvidenceRedacted: breachNotes.redacted,
      breachEvidenceWithheld: breachNotes.withheld.length,
      ...provenance,
    };
  });
}
