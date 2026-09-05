import type { CollectRunRole } from "@/domains/collect/types";
import type { JobListRecord } from "@/domains/jobs/jobs.functions";
import {
  isProcessCapability,
  URL_ENRICH_CAPABILITY_ID,
} from "@watchdog/schemas";

export function classifyRun(job: JobListRecord): CollectRunRole {
  if (job.playbookStep !== null && job.playbookStep !== undefined) {
    return "step";
  }
  if (isProcessCapability(job.capabilityId)) {
    return "process";
  }
  if (job.capabilityId === URL_ENRICH_CAPABILITY_ID) {
    return "enrich";
  }
  return "collect";
}

export function landedEvidenceIds(job: JobListRecord): readonly string[] {
  return job.evidenceIds ?? [];
}

function jobInputEvidenceId(job: JobListRecord): string | null {
  const evidenceId = job.input.evidenceId;
  if (typeof evidenceId === "string" && evidenceId !== "") {
    return evidenceId;
  }
  const sourceEvidenceId = job.input.sourceEvidenceId;
  if (typeof sourceEvidenceId === "string" && sourceEvidenceId !== "") {
    return sourceEvidenceId;
  }
  return null;
}

export function jobLinksEvidence(
  job: JobListRecord,
  evidenceId: string
): boolean {
  if (job.evidenceIds?.includes(evidenceId) === true) {
    return true;
  }
  if (isProcessCapability(job.capabilityId)) {
    return job.input.evidenceId === evidenceId;
  }
  if (job.capabilityId === URL_ENRICH_CAPABILITY_ID) {
    return job.input.sourceEvidenceId === evidenceId;
  }
  const inputEvidenceId = jobInputEvidenceId(job);
  if (
    job.playbookRunId !== null &&
    job.playbookRunId !== "" &&
    inputEvidenceId === evidenceId
  ) {
    return true;
  }
  return false;
}

export function isCollectCap(job: JobListRecord): boolean {
  if (job.playbookRunId !== null && job.playbookRunId !== "") return false;
  if (isProcessCapability(job.capabilityId)) return false;
  if (job.capabilityId === URL_ENRICH_CAPABILITY_ID) return false;
  return true;
}

export function producingCollectJob(
  jobs: readonly JobListRecord[],
  evidenceId: string
): JobListRecord | null {
  const matches = jobs
    .filter((job) => {
      if (!isCollectCap(job)) return false;
      if ((job.evidenceIds?.length ?? 0) > 1) return false;
      return job.evidenceIds?.includes(evidenceId) === true;
    })
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  return matches[0] ?? null;
}

export function shouldStayStandaloneJob(job: JobListRecord): boolean {
  const landed = landedEvidenceIds(job);
  if (landed.length === 0) {
    return isCollectCap(job);
  }
  if (landed.length > 1) {
    return true;
  }
  return false;
}
