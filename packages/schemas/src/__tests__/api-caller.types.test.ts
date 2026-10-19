import { describe, expectTypeOf, it } from "vitest";

import type { ApiActor, ApiCaller, ApiCredential } from "../api-caller";
import type { Scope } from "../api-scopes";

describe("ApiCredential", () => {
  it("gives a session no key id and a key one", () => {
    expectTypeOf<Extract<ApiCredential, { kind: "session" }>>().toEqualTypeOf<{
      kind: "session";
    }>();
    expectTypeOf<
      Extract<ApiCredential, { kind: "session" }>
    >().not.toHaveProperty("keyId");
    expectTypeOf<
      Extract<ApiCredential, { kind: "apiKey" }>["keyId"]
    >().toEqualTypeOf<string>();
  });

  it("gives a key its scopes and a session none", () => {
    expectTypeOf<
      Extract<ApiCredential, { kind: "apiKey" }>["scopes"]
    >().toEqualTypeOf<ReadonlySet<Scope>>();
    expectTypeOf<
      Extract<ApiCredential, { kind: "session" }>
    >().not.toHaveProperty("scopes");
  });

  it("narrows to a key id on the kind tag", () => {
    const keyIdOf = (credential: ApiCredential): string | null =>
      credential.kind === "apiKey" ? credential.keyId : null;
    expectTypeOf(keyIdOf).returns.toEqualTypeOf<string | null>();
  });
});

describe("ApiCaller", () => {
  it("pairs an actor with its credential and an anonymous caller with none", () => {
    expectTypeOf<
      Extract<ApiCaller, { actor: ApiActor }>["credential"]
    >().toEqualTypeOf<ApiCredential>();
    expectTypeOf<
      Extract<ApiCaller, { actor: null }>["credential"]
    >().toEqualTypeOf<undefined>();
  });
});
