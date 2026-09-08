import { Effect } from "effect";

import { db, evidenceRepo, jobsRepo } from "@watchdog/db";
import {
  ENRICHED_MD_ARTIFACT,
  evidenceIdsFromJobInputs,
  evidenceSnapshotSchema,
  parseTrimmedCaseId,
  trimmedOrUndefined,
  URL_ENRICH_CAPABILITY_ID,
  type EvidenceSnapshot,
} from "@watchdog/schemas";

import { readArtifactBytesEffect } from "../infra/blob";
import { tryDb } from "../infra/postgres-effect";
import { NotFoundError, type DomainTag } from "../infra/tagged-errors";
import { parseStoredJobEvidenceIds } from "../jobs/stages/helpers";

export const MAX_SNAPSHOT_CHARS = 80_000;

const TEXTISH_MIME =
  /^(text\/|application\/(json|xml|javascript|x-www-form-urlencoded))/i;

function truncate(text: string, max = MAX_SNAPSHOT_CHARS): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}\n\n…[truncated ${text.length - max} chars]`;
}

function loadTextFromEvidence(row: {
  text: string | null;
  uri: string | null;
  mime: string | null;
  kind: string;
}): Effect.Effect<string> {
  if (row.text !== null && row.text.trim() !== "") {
    return Effect.succeed(row.text);
  }
  if (row.uri === null) {
    return Effect.succeed("");
  }
  const mime = row.mime ?? "";
  if (mime && !TEXTISH_MIME.test(mime) && !mime.includes("charset")) {
    return Effect.succeed("");
  }
  return readArtifactBytesEffect(row.uri).pipe(
    Effect.map((bytes) => {
      const head = bytes.slice(0, 512);
      if (head.includes(0)) return "";
      return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
    }),
    Effect.catch(() => Effect.succeed(""))
  );
}

/**
 * URL dumps are metadata-only until Enrich. Process should harvest the Job
 * Output (enriched.md), not the bare URL string on the Evidence row.
 */
function loadEnrichOutputText(input: {
  caseId: string;
  evidenceId: string;
}): Effect.Effect<string | null, DomainTag> {
  return Effect.gen(function* loadEnrichOutputTextGen() {
    const recent = yield* tryDb(() =>
      jobsRepo.listSucceededForCapability(
        db,
        input.caseId,
        URL_ENRICH_CAPABILITY_ID,
        40
      )
    );
    for (const job of recent) {
      const inputIds = evidenceIdsFromJobInputs([job.input]);
      const stored = parseStoredJobEvidenceIds(job.evidenceIds);
      const evidenceIdsFromJob = stored.ok ? stored.ids : [];
      const linked =
        inputIds.includes(input.evidenceId) ||
        evidenceIdsFromJob.includes(input.evidenceId);
      if (!linked) continue;
      const arts = job.output ?? [];
      const enriched =
        arts.find((a) => a.name === ENRICHED_MD_ARTIFACT) ??
        arts.find((a) => a.name === "live.md") ??
        arts.find((a) => a.name === "wayback.md");
      if (enriched === undefined) continue;
      const text = yield* readArtifactBytesEffect(enriched.uri).pipe(
        Effect.map((bytes) =>
          new TextDecoder("utf-8", { fatal: false }).decode(bytes)
        ),
        Effect.catch(() => Effect.succeed(""))
      );
      if (text.trim()) return text;
    }
    return null;
  });
}

export function packEvidenceSnapshotEffect(input: {
  caseId: string;
  evidenceId: string;
  entityId?: string;
}): Effect.Effect<EvidenceSnapshot, DomainTag> {
  return Effect.gen(function* packEvidenceSnapshotGen() {
    const row = yield* tryDb(() =>
      evidenceRepo.getActiveInCase(db, input.caseId, input.evidenceId)
    );
    if (!row) {
      return yield* new NotFoundError({
        resource: `Evidence not found: ${input.evidenceId}`,
      });
    }
    const initialText = yield* loadTextFromEvidence(row);
    const looksLikeUrlOnly =
      row.uri === null &&
      Boolean(initialText.trim()) &&
      /^https?:\/\/\S+$/i.test(initialText.trim());
    const needsEnrich = !initialText.trim() || looksLikeUrlOnly;
    const fromEnrich = needsEnrich
      ? yield* loadEnrichOutputText({
          caseId: input.caseId,
          evidenceId: row.id,
        })
      : null;
    const rawText =
      fromEnrich !== null && fromEnrich.trim() !== ""
        ? fromEnrich
        : initialText;
    let entityId: string | undefined;
    if (input.entityId !== null && input.entityId !== undefined) {
      entityId = parseTrimmedCaseId(input.entityId) ?? undefined;
    } else if (row.entityId === null || row.entityId === undefined) {
      entityId = undefined;
    } else {
      entityId = parseTrimmedCaseId(row.entityId) ?? undefined;
    }
    const label = trimmedOrUndefined(row.label ?? undefined);
    const mime = trimmedOrUndefined(row.mime ?? undefined);
    return evidenceSnapshotSchema.parse({
      evidenceId: row.id,
      caseId: row.caseId,
      ...(entityId === undefined ? {} : { entityId }),
      kind: row.kind,
      ...(label === undefined ? {} : { label }),
      text: truncate(rawText),
      ...(mime === undefined ? {} : { mime }),
      sha256: row.sha256,
      uri: row.uri,
      packedAt: new Date().toISOString(),
      packerVersion: 1,
    });
  });
}

export function snapshotToArtifactBytes(
  snapshot: EvidenceSnapshot
): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(snapshot, null, 2));
}
