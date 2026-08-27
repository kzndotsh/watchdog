import { db, evidenceRepo, jobsRepo } from "@watchdog/db";
import {
  ENRICHED_MD_ARTIFACT,
  evidenceSnapshotSchema,
  URL_ENRICH_CAPABILITY_ID,
  type EvidenceSnapshot,
} from "@watchdog/schemas";

import { readArtifactBytes } from "../infra/blob";
import { DomainError } from "../infra/domain-error";

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
}): Promise<string> {
  if (row.text !== null && row.text.trim() !== "") {
    return Promise.resolve(row.text);
  }
  if (row.uri === null) {
    return Promise.resolve("");
  }
  const mime = row.mime ?? "";
  if (mime && !TEXTISH_MIME.test(mime) && !mime.includes("charset")) {
    return Promise.resolve("");
  }
  return readArtifactBytes(row.uri)
    .then((bytes) => {
      const head = bytes.slice(0, 512);
      if (head.includes(0)) return "";
      return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
    })
    .catch(() => "");
}

/**
 * URL dumps are metadata-only until Enrich. Process should harvest the Job
 * Output (enriched.md), not the bare URL string on the Evidence row.
 */
function loadEnrichOutputText(input: {
  caseId: string;
  evidenceId: string;
}): Promise<string | null> {
  return jobsRepo
    .listSucceededForCapability(db, input.caseId, URL_ENRICH_CAPABILITY_ID, 40)
    .then((recent) => {
      let chain: Promise<string | null> = Promise.resolve(null);
      for (const job of recent) {
        chain = chain.then((found) => {
          if (found !== null) return found;
          const sourceId =
            typeof job.input === "object" && job.input !== null
              ? (job.input as { sourceEvidenceId?: string }).sourceEvidenceId
              : undefined;
          const linked =
            sourceId === input.evidenceId ||
            (job.evidenceIds?.includes(input.evidenceId) ?? false);
          if (!linked) return null;
          const arts = job.output ?? [];
          const enriched =
            arts.find((a) => a.name === ENRICHED_MD_ARTIFACT) ??
            arts.find((a) => a.name === "live.md") ??
            arts.find((a) => a.name === "wayback.md");
          if (enriched === undefined) return null;
          return readArtifactBytes(enriched.uri)
            .then((bytes) => {
              const text = new TextDecoder("utf-8", { fatal: false }).decode(
                bytes
              );
              return text.trim() ? text : null;
            })
            .catch(() => null);
        });
      }
      return chain;
    });
}

export function packEvidenceSnapshot(input: {
  caseId: string;
  evidenceId: string;
  entityId?: string;
}): Promise<EvidenceSnapshot> {
  return evidenceRepo
    .getActiveInCase(db, input.caseId, input.evidenceId)
    .then((row) => {
      if (!row) {
        throw new DomainError(
          "not_found",
          `Evidence not found: ${input.evidenceId}`
        );
      }
      return loadTextFromEvidence(row).then((initialText) => {
        const looksLikeUrlOnly =
          row.uri === null &&
          Boolean(initialText.trim()) &&
          /^https?:\/\/\S+$/i.test(initialText.trim());
        const needsEnrich = !initialText.trim() || looksLikeUrlOnly;
        const textPromise = needsEnrich
          ? loadEnrichOutputText({
              caseId: input.caseId,
              evidenceId: row.id,
            }).then((fromEnrich) =>
              fromEnrich !== null && fromEnrich.trim() !== ""
                ? fromEnrich
                : initialText
            )
          : Promise.resolve(initialText);
        return textPromise.then((rawText) => {
          const entityId = input.entityId ?? row.entityId ?? undefined;
          return evidenceSnapshotSchema.parse({
            evidenceId: row.id,
            caseId: row.caseId,
            ...(entityId !== undefined && entityId !== "" ? { entityId } : {}),
            kind: row.kind,
            ...(row.label !== null && row.label !== ""
              ? { label: row.label }
              : {}),
            text: truncate(rawText),
            ...(row.mime !== null && row.mime !== "" ? { mime: row.mime } : {}),
            sha256: row.sha256,
            uri: row.uri,
            packedAt: new Date().toISOString(),
            packerVersion: 1,
          });
        });
      });
    });
}

export function snapshotToArtifactBytes(
  snapshot: EvidenceSnapshot
): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(snapshot, null, 2));
}
