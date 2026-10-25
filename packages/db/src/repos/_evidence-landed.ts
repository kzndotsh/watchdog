import { and, eq, exists, sql } from "drizzle-orm";

import type { CaseId } from "@watchdog/schemas/shared";

import type { DbExec } from "../exec";
import { evidence } from "../schema/evidence";
import { jobEvidence } from "../schema/evidence-links";
import { jobs } from "../schema/jobs";

/**
 * A condition on `jobs`: the Job produced this Evidence, as opposed to only reading it.
 * `job_evidence` links both: the Evidence a Job landed, and the source Evidence a Process Cap
 * read (`linkedSource`). What a Job produced is what its output artifacts became, so the link
 * counts only when the Evidence's object (`uri`) is one of the Job's artifacts; a source dump
 * is not. (The jsonb containment test has no builder operator, so it lives here, not in a repo.)
 */
export function landedEvidence(
  exec: DbExec,
  caseId: CaseId,
  evidenceId: string
) {
  return exists(
    exec
      .select({ one: evidence.id })
      .from(jobEvidence)
      .innerJoin(
        evidence,
        and(
          eq(evidence.id, jobEvidence.evidenceId),
          eq(evidence.caseId, jobEvidence.caseId)
        )
      )
      .where(
        and(
          eq(jobEvidence.jobId, jobs.id),
          eq(jobEvidence.caseId, caseId),
          eq(jobEvidence.evidenceId, evidenceId),
          sql`${jobs.output} @> jsonb_build_array(jsonb_build_object('uri', ${evidence.uri}))`
        )
      )
  );
}
