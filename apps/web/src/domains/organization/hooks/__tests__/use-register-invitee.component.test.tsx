import { describe, expect, it, vi } from "vitest";

const inviteSignUp = vi.hoisted(() => vi.fn());

vi.mock("@/auth/invitation-api", () => ({ inviteSignUp }));
vi.mock("@/shared/ui/toast", async () => {
  const { toastModuleDouble } = await import("@/testing/toast-double");
  return toastModuleDouble();
});

import { useRegisterInvitee } from "@/domains/organization/hooks/use-register-invitee";
import { runAuthMutation } from "@/shared/lib/__tests__/helpers/auth-mutation-harness";

const VARIABLES = {
  invitationId: "inv-1",
  name: "Ada",
  password: "correct horse battery",
};

describe("useRegisterInvitee", () => {
  it("signs up with the variables, then runs the callback and nothing else", async () => {
    inviteSignUp.mockResolvedValue(undefined);
    const run = await runAuthMutation({
      useVerb: (onDone) => useRegisterInvitee({ onRegistered: onDone }),
      authCall: inviteSignUp,
      answer: { kind: "ok" },
      variables: VARIABLES,
    });

    expect(inviteSignUp).toHaveBeenCalledWith(VARIABLES);
    expect(run.events).toEqual(["callback"]);
  });

  it("surfaces a rejected sign-up on the mutation and skips the callback", async () => {
    const run = await runAuthMutation({
      useVerb: (onDone) => useRegisterInvitee({ onRegistered: onDone }),
      authCall: inviteSignUp,
      answer: { kind: "rejected", message: "Invitation expired" },
      variables: VARIABLES,
    });

    expect(run.result.current.error).toEqual(new Error("Invitation expired"));
    expect(run.events).toEqual([]);
  });
});
