import { createRouterClient } from "@orpc/server";
import { describe, expect, it, vi } from "vitest";

const vault = vi.hoisted(() => ({
  current: undefined as
    | { secrets: Map<string, Map<string, string>> }
    | undefined,
}));

// Route `runApp` through a fake credential Layer: the procedures and the core
// credential helpers run unpatched, only the vault service is swapped.
vi.mock("../../runtime", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../runtime")>();
  const { fakeVault } = await import("@watchdog/core/vault");
  const fake = fakeVault({
    u1: { AI_COMPAT_API_KEY: "sk-test" },
  });
  vault.current = fake;
  return { ...actual, runApp: actual.runAppWith(fake.layer) };
});

import { testActor } from "@watchdog/test-kit";

import { list, put, remove } from "../credentials";

const actor = testActor();

const context = {
  headers: new Headers(),
  actor,
  authMethod: "session" as const,
};

describe("credentials procedures", () => {
  it("lists credential slots for the actor from the vault service", async () => {
    const slots = await createRouterClient({ list }, { context }).list();

    expect(
      slots.find((slot) => slot.name === "AI_COMPAT_API_KEY")
    ).toMatchObject({ configured: true });
  });

  it("stores a secret through the vault service and never returns it", async () => {
    const slot = await createRouterClient({ put }, { context }).put({
      name: "SHODAN_API_KEY",
      secret: "  s3cret  ",
    });

    expect(slot).toMatchObject({ name: "SHODAN_API_KEY", configured: true });
    expect(JSON.stringify(slot)).not.toContain("s3cret");
    expect(vault.current?.secrets.get("u1")?.get("SHODAN_API_KEY")).toBe(
      "s3cret"
    );
  });

  it("deletes a credential and reports a missing one as not found", async () => {
    const client = createRouterClient({ remove }, { context });
    await expect(client.remove({ name: "AI_COMPAT_API_KEY" })).resolves.toEqual(
      { ok: true }
    );
    await expect(
      client.remove({ name: "AI_COMPAT_API_KEY" })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("rejects invalid credential names at ingress", async () => {
    await expect(
      createRouterClient({ put }, { context }).put({
        name: "shodan",
        secret: "secret",
      })
    ).rejects.toMatchObject({
      message: "Input validation failed",
    });
  });
});
