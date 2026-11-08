import { describe, expect, it } from "@effect/vitest";
import { Effect, Result } from "effect";
import type { HttpClient } from "effect/http";
import { vi } from "vitest";
import { z } from "zod";

import {
  HttpVendorError,
  ParseVendorError,
  RateLimitedError,
  UnexpectedToolError,
  ValidationVendorError,
} from "../../errors/tagged-errors";
import {
  bool,
  child,
  defineJsonProvider,
  num,
  pick,
  str,
  type KeyPlacement,
} from "../define-json-provider";
import { toolsHttpClientLayer } from "../http-client-layer";

const schema = z.object({
  id: z.string(),
  queriedAt: z.string(),
  found: z.boolean(),
  score: z.number().nullable(),
});
const options = { userAgent: "watchdog-test" };

function provider(key: KeyPlacement) {
  return defineJsonProvider({
    service: "Example",
    schema,
    key,
    normalize: (raw) => raw.trim().toLowerCase(),
    request: (id, _options: typeof options) => ({
      url: `https://example.com/api/${id}`,
    }),
    notFound: ({ subject, queriedAt }) => ({
      id: subject,
      queriedAt,
      found: false,
      score: null,
    }),
    toSnapshot: ({ subject, queriedAt, body }) => ({
      id: subject,
      queriedAt,
      found: true,
      score: pick(body, { score: num() }).score,
    }),
  });
}

function stubFetch(response: () => Response) {
  const fetch = vi.fn().mockImplementation(() => Promise.resolve(response()));
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

function sent(fetch: ReturnType<typeof stubFetch>) {
  const [url, init] = fetch.mock.calls[0] as [unknown, RequestInit | undefined];
  return {
    url: String(url),
    headers: new Headers(init?.headers),
    method: init?.method,
    body:
      init?.body instanceof Uint8Array
        ? new TextDecoder().decode(init.body)
        : ((init?.body as string | undefined) ?? ""),
  };
}

const provided = <A, E>(effect: Effect.Effect<A, E, HttpClient.HttpClient>) =>
  effect.pipe(
    Effect.provide(toolsHttpClientLayer),
    Effect.ensuring(Effect.sync(() => vi.unstubAllGlobals()))
  );

describe("defineJsonProvider key placement", () => {
  it.effect("sends a header key with Accept and the caller's User-Agent", () =>
    Effect.gen(function* headerKeyGen() {
      const fetch = stubFetch(
        () => new Response(JSON.stringify({ score: 7 }), { status: 200 })
      );
      const snap = yield* provider({ header: "X-Key" })(
        " ABC ",
        "secret",
        AbortSignal.timeout(5000),
        options
      );
      const request = sent(fetch);
      expect(request.url).toBe("https://example.com/api/abc");
      expect(request.headers.get("x-key")).toBe("secret");
      expect(request.headers.get("accept")).toBe("application/json");
      expect(request.headers.get("user-agent")).toBe("watchdog-test");
      expect(snap).toMatchObject({ id: "abc", found: true, score: 7 });
    }).pipe(provided)
  );

  it.effect("sends a query key in the URL and no key header", () =>
    Effect.gen(function* queryKeyGen() {
      const fetch = stubFetch(() => new Response("{}", { status: 200 }));
      yield* provider({ query: "apikey" })(
        "abc",
        "s3 cret",
        AbortSignal.timeout(5000),
        options
      );
      expect(sent(fetch).url).toBe(
        "https://example.com/api/abc?apikey=s3+cret"
      );
    }).pipe(provided)
  );

  it.effect("sends Bearer and Basic keys as Authorization", () =>
    Effect.gen(function* authorizationGen() {
      const bearer = stubFetch(() => new Response("{}", { status: 200 }));
      yield* provider("bearer")("a", "tok", AbortSignal.timeout(5000), options);
      expect(sent(bearer).headers.get("authorization")).toBe("Bearer tok");

      const basic = stubFetch(() => new Response("{}", { status: 200 }));
      yield* provider("basic")(
        "a",
        "user:pass",
        AbortSignal.timeout(5000),
        options
      );
      expect(sent(basic).headers.get("authorization")).toBe(
        `Basic ${Buffer.from("user:pass").toString("base64")}`
      );
    }).pipe(provided)
  );

  it.effect(
    "sends no key for a blank key, and none for a keyless provider",
    () =>
      Effect.gen(function* blankKeyGen() {
        const blank = stubFetch(() => new Response("{}", { status: 200 }));
        yield* provider({ header: "X-Key" })(
          "a",
          "  ",
          AbortSignal.timeout(5000),
          options
        );
        expect(sent(blank).headers.has("x-key")).toBe(false);

        const keyless = defineJsonProvider({
          service: "Example",
          schema,
          normalize: (raw) => raw,
          request: (id, _options: typeof options) => ({
            url: `https://example.com/${id}`,
          }),
          toSnapshot: ({ subject, queriedAt }) => ({
            id: subject,
            queriedAt,
            found: true,
            score: null,
          }),
        });
        const open = stubFetch(() => new Response("{}", { status: 200 }));
        const snap = yield* keyless("a", AbortSignal.timeout(5000), options);
        expect(snap.found).toBe(true);
        expect(sent(open).url).toBe("https://example.com/a");
      }).pipe(provided)
  );

  it.effect("sends a POST body with the request's own headers", () =>
    Effect.gen(function* postGen() {
      const fetch = stubFetch(() => new Response("{}", { status: 200 }));
      const post = defineJsonProvider({
        service: "Example",
        schema,
        key: { header: "Auth-Key" },
        normalize: (raw) => raw,
        request: (id, _options: typeof options) => ({
          url: "https://example.com/search",
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id }),
        }),
        toSnapshot: ({ subject, queriedAt }) => ({
          id: subject,
          queriedAt,
          found: true,
          score: null,
        }),
      });
      yield* post("q", "k", AbortSignal.timeout(5000), options);
      const request = sent(fetch);
      expect(request.method).toBe("POST");
      expect(request.headers.get("content-type")).toBe("application/json");
      expect(request.headers.get("auth-key")).toBe("k");
      expect(JSON.parse(request.body)).toEqual({ id: "q" });
    }).pipe(provided)
  );
});

