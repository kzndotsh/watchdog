import { createHash } from "node:crypto";

import { Effect } from "effect";
import { HttpClient } from "effect/http";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Egress, makeJobEgress } from "../egress";
import { httpClientLayer } from "../http-client-layer";
import { redactUrl, SecretRegistry } from "../redact-url";
import { createOutboundTransport } from "../safe-fetch";
import {
  TEST_SERVER_ADDRESS,
  closePlain,
  harness,
  listenPlain,
} from "./helpers/loopback-server";

vi.unmock("undici");

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  await Promise.all(cleanups.splice(0).map(async (cleanup) => cleanup()));
});

const sha256 = (data: string | Uint8Array) =>
  createHash("sha256").update(data).digest("hex");

type Route = (
  req: import("node:http").IncomingMessage,
  res: import("node:http").ServerResponse
) => void;

/** Runs `act` once `gate` opens, for a route that answers after the test releases it. */
async function afterGate(gate: Promise<void>, act: () => void): Promise<void> {
  await gate;
  act();
}

async function serve(route: Route) {
  const { server, port } = await listenPlain(route);
  cleanups.push(async () => closePlain(server));
  return `http://${TEST_SERVER_ADDRESS}:${port}`;
}

function job(options?: Parameters<typeof makeJobEgress>[1]) {
  const { fetch, fetchPrivateOrigin } = harness();
  return makeJobEgress({ fetch, fetchPrivateOrigin }, options);
}

