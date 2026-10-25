import { createHmac, hkdfSync } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import { stampedCapVersion } from "../../../caps/breach-caps";
import { CREDENTIAL_REUSE_LABEL } from "../../../infra/credential-fingerprint";
import { masterKeyBytes } from "../../../infra/vault-crypto";
import { breachCredentialContext } from "../collect";

const MASTER = "0123456789abcdef0123456789abcdef";

vi.mock("@watchdog/env/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@watchdog/env/server")>();
  return {
    ...actual,
    env: new Proxy(actual.env, {
      get: (target, prop, receiver) =>
        prop === "WD_MASTER_VAULT_KEY"
          ? MASTER
          : Reflect.get(target, prop, receiver),
    }),
  };
});

describe("the breach credential part of a Cap context", () => {
  it("hands a Cap the mode and one function, and nothing that holds the key", () => {
    const ctx = breachCredentialContext(
      stampedCapVersion("breach.dehashed.lookup", "full")
    );
    expect(Object.keys(ctx).sort()).toEqual([
      "breachCredentialMode",
      "credentialFingerprint",
    ]);
    expect(ctx.breachCredentialMode).toBe("full");
    expect(typeof ctx.credentialFingerprint).toBe("function");
    // The function carries no property a Cap could read the key from.
    expect(Object.keys(ctx.credentialFingerprint)).toEqual([]);

    const key = Buffer.from(
      hkdfSync(
        "sha256",
        masterKeyBytes(MASTER),
        Buffer.alloc(0),
        Buffer.from(CREDENTIAL_REUSE_LABEL, "utf-8"),
        32
      )
    );
    // The function's answer is not the key, and is not derived from anything but the key.
    const answer = ctx.credentialFingerprint("hunter2", "plaintext");
    expect(answer).not.toContain(key.toString("hex"));
    expect(JSON.stringify(ctx)).not.toContain(key.toString("hex"));
    expect(answer).toBe(
      createHmac("sha256", key).update("plaintext\0hunter2").digest("hex")
    );
  });

  it("follows the version the Job was stamped with, and reads an unmarked one as safe", () => {
    expect(
      breachCredentialContext(
        stampedCapVersion("breach.snusbase.lookup", "safe")
      ).breachCredentialMode
    ).toBe("safe");
    expect(breachCredentialContext("abc123").breachCredentialMode).toBe("safe");
  });
});
