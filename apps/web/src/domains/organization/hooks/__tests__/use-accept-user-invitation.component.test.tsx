import { describe, expect, it, vi } from "vitest";

const acceptInvitation = vi.hoisted(() => vi.fn());
const onAccepted = vi.hoisted(() => vi.fn());

vi.mock("@/auth/client", () => ({
  authClient: { organization: { acceptInvitation } },
}));
vi.mock("@/shared/ui/toast", async () => {
  const { toastModuleDouble } = await import("@/testing/toast-double");
  return toastModuleDouble();
});

import { useAcceptUserInvitation } from "@/domains/organization/hooks/use-accept-user-invitation";
import { organizationKeys } from "@/domains/organization/queries";
import { runAuthMutation } from "@/shared/lib/__tests__/helpers/auth-mutation-harness";
import { toast } from "@/shared/ui/toast";

const SEED = [organizationKeys.userInvitations()];
const INVITATION = { id: "inv-1", organizationId: "org-7" };

describe("useAcceptUserInvitation", () => {
  it("accepts the invitation in the variables and hands the joined organization id to the callback, with no toast and no cache settle", async () => {
    onAccepted.mockClear();
    const run = await runAuthMutation({
      useVerb: (onDone) =>
        useAcceptUserInvitation({
          onAccepted: (organizationId) => {
            onAccepted(organizationId);
            onDone();
          },
        }),
      authCall: acceptInvitation,
      answer: { kind: "ok" },
      variables: INVITATION,
      seed: SEED,
    });

    expect(acceptInvitation).toHaveBeenCalledWith({ invitationId: "inv-1" });
    expect(onAccepted).toHaveBeenCalledWith("org-7");
    expect(run.events).toEqual(["callback"]);
    expect(run.invalidated(organizationKeys.userInvitations())).toBe(false);
  });

  it("toasts the refusal and skips the callback", async () => {
    onAccepted.mockClear();
    const run = await runAuthMutation({
      useVerb: () => useAcceptUserInvitation({ onAccepted }),
      authCall: acceptInvitation,
      answer: { kind: "refused", message: "Expired" },
      variables: INVITATION,
    });

    expect(run.events).toEqual(["toast.error"]);
    expect(toast.error).toHaveBeenCalledWith("Expired");
    expect(onAccepted).not.toHaveBeenCalled();
  });

  it("toasts a rejected call and skips the callback", async () => {
    onAccepted.mockClear();
    const run = await runAuthMutation({
      useVerb: () => useAcceptUserInvitation({ onAccepted }),
      authCall: acceptInvitation,
      answer: { kind: "rejected", message: "network down" },
      variables: INVITATION,
    });

    expect(run.events).toEqual(["toast.error"]);
    expect(toast.error).toHaveBeenCalledWith("network down");
    expect(onAccepted).not.toHaveBeenCalled();
  });
});
