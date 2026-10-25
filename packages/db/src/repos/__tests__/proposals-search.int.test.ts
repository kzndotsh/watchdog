import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { ENTITY_KIND_LABELS, ENTITY_KINDS } from "@watchdog/schemas/shared";
import { buildClaimCreateOp } from "@watchdog/schemas/testing";
import {
  captureStatements,
  explainPlan,
  seedCase,
  seedEntity,
  seedJob,
  seedPlaybookRun,
  seedProposal,
  withTestTx,
  type PlanNode,
} from "@watchdog/test-db";
import { testId } from "@watchdog/test-kit";

import type { DbExec } from "../../exec.ts";
import { entitySlugIlikePatterns } from "../_ilike.ts";
import { sqlCatalogIdIlike, sqlInDisplayLabelMatch } from "../_label-search.ts";
import { proposalsRepo } from "../proposals.repo.ts";

/**
 * Pending-Proposal search (performance spec #250, finding B7). The reference below is the
 * query as it was before the rewrite: it serializes each Proposal's patch to text once per
 * (Proposal, matching Entity) pair. The rewrite must return the same Proposals in the same
 * order for every term.
 */
async function legacySearchIds(
  exec: DbExec,
  caseId: string,
  term: string,
  limit: number
): Promise<string[]> {
  const patterns = entitySlugIlikePatterns(term);
  const pattern = patterns[0];
  if (pattern === undefined) return [];
  const kindLabel = sqlInDisplayLabelMatch(
    "e.kind",
    ENTITY_KINDS,
    ENTITY_KIND_LABELS,
    term
  );
  const entityFieldMatches = [
    sql`e.name ilike ${pattern}`,
    ...patterns.map((p) => sql`e.slug ilike ${p}`),
    sql`e.summary ilike ${pattern}`,
    sql`e.notes ilike ${pattern}`,
    sql`e.kind::text ilike ${pattern}`,
    ...(kindLabel ? [kindLabel] : []),
  ];
  const rows = await exec.execute<{ id: string }>(sql`
    select p.id
    from proposals p
    left join jobs on p.job_id = jobs.id
    left join playbook_runs on jobs.playbook_run_id = playbook_runs.id
    where p.case_id = ${caseId} and p.status = 'pending'
      and (
        p.summary ilike ${pattern}
        or ${sqlCatalogIdIlike("jobs.capability_id", pattern)}
        or ${sqlCatalogIdIlike("playbook_runs.playbook_id", pattern)}
        or (p.patch)::text ilike ${pattern}
        or exists (
          select 1 from entities e
          where e.case_id = p.case_id
            and (${sql.join(entityFieldMatches, sql` or `)})
            and (p.patch)::text like '%' || e.id::text || '%'
        )
      )
    order by p.created_at desc, p.id desc
    limit ${limit}`);
  return rows.map((row) => row.id);
}

/** Relation names of the plan's scans, each flagged when it runs inside a correlated SubPlan. */
function collect(
  node: PlanNode,
  inSubPlan: boolean,
  out: { relation: string | undefined; inSubPlan: boolean }[]
): void {
  const relationship =
    "Parent Relationship" in node ? node["Parent Relationship"] : undefined;
  // An uncorrelated InitPlan runs once however many times its parent SubPlan does.
  const own =
    relationship === "InitPlan"
      ? false
      : inSubPlan || relationship === "SubPlan";
  out.push({ relation: node["Relation Name"], inSubPlan: own });
  for (const child of node.Plans ?? []) collect(child, own, out);
}

/**
 * Entities match the term only through the Proposal's patch, so each Proposal has to be
 * tested against every matching Entity: the shape that made the old query quadratic.
 */
async function seedSearchFixture(exec: DbExec) {
  const cased = await seedCase(exec);
  const entities = await Promise.all(
    [
      {
        name: "Acme Holdings",
        slug: "acme-holdings",
        summary: "Shell company in Cyprus",
      },
      { name: "Acme Logistics", slug: "acme-logistics" },
      {
        name: "Borealis Trading",
        slug: "borealis-trading",
        summary: "Acme supplier",
      },
      { name: "Casimir Rowe", slug: "casimir-rowe" },
    ].map(async (entity, index) =>
      seedEntity(exec, cased.id, { id: testId(100 + index), ...entity })
    )
  );
  const [holdings, logistics, borealis, casimir] = entities;
  if (!holdings || !logistics || !borealis || !casimir) throw new Error("seed");
  const job = await seedJob(exec, cased.id, {
    capabilityId: "network.shodan.lookup",
  });
  const run = await seedPlaybookRun(exec, cased.id, {
    playbookId: "person-footprint",
  });
  const withRun = await seedJob(exec, cased.id, {
    capabilityId: "identity.holehe.check",
    playbookRunId: run.id,
  });
  // One Proposal per route into the match: Entity in the patch, summary, Job, playbook run,
  // nothing, and a decided one that must never be returned.
  const byEntity = await seedProposal(
    exec,
    cased.id,
    [buildClaimCreateOp(holdings.id, "observed", { id: testId(200) })],
    { summary: null, jobId: null }
  );
  const bySecondEntity = await seedProposal(
    exec,
    cased.id,
    [
      buildClaimCreateOp(casimir.id, "observed", { id: testId(201) }),
      buildClaimCreateOp(logistics.id, "observed", { id: testId(202) }),
    ],
    { summary: "Casimir link", jobId: null }
  );
  const bySummary = await seedProposal(
    exec,
    cased.id,
    [buildClaimCreateOp(borealis.id, "observed", { id: testId(203) })],
    { summary: "Link domains", jobId: null }
  );
  const byJob = await seedProposal(
    exec,
    cased.id,
    [buildClaimCreateOp(casimir.id, "observed", { id: testId(204) })],
    { summary: "zzz", jobId: job.id }
  );
  const byRun = await seedProposal(
    exec,
    cased.id,
    [buildClaimCreateOp(casimir.id, "observed", { id: testId(205) })],
    { summary: "zzz", jobId: withRun.id }
  );
  const none = await seedProposal(
    exec,
    cased.id,
    [buildClaimCreateOp(casimir.id, "observed", { id: testId(206) })],
    { summary: "unrelated", jobId: null }
  );
  const decided = await seedProposal(
    exec,
    cased.id,
    [buildClaimCreateOp(holdings.id, "observed", { id: testId(207) })],
    { summary: "acme", jobId: null, status: "accepted" }
  );
  return {
    caseId: cased.id,
    byEntity: byEntity.id,
    bySecondEntity: bySecondEntity.id,
    bySummary: bySummary.id,
    byJob: byJob.id,
    byRun: byRun.id,
    none: none.id,
    decided: decided.id,
  };
}

