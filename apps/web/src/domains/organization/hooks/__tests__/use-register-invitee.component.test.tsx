import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const inviteSignUp = vi.hoisted(() => vi.fn());

const assign = vi.hoisted(() => vi.fn());

beforeEach(() => {
  assign.mockClear();
  vi.stubGlobal("location", { assign });
});
afterEach(() => {
  vi.unstubAllGlobals();
});

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
  it("signs up with the variables, then hard-navigates home", async () => {
    inviteSignUp.mockResolvedValue(undefined);
    await runAuthMutation({
      useVerb: () => useRegisterInvitee(),
      authCall: inviteSignUp,
      answer: { kind: "ok" },
      variables: VARIABLES,
    });

    expect(inviteSignUp).toHaveBeenCalledWith(VARIABLES);
    expect(assign).toHaveBeenCalledWith("/");
  });

  it("surfaces a rejected sign-up on the mutation", async () => {
    const run = await runAuthMutation({
      useVerb: () => useRegisterInvitee(),
      authCall: inviteSignUp,
      answer: { kind: "rejected", message: "Invitation expired" },
      variables: VARIABLES,
    });

    expect(run.result.current.error).toEqual(new Error("Invitation expired"));
    expect(assign).not.toHaveBeenCalled();
  });
});
