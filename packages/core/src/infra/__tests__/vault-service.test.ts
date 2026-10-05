import { Effect, Exit, Layer } from "effect";
import { describe, expect, it } from "vitest";

import { NotFoundError } from "../tagged-errors";
import {
  Vault,
  deleteCredentialEffect,
  getCredentialEffect,
  hasCredentialEffect,
  listCredentialMetaEffect,
  putCredentialEffect,
} from "../vault";
import { fakeVault } from "../vault-fake";

function run<A, E>(
  effect: Effect.Effect<A, E, Vault>,
  vault: ReturnType<typeof fakeVault>
): Promise<A> {
  return Effect.runPromise(Effect.provide(effect, vault.layer));
}

describe("Vault service (fake Layer)", () => {
  it("serves credentials to the helpers without a database or master key", async () => {
    const vault = fakeVault({ u1: { WHOIS_API_KEY: "k-1" } });

    expect(await run(getCredentialEffect("u1", "WHOIS_API_KEY"), vault)).toBe(
      "k-1"
    );
    expect(await run(hasCredentialEffect("u1", "WHOIS_API_KEY"), vault)).toBe(
      true
    );
    expect(await run(hasCredentialEffect("u2", "WHOIS_API_KEY"), vault)).toBe(
      false
    );
    const meta = await run(listCredentialMetaEffect("u1"), vault);
    expect(meta.map((m) => m.name)).toEqual(["WHOIS_API_KEY"]);
    expect(JSON.stringify(meta)).not.toContain("k-1");
  });

  it("fails a missing slot with NotFoundError, like the live vault", async () => {
    const vault = fakeVault();
    const exit = await Effect.runPromiseExit(
      Effect.provide(getCredentialEffect("u1", "NOPE_KEY"), vault.layer)
    );
    expect(Exit.isFailure(exit)).toBe(true);
    const failure = Exit.isFailure(exit) ? exit.cause.reasons[0] : undefined;
    expect(failure).toMatchObject({ error: expect.any(NotFoundError) });
  });

  it("validates names and trims secrets on put, then deletes", async () => {
    const vault = fakeVault();
    await expect(
      run(
        putCredentialEffect({ userId: "u1", name: "lower", secret: "x" }),
        vault
      )
    ).rejects.toMatchObject({ code: "invalid" });
    await run(
      putCredentialEffect({ userId: "u1", name: "NEW_KEY", secret: "  v  " }),
      vault
    );
    expect(vault.secrets.get("u1")?.get("NEW_KEY")).toBe("v");
    await run(deleteCredentialEffect("u1", "NEW_KEY"), vault);
    expect(await run(hasCredentialEffect("u1", "NEW_KEY"), vault)).toBe(false);
  });

  it("accepts any alternate Layer, no module patching", async () => {
    const stub = Layer.succeed(
      Vault,
      Vault.of({
        list: () => Effect.succeed([]),
        has: () => Effect.succeed(true),
        get: (_userId, name) => Effect.succeed(`secret-for-${name}`),
        put: () => Effect.die("unused"),
        delete: () => Effect.void,
      })
    );
    const value = await Effect.runPromise(
      Effect.provide(getCredentialEffect("u1", "ANY_KEY"), stub)
    );
    expect(value).toBe("secret-for-ANY_KEY");
  });
});
