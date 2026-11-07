import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-start", async () =>
  (await import("@/testing/server-fn")).serverFnModuleDouble()
);
vi.mock("@/lib/orpc.server", async () =>
  (await import("@/testing/server-fn")).orpcServerModuleDouble()
);

import {
  acceptProposalFn,
  getProposalFn,
  listProposalQueuePageFn,
} from "@/domains/triage/triage.functions";
import { callServerFn, orpc, orpcNotFound } from "@/testing/server-fn";
import { testId } from "@watchdog/test-kit";

const CASE_ID = testId(10);
const PROPOSAL_ID = testId(1);

beforeEach(() => orpc.reset());

describe("getProposalFn", () => {
  it("answers null when the Case has no such Proposal", async () => {
    orpc.fail("proposals.get", orpcNotFound());

    await expect(
      callServerFn(getProposalFn, { caseId: CASE_ID, proposalId: PROPOSAL_ID })
    ).resolves.toBeNull();
  });

  it("rethrows any other API failure", async () => {
    orpc.fail("proposals.get", new Error("db down"));

    await expect(
      callServerFn(getProposalFn, { caseId: CASE_ID, proposalId: PROPOSAL_ID })
    ).rejects.toThrow("db down");
  });
});

describe("input validation", () => {
  it.each([
    ["listProposalQueuePageFn", listProposalQueuePageFn, { caseId: "x" }],
    ["getProposalFn", getProposalFn, { caseId: CASE_ID, proposalId: "x" }],
    [
      "acceptProposalFn",
      acceptProposalFn,
      { caseId: CASE_ID, proposalId: "x" },
    ],
  ] as const)(
    "%s refuses a malformed input before the API is called",
    async (_name, fn, input) => {
      await expect(callServerFn(fn, input)).rejects.toThrow();

      expect(orpc.calls("proposals.queuePage")).toEqual([]);
      expect(orpc.calls("proposals.get")).toEqual([]);
      expect(orpc.calls("proposals.accept")).toEqual([]);
    }
  );

  it("refuses a queue status the list does not declare", async () => {
    await expect(
      callServerFn(listProposalQueuePageFn, {
        caseId: CASE_ID,
        status: ["nonsense"],
      })
    ).rejects.toThrow();

    expect(orpc.calls("proposals.queuePage")).toEqual([]);
  });
});
