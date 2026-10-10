import { describe, expect, it, vi } from "vitest";

vi.mock("@/auth/server", () => ({ auth: {} }));

const cancelInvitation = vi.hoisted(() => vi.fn());

vi.mock("@/auth/client", () => ({
  authClient: { organization: { cancelInvitation } },
}));
vi.mock("@/shared/ui/toast", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { useCancelInvitation } from "@/domains/organization/hooks/use-cancel-invitation";
import { organizationKeys } from "@/domains/organization/queries";
import { runAuthMutation } from "@/shared/lib/__tests__/helpers/auth-mutation-harness";
import { toast } from "@/shared/ui/toast";

const SEED = [organizationKeys.team(), organizationKeys.userInvitations()];

describe("useCancelInvitation", () => {
  it("cancels the invitation in the variables and refreshes only the team list, without a toast", async () => {
    const run = await runAuthMutation({
      useVerb: () => useCancelInvitation(),
      authCall: cancelInvitation,
      answer: { kind: "ok" },
      variables: "inv-1",
      seed: SEED,
    });

    expect(cancelInvitation).toHaveBeenCalledWith({ invitationId: "inv-1" });
    expect(run.events).toEqual(["invalidate"]);
    expect(run.invalidated(organizationKeys.team())).toBe(true);
    expect(run.invalidated(organizationKeys.userInvitations())).toBe(false);
  });

  it("toasts the refusal and refreshes nothing", async () => {
    const run = await runAuthMutation({
      useVerb: () => useCancelInvitation(),
      authCall: cancelInvitation,
      answer: { kind: "refused", message: "Not allowed" },
      variables: "inv-1",
      seed: SEED,
    });

    expect(run.events).toEqual(["toast.error"]);
    expect(toast.error).toHaveBeenCalledWith("Not allowed");
    expect(run.invalidated(organizationKeys.team())).toBe(false);
  });

  it("toasts a rejected call and refreshes nothing", async () => {
    const run = await runAuthMutation({
      useVerb: () => useCancelInvitation(),
      authCall: cancelInvitation,
      answer: { kind: "rejected", message: "network down" },
      variables: "inv-1",
      seed: SEED,
    });

    expect(run.events).toEqual(["toast.error"]);
    expect(toast.error).toHaveBeenCalledWith("network down");
    expect(run.invalidated(organizationKeys.team())).toBe(false);
  });
});
