import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const leave = vi.hoisted(() => vi.fn());

const assign = vi.hoisted(() => vi.fn());

beforeEach(() => {
  assign.mockClear();
  vi.stubGlobal("location", { assign });
});
afterEach(() => {
  vi.unstubAllGlobals();
});

vi.mock("@/auth/client", () => ({
  authClient: { organization: { leave } },
}));
vi.mock("@/shared/ui/toast", async () => {
  const { toastModuleDouble } = await import("@/testing/toast-double");
  return toastModuleDouble();
});

import { useLeaveOrganization } from "@/domains/organization/hooks/use-leave-organization";
import { organizationKeys } from "@/domains/organization/queries";
import { runAuthMutation } from "@/shared/lib/__tests__/helpers/auth-mutation-harness";

const SEED = [organizationKeys.state("u1")];

describe("useLeaveOrganization", () => {
  it("leaves the organization in the variables, invalidates the organization state and hard-navigates home", async () => {
    const run = await runAuthMutation({
      useVerb: () => useLeaveOrganization(),
      authCall: leave,
      answer: { kind: "ok" },
      variables: "org-1",
      seed: SEED,
    });

    expect(leave).toHaveBeenCalledWith({ organizationId: "org-1" });
    expect(run.invalidated(organizationKeys.state("u1"))).toBe(true);
    expect(assign).toHaveBeenCalledWith("/");
  });

  it("surfaces the refusal on the mutation", async () => {
    const run = await runAuthMutation({
      useVerb: () => useLeaveOrganization(),
      authCall: leave,
      answer: { kind: "refused", message: "Last owner" },
      variables: "org-1",
    });

    expect(run.result.current.error).toEqual(new Error("Last owner"));
    expect(assign).not.toHaveBeenCalled();
  });

  it("surfaces a rejected call on the mutation", async () => {
    const run = await runAuthMutation({
      useVerb: () => useLeaveOrganization(),
      authCall: leave,
      answer: { kind: "rejected", message: "network down" },
      variables: "org-1",
    });

    expect(run.result.current.error).toEqual(new Error("network down"));
  });
});
