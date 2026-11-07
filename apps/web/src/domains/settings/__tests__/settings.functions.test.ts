import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-start", async () =>
  (await import("@/testing/server-fn")).serverFnModuleDouble()
);
vi.mock("@/lib/orpc.server", async () =>
  (await import("@/testing/server-fn")).orpcServerModuleDouble()
);

import {
  deleteCredentialFn,
  putCredentialFn,
} from "@/domains/settings/settings.functions";
import { callServerFn, orpc } from "@/testing/server-fn";

beforeEach(() => orpc.reset());

describe("putCredentialFn", () => {
  it("sends the name, secret and label and nothing else", async () => {
    const slot = {
      name: "SHODAN_API_KEY",
      label: "Shodan",
      description: "",
      configured: true,
      updatedAt: null,
      breachDisabled: false,
    };
    orpc.reply("credentials.put", slot);

    await expect(
      callServerFn(putCredentialFn, {
        name: "SHODAN_API_KEY",
        secret: "abc",
        label: "Shodan",
        organizationId: "org-evil",
      })
    ).resolves.toEqual(slot);

    expect(orpc.calls("credentials.put")).toEqual([
      { name: "SHODAN_API_KEY", secret: "abc", label: "Shodan" },
    ]);
  });

  it("refuses an empty secret", async () => {
    await expect(
      callServerFn(putCredentialFn, {
        name: "SHODAN_API_KEY",
        secret: "",
        label: "Shodan",
      })
    ).rejects.toThrow();

    expect(orpc.calls("credentials.put")).toEqual([]);
  });
});

describe("deleteCredentialFn", () => {
  it("answers ok once the API has deleted the credential", async () => {
    orpc.reply("credentials.delete", { ok: true });

    await expect(
      callServerFn(deleteCredentialFn, { name: "SHODAN_API_KEY" })
    ).resolves.toEqual({ ok: true });

    expect(orpc.calls("credentials.delete")).toEqual([
      { name: "SHODAN_API_KEY" },
    ]);
  });

  it("does not answer ok when the API fails", async () => {
    orpc.fail("credentials.delete", new Error("vault down"));

    await expect(
      callServerFn(deleteCredentialFn, { name: "SHODAN_API_KEY" })
    ).rejects.toThrow("vault down");
  });
});
