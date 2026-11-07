import { describe, expect, it } from "vitest";

import { graphHistoryList } from "../graph-history.ts";
import { testCaseId } from "../testing/index.ts";

const PAGE_DEFAULT = 25;
const PAGE_MAX = 100;
const input = graphHistoryList.input;

const base = {
  caseId: testCaseId(1),
  kind: "claim",
  rowId: "00000000-0000-4000-8000-000000000030",
} as const;

describe("graphHistoryList.input", () => {
  it("defaults the page size", () => {
    expect(input.parse(base).limit).toBe(PAGE_DEFAULT);
  });

  it("accepts the largest page and rejects one more, instead of clamping", () => {
    expect(
      input.safeParse({
        ...base,
        limit: PAGE_MAX,
      }).success
    ).toBe(true);
    expect(
      input.safeParse({
        ...base,
        limit: PAGE_MAX + 1,
      }).success
    ).toBe(false);
    expect(input.safeParse({ ...base, limit: 0 }).success).toBe(false);
  });

  it("rejects a kind that is not a Graph row", () => {
    expect(input.safeParse({ ...base, kind: "evidence" }).success).toBe(false);
  });

  it("trims the row id", () => {
    expect(input.parse({ ...base, rowId: `  ${base.rowId} ` }).rowId).toBe(
      base.rowId
    );
  });
});
