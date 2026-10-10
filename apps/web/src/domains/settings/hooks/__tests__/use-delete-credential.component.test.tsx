import { describe, expect, it, vi } from "vitest";

vi.mock("@/auth/server", () => ({ auth: {} }));

const deleteCredentialFn = vi.hoisted(() => vi.fn());
const onFailed = vi.hoisted(() => vi.fn());

vi.mock("@/domains/settings/settings.functions", () => ({
  deleteCredentialFn,
}));
vi.mock("@/shared/ui/toast", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { useDeleteCredential } from "@/domains/settings/hooks/use-delete-credential";
import { credentialsKeys, usersKeys } from "@/domains/settings/queries";
import { runAuthMutation } from "@/shared/lib/__tests__/helpers/auth-mutation-harness";
import { toast } from "@/shared/ui/toast";

const SEED = [credentialsKeys.all, usersKeys.all];

describe("useDeleteCredential", () => {
  it("deletes the slot in the variables, toasts, runs the callback, then refreshes only the credential list", async () => {
    deleteCredentialFn.mockResolvedValue({ ok: true });
    const run = await runAuthMutation({
      useVerb: (onDone) => useDeleteCredential({ onDeleted: onDone }),
      authCall: deleteCredentialFn,
      answer: { kind: "ok", data: { ok: true } },
      variables: "WHOIS_API_KEY",
      seed: SEED,
    });

    expect(deleteCredentialFn).toHaveBeenCalledWith({
      data: { name: "WHOIS_API_KEY" },
    });
    expect(toast.success).toHaveBeenCalledWith("Credential removed");
    expect(run.events).toEqual(["toast.success", "callback", "invalidate"]);
    expect(run.invalidated(credentialsKeys.all)).toBe(true);
    expect(run.invalidated(usersKeys.all)).toBe(false);
  });

  it("hands a rejected delete to onFailed with no toast, no success callback and no refresh", async () => {
    onFailed.mockClear();
    const run = await runAuthMutation({
      useVerb: (onDone) => useDeleteCredential({ onDeleted: onDone, onFailed }),
      authCall: deleteCredentialFn,
      answer: { kind: "rejected", message: "Vault locked" },
      variables: "WHOIS_API_KEY",
      seed: SEED,
    });

    expect(onFailed).toHaveBeenCalledWith(new Error("Vault locked"));
    expect(run.events).toEqual([]);
    expect(run.invalidated(credentialsKeys.all)).toBe(false);
  });
});
