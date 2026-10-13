import { describe, expect, it } from "vitest";

import {
  expectNoSeqScan,
  isExplainable,
  isTransactionControl,
  planFromExplainRows,
  seqScanRelations,
  touchesTable,
  type PlanNode,
} from "../query-shape";

const seq = (relation: string): PlanNode => ({
  "Node Type": "Seq Scan",
  "Relation Name": relation,
});
const idx = (relation: string): PlanNode => ({
  "Node Type": "Index Scan",
  "Relation Name": relation,
});

describe("seqScanRelations", () => {
  it("finds a Seq Scan nested under joins and subplans", () => {
    const plan: PlanNode = {
      "Node Type": "Nested Loop",
      Plans: [idx("cases"), { "Node Type": "Sort", Plans: [seq("evidence")] }],
    };
    expect(seqScanRelations(plan)).toEqual(["evidence"]);
  });

  it("ignores index scans and nodes without a relation", () => {
    const plan: PlanNode = {
      "Node Type": "Aggregate",
      Plans: [idx("jobs"), { "Node Type": "Result" }],
    };
    expect(seqScanRelations(plan)).toEqual([]);
  });
});

describe("expectNoSeqScan", () => {
  it("passes when the table is read through an index", () => {
    expect(() => expectNoSeqScan(idx("evidence"), "evidence")).not.toThrow();
  });

  it("fails naming the table when it is sequentially scanned", () => {
    const plan: PlanNode = { "Node Type": "Limit", Plans: [seq("evidence")] };
    expect(() => expectNoSeqScan(plan, "evidence")).toThrow(/evidence/);
  });

  it("allows a Seq Scan on a different table", () => {
    expect(() => expectNoSeqScan(seq("cases"), "evidence")).not.toThrow();
  });
});

describe("planFromExplainRows", () => {
  it("reads the root plan from EXPLAIN (FORMAT JSON) rows", () => {
    const root = seq("evidence");
    expect(planFromExplainRows([{ "QUERY PLAN": [{ Plan: root }] }])).toBe(
      root
    );
  });

  it.each([[[]], [[{}]], [[{ "QUERY PLAN": [] }]], [[{ "QUERY PLAN": "x" }]]])(
    "rejects rows without a plan: %j",
    (rows) => {
      expect(() => planFromExplainRows(rows)).toThrow(/plan/);
    }
  );
});

describe("statement classifiers", () => {
  it.each([
    "begin",
    "BEGIN",
    " commit",
    "rollback",
    "savepoint s1",
    "release savepoint s1",
  ])("treats %j as transaction control", (sql) => {
    expect(isTransactionControl(sql)).toBe(true);
  });

  it("does not treat data statements as transaction control", () => {
    expect(isTransactionControl('select "id" from "cases"')).toBe(false);
    expect(isTransactionControl("begin_work_table_insert")).toBe(false);
  });

  it("matches a quoted or bare table name, not a prefix of another", () => {
    expect(
      touchesTable(
        'select "id" from "evidence" where "case_id" = $1',
        "evidence"
      )
    ).toBe(true);
    expect(touchesTable("select id from evidence", "evidence")).toBe(true);
    expect(touchesTable('select 1 from "evidence_links"', "evidence")).toBe(
      false
    );
  });

  it("explains only SELECT and WITH statements", () => {
    expect(isExplainable("select 1")).toBe(true);
    expect(isExplainable("  WITH x AS (select 1) select * from x")).toBe(true);
    expect(isExplainable('insert into "cases" values ($1)')).toBe(false);
    expect(isExplainable('update "cases" set "name" = $1')).toBe(false);
    expect(isExplainable("explain analyze select 1")).toBe(false);
  });
});
