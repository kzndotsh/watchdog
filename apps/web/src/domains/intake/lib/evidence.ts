import type { EvidenceRecord } from "@/domains/intake/types";
import type { JobListRecord } from "@/domains/jobs/types";
import { evidencePrimaryLabel } from "@/shared/ui/intake/evidence-option";
import { jobHeadlineLabel } from "@/shared/ui/vocab";
import {
  ENRICHED_MD_ARTIFACT,
  evidenceTitleMapForJobInputs,
  evidenceTitleMapFromRows,
  isOpenJobStatus,
  type JobInputRecord,
} from "@watchdog/schemas";

export { ENRICHED_MD_ARTIFACT };

const TEXT_MIME_PATTERN =
  /^(text\/|.*json.*|.*xml.*|.*html.*|.*yaml.*|.*javascript.*)/;

/** MIME types that can be shown as inline text in evidence previews. */
export function isTextEvidenceMime(mime: string | null | undefined): boolean {
  if (mime === null || mime === undefined || mime === "") return false;
  return TEXT_MIME_PATTERN.test(mime);
}

/** Whether dossier/intake previews should render stored `text` inline. */
export function evidenceShowsInlineText(evidence: EvidenceRecord): boolean {
  return evidence.kind === "attestation" || isTextEvidenceMime(evidence.mime);
}

export type EvidenceJsonParseResult =
  | { ok: true; data: unknown }
  | { ok: false };

/** Best-effort JSON parse for inline evidence text previews. */
export function tryParseEvidenceJson(text: string): EvidenceJsonParseResult {
  try {
    return { ok: true, data: JSON.parse(text) };
  } catch {
    return { ok: false };
  }
}

export function evidenceTitle(row: EvidenceRecord): string {
  return evidencePrimaryLabel(row);
}

/** Dedupe evidence rows by id — active rows win over hidden when both are present. */
export function mergeEvidenceRecords(
  ...lists: readonly (readonly EvidenceRecord[] | undefined)[]
): EvidenceRecord[] {
  const byId = new Map<string, EvidenceRecord>();
  for (const list of lists) {
    if (list === undefined) continue;
    for (const row of list) {
      byId.set(row.id, row);
    }
  }
  return [...byId.values()];
}

/** Id → display title for job-input search and collect filters. */
export function evidenceTitleMapFromRecords(
  rows: readonly EvidenceRecord[]
): Map<string, string> {
  return evidenceTitleMapFromRows(rows);
}

/** Id → display title for jobs that reference evidence in input. */
export function evidenceTitleMapForJobRecords(
  rows: readonly EvidenceRecord[],
  inputs: readonly (JobInputRecord | null | undefined)[]
): Map<string, string> {
  return evidenceTitleMapForJobInputs(
    rows.map((row) => ({
      id: row.id,
      label: row.label,
      kind: row.kind,
      sourceUrl: row.sourceUrl,
    })),
    inputs
  );
}

export function evidenceHint(
  row: EvidenceRecord,
  producingCap: JobListRecord | null = null
): string | null {
  if (row.sourceUrl !== null && row.sourceUrl !== "") return row.sourceUrl;
  if (producingCap !== null) {
    return jobHeadlineLabel(producingCap);
  }
  if (row.text !== null && row.text.length > 0) {
    return `${row.text.length.toLocaleString()} characters`;
  }
  return null;
}

/** Prefer succeeded enrich Job’s enriched.md for the Output tab. */
export function latestEnrichOutput(enrichJobs: JobListRecord[]): {
  job: JobListRecord;
  artifact: NonNullable<JobListRecord["output"]>[number];
} | null {
  for (const job of enrichJobs) {
    const arts = job.output ?? [];
    const enriched =
      arts.find((a) => a.name === ENRICHED_MD_ARTIFACT) ??
      arts.find((a) => a.name === "live.md") ??
      arts.find((a) => a.name === "wayback.md");
    if (enriched && job.status === "succeeded") {
      return { job, artifact: enriched };
    }
  }
  const open = enrichJobs.find((j) => isOpenJobStatus(j.status));
  if (open !== undefined) return null;
  return null;
}

export function evidenceHasEnrichableUrl(row: EvidenceRecord): boolean {
  const url = (row.sourceUrl ?? row.text)?.trim();
  return url !== undefined && url !== "" && /^https?:\/\//i.test(url);
}
