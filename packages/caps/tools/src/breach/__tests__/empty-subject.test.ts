import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { vi } from "vitest";

import { toolsHttpClientLayer } from "../../http/http-client-layer";
import { fetchRdapWhoisEffect } from "../../whois/rdap";
import { fetchWhoisXmlEffect } from "../../whois/whoisxml";
import { fetchDehashedLookupEffect } from "../dehashed";
import { fetchSnusbaseLookupEffect } from "../snusbase";
import { FULL } from "./credential-fixtures";

const options = { userAgent: "watchdog-test", credentials: FULL };
const signal = () => AbortSignal.timeout(5000);

describe("an empty subject", () => {
  it.effect("fails before any request", () =>
    Effect.gen(function* emptySubjectGen() {
      const fetchMock = vi.fn();
      vi.stubGlobal("fetch", fetchMock);
      const tag = <A, R>(call: Effect.Effect<A, { _tag: string }, R>) =>
        call.pipe(
          Effect.flip,
          Effect.map((error) => error._tag)
        );
      const tags = yield* Effect.all([
        tag(fetchDehashedLookupEffect("  ", "k", signal(), options)),
        tag(fetchSnusbaseLookupEffect("  ", "k", signal(), options)),
        tag(fetchRdapWhoisEffect("  ", signal(), options)),
        tag(fetchWhoisXmlEffect("  ", "k", signal(), options)),
      ]);
      expect(tags).toEqual(
        Array.from({ length: 4 }, () => "ValidationVendorError")
      );
      expect(fetchMock).not.toHaveBeenCalled();
    }).pipe(
      Effect.provide(toolsHttpClientLayer),
      Effect.ensuring(Effect.sync(() => vi.unstubAllGlobals()))
    )
  );
});
