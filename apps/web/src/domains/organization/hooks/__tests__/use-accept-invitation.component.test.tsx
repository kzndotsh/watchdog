import { describe, expect, it, vi } from "vitest";

const acceptInvitation = vi.hoisted(() => vi.fn());

vi.mock("@/auth/client", () => ({
  authClient: { organization: { acceptInvitation } },
}));
vi.mock("@/shared/ui/toast", async () => {
  const { toastModuleDouble } = await import("@/testing/toast-double");
  return toastModuleDouble();
});

import { useAcceptInvitation } from "@/domains/organization/hooks/use-accept-invitation";
import { runAuthMutation } from "@/shared/lib/__tests__/helpers/auth-mutation-harness";

describe("useAcceptInvitation", () => {
  it("accepts the invitation in the variables, then runs the callback and nothing else", async () => {
    const run = await runAuthMutation({
      useVerb: (onDone) => useAcceptInvitation({ onAccepted: onDone }),
      authCall: acceptInvitation,
      answer: { kind: "ok" },
      variables: "inv-1",
    });

    expect(acceptInvitation).toHaveBeenCalledWith({ invitationId: "inv-1" });
    expect(run.events).toEqual(["callback"]);
  });

  it("surfaces the refusal on the mutation and skips the callback", async () => {
    const run = await runAuthMutation({
      useVerb: (onDone) => useAcceptInvitation({ onAccepted: onDone }),
      authCall: acceptInvitation,
      answer: { kind: "refused", message: "Expired" },
      variables: "inv-1",
    });

    expect(run.result.current.error).toEqual(new Error("Expired"));
    expect(run.events).toEqual([]);
  });

  it("falls back to the default copy when the refusal has no message", async () => {
    const run = await runAuthMutation({
      useVerb: (onDone) => useAcceptInvitation({ onAccepted: onDone }),
      authCall: acceptInvitation,
      answer: { kind: "refused" },
      variables: "inv-1",
    });

    expect(run.result.current.error).toEqual(
      new Error("Couldn't accept invitation")
    );
  });

  it("surfaces a rejected call on the mutation and skips the callback", async () => {
    const run = await runAuthMutation({
      useVerb: (onDone) => useAcceptInvitation({ onAccepted: onDone }),
      authCall: acceptInvitation,
      answer: { kind: "rejected", message: "network down" },
      variables: "inv-1",
    });

    expect(run.result.current.error).toEqual(new Error("network down"));
    expect(run.events).toEqual([]);
  });
});
