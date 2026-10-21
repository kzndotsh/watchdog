import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  invariantRules,
  renderViolationReportSql,
  STRUCTURAL_RULES,
  vocabularyRules,
} from "../invariants";
import { vocabChecks } from "../schema/vocab-checks";

const REPORT_MIGRATION = readFileSync(
  path.resolve(
    import.meta.dirname,
    "../../drizzle/0025_report_invariant_violations.sql"
  ),
  "utf-8"
);

describe("invariant violation rules", () => {
  it("has one vocabulary rule per CHECK constraint the schema declares, but for a table or column created with its checks", () => {
    // graph_history (#303) and case_deletion_records (#304) arrived after these migrations, with
    // their checks from the first row: an install that has not migrated has nothing in them to
    // repair, and may not have the tables. jobs.error_code (#432) is the same for a column.
    expect(vocabularyRules().map((rule) => rule.name)).toEqual(
      vocabChecks()
        .filter(
          (check) =>
            check.table !== "graph_history" &&
            check.table !== "case_deletion_records" &&
            `${check.table}.${check.column}` !== "jobs.error_code"
        )
        .map((check) => `${check.table}.${check.column}`)
    );
  });

  it("gives every rule a name, one SELECT and a hint", () => {
    for (const rule of invariantRules()) {
      expect(rule.name, "name").not.toBe("");
      expect(rule.query, rule.name).toMatch(/^SELECT /);
      expect(rule.hint, rule.name).not.toBe("");
    }
    const names = invariantRules().map((rule) => rule.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("is what migration 0025 runs: every structural rule appears in the file verbatim", () => {
    for (const rule of STRUCTURAL_RULES) {
      expect(REPORT_MIGRATION, rule.name).toContain(rule.query);
      expect(REPORT_MIGRATION, rule.name).toContain(
        rule.hint.replaceAll("'", "''")
      );
    }
  });

  it("renders a report that aborts only when a rule lists rows", () => {
    const sql = renderViolationReportSql(invariantRules());
    expect(sql).toContain("RAISE EXCEPTION");
    expect(sql).toContain("IF total > 0 THEN");
    // The only statements it runs are the rules' own SELECTs: it reports, it never repairs.
    expect(
      invariantRules().every((rule) => rule.query.startsWith("SELECT "))
    ).toBe(true);
  });
});
