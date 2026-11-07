import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-start", async () =>
  (await import("@/testing/server-fn")).serverFnModuleDouble()
);
vi.mock("@/lib/orpc.server", async () =>
  (await import("@/testing/server-fn")).orpcServerModuleDouble()
);

import {
  createClaimFn,
  listClaimsPageFn,
  retractClaimFn,
  updateClaimFn,
} from "@/domains/entities/claims/claims.functions";
import { callServerFn, orpc } from "@/testing/server-fn";
import { testId } from "@watchdog/test-kit";

beforeEach(() => orpc.reset());

describe("claims server functions", () => {
  it.each([
    ["listClaimsPageFn", listClaimsPageFn, { caseId: "not-a-uuid" }],
    ["createClaimFn", createClaimFn, { caseId: testId(10) }],
    ["retractClaimFn", retractClaimFn, { caseId: testId(10), claimId: "x" }],
    ["updateClaimFn", updateClaimFn, { caseId: testId(10), claimId: "x" }],
  ] as const)(
    "%s refuses a malformed input before the API is called",
    async (_name, fn, input) => {
      await expect(callServerFn(fn, input)).rejects.toThrow();

      expect(orpc.calls("claims.list")).toMatchObject([]);
      expect(orpc.calls("claims.create")).toEqual([]);
      expect(orpc.calls("claims.retract")).toEqual([]);
      expect(orpc.calls("claims.update")).toEqual([]);
    }
  );

  it("trims padded ids and forwards the list's declared filters", async () => {
    orpc.reply("claims.list", { items: [], nextCursor: null, total: null });

    await callServerFn(listClaimsPageFn, {
      caseId: `  ${testId(10)}  `,
      entityId: testId(20),
      q: "domain",
    });

    expect(orpc.calls("claims.list")).toMatchObject([
      { caseId: testId(10), entityId: testId(20), q: "domain" },
    ]);
  });
});
