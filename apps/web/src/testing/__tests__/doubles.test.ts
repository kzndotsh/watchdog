import { describe, expect, it, vi } from "vitest";

import { auth } from "@/auth/server";
import {
  buildEvidenceRecord,
  buildJobListRecord,
  buildJobRecord,
  buildProposalRecord,
} from "@/testing/records";
import { toastModuleDouble } from "@/testing/toast-double";

describe("shared web test doubles", () => {
  it("serves @/auth/server from the setup file without a vi.mock in the test", () => {
    // The real module would build Better Auth (and carry `api`); the double is empty.
    expect(auth).toEqual({});
  });

  it("gives every toast helper a spy", () => {
    const { toast } = toastModuleDouble();
    toast.success("Saved");
    expect(vi.isMockFunction(toast.error)).toBe(true);
    expect(toast.success).toHaveBeenCalledWith("Saved");
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("overrides fields and keeps the other defaults in the record builders", () => {
    expect(buildEvidenceRecord({ label: "x" })).toMatchObject({
      label: "x",
      kind: "attestation",
      deletedAt: null,
    });
    expect(buildJobListRecord({ status: "failed" })).toMatchObject({
      status: "failed",
      capabilityId: "network.dns.lookup",
    });
    expect(buildJobRecord({ logs: ["a"] })).toMatchObject({
      logs: ["a"],
      output: null,
    });
    expect(buildProposalRecord({ status: "accepted" })).toMatchObject({
      status: "accepted",
      agentSourced: false,
    });
  });

  it("returns a fresh record per call", () => {
    expect(buildProposalRecord().patch).not.toBe(buildProposalRecord().patch);
  });
});