/*
 * "acme": two Entities by name, one by summary, so only some Proposals patch them. "shell
 * company": an Entity summary. "casimir": an Entity name and a Proposal summary. "shodan": a
 * Job capability. "person-footprint": a playbook id. "link domains": a Proposal summary.
 * "claim": text in every patch. "organization": an Entity kind.
 */
const TERMS = [
  "acme",
  "acme holdings",
  "shell company",
  "supplier",
  "casimir",
  "shodan",
  "person-footprint",
  "holehe",
  "link domains",
  "claim",
  "zzz",
  "organization",
  "no such term",
  "%",
  "_",
] as const;

describe("proposalsRepo.searchPendingForCase: result sets", () => {
  it.each(TERMS)(
    "returns what the per-pair query returned for %j",
    async (term) => {
      await withTestTx(async (tx) => {
        const fixture = await seedSearchFixture(tx);
        for (const limit of [1, 3, 50]) {
          // oxlint-disable-next-line eslint/no-await-in-loop -- one comparison per limit
          const expected = await legacySearchIds(
            tx,
            fixture.caseId,
            term,
            limit
          );
          // oxlint-disable-next-line eslint/no-await-in-loop -- one comparison per limit
          const hits = await proposalsRepo.searchPendingForCase(
            tx,
            fixture.caseId,
            term,
            limit
          );
          expect(hits.map((hit) => hit.proposal.id)).toEqual(expected);
        }
      });
    }
  );

  it("finds each route into a match, and never a decided Proposal", async () => {
    await withTestTx(async (tx) => {
      const f = await seedSearchFixture(tx);
      const ids = async (term: string) =>
        (await proposalsRepo.searchPendingForCase(tx, f.caseId, term, 50))
          .map((hit) => hit.proposal.id)
          .sort();
      // "acme" names Acme Holdings and Acme Logistics, and the summary of Borealis: the
      // Proposals whose patch touches one of them. Not the decided Proposal.
      expect(await ids("acme")).toEqual(
        [f.byEntity, f.bySecondEntity, f.bySummary].sort()
      );
      expect(await ids("supplier")).toEqual([f.bySummary]);
      expect(await ids("shodan")).toEqual([f.byJob]);
      expect(await ids("person-footprint")).toEqual([f.byRun]);
      expect(await ids("unrelated")).toEqual([f.none]);
      expect(await ids("no such term")).toEqual([]);
    });
  });
});

describe("proposalsRepo.searchPendingForCase: ties", () => {
  it("orders Proposals created in one transaction by id, newest first, whatever the plan", async () => {
    await withTestTx(async (tx) => {
      const cased = await seedCase(tx);
      const ids: string[] = [];
      for (let i = 0; i < 4; i += 1) {
        // oxlint-disable-next-line eslint/no-await-in-loop -- one Proposal at a time
        const proposal = await seedProposal(tx, cased.id, [], {
          summary: "tied",
          jobId: null,
        });
        ids.push(proposal.id);
      }
      // One transaction, so every `created_at` is the same instant: only `id` can order them.
      const hits = await proposalsRepo.searchPendingForCase(
        tx,
        cased.id,
        "tied",
        50
      );
      // Lower-case uuids: text order is the byte order Postgres sorts them in.
      const newestFirst = [...ids].sort((a, b) => (a < b ? 1 : -1));
      expect(hits.map((hit) => hit.proposal.id)).toEqual(newestFirst);
      const [first] = await proposalsRepo.searchPendingForCase(
        tx,
        cased.id,
        "tied",
        1
      );
      expect(first?.proposal.id).toBe(newestFirst[0]);
    });
  });
});

describe("proposalsRepo.searchPendingForCase: plan", () => {
  it("matches Entities once for the whole search, not once per Proposal", async () => {
    await withTestTx(async (tx) => {
      const fixture = await seedSearchFixture(tx);
      const { statements } = await captureStatements(() =>
        proposalsRepo.searchPendingForCase(tx, fixture.caseId, "acme", 50)
      );
      const read = statements.filter((s) => /\bfrom "proposals"/i.test(s.sql));
      expect(read).toHaveLength(1);
      const [statement] = read;
      if (statement === undefined) throw new Error("no statement");
      const plan = await explainPlan(statement, { seqScan: "planner" });
      const nodes: { relation: string | undefined; inSubPlan: boolean }[] = [];
      collect(plan, false, nodes);
      const entityReads = nodes.filter((node) => node.relation === "entities");
      // A correlated SubPlan re-runs per Proposal row (and, with it, the per-pair patch cast).
      expect(entityReads.map((node) => node.inSubPlan)).toEqual([false]);
    });
  });
});
