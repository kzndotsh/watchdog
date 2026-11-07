import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-start", async () =>
  (await import("@/testing/server-fn")).serverFnModuleDouble()
);
vi.mock("@/lib/orpc.server", async () =>
  (await import("@/testing/server-fn")).orpcServerModuleDouble()
);

import {
  createEdgeFn,
  deleteEdgeFn,
  getGraphSnapshotFn,
  listEdgesPageFn,
  updateEdgeFn,
} from "@/domains/entities/edges/edges.functions";
import { callServerFn, orpc } from "@/testing/server-fn";
import { testId } from "@watchdog/test-kit";

const CASE_ID = testId(10);

beforeEach(() => orpc.reset());

describe("deleteEdgeFn", () => {
  it("sends the Case and Connection ids and answers nothing", async () => {
    orpc.reply("edges.delete", { ok: true });

    await expect(
      callServerFn(deleteEdgeFn, { caseId: CASE_ID, edgeId: testId(4) })
    ).resolves.toBeUndefined();

    expect(orpc.calls("edges.delete")).toEqual([
      { caseId: CASE_ID, edgeId: testId(4) },
    ]);
  });
});

describe("input validation", () => {
  it.each([
    ["listEdgesPageFn", listEdgesPageFn, { caseId: "not-a-uuid" }],
    ["getGraphSnapshotFn", getGraphSnapshotFn, { caseId: "not-a-uuid" }],
    ["createEdgeFn", createEdgeFn, { caseId: CASE_ID, fromId: "x", toId: "y" }],
    ["updateEdgeFn", updateEdgeFn, { caseId: CASE_ID, edgeId: "x" }],
    ["deleteEdgeFn", deleteEdgeFn, { caseId: CASE_ID, edgeId: "x" }],
  ] as const)(
    "%s refuses a malformed input before the API is called",
    async (_name, fn, input) => {
      await expect(callServerFn(fn, input)).rejects.toThrow();

      expect(orpc.calls("edges.list")).toEqual([]);
      expect(orpc.calls("graph.snapshot")).toEqual([]);
      expect(orpc.calls("edges.create")).toEqual([]);
      expect(orpc.calls("edges.update")).toEqual([]);
      expect(orpc.calls("edges.delete")).toEqual([]);
    }
  );

  it("trims a padded Case id on the Graph snapshot read", async () => {
    orpc.reply("graph.snapshot", {
      entities: [],
      edges: [],
      isTruncated: false,
    });

    await callServerFn(getGraphSnapshotFn, { caseId: `  ${CASE_ID}  ` });

    expect(orpc.calls("graph.snapshot")).toEqual([{ caseId: CASE_ID }]);
  });
});
