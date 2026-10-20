import { describe, expect, it, vi } from "vitest";

import {
  createRequestLogMiddleware,
  type RequestLogFields,
} from "../request-log.server.ts";

type Logged = { fields: RequestLogFields; level: string };

async function run(
  url: string,
  init: RequestInit,
  respond: () => Response
): Promise<Logged[]> {
  const logged: Logged[] = [];
  const middleware = createRequestLogMiddleware((fields, level) => {
    logged.push({ fields, level });
  });
  await middleware(new Request(url, init), async () => respond());
  return logged;
}

describe("request log middleware", () => {
  it("logs one event with method, path, status and duration, and nothing else", async () => {
    const logged = await run(
      "http://app.test/cases/abc?token=secret-token&q=1",
      {
        method: "POST",
        headers: {
          cookie: "session=secret-cookie",
          authorization: "Bearer secret-bearer",
          "x-request-id": "req-123",
        },
        body: "secret-body",
      },
      () => new Response("ok", { status: 201 })
    );

    expect(logged).toHaveLength(1);
    const [{ fields, level }] = logged;
    expect(level).toBe("info");
    expect(fields).toEqual({
      method: "POST",
      path: "/cases/abc",
      status: 201,
      durationMs: expect.any(Number),
      requestId: "req-123",
    });
    const text = JSON.stringify(fields);
    for (const secret of [
      "secret-token",
      "secret-cookie",
      "secret-bearer",
      "secret-body",
      "?",
    ]) {
      expect(text).not.toContain(secret);
    }
  });

  it("leaves out an absent or unusable request id", async () => {
    const none = await run("http://app.test/", {}, () => new Response("ok"));
    expect(none[0]?.fields).not.toHaveProperty("requestId");
    const bad = await run(
      "http://app.test/",
      { headers: { "x-request-id": "a b;<script>" } },
      () => new Response("ok")
    );
    expect(bad[0]?.fields).not.toHaveProperty("requestId");
  });

  it("logs static files and health probes at debug, page requests at info", async () => {
    const asset = await run(
      "http://app.test/assets/app-1a2b.js",
      {},
      () => new Response("x")
    );
    const probe = await run(
      "http://app.test/api/v1/health",
      {},
      () => new Response("ok")
    );
    const page = await run(
      "http://app.test/dashboard",
      {},
      () => new Response("x")
    );
    expect(asset[0]?.level).toBe("debug");
    expect(probe[0]?.level).toBe("debug");
    expect(page[0]?.level).toBe("info");
  });

  it("skips paths the app already logs (API, server functions)", async () => {
    const api = await run(
      "http://app.test/api/v1/cases",
      {},
      () => new Response("x")
    );
    const fn = await run(
      "http://app.test/_serverFn/abc",
      {},
      () => new Response("x")
    );
    expect(api).toHaveLength(0);
    expect(fn).toHaveLength(0);
  });

  it("logs a failing handler as 500 and rethrows it", async () => {
    const emit = vi.fn();
    const middleware = createRequestLogMiddleware(emit);
    await expect(
      middleware(new Request("http://app.test/boom?x=1"), async () => {
        throw new Error("down");
      })
    ).rejects.toThrow("down");
    expect(emit).toHaveBeenCalledWith(
      expect.objectContaining({ path: "/boom", status: 500 }),
      "info"
    );
  });

  it("does not fail the response when the log write fails", async () => {
    const middleware = createRequestLogMiddleware(async () => {
      throw new Error("disk full");
    });
    const response = await middleware(
      new Request("http://app.test/"),
      async () => new Response("ok")
    );
    expect(response.status).toBe(200);
  });
});