describe("defineJsonProvider statuses", () => {
  it.effect("maps 404 to the declared not-found snapshot by default", () =>
    Effect.gen(function* notFoundGen() {
      stubFetch(() => new Response(null, { status: 404 }));
      const snap = yield* provider({ header: "k" })(
        "abc",
        "k",
        AbortSignal.timeout(5000),
        options
      );
      expect(snap).toMatchObject({ id: "abc", found: false, score: null });
    }).pipe(provided)
  );

  it.effect("fails a 404 as an HTTP error when no notFound is declared", () =>
    Effect.gen(function* noNotFoundGen() {
      stubFetch(() => new Response(null, { status: 404 }));
      const strict = defineJsonProvider({
        service: "Example",
        schema,
        normalize: (raw) => raw,
        request: (id, _options: typeof options) => ({
          url: `https://example.com/${id}`,
        }),
        toSnapshot: () => ({ id: "x", queriedAt: "t", found: true, score: 1 }),
      });
      const outcome = yield* Effect.result(
        strict("a", AbortSignal.timeout(5000), options)
      );
      expect(Result.isFailure(outcome)).toBe(true);
      if (Result.isFailure(outcome)) {
        expect(outcome.failure).toBeInstanceOf(HttpVendorError);
      }
    }).pipe(provided)
  );

  it.effect("treats only the declared statuses as not found", () =>
    Effect.gen(function* overrideGen() {
      const forbidden = defineJsonProvider({
        service: "Example",
        schema,
        normalize: (raw) => raw,
        request: (id, _options: typeof options) => ({
          url: `https://example.com/${id}`,
        }),
        notFoundStatuses: [403],
        notFound: ({ subject, queriedAt }) => ({
          id: subject,
          queriedAt,
          found: false,
          score: null,
        }),
        toSnapshot: () => ({ id: "x", queriedAt: "t", found: true, score: 1 }),
      });

      stubFetch(() => new Response(null, { status: 403 }));
      const miss = yield* forbidden("a", AbortSignal.timeout(5000), options);
      expect(miss.found).toBe(false);

      stubFetch(() => new Response(null, { status: 404 }));
      const outcome = yield* Effect.result(
        forbidden("a", AbortSignal.timeout(5000), options)
      );
      expect(Result.isFailure(outcome)).toBe(true);
    }).pipe(provided)
  );

  it.effect("keeps fetch-json's 429 policy and non-object body failure", () =>
    Effect.gen(function* policyGen() {
      const fetch = stubFetch(
        () =>
          new Response(null, { status: 429, headers: { "retry-after": "60" } })
      );
      const limited = yield* Effect.result(
        provider({ header: "k" })("a", "k", AbortSignal.timeout(5000), options)
      );
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(Result.isFailure(limited)).toBe(true);
      if (Result.isFailure(limited)) {
        expect(limited.failure).toBeInstanceOf(RateLimitedError);
      }

      stubFetch(() => new Response("[1]", { status: 200 }));
      const array = yield* Effect.result(
        provider({ header: "k" })("a", "k", AbortSignal.timeout(5000), options)
      );
      expect(Result.isFailure(array)).toBe(true);
      if (Result.isFailure(array)) {
        expect(array.failure).toBeInstanceOf(ParseVendorError);
      }
    }).pipe(provided)
  );
});

