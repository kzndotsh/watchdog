import type { EvidenceRecord } from "@/domains/intake/types";
import type { JobListRecord } from "@/domains/jobs/jobs.functions";
import { capabilityLabel } from "@/shared/ui/vocab";
import { ENRICHED_MD_ARTIFACT } from "@watchdog/schemas";

export { ENRICHED_MD_ARTIFACT };

export function evidenceTitle(row: EvidenceRecord): string {
  const label = row.label?.trim();
  if (label !== undefined && label !== "") return label;
  if (row.sourceUrl !== null && row.sourceUrl !== "") {
    try {
      return new URL(row.sourceUrl).hostname;
    } catch {
      return row.sourceUrl;
    }
  }
  return row.kind;
}

export function evidenceHint(
  row: EvidenceRecord,
  producingCap: JobListRecord | null = null
): string | null {
  if (row.sourceUrl !== null && row.sourceUrl !== "") return row.sourceUrl;
  if (producingCap !== null) {
    return capabilityLabel(producingCap.capabilityId);
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
  const running = enrichJobs.find(
    (j) => j.status === "queued" || j.status === "running"
  );
  if (running) return null;
  return null;
}

export function evidenceHasEnrichableUrl(row: EvidenceRecord): boolean {
  const url = (row.sourceUrl ?? row.text)?.trim();
  return url !== undefined && url !== "" && /^https?:\/\//i.test(url);
}
