import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { vi } from "vitest";

import {
  RateLimitedError,
  ValidationVendorError,
} from "../../errors/tagged-errors";
import { toolsHttpClientLayer } from "../../http/http-client-layer";
import {
  EMAILOSINT_MAX_ACCOUNTS,
  fetchEmailosintLookupEffect,
  parseEmailosintBody,
} from "../emailosint";

const EMAIL = "alex.morgan@mailhost.test";
const AT = "2026-01-01T00:00:00.000Z";
const options = { userAgent: "watchdog-test" };
const signal = () => AbortSignal.timeout(5000);

const fixture = JSON.parse(
  readFileSync(
    path.join(
      import.meta.dirname,
      "..",
      "__fixtures__",
      "emailosint-lookup.json"
    ),
    "utf-8"
  )
) as unknown;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("parseEmailosintBody", () => {
  it("keeps the allowlisted account, site, breach and stealer fields", () => {
    const snap = parseEmailosintBody(EMAIL, AT, fixture);
    expect(snap.lookupId).toBe("65fa0b1c2c4a8e0d1c8b2a3f");
    expect(snap.completed).toBe(true);
    expect(snap.timedOut).toBe(false);
    expect(snap.accounts).toEqual([
      {
        service: "github",
        serviceName: "GitHub",
        domain: "github.com",
        category: "Developer",
        username: "alex",
        displayName: "Alex Morgan",
        profileUrl: "https://github.com/alex",
      },
      {
        service: "spotify",
        serviceName: "Spotify",
        domain: null,
        category: null,
        username: null,
        displayName: null,
        profileUrl: null,
      },
    ]);
    expect(snap.registeredOn).toEqual(["GitHub", "Adobe"]);
    expect(snap.notRegisteredCount).toBe(2);
    expect(snap.breachTotal).toBe(6);
    expect(snap.breachSourceCount).toBe(3);
    expect(snap.breachSources).toEqual([
      { name: "Adobe", date: "2013-10-04" },
      { name: "Canva", date: null },
    ]);
    expect(snap.stealerLogCount).toBe(2);
    expect(snap.stealerOriginHosts).toEqual(["login.shop.test"]);
    expect(snap.isTruncated).toBe(false);
  });

  it("never copies a credential, phone, IP or AI text", () => {
    const stored = JSON.stringify(parseEmailosintBody(EMAIL, AT, fixture));
    for (const secret of [
      "hunter2",
      "5f4dcc3b5aa765d61d8327deb882cf99",
      "alexm",
      "192.0.2.10",
      "+15550100",
      "session=abc",
      "medium exposure",
    ]) {
      expect(stored).not.toContain(secret);
    }
  });

  it("cuts long account lists and flags the cut", () => {
    const row = { module: { id: "x" }, data: { fields: [] } };
    const snap = parseEmailosintBody(EMAIL, AT, {
      accounts: Array.from({ length: EMAILOSINT_MAX_ACCOUNTS + 5 }, () => row),
    });
    expect(snap.accounts).toHaveLength(EMAILOSINT_MAX_ACCOUNTS);
    expect(snap.isTruncated).toBe(true);
  });

  it("reads an empty body as no findings", () => {
    const snap = parseEmailosintBody(EMAIL, AT, {});
    expect(snap.accounts).toEqual([]);
    expect(snap.breachTotal).toBeNull();
    expect(snap.stealerLogCount).toBeNull();
    expect(snap.completed).toBe(false);
  });
});

describe("fetchEmailosintLookupEffect", () => {
  it.effect("posts the email with a bearer key and no AI summary", () =>
    Effect.gen(function* postsLookupGen() {
      const fetchMock = vi
        .fn<
          (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
        >()
        .mockResolvedValue(jsonResponse(fixture));
      vi.stubGlobal("fetch", fetchMock);
      const snap = yield* fetchEmailosintLookupEffect(
        " Alex.Morgan@MailHost.test ",
        "eo_test",
        signal(),
        options
      );
      expect(snap.email).toBe(EMAIL);
      const [input, init] = fetchMock.mock.calls[0] ?? [];
      const url = input instanceof Request ? input.url : input;
      expect(url === undefined ? undefined : new URL(url).href).toBe(
        "https://api.emailosint.org/v1/lookup/email"
      );
      expect(init?.method).toBe("POST");
      expect(new Headers(init?.headers).get("authorization")).toBe(
        "Bearer eo_test"
      );
      const sent: unknown = yield* Effect.promise(() =>
        new Response(init?.body).json()
      );
      expect(sent).toEqual({
        email: EMAIL,
        module_timeout_ms: 15_000,
        disable_ai_summary: true,
      });
    }).pipe(
      Effect.provide(toolsHttpClientLayer),
      Effect.ensuring(Effect.sync(() => vi.unstubAllGlobals()))
    )
  );

  it.effect("rejects an invalid email before any request", () =>
    Effect.gen(function* invalidEmailGen() {
      const fetchMock = vi.fn();
      vi.stubGlobal("fetch", fetchMock);
      const failure = yield* fetchEmailosintLookupEffect(
        "not-an-email",
        "eo_test",
        signal(),
        options
      ).pipe(Effect.flip);
      expect(failure).toBeInstanceOf(ValidationVendorError);
      expect(fetchMock).not.toHaveBeenCalled();
    }).pipe(
      Effect.provide(toolsHttpClientLayer),
      Effect.ensuring(Effect.sync(() => vi.unstubAllGlobals()))
    )
  );

  for (const [status, message] of [
    [401, "EmailOSINT API key invalid"],
    [402, "EmailOSINT API access needs a Business plan or higher"],
  ] as const) {
    it.effect(
      `HTTP ${status} is a fixed message with the status, not the email, in the cause`,
      () =>
        Effect.gen(function* refusedGen() {
          vi.stubGlobal(
            "fetch",
            vi
              .fn()
              .mockResolvedValue(
                jsonResponse({ error: "x", message: `bad ${EMAIL}` }, status)
              )
          );
          const failure = yield* fetchEmailosintLookupEffect(
            EMAIL,
            "eo_test",
            signal(),
            options
          ).pipe(Effect.flip);
          expect(failure).toBeInstanceOf(ValidationVendorError);
          expect(failure.message).toBe(message);
          expect(String(failure.cause)).toContain(String(status));
          expect(String(failure.cause)).not.toContain(EMAIL);
        }).pipe(
          Effect.provide(toolsHttpClientLayer),
          Effect.ensuring(Effect.sync(() => vi.unstubAllGlobals()))
        )
    );
  }

  it.effect("a quota 429 past the wait cap fails as RateLimitedError", () =>
    Effect.gen(function* quotaGen() {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockImplementation(() =>
          Promise.resolve(
            new Response(JSON.stringify({ error: "plan_quota_reached" }), {
              status: 429,
              headers: { "retry-after": "3600" },
            })
          )
        )
      );
      const failure = yield* fetchEmailosintLookupEffect(
        EMAIL,
        "eo_test",
        signal(),
        options
      ).pipe(Effect.flip);
      expect(failure).toBeInstanceOf(RateLimitedError);
    }).pipe(
      Effect.provide(toolsHttpClientLayer),
      Effect.ensuring(Effect.sync(() => vi.unstubAllGlobals()))
    )
  );
});
