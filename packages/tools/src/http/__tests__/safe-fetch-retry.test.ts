import { createServer as createTlsServer } from "node:https";
import type { AddressInfo } from "node:net";

import { afterEach, describe, expect, it, vi } from "vitest";

import { BlockedTargetError } from "../../errors/tagged-errors";
import { createSafeFetch } from "../safe-fetch";
import {
  TEST_SERVER_ADDRESS,
  closePlain,
  harness,
  listenPlain,
  listenProtocol,
  testCert,
} from "./helpers/loopback-server";

vi.unmock("undici");

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  await Promise.all(cleanups.splice(0).map(async (cleanup) => cleanup()));
});

describe("safeFetch protocol negotiation", () => {
  it("speaks HTTP/2 to a server that offers it on the direct path", async () => {
    const seen: string[] = [];
    const server = await listenProtocol("h2", (req, res) => {
      seen.push(req.httpVersion);
      res.writeHead(200);
      res.end("hello");
    });
    cleanups.push(server.stop);
    const { fetch } = harness({ ca: server.ca });
    const res = await fetch(`${server.origin}/ok`);
    expect(await res.text()).toBe("hello");
    expect(seen).toEqual(["2.0"]);
  });

  it("falls back to HTTP/1.1 over TLS when the server does not offer h2", async () => {
    const { key, cert } = testCert();
    const seen: string[] = [];
    const server = createTlsServer({ key, cert }, (req, res) => {
      seen.push(req.httpVersion);
      res.end("hello");
    });
    // oxlint-disable-next-line promise/avoid-new -- wraps the callback listen API
    await new Promise<void>((resolve) => {
      server.listen(0, TEST_SERVER_ADDRESS, resolve);
    });
    cleanups.push(async () => {
      server.closeAllConnections();
      // oxlint-disable-next-line promise/avoid-new -- wraps the callback close API
      await new Promise<void>((resolve) => {
        server.close(() => {
          resolve();
        });
      });
    });
    const { port } = server.address() as AddressInfo;
    const { fetch } = harness({ ca: cert });
    const res = await fetch(`https://${TEST_SERVER_ADDRESS}:${port}/ok`);
    expect(await res.text()).toBe("hello");
    expect(seen).toEqual(["1.1"]);
  });
});

type Script = (attempt: number, req: { method?: string }) => Step;
type Step =
  | { readonly kind: "status"; readonly status: number }
  | { readonly kind: "reset" }
  | { readonly kind: "ok" };

async function scripted(script: Script) {
  let attempts = 0;
  const methods: (string | undefined)[] = [];
  const { server, port } = await listenPlain((req, res) => {
    attempts += 1;
    methods.push(req.method);
    const step = script(attempts, req);
    if (step.kind === "reset") {
      req.socket.destroy();
      return;
    }
    res.writeHead(step.kind === "ok" ? 200 : step.status);
    res.end(step.kind === "ok" ? "fine" : "");
  });
  cleanups.push(async () => closePlain(server));
  return {
    url: `http://${TEST_SERVER_ADDRESS}:${port}/x`,
    attempts: () => attempts,
    methods,
  };
}

describe("safeFetch retry", () => {
  it.each([502, 503, 504])(
    "retries an idempotent GET after a %s and returns the later answer",
    async (status) => {
      const target = await scripted((n) =>
        n < 3 ? { kind: "status", status } : { kind: "ok" }
      );
      const res = await harness().fetch(target.url);
      expect(res.status).toBe(200);
      expect(await res.text()).toBe("fine");
      expect(target.attempts()).toBe(3);
    }
  );

  it("retries after a connection reset", async () => {
    const target = await scripted((n) =>
      n === 1 ? { kind: "reset" } : { kind: "ok" }
    );
    const res = await harness().fetch(target.url);
    expect(res.status).toBe(200);
    expect(target.attempts()).toBe(2);
  });

  it.each(["HEAD", "OPTIONS"])("retries %s", async (method) => {
    const target = await scripted((n) =>
      n === 1 ? { kind: "status", status: 503 } : { kind: "ok" }
    );
    const res = await harness().fetch(target.url, { method });
    expect(res.status).toBe(200);
    expect(target.methods).toEqual([method, method]);
  });

  it("stops at the attempt limit and returns the last transient status", async () => {
    const target = await scripted(() => ({ kind: "status", status: 503 }));
    const res = await harness({
      retry: { maxAttempts: 3, baseDelayMs: 1 },
    }).fetch(target.url);
    expect(res.status).toBe(503);
    expect(target.attempts()).toBe(3);
  });

  it("stops at the attempt limit on repeated resets and fails", async () => {
    const target = await scripted(() => ({ kind: "reset" }));
    await expect(harness().fetch(target.url)).rejects.toBeDefined();
    expect(target.attempts()).toBe(3);
  });

  it("honours a policy of one attempt", async () => {
    const target = await scripted(() => ({ kind: "status", status: 503 }));
    const res = await harness({
      retry: { maxAttempts: 1, baseDelayMs: 1 },
    }).fetch(target.url);
    expect(res.status).toBe(503);
    expect(target.attempts()).toBe(1);
  });

  it.each(["POST", "PUT", "DELETE", "PATCH"])(
    "never retries %s",
    async (method) => {
      const target = await scripted(() => ({ kind: "status", status: 503 }));
      const res = await harness().fetch(target.url, { method });
      expect(res.status).toBe(503);
      expect(target.attempts()).toBe(1);
    }
  );

  it.each([400, 404, 429, 500, 501])("does not retry a %s", async (status) => {
    const target = await scripted(() => ({ kind: "status", status }));
    const res = await harness().fetch(target.url);
    expect(res.status).toBe(status);
    expect(target.attempts()).toBe(1);
  });

  it("retries over HTTP/2 too", async () => {
    let attempts = 0;
    const server = await listenProtocol("h2", (_req, res) => {
      attempts += 1;
      res.writeHead(attempts < 2 ? 503 : 200);
      res.end("fine");
    });
    cleanups.push(server.stop);
    const res = await harness({ ca: server.ca }).fetch(`${server.origin}/x`);
    expect(res.status).toBe(200);
    expect(attempts).toBe(2);
  });
});

