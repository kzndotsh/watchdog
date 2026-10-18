import { sql } from "drizzle-orm";

import { jobEvidence, proposalEvidence } from "../schema/evidence-links";
import { jobs } from "../schema/jobs";
import { proposals } from "../schema/proposals";

/*
 * The Evidence ids of a Job or Proposal live in link tables (`job_evidence`, `proposal_evidence`,
 * #302). Readers still want them on the row, in the order they were stored, so each read folds
 * them into its own statement as a correlated scalar subquery instead of paying a second round
 * trip: an index probe on the link table's primary key per returned row.
 */

/** A Job's Evidence ids in landing order (`[]` when none), for a select or returning list. */
export const jobEvidenceIds = sql<string[]>`coalesce(array(
  select ${jobEvidence.evidenceId}::text from ${jobEvidence}
  where ${jobEvidence.jobId} = ${jobs.id}
  order by ${jobEvidence.position}
), '{}'::text[])`;

/** A Proposal's Evidence ids in citation order (`[]` when none). */
export const proposalEvidenceIds = sql<string[]>`coalesce(array(
  select ${proposalEvidence.evidenceId}::text from ${proposalEvidence}
  where ${proposalEvidence.proposalId} = ${proposals.id}
  order by ${proposalEvidence.position}
), '{}'::text[])`;
