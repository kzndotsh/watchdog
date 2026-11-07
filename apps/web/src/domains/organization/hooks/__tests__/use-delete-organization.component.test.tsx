import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const deleteOrganization = vi.hoisted(() => vi.fn());

const assign = vi.hoisted(() => vi.fn());

beforeEach(() => {
  assign.mockClear();
  vi.stubGlobal("location", { assign });
});
afterEach(() => {
  vi.unstubAllGlobals();
});

vi.mock("@/auth/client", () => ({
  authClient: { organization: { delete: deleteOrganization } },
}));
vi.mock("@/shared/ui/toast", async () => {
  const { toastModuleDouble } = await import("@/testing/toast-double");
  return toastModuleDouble();
});

import { useDeleteOrganization } from "@/domains/organization/hooks/use-delete-organization";
import { organizationKeys } from "@/domains/organization/queries";
import { runAuthMutation } from "@/shared/lib/__tests__/helpers/auth-mutation-harness";

const SEED = [organizationKeys.state("u1")];

describe("useDeleteOrganization", () => {
  it("deletes the organization in the variables, invalidates the organization state and hard-navigates home", async () => {
    const run = await runAuthMutation({
      useVerb: () => useDeleteOrganization(),
      authCall: deleteOrganization,
      answer: { kind: "ok" },
      variables: "org-1",
      seed: SEED,
    });

    expect(deleteOrganization).toHaveBeenCalledWith({
      organizationId: "org-1",
    });
    expect(run.invalidated(organizationKeys.state("u1"))).toBe(true);
    expect(assign).toHaveBeenCalledWith("/");
  });

  it("surfaces the refusal on the mutation", async () => {
    const run = await runAuthMutation({
      useVerb: () => useDeleteOrganization(),
      authCall: deleteOrganization,
      answer: { kind: "refused", message: "Owners only" },
      variables: "org-1",
    });

    expect(run.result.current.error).toEqual(new Error("Owners only"));
    expect(assign).not.toHaveBeenCalled();
  });

  it("surfaces a rejected call on the mutation", async () => {
    const run = await runAuthMutation({
      useVerb: () => useDeleteOrganization(),
      authCall: deleteOrganization,
      answer: { kind: "rejected", message: "network down" },
      variables: "org-1",
    });

    expect(run.result.current.error).toEqual(new Error("network down"));
  });
});