describe("safeFetch never retries a refusal", () => {
  it("does not retry a literal blocked address (no connection is made)", async () => {
    const { fetch, lookups } = harness();
    await expect(fetch("http://10.0.0.5/")).rejects.toBeInstanceOf(
      BlockedTargetError
    );
    expect(lookups).toEqual([]);
  });

  it("resolves a name that maps to a blocked address once and opens no socket", async () => {
    const { fetch, lookups } = harness();
    await expect(fetch("http://internal.test/")).rejects.toMatchObject({
      code: "blocked_target",
      reason: "resolved",
    });
    expect(lookups).toEqual(["internal.test"]);
  });

  it("does not retry after the byte cap refused a response", async () => {
    let attempts = 0;
    const { server, port } = await listenPlain((_req, res) => {
      attempts += 1;
      res.writeHead(200, { "content-length": "5000" });
      res.end("x".repeat(5000));
    });
    cleanups.push(async () => closePlain(server));
    await expect(
      harness().fetch(`http://${TEST_SERVER_ADDRESS}:${port}/`, {
        limits: { maxBytes: 100 },
      })
    ).rejects.toMatchObject({ code: "outbound_limit", kind: "bytes" });
    expect(attempts).toBe(1);
  });

  it("does not retry after the call deadline passed", async () => {
    let attempts = 0;
    const { server, port } = await listenPlain(() => {
      attempts += 1;
    });
    cleanups.push(async () => closePlain(server));
    await expect(
      harness().fetch(`http://${TEST_SERVER_ADDRESS}:${port}/`, {
        limits: { timeoutMs: 150 },
      })
    ).rejects.toMatchObject({ code: "outbound_limit", kind: "timeout" });
    expect(attempts).toBe(1);
  });

  it("does not retry after the caller aborted, even in the backoff wait", async () => {
    const target = await scripted(() => ({ kind: "status", status: 503 }));
    const controller = new AbortController();
    const pending = harness({
      retry: { maxAttempts: 3, baseDelayMs: 10_000 },
    }).fetch(target.url, { signal: controller.signal });
    // The first attempt is answered with 503; the client is now waiting to retry.
    await vi.waitFor(() => {
      expect(target.attempts()).toBe(1);
    });
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(target.attempts()).toBe(1);
  });

  it("does not retry a redirect refused by the per-hop checks", async () => {
    let attempts = 0;
    const { server, port } = await listenPlain((_req, res) => {
      attempts += 1;
      res.writeHead(302, { location: "http://169.254.169.254/latest" });
      res.end();
    });
    cleanups.push(async () => closePlain(server));
    await expect(
      harness().fetch(`http://${TEST_SERVER_ADDRESS}:${port}/`)
    ).rejects.toBeInstanceOf(BlockedTargetError);
    expect(attempts).toBe(1);
  });

  it("keeps the validating lookup on every attempt, retries included", async () => {
    // A name that resolves to the test server first and to a blocked address afterwards:
    // each attempt resolves again and the second resolution is refused, not connected to.
    let resolutions = 0;
    let attempts = 0;
    const { server, port } = await listenPlain((req, res) => {
      attempts += 1;
      req.socket.destroy();
      res.end();
    });
    cleanups.push(async () => closePlain(server));
    const fetch = createSafeFetch({
      resolve: () => {
        resolutions += 1;
        return Promise.resolve(
          resolutions === 1
            ? [{ address: TEST_SERVER_ADDRESS, family: 4 }]
            : [{ address: "10.0.0.5", family: 4 }]
        );
      },
      isBlocked: (address) => address !== TEST_SERVER_ADDRESS,
      retry: { maxAttempts: 3, baseDelayMs: 1 },
    });
    await expect(fetch(`http://flip.test:${port}/`)).rejects.toBeInstanceOf(
      BlockedTargetError
    );
    expect(attempts).toBe(1);
    expect(resolutions).toBe(2);
  });
});
