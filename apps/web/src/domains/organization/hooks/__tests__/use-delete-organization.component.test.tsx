import { describe, expect, it, vi } from "vitest";

const deleteOrganization = vi.hoisted(() => vi.fn());

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

const SEED = [organizationKeys.team()];

describe("useDeleteOrganization", () => {
  it("deletes the organization in the variables and settles no cache (the caller reloads)", async () => {
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
    expect(run.events).toEqual([]);
    expect(run.invalidated(organizationKeys.team())).toBe(false);
  });

  it("surfaces the refusal on the mutation", async () => {
    const run = await runAuthMutation({
      useVerb: () => useDeleteOrganization(),
      authCall: deleteOrganization,
      answer: { kind: "refused", message: "Owners only" },
      variables: "org-1",
    });

    expect(run.result.current.error).toEqual(new Error("Owners only"));
    expect(run.events).toEqual([]);
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
