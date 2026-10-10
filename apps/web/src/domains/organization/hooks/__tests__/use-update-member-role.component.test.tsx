import { describe, expect, it, vi } from "vitest";

vi.mock("@/auth/server", () => ({ auth: {} }));

const updateMemberRole = vi.hoisted(() => vi.fn());

vi.mock("@/auth/client", () => ({
  authClient: { organization: { updateMemberRole } },
}));
vi.mock("@/shared/ui/toast", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { useUpdateMemberRole } from "@/domains/organization/hooks/use-update-member-role";
import { organizationKeys } from "@/domains/organization/queries";
import { runAuthMutation } from "@/shared/lib/__tests__/helpers/auth-mutation-harness";
import { toast } from "@/shared/ui/toast";

const SEED = [organizationKeys.team(), organizationKeys.userInvitations()];
const VARIABLES = { memberId: "m-2", role: "admin" };

describe("useUpdateMemberRole", () => {
  it("updates the member in the variables and refreshes only the team list, without a toast", async () => {
    const run = await runAuthMutation({
      useVerb: () => useUpdateMemberRole(),
      authCall: updateMemberRole,
      answer: { kind: "ok" },
      variables: VARIABLES,
      seed: SEED,
    });

    expect(updateMemberRole).toHaveBeenCalledWith(VARIABLES);
    expect(run.events).toEqual(["invalidate"]);
    expect(run.invalidated(organizationKeys.team())).toBe(true);
    expect(run.invalidated(organizationKeys.userInvitations())).toBe(false);
  });

  it("toasts the refusal and refreshes nothing", async () => {
    const run = await runAuthMutation({
      useVerb: () => useUpdateMemberRole(),
      authCall: updateMemberRole,
      answer: { kind: "refused", message: "Not allowed" },
      variables: VARIABLES,
      seed: SEED,
    });

    expect(run.events).toEqual(["toast.error"]);
    expect(toast.error).toHaveBeenCalledWith("Not allowed");
    expect(run.invalidated(organizationKeys.team())).toBe(false);
  });

  it("toasts a rejected call and refreshes nothing", async () => {
    const run = await runAuthMutation({
      useVerb: () => useUpdateMemberRole(),
      authCall: updateMemberRole,
      answer: { kind: "rejected", message: "network down" },
      variables: VARIABLES,
      seed: SEED,
    });

    expect(run.events).toEqual(["toast.error"]);
    expect(run.invalidated(organizationKeys.team())).toBe(false);
  });
});
