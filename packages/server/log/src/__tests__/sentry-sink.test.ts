import { describe, expect, it, vi } from "vitest";

import type { ErrorReport } from "../error-report.ts";
import { createSentrySink, parseDsn } from "../sentry-sink.ts";

const report: ErrorReport = {
  name: "TypeError",
  message: "x is not a function",
  stack:
    "TypeError: x\n    at run (/app/a.js:10:5)\n    at main (/app/b.js:2:1)",
  level: "error",
  service: "watchdog-web",
  release: "1.0.0",
  environment: "production",
  context: { path: "/api/v1/cases" },
  timestamp: 1_700_000_000_000,
};

describe("parseDsn", () => {
  it("builds the envelope URL for Sentry, self-hosted and path-prefixed DSNs", () => {
    expect(parseDsn("https://pub@o1.ingest.example.test/42")).toEqual({
      envelopeUrl: "https://o1.ingest.example.test/api/42/envelope/",
      publicKey: "pub",
    });
    expect(parseDsn("http://k@glitchtip.lan:8000/sub/3")?.envelopeUrl).toBe(
      "http://glitchtip.lan:8000/sub/api/3/envelope/"
    );
  });

  it("rejects what is not a DSN", () => {
    expect(parseDsn("not a url")).toBeNull();
    expect(parseDsn("https://host.example.test/1")).toBeNull();
    expect(parseDsn("ftp://k@host.example.test/1")).toBeNull();
    expect(parseDsn("https://k@host.example.test")).toBeNull();
  });

  it("returns null, never throws, for a malformed percent-escape in the key", () => {
    expect(() => parseDsn("https://%zz@host.example.test/1")).not.toThrow();
    expect(parseDsn("https://%zz@host.example.test/1")).toBeNull();
    expect(
      createSentrySink({ dsn: "https://%zz@host.example.test/1" })
    ).toBeNull();
  });
});

describe("createSentrySink", () => {
  it("is null for an unusable DSN, so reporting stays off", () => {
    expect(createSentrySink({ dsn: "nonsense" })).toBeNull();
  });

  it("posts one envelope with the key, release and parsed frames", async () => {
    const calls: { url: string; init: RequestInit; body: string }[] = [];
    const fake = vi.fn(
      async (url: string | URL | Request, init?: RequestInit) => {
        calls.push({
          url: url instanceof Request ? url.url : url.toString(),
          init: init ?? {},
          body: typeof init?.body === "string" ? init.body : "",
        });
        return new Response(null, { status: 200 });
      }
    );
    const sink = createSentrySink({
      dsn: "https://pub@errors.example.test/7",
      fetch: fake,
    });

    await sink?.send(report);

    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe("https://errors.example.test/api/7/envelope/");
    const headers = calls[0]?.init.headers as Record<string, string>;
    expect(headers["x-sentry-auth"]).toContain("sentry_key=pub");
    const lines = (calls[0]?.body ?? "").split("\n");
    expect(lines).toHaveLength(3);
    const event = JSON.parse(lines[2] ?? "{}");
    expect(event).toMatchObject({
      level: "error",
      release: "1.0.0",
      environment: "production",
      exception: {
        values: [{ type: "TypeError", value: "x is not a function" }],
      },
      extra: { path: "/api/v1/cases" },
    });
    // oldest frame first
    expect(event.exception.values[0].stacktrace.frames[0]).toMatchObject({
      function: "main",
      filename: "/app/b.js",
      lineno: 2,
    });
  });
});

describe("stack frames", () => {
  async function framesFor(stack: string): Promise<unknown[] | undefined> {
    let body = "";
    const sink = createSentrySink({
      dsn: "https://pub@errors.example.test/7",
      fetch: vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
        body = typeof init?.body === "string" ? init.body : "";
        return new Response(null, { status: 200 });
      }),
    });
    await sink?.send({ ...report, stack });
    const event = JSON.parse(body.split("\n")[2] ?? "{}");
    return event.exception.values[0].stacktrace?.frames;
  }

  it("parses named, anonymous and URL frames and skips the rest", async () => {
    const frames = await framesFor(
      [
        "Error: boom",
        "    at https://app.example.test/assets/a-1.js:3:14",
        "    at Object.run [as go] (https://app.example.test/assets/b.js:7:2)",
        "    at not a frame",
      ].join("\n")
    );
    expect(frames).toEqual([
      {
        function: "Object.run [as go]",
        filename: "https://app.example.test/assets/b.js",
        lineno: 7,
        colno: 2,
      },
      {
        function: "<anonymous>",
        filename: "https://app.example.test/assets/a-1.js",
        lineno: 3,
        colno: 14,
      },
    ]);
  });

  it("stays fast on a hostile stack (a browser can send one)", async () => {
    const hostile = `at ${"  ".repeat(200_000)}x`;
    const lines = Array.from(
      { length: 5000 },
      () => `    at f (${"a:".repeat(300)}1:1)`
    );
    const started = performance.now();
    await framesFor(`${hostile}\n${lines.join("\n")}`);
    expect(performance.now() - started).toBeLessThan(1000);
  });

  it("keeps at most 100 frames", async () => {
    const stack = Array.from(
      { length: 500 },
      (_, i) => `    at f${i} (/a.js:${i + 1}:1)`
    ).join("\n");
    expect(await framesFor(stack)).toHaveLength(100);
  });
});
