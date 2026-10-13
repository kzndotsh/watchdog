import { describe, expect, it } from "vitest";

import {
  captureStatements,
  expectNoSeqScanOn,
  explainPlan,
  seedCase,
  seedEntity,
  seedEvidence,
  seedJob,
  withTestTx,
  type PlanNode,
} from "@watchdog/test-db";

import { evidenceRepo } from "../evidence.repo.ts";
import { jobsRepo } from "../jobs.repo.ts";

/** Plan text that makes a SubPlan run per outer row: a plain `SubPlan n`, not `hashed SubPlan n`. */
const PER_ROW_SUBPLAN = /(?<!hashed )SubPlan \d+/;
const CONDITION_KEYS = [
  "Filter",
  "Join Filter",
  "One-Time Filter",
  "Index Cond",
  "Recheck Cond",
] as const;

function perRowSubplans(node: PlanNode): string[] {
  const found: string[] = [];
  const visit = (n: Record<string, unknown>): void => {
    for (const key of CONDITION_KEYS) {
      const text = n[key];
      if (typeof text === "string" && PER_ROW_SUBPLAN.test(text)) {
        found.push(`${key}: ${text}`);
      }
    }
    const children = n.Plans;
    if (Array.isArray(children)) {
      for (const child of children) visit(child as Record<string, unknown>);
    }
  };
  visit(node as unknown as Record<string, unknown>);
  return found;
}

/** Conditions that bound each scan of `table` (index or recheck conditions), one string per scan. */
function scanConditions(node: PlanNode, table: string): string[] {
  const found: string[] = [];
  const visit = (n: Record<string, unknown>): void => {
    if (n["Relation Name"] === table) {
      found.push(JSON.stringify([n["Index Cond"], n["Recheck Cond"]]));
    }
    const children = n.Plans;
    if (Array.isArray(children)) {
      for (const child of children) visit(child as Record<string, unknown>);
    }
  };
  visit(node as unknown as Record<string, unknown>);
  return found;
}

/** A Case whose Jobs reach a term through one route each, plus decoys that must not match. */
async function seedSearchFixture(tx: Parameters<typeof seedCase>[0]) {
  const cased = await seedCase(tx);
  const other = await seedCase(tx);
  const ledger = await seedEvidence(tx, cased.id, {
    label: "Vendor Ledger",
    text: "wire transfer to the Cyprus account",
  });
  const hidden = await seedEvidence(tx, cased.id, {
    label: "quiet.txt",
    notes: "hidden memo about shells",
  });
  await evidenceRepo.softDelete(tx, cased.id, hidden.id);
  const foreignEvidence = await seedEvidence(tx, other.id, {
    label: "Vendor Ledger",
    text: "foreign only phrase zanzibar",
  });
  const acme = await seedEntity(tx, cased.id, {
    name: "Acme Holdings",
    slug: "acme-holdings",
  });
  const jobIds = {
    cap: (
      await seedJob(tx, cased.id, {
        capabilityId: "network.shodan.lookup",
        input: { ip: "198.51.100.42" },
      })
    ).id,
    viaEvidence: (
      await seedJob(tx, cased.id, {
        capabilityId: "evidence.harvest",
        input: { evidenceId: ledger.id },
      })
    ).id,
    viaPaddedSource: (
      await seedJob(tx, cased.id, {
        capabilityId: "evidence.harvest",
        input: { sourceEvidenceId: `  ${ledger.id}  ` },
      })
    ).id,
    viaUpperCaseId: (
      await seedJob(tx, cased.id, {
        capabilityId: "evidence.harvest",
        input: { evidenceId: ledger.id.toUpperCase() },
      })
    ).id,
    viaHidden: (
      await seedJob(tx, cased.id, {
        capabilityId: "evidence.harvest",
        input: { evidenceId: hidden.id },
      })
    ).id,
    viaForeignEvidence: (
      await seedJob(tx, cased.id, {
        capabilityId: "evidence.harvest",
        input: { evidenceId: foreignEvidence.id },
      })
    ).id,
    viaEntity: (
      await seedJob(tx, cased.id, {
        capabilityId: "network.dns.lookup",
        input: { entityId: acme.id, host: "example.com" },
      })
    ).id,
    plain: (await seedJob(tx, cased.id, { input: { host: "plain.test" } })).id,
  };
  return { cased, other, jobIds };
}

const idsOf = (rows: { job: { id: string } }[]) => rows.map((r) => r.job.id);

describe("jobsRepo.searchForCase result sets", () => {
  it.each([
    ["Cap id", "shodan", ["cap"]],
    ["Cap id, upper case", "SHODAN", ["cap"]],
    ["Job input", "198.51.100", ["cap"]],
    [
      "linked Evidence label",
      "vendor ledger",
      ["viaEvidence", "viaPaddedSource"],
    ],
    ["linked Evidence text", "Cyprus", ["viaEvidence", "viaPaddedSource"]],
    ["linked soft-deleted Evidence", "hidden memo", ["viaHidden"]],
    ["linked Entity", "acme holdings", ["viaEntity"]],
    ["Evidence of another Case", "zanzibar", []],
    ["nothing", "no-such-term-xyz", []],
    ["wildcard is stripped, not a wildcard", "sh_dan", []],
    ["wildcard is stripped, rest matches", "sh%odan", ["cap"]],
    ["only wildcards", "%_%", []],
  ] as const)("%s: %s", async (_label, term, expected) => {
    await withTestTx(async (tx) => {
      const { cased, jobIds } = await seedSearchFixture(tx);
      const rows = await jobsRepo.searchForCase(tx, cased.id, term, 50);
      expect([...idsOf(rows)].sort()).toEqual(
        expected.map((name) => jobIds[name]).sort()
      );
    });
  });

  it("does not return Jobs through another Case", async () => {
    await withTestTx(async (tx) => {
      const { other } = await seedSearchFixture(tx);
      expect(await jobsRepo.searchForCase(tx, other.id, "shodan", 50)).toEqual(
        []
      );
    });
  });
});

describe("jobsRepo.searchForCase plan", () => {
  it("matches Evidence and Entities once, not once per Job, and never scans them whole", async () => {
    await withTestTx(async (tx) => {
      const { cased } = await seedSearchFixture(tx);
      const { statements } = await captureStatements(async () =>
        jobsRepo.searchForCase(tx, cased.id, "vendor ledger", 50)
      );
      const reads = statements.filter((s) => /^\s*select/i.test(s.sql));
      expect(reads).toHaveLength(1);
      const plan = await explainPlan(reads[0]);
      expect(perRowSubplans(plan)).toEqual([]);
      for (const table of ["entities", "evidence"]) {
        const scans = scanConditions(plan, table);
        expect(scans, `no scan of ${table}`).not.toHaveLength(0);
        for (const cond of scans) expect(cond).toContain("case_id");
      }
      await expectNoSeqScanOn(statements, "entities");
      await expectNoSeqScanOn(statements, "evidence");
    });
  });
});
