import { describe, expect, it, vi } from "vitest";

vi.mock("@/auth/server", () => ({ auth: {} }));

const removeMember = vi.hoisted(() => vi.fn());

vi.mock("@/auth/client", () => ({
  authClient: { organization: { removeMember } },
}));
vi.mock("@/shared/ui/toast", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { useRemoveMember } from "@/domains/organization/hooks/use-remove-member";
import { organizationKeys } from "@/domains/organization/queries";
import { runAuthMutation } from "@/shared/lib/__tests__/helpers/auth-mutation-harness";
import { toast } from "@/shared/ui/toast";

const SEED = [organizationKeys.team(), organizationKeys.userInvitations()];

describe("useRemoveMember", () => {
  it("removes the member in the variables and refreshes only the team list, without a toast", async () => {
    const run = await runAuthMutation({
      useVerb: () => useRemoveMember(),
      authCall: removeMember,
      answer: { kind: "ok" },
      variables: "m-2",
      seed: SEED,
    });

    expect(removeMember).toHaveBeenCalledWith({ memberIdOrEmail: "m-2" });
    expect(run.events).toEqual(["invalidate"]);
    expect(run.invalidated(organizationKeys.team())).toBe(true);
    expect(run.invalidated(organizationKeys.userInvitations())).toBe(false);
  });

  it("toasts the refusal and refreshes nothing", async () => {
    const run = await runAuthMutation({
      useVerb: () => useRemoveMember(),
      authCall: removeMember,
      answer: { kind: "refused", message: "Not allowed" },
      variables: "m-2",
      seed: SEED,
    });

    expect(run.events).toEqual(["toast.error"]);
    expect(toast.error).toHaveBeenCalledWith("Not allowed");
    expect(run.invalidated(organizationKeys.team())).toBe(false);
  });

  it("toasts a rejected call and refreshes nothing", async () => {
    const run = await runAuthMutation({
      useVerb: () => useRemoveMember(),
      authCall: removeMember,
      answer: { kind: "rejected", message: "network down" },
      variables: "m-2",
      seed: SEED,
    });

    expect(run.events).toEqual(["toast.error"]);
    expect(run.invalidated(organizationKeys.team())).toBe(false);
  });
});