describe("the Job ledger", () => {
  it("records the envelope of one call", async () => {
    const origin = await serve((_req, res) => {
      res.writeHead(200, {
        "content-type": "application/json",
        "set-cookie": "sid=abc123",
        "x-request-id": "req-1",
        "x-ratelimit-remaining": "41",
        "x-private": "nope",
        server: "loopback",
      });
      res.end('{"ok":true}');
    });
    const { egress, ledger } = job();

    const res = await egress.fetch(
      `${origin}/v1/host?key=abcd1234efgh&ip=1.1.1.1`
    );
    await res.text();

    const [call] = ledger.drain();
    expect(call).toMatchObject({
      seq: 0,
      method: "GET",
      url: `${origin}/v1/host?key=[redacted]&ip=1.1.1.1`,
      outcome: "response",
      status: 200,
      requestBody: { state: "none" },
      failure: null,
      hops: [
        {
          url: `${origin}/v1/host?key=[redacted]&ip=1.1.1.1`,
          status: 200,
          attempts: 1,
        },
      ],
      responseHeaders: {
        "content-type": "application/json",
        "x-request-id": "req-1",
        "x-ratelimit-remaining": "41",
        server: "loopback",
      },
    });
    expect(call?.responseHeaders).not.toHaveProperty("set-cookie");
    expect(call?.responseHeaders).not.toHaveProperty("x-private");
    expect(Date.parse(call?.startedAt ?? "")).not.toBeNaN();
    expect(call?.headersMs).toBeGreaterThanOrEqual(0);
    expect(call?.durationMs).toBeGreaterThanOrEqual(call?.headersMs ?? 0);
  });

  it("hashes exactly the bytes served and keeps a copy", async () => {
    const payload = "héllo ".repeat(2000);
    const origin = await serve((_req, res) => {
      res.writeHead(200);
      res.end(payload);
    });
    const { egress, ledger } = job();

    expect(await (await egress.fetch(`${origin}/x`)).text()).toBe(payload);

    const [call] = ledger.drain();
    expect(call?.body).toMatchObject({
      state: "stored",
      sha256: sha256(payload),
      bytes: Buffer.byteLength(payload),
    });
    if (call?.body.state !== "stored") throw new Error("expected stored");
    expect(Buffer.from(call.body.data).toString()).toBe(payload);
  });

  it("hashes without keeping a body over the per-call limit or the Job budget", async () => {
    const payload = "x".repeat(100);
    const origin = await serve((_req, res) => {
      res.writeHead(200);
      res.end(payload);
    });
    const perCall = job({ keep: { perCallBytes: 50 } });
    await (await perCall.egress.fetch(`${origin}/x`)).arrayBuffer();
    expect(perCall.ledger.drain()[0]?.body).toEqual({
      state: "hashed",
      sha256: sha256(payload),
      bytes: 100,
      reason: "over_limit",
    });

    const perJob = job({ keep: { perJobBytes: 150 } });
    for (let i = 0; i < 2; i += 1) {
      // oxlint-disable-next-line no-await-in-loop -- sequential on purpose: the second call finds the budget spent
      await (await perJob.egress.fetch(`${origin}/x`)).arrayBuffer();
    }
    expect(perJob.ledger.drain().map((c) => c.body.state)).toEqual([
      "stored",
      "hashed",
    ]);
    expect(perJob.ledger.drain()[1]?.body).toMatchObject({
      reason: "over_job_budget",
    });
  });

  it("never records a query-string key, a form-encoded key, in the URL or in a hop", async () => {
    const secret = "p@ss w0rd+/é&=";
    const forms = [
      secret,
      encodeURIComponent(secret),
      new URLSearchParams([["", secret]]).toString().slice(1),
    ];
    const origin = await serve((req, res) => {
      if (req.url?.startsWith("/start") === true) {
        res.writeHead(302, {
          location: `/landed?echo=${encodeURIComponent(secret)}&ok=1`,
        });
        res.end();
        return;
      }
      res.writeHead(200);
      res.end("done");
    });
    const { egress, ledger } = job();
    ledger.registerSecret("PROVIDER_KEY", secret);
    const form = new URLSearchParams([["q", secret]]).toString();

    const res = await egress.fetch(
      `${origin}/start?${form}&a=${encodeURIComponent(secret)}&id=7`
    );
    await res.text();

    const recorded = JSON.stringify(ledger.drain());
    for (const form of forms) expect(recorded).not.toContain(form);
    expect(recorded).toContain("[credential:PROVIDER_KEY]");
    const [call] = ledger.drain();
    expect(call?.hops).toHaveLength(2);
    expect(call?.hops[1]?.url).toBe(
      `${origin}/landed?echo=[credential:PROVIDER_KEY]&ok=1`
    );
  });

  it("records each redirect hop with its status", async () => {
    const origin = await serve((req, res) => {
      if (req.url === "/a") {
        res.writeHead(301, { location: "/b?token=zzz" });
        res.end();
      } else if (req.url?.startsWith("/b") === true) {
        res.writeHead(307, { location: "/c" });
        res.end();
      } else {
        res.writeHead(200);
        res.end("end");
      }
    });
    const { egress, ledger } = job();

    await (await egress.fetch(`${origin}/a`)).text();

    const [call] = ledger.drain();
    expect(call?.hops).toEqual([
      { url: `${origin}/a`, status: 301, attempts: 1 },
      { url: `${origin}/b?token=[redacted]`, status: 307, attempts: 1 },
      { url: `${origin}/c`, status: 200, attempts: 1 },
    ]);
    expect(call?.status).toBe(200);
  });

  it("redacts the Location of a redirect it was told not to follow", async () => {
    const origin = await serve((_req, res) => {
      res.writeHead(302, { location: "/next?sig=abc&n=2" });
      res.end();
    });
    const { egress, ledger } = job();

    await egress.fetch(`${origin}/a`, { redirect: "manual" });

    expect(ledger.drain()[0]?.responseHeaders.location).toBe(
      `${origin}/next?sig=[redacted]&n=2`
    );
  });

  it("counts every wire attempt of a retried hop", async () => {
    let seen = 0;
    const origin = await serve((_req, res) => {
      seen += 1;
      res.writeHead(seen < 3 ? 503 : 200);
      res.end("later");
    });
    const { egress, ledger } = job();

    expect(await (await egress.fetch(`${origin}/r`)).text()).toBe("later");

    const [call] = ledger.drain();
    expect(call?.hops).toEqual([
      { url: `${origin}/r`, status: 200, attempts: 3 },
    ]);
    expect(call?.body).toMatchObject({ state: "stored", bytes: 5 });
  });

  it("calls a body that exactly fills the byte cap complete, and a longer one partial", async () => {
    const origin = await serve((req, res) => {
      res.writeHead(200);
      res.end(req.url === "/exact" ? "12345678" : "123456789");
    });
    const { egress, ledger } = job();
    const limits = { maxBytes: 8, truncate: true };

    const exact = await egress.fetch(`${origin}/exact`, { limits });
    expect(await exact.text()).toBe("12345678");
    const longer = await egress.fetch(`${origin}/longer`, { limits });
    expect(await longer.text()).toBe("12345678");

    const [first, second] = ledger.drain();
    expect(first?.body).toMatchObject({
      state: "stored",
      sha256: sha256("12345678"),
      bytes: 8,
    });
    expect(second?.body).toMatchObject({
      state: "partial",
      reason: "byte_cap",
      sha256: sha256("12345678"),
      bytes: 8,
    });
  });

  it("labels a body the consumer stopped reading partial, with the hash of the prefix read", async () => {
    const origin = await serve((_req, res) => {
      res.writeHead(200);
      res.write("first-chunk|");
      cleanups.push(async () => {
        res.end();
      });
    });
    const { egress, ledger } = job();

    const res = await egress.fetch(`${origin}/slow`);
    const reader = res.body?.getReader();
    const first = await reader?.read();
    await reader?.cancel();

    const prefix = Buffer.from(first?.value ?? new Uint8Array());
    expect(prefix.length).toBeGreaterThan(0);
    const [call] = ledger.drain();
    expect(call?.outcome).toBe("response");
    expect(call?.body).toMatchObject({
      state: "partial",
      reason: "reader_stopped",
      sha256: sha256(prefix),
      bytes: prefix.length,
    });
  });

  it("hashes only what the consumer has pulled, never ahead", async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const origin = await serve((_req, res) => {
      res.writeHead(200);
      res.write("one|");
      void afterGate(gate, () => {
        res.write("two|");
        res.end();
      });
    });
    const { egress, ledger } = job();

    const res = await egress.fetch(`${origin}/lazy`);
    expect(ledger.drain()[0]).toMatchObject({
      outcome: "open",
      body: { state: "partial", bytes: 0 },
    });
    const reader = res.body?.getReader();
    const first = await reader?.read();
    expect(first?.value?.byteLength).toBe(4);
    expect(ledger.drain()[0]?.body).toMatchObject({
      state: "partial",
      bytes: 4,
      sha256: sha256("one|"),
    });
    release();
    let rest = "";
    for (;;) {
      // oxlint-disable-next-line no-await-in-loop -- reads in order
      const next = await reader?.read();
      if (next === undefined || next.done) break;
      rest += Buffer.from(next.value).toString();
    }
    expect(rest).toBe("two|");
    expect(ledger.drain()[0]?.body).toMatchObject({
      state: "stored",
      bytes: 8,
      sha256: sha256("one|two|"),
    });
  });

  it("records a refused or failed call by its class, not its message", async () => {
    const { egress, ledger } = job();

    await expect(egress.fetch("http://10.0.0.5/x?key=1")).rejects.toMatchObject(
      {
        reason: "address",
      }
    );

    const [call] = ledger.drain();
    expect(call).toMatchObject({
      outcome: "failed",
      status: null,
      body: { state: "none" },
      failure: { tag: "BlockedTargetError", reason: "address" },
      hops: [
        { url: "http://10.0.0.5/x?key=[redacted]", status: null, attempts: 0 },
      ],
    });
  });

  it("reports a call drained before its response as pending, then as a response", async () => {
    let arrived: () => void = () => undefined;
    const seen = new Promise<void>((resolve) => {
      arrived = resolve;
    });
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const origin = await serve((_req, res) => {
      arrived();
      void afterGate(gate, () => {
        res.writeHead(200, { "content-type": "text/plain" });
        res.end("late");
      });
    });
    const { egress, ledger } = job();

    const pending = egress.fetch(`${origin}/hold`);
    await seen;
    expect(ledger.drain()[0]).toMatchObject({
      outcome: "pending",
      status: null,
      durationMs: null,
      body: { state: "none" },
      failure: null,
    });
    release();
    await (await pending).text();
    expect(ledger.drain()[0]).toMatchObject({
      outcome: "response",
      status: 200,
    });
  });

  it("records a call rejected before the send as failed", async () => {
    const bad = harness({ proxyUrl: "not a proxy url" });
    const badProxy = makeJobEgress(bad);
    await expect(
      badProxy.egress.fetch("http://127.0.0.1:9/x")
    ).rejects.toMatchObject({ reason: "proxy" });
    expect(badProxy.ledger.drain()[0]).toMatchObject({
      outcome: "failed",
      status: null,
      failure: { tag: "BlockedTargetError", reason: "proxy" },
    });

    const transport = createOutboundTransport();
    await transport.close();
    const closed = makeJobEgress(transport);
    await expect(closed.egress.fetch("http://127.0.0.1:9/x")).rejects.toThrow();
    expect(closed.ledger.drain()[0]).toMatchObject({
      outcome: "failed",
      failure: { tag: "Error" },
    });
  });

  it("counts calls without copying bodies", async () => {
    const origin = await serve((_req, res) => {
      res.writeHead(200);
      res.end("x");
    });
    const { egress, ledger } = job();
    expect(ledger.count()).toBe(0);
    await (await egress.fetch(`${origin}/1`)).text();
    await (await egress.fetch(`${origin}/2`)).text();
    expect(ledger.count()).toBe(2);
  });

  it("records a request body only as a SHA-256", async () => {
    const origin = await serve((_req, res) => {
      res.writeHead(200);
      res.end("ok");
    });
    const { egress, ledger } = job();

    await (
      await egress.fetch(`${origin}/p`, {
        method: "POST",
        body: '{"ioc":"secret-seed"}',
        headers: { authorization: "Bearer abcdefgh12345678" },
      })
    ).text();

    const call = ledger.drain()[0];
    expect(call?.method).toBe("POST");
    expect(call?.requestBody).toEqual({
      state: "hashed",
      sha256: sha256('{"ioc":"secret-seed"}'),
      bytes: 21,
    });
    const recorded = JSON.stringify(call);
    expect(recorded).not.toContain("secret-seed");
    expect(recorded).not.toContain("abcdefgh12345678");
  });

  it("gives concurrent calls in one Job separate records", async () => {
    const bodies: Record<string, string> = {
      "/a": "body-a",
      "/b": "body-b",
      "/c": "body-c",
      "/d": "body-d",
    };
    const origin = await serve((req, res) => {
      res.writeHead(req.url === "/b" ? 404 : 200, {
        "content-type": "text/plain",
      });
      res.end(bodies[req.url ?? ""] ?? "unknown");
    });
    const { egress, ledger } = job();

    const responses = await Promise.all(
      ["/a", "/b", "/c", "/d"].map(async (path) =>
        egress.fetch(`${origin}${path}`)
      )
    );
    await Promise.all(responses.map(async (res) => res.text()));

    const calls = ledger.drain();
    expect(calls.map((c) => c.seq)).toEqual([0, 1, 2, 3]);
    const byUrl = new Map(calls.map((c) => [c.url, c]));
    for (const path of ["/a", "/b", "/c", "/d"]) {
      const call = byUrl.get(`${origin}${path}`);
      expect(call?.status).toBe(path === "/b" ? 404 : 200);
      expect(call?.body).toMatchObject({ sha256: sha256(bodies[path] ?? "") });
      expect(call?.hops).toHaveLength(1);
    }
  });

  it("serves the Effect HttpClient of httpClientLayer and records its calls", async () => {
    const origin = await serve((_req, res) => {
      res.writeHead(200, { "content-type": "text/plain" });
      res.end("via client");
    });
    const { egress, ledger } = job();

    const text = await Effect.runPromise(
      Effect.gen(function* viaClient() {
        const client = yield* HttpClient.HttpClient;
        const res = yield* client.get(`${origin}/h?apikey=k`);
        return yield* res.text;
      }).pipe(
        Effect.provide(httpClientLayer),
        Effect.provideService(Egress, egress)
      )
    );

    expect(text).toBe("via client");
    expect(ledger.drain()[0]).toMatchObject({
      url: `${origin}/h?apikey=[redacted]`,
      body: { state: "stored", sha256: sha256("via client") },
    });
  });
});

