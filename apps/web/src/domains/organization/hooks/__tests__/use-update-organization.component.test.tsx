import { authQueryKeys } from "@better-auth-ui/core";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/auth/server", () => ({ auth: {} }));

const update = vi.hoisted(() => vi.fn());

vi.mock("@/auth/client", () => ({
  authClient: { organization: { update } },
}));
vi.mock("@/shared/ui/toast", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { useUpdateOrganization } from "@/domains/organization/hooks/use-update-organization";
import { organizationKeys } from "@/domains/organization/queries";
import { runAuthMutation } from "@/shared/lib/__tests__/helpers/auth-mutation-harness";

const SEED = [authQueryKeys.all, organizationKeys.team()];
const VARIABLES = {
  id: "org-1",
  name: "Newsroom",
  slug: "newsroom",
  logo: null,
};

describe("useUpdateOrganization", () => {
  it("saves the organization in the variables (a cleared logo as an empty string) and refreshes the auth caches", async () => {
    const run = await runAuthMutation({
      useVerb: () => useUpdateOrganization(),
      authCall: update,
      answer: { kind: "ok" },
      variables: VARIABLES,
      seed: SEED,
    });

    expect(update).toHaveBeenCalledWith({
      organizationId: "org-1",
      data: { name: "Newsroom", slug: "newsroom", logo: "" },
    });
    expect(run.events).toEqual(["invalidate"]);
    expect(run.invalidated(authQueryKeys.all)).toBe(true);
    expect(run.invalidated(organizationKeys.team())).toBe(false);
  });

  it("surfaces the refusal on the mutation and refreshes nothing", async () => {
    const run = await runAuthMutation({
      useVerb: () => useUpdateOrganization(),
      authCall: update,
      answer: { kind: "refused", message: "Slug taken" },
      variables: VARIABLES,
      seed: SEED,
    });

    expect(run.result.current.error).toEqual(new Error("Slug taken"));
    expect(run.events).toEqual([]);
    expect(run.invalidated(authQueryKeys.all)).toBe(false);
  });

  it("surfaces a rejected call on the mutation and refreshes nothing", async () => {
    const run = await runAuthMutation({
      useVerb: () => useUpdateOrganization(),
      authCall: update,
      answer: { kind: "rejected", message: "network down" },
      variables: VARIABLES,
      seed: SEED,
    });

    expect(run.result.current.error).toEqual(new Error("network down"));
    expect(run.events).toEqual([]);
  });
});
