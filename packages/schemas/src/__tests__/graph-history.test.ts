import { describe, expect, it } from "vitest";

import {
  GRAPH_HISTORY_PAGE_DEFAULT,
  GRAPH_HISTORY_PAGE_MAX,
  listGraphHistoryInputSchema,
  parseGraphHistoryCursor,
} from "../graph-history.ts";
import { testCaseId } from "../testing/index.ts";

const base = {
  caseId: testCaseId(1),
  kind: "claim",
  rowId: "00000000-0000-4000-8000-000000000030",
} as const;

describe("listGraphHistoryInputSchema", () => {
  it("defaults the page size", () => {
    expect(listGraphHistoryInputSchema.parse(base).limit).toBe(
      GRAPH_HISTORY_PAGE_DEFAULT
    );
  });

  it("accepts the largest page and rejects one more, instead of clamping", () => {
    expect(
      listGraphHistoryInputSchema.safeParse({
        ...base,
        limit: GRAPH_HISTORY_PAGE_MAX,
      }).success
    ).toBe(true);
    expect(
      listGraphHistoryInputSchema.safeParse({
        ...base,
        limit: GRAPH_HISTORY_PAGE_MAX + 1,
      }).success
    ).toBe(false);
    expect(
      listGraphHistoryInputSchema.safeParse({ ...base, limit: 0 }).success
    ).toBe(false);
  });

  it("rejects a kind that is not a Graph row", () => {
    expect(
      listGraphHistoryInputSchema.safeParse({ ...base, kind: "evidence" })
        .success
    ).toBe(false);
  });

  it("trims the row id", () => {
    expect(
      listGraphHistoryInputSchema.parse({ ...base, rowId: `  ${base.rowId} ` })
        .rowId
    ).toBe(base.rowId);
  });
});

describe("parseGraphHistoryCursor", () => {
  it("parses a positive integer id", () => {
    expect(parseGraphHistoryCursor("42")).toBe(42);
  });

  it.each(["", "0", "-1", "1.5", "1e3", " 7", "12abc", "9".repeat(17)])(
    "rejects %j",
    (raw) => {
      expect(parseGraphHistoryCursor(raw)).toBeNull();
    }
  );
});
