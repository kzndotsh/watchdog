import { Effect } from "effect";
import { describe, expect, it } from "vitest";

import {
  MissingCredentialError,
  ValidationVendorError,
} from "@watchdog/tools/errors";

import { getCredentialEffect } from "../../../infra/vault";
import { fakeVault } from "../../../infra/vault-fake";
import { vaultToTools } from "../collect";

const lookup = (name: string, secret?: string) => {
  const vault = fakeVault({
    u1: secret === undefined ? {} : { [name]: secret },
  });
  return getCredentialEffect("u1", name).pipe(
    Effect.mapError(vaultToTools(name)),
    Effect.provide(vault.layer),
    Effect.flip
  );
};

describe("vaultToTools", () => {
  it("fails an unset slot as the Cap-level missing credential, naming the slot", async () => {
    const error = await Effect.runPromise(lookup("ABUSEIPDB_API_KEY"));
    expect(error).toBeInstanceOf(MissingCredentialError);
    expect(error).toMatchObject({ slot: "ABUSEIPDB_API_KEY" });
  });

  it("fails a malformed slot name as validation, not as a missing key", async () => {
    const error = await Effect.runPromise(lookup("not a slot"));
    expect(error).toBeInstanceOf(ValidationVendorError);
  });
});
