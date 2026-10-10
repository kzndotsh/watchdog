import { describe, expect, it, vi } from "vitest";

vi.mock("@/auth/server", () => ({ auth: {} }));

const inviteMember = vi.hoisted(() => vi.fn());

vi.mock("@/auth/client", () => ({
  authClient: { organization: { inviteMember } },
}));
vi.mock("@/shared/ui/toast", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { useResendInvitation } from "@/domains/organization/hooks/use-resend-invitation";
import { organizationKeys } from "@/domains/organization/queries";
import { runAuthMutation } from "@/shared/lib/__tests__/helpers/auth-mutation-harness";
import { toast } from "@/shared/ui/toast";

const SEED = [organizationKeys.team(), organizationKeys.userInvitations()];

describe("useResendInvitation", () => {
  it("resends with the row, toasts, then refreshes only the team list", async () => {
    const run = await runAuthMutation({
      useVerb: () => useResendInvitation(),
      authCall: inviteMember,
      answer: { kind: "ok" },
      variables: { email: "ada@mailhost.test", role: "admin" },
      seed: SEED,
    });

    expect(inviteMember).toHaveBeenCalledWith({
      email: "ada@mailhost.test",
      role: "admin",
      resend: true,
    });
    expect(run.events).toEqual(["toast.success", "invalidate"]);
    expect(run.invalidated(organizationKeys.team())).toBe(true);
    expect(run.invalidated(organizationKeys.userInvitations())).toBe(false);
  });

  it("resends any role other than admin as member", async () => {
    await runAuthMutation({
      useVerb: () => useResendInvitation(),
      authCall: inviteMember,
      answer: { kind: "ok" },
      variables: { email: "bo@mailhost.test", role: "owner" },
    });

    expect(inviteMember).toHaveBeenLastCalledWith({
      email: "bo@mailhost.test",
      role: "member",
      resend: true,
    });
  });

  it("toasts a rejected call and refreshes nothing", async () => {
    const run = await runAuthMutation({
      useVerb: () => useResendInvitation(),
      authCall: inviteMember,
      answer: { kind: "rejected", message: "network down" },
      variables: { email: "ada@mailhost.test", role: "admin" },
      seed: SEED,
    });

    expect(run.events).toEqual(["toast.error"]);
    expect(toast.error).toHaveBeenCalledWith("network down");
    expect(run.invalidated(organizationKeys.team())).toBe(false);
  });
});
