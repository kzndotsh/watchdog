import { describe, expect, it, vi } from "vitest";

vi.mock("@/auth/server", () => ({ auth: {} }));

const unbanUser = vi.hoisted(() => vi.fn());

vi.mock("@/auth/client", () => ({ authClient: { admin: { unbanUser } } }));
vi.mock("@/shared/ui/toast", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { useEnableUser } from "@/domains/settings/hooks/use-enable-user";
import { credentialsKeys, usersKeys } from "@/domains/settings/queries";
import { runAuthMutation } from "@/shared/lib/__tests__/helpers/auth-mutation-harness";
import { TOAST_USER_ENABLED } from "@/shared/lib/toast-copy";
import { toast } from "@/shared/ui/toast";

const SEED = [usersKeys.all, credentialsKeys.all];

describe("useEnableUser", () => {
  it("unbans the user in the variables, refreshes only the user list, then toasts", async () => {
    const run = await runAuthMutation({
      useVerb: () => useEnableUser(),
      authCall: unbanUser,
      answer: { kind: "ok" },
      variables: "u-2",
      seed: SEED,
    });

    expect(unbanUser).toHaveBeenCalledWith({ userId: "u-2" });
    expect(run.events).toEqual(["invalidate", "toast.success"]);
    expect(toast.success).toHaveBeenCalledWith(TOAST_USER_ENABLED);
    expect(run.invalidated(usersKeys.all)).toBe(true);
    expect(run.invalidated(credentialsKeys.all)).toBe(false);
  });

  it("toasts the refusal and refreshes nothing", async () => {
    const run = await runAuthMutation({
      useVerb: () => useEnableUser(),
      authCall: unbanUser,
      answer: { kind: "refused", message: "Not allowed" },
      variables: "u-2",
      seed: SEED,
    });

    expect(run.events).toEqual(["toast.error"]);
    expect(toast.error).toHaveBeenCalledWith("Not allowed");
    expect(run.invalidated(usersKeys.all)).toBe(false);
  });

  it("toasts a rejected call and refreshes nothing", async () => {
    const run = await runAuthMutation({
      useVerb: () => useEnableUser(),
      authCall: unbanUser,
      answer: { kind: "rejected", message: "network down" },
      variables: "u-2",
      seed: SEED,
    });

    expect(run.events).toEqual(["toast.error"]);
    expect(run.invalidated(usersKeys.all)).toBe(false);
  });
});
