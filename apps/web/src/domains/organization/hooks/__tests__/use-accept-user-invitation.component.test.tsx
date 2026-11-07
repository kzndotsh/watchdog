import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const acceptInvitation = vi.hoisted(() => vi.fn());
const setActive = vi.hoisted(() => vi.fn());
const assign = vi.hoisted(() => vi.fn());

beforeEach(() => {
  assign.mockClear();
  setActive.mockReset();
  setActive.mockResolvedValue({ data: null, error: null });
  vi.stubGlobal("location", { assign });
});
afterEach(() => {
  vi.unstubAllGlobals();
});

vi.mock("@/auth/client", () => ({
  authClient: { organization: { acceptInvitation, setActive } },
}));
vi.mock("@/shared/ui/toast", async () => {
  const { toastModuleDouble } = await import("@/testing/toast-double");
  return toastModuleDouble();
});

import { useAcceptUserInvitation } from "@/domains/organization/hooks/use-accept-user-invitation";
import { organizationKeys } from "@/domains/organization/queries";
import { runAuthMutation } from "@/shared/lib/__tests__/helpers/auth-mutation-harness";
import { toast } from "@/shared/ui/toast";

const INVITATION = { id: "inv-1", organizationId: "org-7" };

describe("useAcceptUserInvitation", () => {
  it("accepts the invitation, makes the joined organization active, invalidates the organization state and hard-navigates home, with no toast", async () => {
    const run = await runAuthMutation({
      useVerb: () => useAcceptUserInvitation(),
      authCall: acceptInvitation,
      answer: { kind: "ok" },
      variables: INVITATION,
      seed: [organizationKeys.state("u1")],
    });

    expect(acceptInvitation).toHaveBeenCalledWith({ invitationId: "inv-1" });
    expect(setActive).toHaveBeenCalledWith({ organizationId: "org-7" });
    expect(assign).toHaveBeenCalledWith("/");
    expect(run.events).not.toContain("toast.error");
    expect(run.invalidated(organizationKeys.state("u1"))).toBe(true);
  });

  it("toasts the refusal and does not navigate", async () => {
    const run = await runAuthMutation({
      useVerb: () => useAcceptUserInvitation(),
      authCall: acceptInvitation,
      answer: { kind: "refused", message: "Expired" },
      variables: INVITATION,
    });

    expect(run.events).toEqual(["toast.error"]);
    expect(toast.error).toHaveBeenCalledWith("Expired");
    expect(setActive).not.toHaveBeenCalled();
    expect(assign).not.toHaveBeenCalled();
  });

  it("toasts a rejected call and does not navigate", async () => {
    const run = await runAuthMutation({
      useVerb: () => useAcceptUserInvitation(),
      authCall: acceptInvitation,
      answer: { kind: "rejected", message: "network down" },
      variables: INVITATION,
    });

    expect(run.events).toEqual(["toast.error"]);
    expect(toast.error).toHaveBeenCalledWith("network down");
    expect(assign).not.toHaveBeenCalled();
  });

  it("toasts a refused switch and does not navigate", async () => {
    setActive.mockResolvedValue({
      data: null,
      error: { message: "No access" },
    });
    const run = await runAuthMutation({
      useVerb: () => useAcceptUserInvitation(),
      authCall: acceptInvitation,
      answer: { kind: "ok" },
      variables: INVITATION,
    });

    expect(toast.error).toHaveBeenCalledWith("No access");
    expect(run.events).toEqual(["toast.error"]);
    expect(assign).not.toHaveBeenCalled();
  });
});
