import { writeFileSync } from "node:fs";

import { Effect } from "effect";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { AnyListRepo, ListRow } from "@watchdog/db";
import { LIST_REPOS, listRepoOf } from "@watchdog/db/testing";
import { opsOf } from "@watchdog/schemas/shared";
import type { ListInput, ListPage } from "@watchdog/schemas/shared";
import {
  openPlanDb,
  planNodes,
  rowsReadOn,
  type CapturedStatement,
  type PlanDb,
  type PlanNode,
} from "@watchdog/test-db";

import { Db } from "../db-service";
import { listPageEffect } from "../list-page";
import { runDomainWith } from "../run-domain";

/*
 * The list standard's database gate (ADR-0007), PLAN half: EXPLAIN on the audit-scale perf seed
 * (`PERF_SEED_DIV=1 scripts/perf-seed.sh up wd_perf_<name>`: 50 Cases, 20,000 Evidence, 37,500
 * Identifiers, VACUUM ANALYZEd), against `perf-case-1`, never on the shared test database, whose
 * handful of rows makes a sequential scan the planner's right answer. Set
 * `WD_PERF_DATABASE_URL` to the seeded database (CI does); without it this file is skipped
 * locally and fails in CI. `WD_PERF_REPORT=<file>` writes the measured numbers as JSON. The plan
 * pool sets the repo's documented planner costs (`PLAN_SESSION_SETTINGS`), so CI's untuned
 * server answers as the dev one does.
 *
 * - Without `q`, every declared sort and direction, first and second page, is index-ordered:
 *   no Sort node, and the index scanned leads with the scope column then the sort key.
 * - Without `q`, each filter alone under the default sort has no Sort node; a `selective` filter
 *   scans an index led by its column (or by the scope column, then its column).
 * - With `q` (BitmapOr over the trigram indexes and a top-N Sort are allowed): the first page and
 *   the count, for each worst 3-character needle, each read at most the Case's rows of the table
 *   (`EXPLAIN (ANALYZE, BUFFERS)` on plain SELECTs of the private seed). Times are reported, never
 *   asserted; the 50 ms p95 budget is a manual measurement in `docs/how-to/perf-baseline.md`.
 *   A failure reopens ADR-0007 (Case-scoped `btree_gin` trigram indexes).
 */

const PERF_URL = process.env.WD_PERF_DATABASE_URL;
const PERF_CASE = "perf-case-1";
/** The organization an organization-wide list (Deleted Cases) is read in. */
const PERF_ORG = "perf-org-a";
const RUNS = 20;
/** `com`, `www`, `htt` (every perf Evidence row has a `https://www.example.com` source URL), and the needles that match every row of each seeded list. */
const NEEDLES = ["com", "www", "htt", "exa", "per", "syn"] as const;
const SORT_NODES = new Set(["Sort", "Incremental Sort"]);
const INDEX_NODES = new Set(["Index Scan", "Index Only Scan"]);

if (PERF_URL === undefined && process.env.CI === "true") {
  throw new Error("WD_PERF_DATABASE_URL is required in CI (the plan gate)");
}

const report: Record<string, unknown> = {};

function p95(samples: readonly number[]): number {
  const sorted = [...samples].sort((a, b) => a - b);
  return sorted[Math.ceil(sorted.length * 0.95) - 1] ?? Number.NaN;
}

const round = (ms: number) => Math.round(ms * 100) / 100;