describe("redactUrl", () => {
  it("drops userinfo and fragment and hides every sensitive parameter name", () => {
    const url =
      "https://u:p@api.test/p?Key=1&API_KEY=2&token=3&access_token=4&sig=5&Signature=6&X-Amz-Signature=7&code=8&state=9&password=10&keep=yes#frag";
    expect(redactUrl(url)).toBe(
      "https://api.test/p?Key=[redacted]&API_KEY=[redacted]&token=[redacted]&access_token=[redacted]&sig=[redacted]&Signature=[redacted]&X-Amz-Signature=[redacted]&code=[redacted]&state=[redacted]&password=[redacted]&keep=yes"
    );
  });

  it("hides a parameter whose name has a sensitive token, and keeps a harmless one", () => {
    const names = [
      "auth_token",
      "secret",
      "authorization",
      "x-api-key",
      "access_key",
      "sessionToken",
      "client.secret",
    ];
    const url = `https://api.test/p?${names.map((n) => `${n}=v1`).join("&")}&keyword=v2&monkey=v3&q=v4`;
    expect(redactUrl(url)).toBe(
      `https://api.test/p?${names.map((n) => `${n}=[redacted]`).join("&")}&keyword=v2&monkey=v3&q=v4`
    );
  });

  it("finds a secret in the path and ignores a value under 8 characters", () => {
    const secrets = new SecretRegistry();
    secrets.register("LONG", "longsecret99");
    secrets.register("SHORT", "abc");
    expect(
      redactUrl("https://api.test/v1/longsecret99/abc?x=abc", secrets)
    ).toBe("https://api.test/v1/[credential:LONG]/abc?x=abc");
  });

  it("does not echo a URL that does not parse", () => {
    expect(redactUrl("not a url?key=secretsecret")).toBe("[invalid url]");
  });
});
