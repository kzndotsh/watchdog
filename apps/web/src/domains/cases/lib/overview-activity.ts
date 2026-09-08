import {
  evidenceTitle,
  evidenceTitleMapForJobRecords,
} from "@/domains/intake/lib/evidence";
import { jobActivityAt } from "@/domains/intake/lib/evidence-runs";
import type { EvidenceRecord } from "@/domains/intake/types";
import { groupJobsForQueue } from "@/domains/jobs/lib/status";
import type { JobListRecord } from "@/domains/jobs/types";
import { searchJobHitLabel } from "@/domains/search/lib/hit-labels";
import { proposalTitle } from "@/domains/triage/lib/filters";
import type { ProposalRecord } from "@/domains/triage/triage.functions";
import { entityTitleMapForJobInputs } from "@watchdog/schemas";

export type ActivityKind = "evidence" | "job" | "proposal";

export type ActivityHref =
  | { to: "/collect"; search: { id: string } }
  | { to: "/triage"; search: { proposalId: string } };

export interface ActivityItem {
  id: string;
  kind: ActivityKind;
  label: string;
  at: string;
  href: ActivityHref;
}

const MAX_ACTIVITY = 12;

export const CASE_OVERVIEW_ACTIVITY_LIMIT = MAX_ACTIVITY;

export function jobEntityLabelsForActivity(
  jobs: readonly Pick<JobListRecord, "input">[],
  entities: readonly {
    id: string;
    name: string;
    slug?: string | null;
  }[]
): Record<string, string> {
  return Object.fromEntries(
    entityTitleMapForJobInputs(
      entities,
      jobs.map((job) => job.input)
    )
  );
}

export function jobEvidenceLabelsForActivity(
  jobs: readonly Pick<JobListRecord, "input">[],
  evidenceRows: readonly EvidenceRecord[]
): Record<string, string> {
  return Object.fromEntries(
    evidenceTitleMapForJobRecords(
      evidenceRows,
      jobs.map((job) => job.input)
    )
  );
}

function latestPlaybookStep(steps: readonly JobListRecord[]): JobListRecord {
  const first = steps[0];
  if (first === undefined) {
    throw new Error("latestPlaybookStep: empty steps");
  }
  let best = first;
  for (let i = 1; i < steps.length; i += 1) {
    const step = steps[i];
    if (
      step !== undefined &&
      Date.parse(jobActivityAt(step)) >= Date.parse(jobActivityAt(best))
    ) {
      best = step;
    }
  }
  return best;
}

function seedPlaybookStep(
  steps: readonly JobListRecord[]
): JobListRecord | null {
  if (steps.length === 0) return null;
  return (
    [...steps].sort(
      (a, b) => (a.playbookStep ?? 0) - (b.playbookStep ?? 0)
    )[0] ?? null
  );
}

function playbookResultSummary(steps: readonly JobListRecord[]): string | null {
  const ordered = [...steps].sort(
    (a, b) => Date.parse(jobActivityAt(b)) - Date.parse(jobActivityAt(a))
  );
  for (const step of ordered) {
    const summary = step.resultSummary?.trim();
    if (summary) return summary;
  }
  return null;
}

function jobActivityItem(
  id: string,
  atJob: JobListRecord,
  labelJob: JobListRecord,
  collectId: string,
  resultSummary?: string | null,
  evidenceLabels?: Readonly<Record<string, string>>,
  entityLabels?: Readonly<Record<string, string>>
): ActivityItem {
  return {
    id,
    kind: "job",
    label: searchJobHitLabel(
      {
        capabilityId: labelJob.capabilityId,
        resultSummary: resultSummary ?? atJob.resultSummary,
        input: labelJob.input,
        playbookId: labelJob.playbookId,
      },
      evidenceLabels,
      entityLabels
    ),
    at: jobActivityAt(atJob),
    href: { to: "/collect", search: { id: collectId } },
  };
}

export function buildCaseOverviewActivity(
  evidence: EvidenceRecord[],
  jobs: JobListRecord[],
  pendingProposals: ProposalRecord[],
  maxItems = MAX_ACTIVITY,
  /** Extra evidence rows (e.g. hidden) used only to resolve job input labels. */
  evidenceForJobLabels: EvidenceRecord[] = [],
  /** Entity display labels used only to resolve job input labels. */
  entityLabels?: Readonly<Record<string, string>>
): ActivityItem[] {
  const evidenceLabels = Object.fromEntries(
    evidenceTitleMapForJobRecords(
      [...evidence, ...evidenceForJobLabels],
      jobs.map((job) => job.input)
    )
  );
  const items: ActivityItem[] = [];
  for (const e of evidence) {
    items.push({
      id: `ev-${e.id}`,
      kind: "evidence",
      label: evidenceTitle(e),
      at: e.capturedAt,
      href: { to: "/collect", search: { id: e.id } },
    });
  }
  for (const entry of groupJobsForQueue(jobs)) {
    if (entry.kind === "playbook") {
      const seed = seedPlaybookStep(entry.steps);
      if (seed === null) continue;
      const latest = latestPlaybookStep(entry.steps);
      items.push(
        jobActivityItem(
          `job-run-${entry.runId}`,
          latest,
          seed,
          entry.runId,
          playbookResultSummary(entry.steps),
          evidenceLabels,
          entityLabels
        )
      );
      continue;
    }
    const j = entry.job;
    items.push(
      jobActivityItem(
        `job-${j.id}`,
        j,
        j,
        j.id,
        undefined,
        evidenceLabels,
        entityLabels
      )
    );
  }
  for (const p of pendingProposals) {
    items.push({
      id: `prop-${p.id}`,
      kind: "proposal",
      label: proposalTitle(p),
      at: p.createdAt,
      href: { to: "/triage", search: { proposalId: p.id } },
    });
  }
  items.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  return items.slice(0, maxItems);
}
