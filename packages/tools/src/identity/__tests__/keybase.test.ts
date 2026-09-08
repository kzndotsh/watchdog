import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { vi } from "vitest";

import { toolsHttpClientLayer } from "../../http/http-client-layer";
import { fetchKeybaseLookupEffect, parseKeybaseBody } from "../keybase";

describe("keybase", () => {
  it("parseKeybaseBody treats empty them rows as not found", () => {
    const snap = parseKeybaseBody(
      "nobody",
      "username",
      "2026-01-01T00:00:00.000Z",
      {
        status: { code: 0 },
        them: [{ basics: {}, profile: {} }],
      }
    );
    expect(snap.found).toBe(false);
    expect(snap.username).toBeNull();
  });

  it("parseKeybaseBody keeps substantive profiles as found", () => {
    const snap = parseKeybaseBody(
      "ada",
      "username",
      "2026-01-01T00:00:00.000Z",
      {
        status: { code: 0 },
        them: [
          {
            basics: { username: "ada" },
            profile: { full_name: "Ada Lovelace" },
          },
        ],
      }
    );
    expect(snap.found).toBe(true);
    expect(snap.username).toBe("ada");
    expect(snap.fullName).toBe("Ada Lovelace");
  });

  it.effect("fetchKeybaseLookupEffect accepts single-character usernames", () =>
    Effect.gen(function* singleCharUsernameGen() {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(
          new Response(JSON.stringify({ status: { code: 0 }, them: [] }), {
            status: 200,
          })
        )
      );

      const snap = yield* fetchKeybaseLookupEffect(
        "a",
        AbortSignal.timeout(5000)
      );

      expect(snap.query).toBe("a");
      expect(snap.found).toBe(false);
    }).pipe(
      Effect.provide(toolsHttpClientLayer),
      Effect.ensuring(Effect.sync(() => vi.unstubAllGlobals()))
    )
  );
});