describe.skipIf(PERF_URL === undefined).each(LIST_REPOS)(
  "list $def.name: plans (perf seed, PERF_SEED_DIV=1)",
  (anyRepo: AnyListRepo) => {
    const repo = listRepoOf(anyRepo);
    const { def, indexNeeds } = repo;
    const ops = opsOf(def);
    let planDb: PlanDb;
    let scope: Readonly<Record<string, string>> = {};
    let wireScope: Readonly<Record<string, string>> = {};
    let scopeValue = "";
    let indexKeys: Readonly<Record<string, readonly string[]>> = {};

    const pageOf = async (
      wire: Readonly<Record<string, unknown>>
    ): Promise<{
      page: ListPage<ListRow>;
      statements: CapturedStatement[];
    }> => {
      const input: ListInput<typeof def> = ops.input.parse({
        ...wireScope,
        ...wire,
      });
      const { result, statements } = await planDb.capture(() =>
        runDomainWith(Db.layerOf(planDb.db))(
          listPageEffect({
            def,
            repo,
            scope,
            input,
            toItems: (rows) => Effect.succeed(rows),
          })
        )
      );
      return { page: result, statements };
    };

    /** The plan of the page SELECT (the first statement), with the index each scan used. */
    const pagePlan = async (wire: Readonly<Record<string, unknown>>) => {
      const { page, statements } = await pageOf(wire);
      const [select] = statements;
      if (select === undefined) throw new Error("no page statement");
      const nodes = planNodes(await planDb.plan(select));
      const scans = nodes.filter(
        (node: PlanNode) =>
          INDEX_NODES.has(node["Node Type"]) &&
          node["Relation Name"] === indexNeeds.table
      );
      return {
        page,
        sorts: nodes.filter((node) => SORT_NODES.has(node["Node Type"])),
        indexes: scans.map((node) => indexKeys[node["Index Name"] ?? ""] ?? []),
        names: scans.map((node) => node["Index Name"]),
      };
    };

    beforeAll(async () => {
      if (PERF_URL === undefined) return;
      planDb = openPlanDb(PERF_URL);
      if (def.context === undefined) {
        const caseId = (await planDb.caseIdBySlug(PERF_CASE)) ?? "";
        expect(caseId, `${PERF_CASE} in the perf seed`).not.toBe("");
        scope = { caseId };
        wireScope = { caseId };
        scopeValue = caseId;
      } else {
        scope = { organizationId: PERF_ORG };
        scopeValue = PERF_ORG;
      }
      indexKeys = await planDb.indexKeys(indexNeeds.table);
    });

    afterAll(async () => {
      if (PERF_URL === undefined) return;
      await planDb.end();
      if (process.env.WD_PERF_REPORT !== undefined) {
        writeFileSync(
          process.env.WD_PERF_REPORT,
          JSON.stringify(report, null, 2)
        );
      }
    });

    it("without q: every declared sort and direction is index-ordered, first and second page", async () => {
      const plans: Record<string, unknown> = {};
      for (const [key, sort] of Object.entries(def.sorts)) {
        for (const dir of sort.dirs) {
          const value = `${key}.${dir}`;
          // oxlint-disable-next-line eslint/no-await-in-loop -- one plan per sort value
          const first = await pagePlan({ sort: value });
          const cursor = first.page.nextCursor;
          expect(cursor, `${value}: a second page`).not.toBeNull();
          // oxlint-disable-next-line eslint/no-await-in-loop -- needs the first page's cursor
          const second = await pagePlan({ sort: value, cursor });
          for (const plan of [first, second]) {
            expect(plan.sorts, `${value}: no Sort node`).toEqual([]);
            expect(
              plan.indexes.some(
                (keys) =>
                  keys[0] === indexNeeds.scopeColumn &&
                  (keys[1] ?? "").includes(indexNeeds.sortColumns[key] ?? "?")
              ),
              `${value}: led by (${indexNeeds.scopeColumn}, ${indexNeeds.sortColumns[key]}), used ${plan.names.join(", ")}`
            ).toBe(true);
          }
          plans[value] = { first: first.names, second: second.names };
        }
      }
      report[`${def.name}.sorts`] = plans;
    });

    it("without q: each filter alone under the default sort has no Sort node; a selective one uses its leading index", async () => {
      const { page } = await pageOf({});
      const sample = (key: string): unknown => {
        const filter = def.filters[key];
        if (filter === undefined) return undefined;
        const seen = page.items
          .map(
            (row) => Object.entries(row).find(([field]) => field === key)?.[1]
          )
          .find((value) => value !== null && value !== undefined);
        switch (filter.kind) {
          case "flag": {
            return true;
          }
          case "choices": {
            return seen === undefined ? undefined : [seen];
          }
          case "ref": {
            return seen;
          }
          case "tags": {
            return undefined;
          }
          default: {
            return filter satisfies never;
          }
        }
      };
      const plans: Record<string, unknown> = {};
      for (const key of Object.keys(def.filters)) {
        const value = sample(key);
        expect(value, `${key}: a sample from the first page`).toBeDefined();
        // oxlint-disable-next-line eslint/no-await-in-loop -- one plan per filter
        const plan = await pagePlan({ [key]: value });
        expect(plan.sorts, `${key}: no Sort node`).toEqual([]);
        const column = indexNeeds.selectiveColumns[key];
        if (column !== undefined) {
          expect(
            plan.indexes.some(
              (keys) =>
                keys[0] === column ||
                (keys[0] === indexNeeds.scopeColumn && keys[1] === column)
            ),
            `${key}: an index led by ${column}, used ${plan.names.join(", ")}`
          ).toBe(true);
        }
        plans[key] = plan.names;
      }
      report[`${def.name}.filters`] = plans;
    });

    it("with q: the first page and the count each read at most the Case's rows of the table, for the worst 3-character needles", async () => {
      // The ceiling: a search kept inside the Case reads each of the Case's rows of the table
      // at most once per statement. A plan that leaves the Case first (a global trigram bitmap,
      // ADR-0007's open risk) reads every organisation's matching rows instead: for `com` at
      // audit scale that is all 20,000 Evidence rows, 50 times this bound. Rows read are exact
      // for the frozen seed and its plan, so CI load cannot flake them; the times are measured
      // for the record only (`perf-baseline.md` holds the 50 ms budget's manual check).
      const scopeRows = await planDb.rowsInScope(
        indexNeeds.table,
        indexNeeds.scopeColumn,
        scopeValue
      );
      expect(
        scopeRows,
        `${indexNeeds.table} rows in ${PERF_CASE}`
      ).toBeGreaterThan(0);
      const timings: Record<string, unknown> = { scopeRows };
      const check = async (
        label: string,
        wire: Readonly<Record<string, unknown>>
      ) => {
        const { page, statements } = await pageOf(wire);
        const rowsRead: number[] = [];
        const samples: number[] = [];
        for (let run = 0; run <= RUNS; run += 1) {
          let total = 0;
          for (const statement of statements) {
            // oxlint-disable-next-line eslint/no-await-in-loop -- sequential runs are the measurement
            const analyzed = await planDb.analyze(statement);
            total += analyzed.executionMs;
            if (run === 0)
              rowsRead.push(
                // The list's own rows: a display join of the same table under another name
                // (the Entity list's Connection peer) reads one row per page row by key.
                rowsReadOn(analyzed.plan, indexNeeds.table, {
                  alias: indexNeeds.table,
                })
              );
          }
          // The first run warms the cache: its times are not kept.
          if (run > 0) samples.push(total);
        }
        for (const [index, rows] of rowsRead.entries()) {
          expect(
            rows,
            `${label}: statement ${index + 1} rows read`
          ).toBeLessThanOrEqual(scopeRows);
        }
        timings[label] = {
          statements: statements.length,
          total: page.total,
          rowsRead,
          p95Ms: round(p95(samples)),
          maxMs: round(Math.max(...samples)),
        };
      };
      for (const q of NEEDLES) {
        // oxlint-disable-next-line eslint/no-await-in-loop -- one needle at a time
        await check(`q=${q}`, { q });
      }
      await check("no q", {});
      report[`${def.name}.q`] = timings;
      console.info(`list ${def.name} (${PERF_CASE}):`, JSON.stringify(timings));
    });
  }
);
