import { describe, expect, it } from "vitest";

import {
  expectNoSeqScan,
  isExplainable,
  isTransactionControl,
  planFromExplainRows,
  rowsReadOn,
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

  it("treats a table name as a literal identifier, not a pattern", () => {
    expect(() => touchesTable("select 1 from evidence", "evid.nce")).toThrow(
      /identifier/
    );
    expect(() => touchesTable("select 1", "a.*+")).toThrow(/identifier/);
    expect(() => touchesTable("select 1", "")).toThrow(/identifier/);
    expect(() => touchesTable("select 1", 'a"b')).toThrow(/identifier/);
  });

  it.each([
    "with moved as (delete from cases returning id) select * from moved",
    "with x as (insert into cases (id) values ($1) returning id) select * from x",
    "WITH x AS (UPDATE cases SET name = $1 RETURNING id) SELECT * FROM x",
    "with x as (merge into cases using t on true when matched then delete) select 1",
    "select 1; delete from cases",
    "select * into scratch from cases",
  ])("rejects a data-modifying or multi-statement query: %s", (sql) => {
    expect(isExplainable(sql)).toBe(false);
  });

  it("does not mistake quoted names or updated_at for write keywords", () => {
    expect(
      isExplainable(
        'select "updated_at", "delete" from "cases" where "name" = $1'
      )
    ).toBe(true);
    expect(isExplainable("select 'insert; update' as x")).toBe(true);
    expect(
      isExplainable("with x as (select 1 as n) select n from x where n = $1")
    ).toBe(true);
  });

  it("explains only SELECT and WITH statements", () => {
    expect(isExplainable("select 1")).toBe(true);
    expect(isExplainable("  WITH x AS (select 1) select * from x")).toBe(true);
    expect(isExplainable('insert into "cases" values ($1)')).toBe(false);
    expect(isExplainable('update "cases" set "name" = $1')).toBe(false);
    expect(isExplainable("explain analyze select 1")).toBe(false);
  });
});

describe("rowsReadOn", () => {
  it("adds the rows each scan of the table returned (times its loops) and removed", () => {
    const plan: PlanNode = {
      "Node Type": "Limit",
      Plans: [
        {
          "Node Type": "Nested Loop",
          Plans: [
            {
              "Node Type": "Index Scan",
              "Relation Name": "evidence",
              "Actual Rows": 51,
              "Actual Loops": 1,
              "Rows Removed by Filter": 120,
            },
            {
              "Node Type": "Index Scan",
              "Relation Name": "entities",
              "Actual Rows": 1,
              "Actual Loops": 51,
            },
            {
              "Node Type": "Index Scan",
              "Relation Name": "entities",
              Alias: "connection_peer",
              "Actual Rows": 1,
              "Actual Loops": 7,
            },
          ],
        },
        {
          "Node Type": "Bitmap Heap Scan",
          "Relation Name": "evidence",
          "Actual Rows": 2,
          "Actual Loops": 3,
          "Rows Removed by Index Recheck": 4,
        },
      ],
    };
    expect(rowsReadOn(plan, "evidence")).toBe(51 + 120 + 6 + 4);
    expect(rowsReadOn(plan, "entities")).toBe(51 + 7);
    expect(rowsReadOn(plan, "entities", { alias: "entities" })).toBe(51);
    expect(rowsReadOn(plan, "jobs")).toBe(0);
  });
});
