import { describe, expect, it, vi } from "vitest";

vi.mock("@/auth/server", () => ({ auth: {} }));

const inviteMember = vi.hoisted(() => vi.fn());

vi.mock("@/auth/client", () => ({
  authClient: { organization: { inviteMember } },
}));
vi.mock("@/shared/ui/toast", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { useInviteMember } from "@/domains/organization/hooks/use-invite-member";
import { organizationKeys } from "@/domains/organization/queries";
import { runAuthMutation } from "@/shared/lib/__tests__/helpers/auth-mutation-harness";
import { toast } from "@/shared/ui/toast";

const VARIABLES = { email: "ada@mailhost.test", role: "admin" as const };
const SEED = [organizationKeys.team(), organizationKeys.userInvitations()];

describe("useInviteMember", () => {
  it("invites with the variables, then runs the callback, toasts and refreshes only the team list", async () => {
    const run = await runAuthMutation({
      useVerb: (onDone) => useInviteMember({ onInvited: onDone }),
      authCall: inviteMember,
      answer: { kind: "ok" },
      variables: VARIABLES,
      seed: SEED,
    });

    expect(inviteMember).toHaveBeenCalledWith(VARIABLES);
    expect(run.events).toEqual(["callback", "toast.success", "invalidate"]);
    expect(run.invalidated(organizationKeys.team())).toBe(true);
    expect(run.invalidated(organizationKeys.userInvitations())).toBe(false);
  });

  it("toasts the refusal and does nothing else when the call is refused", async () => {
    const run = await runAuthMutation({
      useVerb: (onDone) => useInviteMember({ onInvited: onDone }),
      authCall: inviteMember,
      answer: { kind: "refused", message: "Already a member" },
      variables: VARIABLES,
      seed: SEED,
    });

    expect(run.events).toEqual(["toast.error"]);
    expect(toast.error).toHaveBeenCalledWith("Already a member");
    expect(run.invalidated(organizationKeys.team())).toBe(false);
  });

  it("toasts the fallback copy when the refusal has no message", async () => {
    const run = await runAuthMutation({
      useVerb: (onDone) => useInviteMember({ onInvited: onDone }),
      authCall: inviteMember,
      answer: { kind: "refused" },
      variables: VARIABLES,
    });

    expect(run.events).toEqual(["toast.error"]);
    expect(toast.error).toHaveBeenCalledWith("Couldn't send invitation");
  });

  it("toasts a rejected call and does nothing else", async () => {
    const run = await runAuthMutation({
      useVerb: (onDone) => useInviteMember({ onInvited: onDone }),
      authCall: inviteMember,
      answer: { kind: "rejected", message: "network down" },
      variables: VARIABLES,
      seed: SEED,
    });

    expect(run.events).toEqual(["toast.error"]);
    expect(toast.error).toHaveBeenCalledWith("network down");
    expect(run.invalidated(organizationKeys.team())).toBe(false);
  });
});
