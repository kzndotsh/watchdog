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
  it("has one vocabulary rule per CHECK constraint the schema declares", () => {
    expect(vocabularyRules().map((rule) => rule.name)).toEqual(
      vocabChecks().map((check) => `${check.table}.${check.column}`)
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
