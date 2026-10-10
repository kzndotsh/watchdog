import { describe, expect, it, vi } from "vitest";

vi.mock("@/auth/server", () => ({ auth: {} }));

const banUser = vi.hoisted(() => vi.fn());

vi.mock("@/auth/client", () => ({ authClient: { admin: { banUser } } }));
vi.mock("@/shared/ui/toast", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { useDisableUser } from "@/domains/settings/hooks/use-disable-user";
import { credentialsKeys, usersKeys } from "@/domains/settings/queries";
import { runAuthMutation } from "@/shared/lib/__tests__/helpers/auth-mutation-harness";
import { TOAST_USER_DISABLED } from "@/shared/lib/toast-copy";
import { toast } from "@/shared/ui/toast";

const SEED = [usersKeys.all, credentialsKeys.all];

describe("useDisableUser", () => {
  it("bans the user in the variables, refreshes only the user list, then toasts", async () => {
    const run = await runAuthMutation({
      useVerb: () => useDisableUser(),
      authCall: banUser,
      answer: { kind: "ok" },
      variables: "u-2",
      seed: SEED,
    });

    expect(banUser).toHaveBeenCalledWith({
      userId: "u-2",
      banReason: "disabled",
    });
    expect(run.events).toEqual(["invalidate", "toast.success"]);
    expect(toast.success).toHaveBeenCalledWith(TOAST_USER_DISABLED);
    expect(run.invalidated(usersKeys.all)).toBe(true);
    expect(run.invalidated(credentialsKeys.all)).toBe(false);
  });

  it("toasts the refusal and refreshes nothing", async () => {
    const run = await runAuthMutation({
      useVerb: () => useDisableUser(),
      authCall: banUser,
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
      useVerb: () => useDisableUser(),
      authCall: banUser,
      answer: { kind: "rejected", message: "network down" },
      variables: "u-2",
      seed: SEED,
    });

    expect(run.events).toEqual(["toast.error"]);
    expect(run.invalidated(usersKeys.all)).toBe(false);
  });
});
