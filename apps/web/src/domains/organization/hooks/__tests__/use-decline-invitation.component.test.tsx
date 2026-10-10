import { describe, expect, it, vi } from "vitest";

vi.mock("@/auth/server", () => ({ auth: {} }));

const rejectInvitation = vi.hoisted(() => vi.fn());

vi.mock("@/auth/client", () => ({
  authClient: { organization: { rejectInvitation } },
}));
vi.mock("@/shared/ui/toast", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { useDeclineInvitation } from "@/domains/organization/hooks/use-decline-invitation";
import { organizationKeys } from "@/domains/organization/queries";
import { runAuthMutation } from "@/shared/lib/__tests__/helpers/auth-mutation-harness";
import { toast } from "@/shared/ui/toast";

const SEED = [organizationKeys.team(), organizationKeys.userInvitations()];

describe("useDeclineInvitation", () => {
  it("declines the invitation in the variables and refreshes only the invitations addressed to the user", async () => {
    const run = await runAuthMutation({
      useVerb: () => useDeclineInvitation(),
      authCall: rejectInvitation,
      answer: { kind: "ok" },
      variables: "inv-9",
      seed: SEED,
    });

    expect(rejectInvitation).toHaveBeenCalledWith({ invitationId: "inv-9" });
    expect(run.events).toEqual(["invalidate"]);
    expect(run.invalidated(organizationKeys.userInvitations())).toBe(true);
    expect(run.invalidated(organizationKeys.team())).toBe(false);
  });

  it("toasts the refusal and refreshes nothing", async () => {
    const run = await runAuthMutation({
      useVerb: () => useDeclineInvitation(),
      authCall: rejectInvitation,
      answer: { kind: "refused", message: "Expired" },
      variables: "inv-9",
      seed: SEED,
    });

    expect(run.events).toEqual(["toast.error"]);
    expect(toast.error).toHaveBeenCalledWith("Expired");
    expect(run.invalidated(organizationKeys.userInvitations())).toBe(false);
  });

  it("toasts a rejected call and refreshes nothing", async () => {
    const run = await runAuthMutation({
      useVerb: () => useDeclineInvitation(),
      authCall: rejectInvitation,
      answer: { kind: "rejected", message: "network down" },
      variables: "inv-9",
      seed: SEED,
    });

    expect(run.events).toEqual(["toast.error"]);
    expect(toast.error).toHaveBeenCalledWith("network down");
    expect(run.invalidated(organizationKeys.userInvitations())).toBe(false);
  });
});
