import { sql } from "drizzle-orm";

import { jobEvidence, proposalEvidence } from "../schema/evidence-links";
import { jobs } from "../schema/jobs";
import { proposals } from "../schema/proposals";

/*
 * The Evidence ids of a Job or Proposal live in link tables (`job_evidence`, `proposal_evidence`,
 * #302). Readers still want them on the row, in the order they were stored, so each read folds
 * them into its own statement as a correlated scalar subquery instead of paying a second round
 * trip: an index probe on the link table's primary key per returned row.
 *
 * Raw `sql` by necessity: the query builder cannot express a correlated `array(select ...)`. The
 * helper lives here, outside `*.repo.ts`, so it is outside the scope of `watchdog/db-repo-no-raw-sql`
 * (which keeps repos on the builder API; its baseline may only shrink): one shared, tested
 * fragment rather than raw SQL spread through the repos.
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

/** How many Evidence items a Proposal cites at the Proposal level (a queue row's "n ev"). */
export const proposalEvidenceCount = sql<number>`(
  select count(*)::int from ${proposalEvidence}
  where ${proposalEvidence.proposalId} = ${proposals.id}
)`;

/**
 * A Proposal's patch ops counted by resource (`{ "claim": 2, "entity": 1 }`), computed in the
 * database so a queue row never reads the patch itself (#580).
 */
export const proposalOpCounts = sql<Record<string, number>>`coalesce((
  select jsonb_object_agg(op.resource, op.n)
  from (
    select elem->>'resource' as resource, count(*)::int as n
    from jsonb_array_elements(${proposals.patch}) as elem
    group by 1
  ) as op
), '{}'::jsonb)`;