describe("defineJsonProvider failures", () => {
  it.effect("fails with the tools error a normalizer or mapping throws", () =>
    Effect.gen(function* throwsGen() {
      const fetch = stubFetch(() => new Response("{}", { status: 200 }));
      const picky = defineJsonProvider({
        service: "Example",
        schema,
        normalize: (raw) => {
          if (raw === "") throw new ValidationVendorError({ message: "empty" });
          return raw;
        },
        request: (id, _options: typeof options) => ({
          url: `https://example.com/${id}`,
        }),
        toSnapshot: () => {
          throw new ValidationVendorError({ message: "bad body" });
        },
      });
      const badSubject = yield* Effect.result(
        picky("", AbortSignal.timeout(5000), options)
      );
      expect(Result.isFailure(badSubject)).toBe(true);
      expect(fetch).not.toHaveBeenCalled();

      const badBody = yield* Effect.result(
        picky("a", AbortSignal.timeout(5000), options)
      );
      expect(Result.isFailure(badBody)).toBe(true);
      if (Result.isFailure(badBody)) {
        expect(badBody.failure).toBeInstanceOf(ValidationVendorError);
      }
    }).pipe(provided)
  );
});

describe("defineJsonProvider throws map to tools errors", () => {
  const base = {
    service: "Example",
    schema,
    normalize: (raw: string) => raw,
    request: (id: string, _options: typeof options) => ({
      url: `https://example.com/${id}`,
    }),
    toSnapshot: ({
      subject,
      queriedAt,
    }: {
      subject: string;
      queriedAt: string;
    }) => ({
      id: subject,
      queriedAt,
      found: true,
      score: null,
    }),
  };

  it.effect("maps a throwing request, bad URL, toSnapshot and notFound", () =>
    Effect.gen(function* mappedGen() {
      const fetch = stubFetch(() => new Response(null, { status: 404 }));
      const failure = (
        effect: Effect.Effect<unknown, unknown, HttpClient.HttpClient>
      ) => Effect.result(effect);
      const badRequest = defineJsonProvider({
        ...base,
        request: () => {
          throw new Error("boom");
        },
      });
      const badUrl = defineJsonProvider({
        ...base,
        key: { query: "k" },
        request: () => ({ url: "not a url" }),
      });
      const badMap = defineJsonProvider({
        ...base,
        toSnapshot: () => {
          throw new Error("boom");
        },
      });
      const badNotFound = defineJsonProvider({
        ...base,
        notFound: () => {
          throw new Error("boom");
        },
      });
      const signal = AbortSignal.timeout(5000);
      const outcomes = [
        yield* failure(badRequest("a", signal, options)),
        yield* failure(badUrl("a", "k", signal, options)),
        yield* failure(badNotFound("a", signal, options)),
      ];
      stubFetch(() => new Response("{}", { status: 200 }));
      outcomes.push(yield* failure(badMap("a", signal, options)));
      for (const outcome of outcomes) {
        expect(Result.isFailure(outcome)).toBe(true);
        if (Result.isFailure(outcome)) {
          expect(outcome.failure).toBeInstanceOf(UnexpectedToolError);
        }
      }
      expect(fetch).toHaveBeenCalledTimes(1);
    }).pipe(provided)
  );
});

describe("field coercion", () => {
  it("reads declared fields strictly, by body key, and nulls the rest", () => {
    const body = {
      isp: "Acme",
      as_owner: "AS1",
      empty: "",
      count: 3,
      countStr: "3",
      flag: false,
    };
    expect(
      pick(body, {
        isp: str(),
        asOwner: str("as_owner"),
        empty: str(),
        count: num(),
        countStr: num(),
        flag: bool(),
        missing: bool(),
      })
    ).toEqual({
      isp: "Acme",
      asOwner: "AS1",
      empty: "",
      count: 3,
      countStr: null,
      flag: false,
      missing: null,
    });
  });

  it("digs into nested objects, treating non-objects as empty", () => {
    expect(child({ a: { b: 1 } }, "a")).toEqual({ b: 1 });
    expect(child({ a: [1] }, "a")).toEqual({});
    expect(child({ a: null }, "a")).toEqual({});
    expect(child("x", "a")).toEqual({});
    expect(child(undefined, "a")).toEqual({});
  });
});
