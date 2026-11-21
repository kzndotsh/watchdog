import { createHash } from "node:crypto";

import { Effect, Exit } from "effect";
import { afterEach, describe, expect, it, vi } from "vitest";

import { isBlockedAddress } from "../blocked-address";
import { makeJobEgress } from "../egress";
import { admitAiOrigin } from "../egress-ai";
import { closePlain, harness, listenPlain } from "./helpers/loopback-server";

vi.unmock("undici");

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  await Promise.all(cleanups.splice(0).map(async (cleanup) => cleanup()));
});

const sha256 = (text: string) =>
  createHash("sha256").update(text).digest("hex");

type Route = Parameters<typeof listenPlain>[0];

/** A model endpoint on loopback; `hits` counts what reached it. */
async function modelServer(route: Route) {
  const hits: string[] = [];
  const { server, port } = await listenPlain((req, res) => {
    hits.push(req.url ?? "");
    route(req, res);
  });
  cleanups.push(async () => closePlain(server));
  return { port, hits };
}

const answer: Route = (_req, res) => {
  res.writeHead(200, { "content-type": "application/json" });
  res.end('{"completion":"secret model text"}');
};

const redirect: Route = (_req, res) => {
  res.writeHead(302, { location: "http://127.0.0.1:1/elsewhere" });
  res.end();
};

describe("admitAiOrigin", () => {
  it("admits the Anthropic host, a public origin and a listed private origin", () => {
    expect(admitAiOrigin("https://api.anthropic.com/v1", [])).toEqual({
      origin: "https://api.anthropic.com",
      kind: "anthropic",
    });
    expect(admitAiOrigin("https://models.example.com/v1/x", [])).toEqual({
      origin: "https://models.example.com",
      kind: "public",
    });
    expect(
      admitAiOrigin("http://127.0.0.1:8080/v1", ["http://127.0.0.1:8080"])
    ).toEqual({ origin: "http://127.0.0.1:8080", kind: "private" });
  });

  it("refuses a private or loopback origin that is not listed, whatever the spelling", () => {
    const listed = ["http://127.0.0.1:8080"];
    for (const raw of [
      "http://127.0.0.1:9090/v1",
      "http://127.0.0.1/v1",
      "http://localhost:8080",
      "http://10.0.0.5:8080",
      "http://[::1]:8080",
      "http://169.254.169.254",
      "http://llm.internal",
      "http://singlelabel",
    ]) {
      expect(admitAiOrigin(raw, listed), raw).toBeNull();
    }
  });

  it("refuses what is not an http(s) origin, and credentials in the URL", () => {
    for (const raw of [
      "not a url",
      "ftp://models.example.com",
      "file:///etc/passwd",
      "https://user:pw@models.example.com",
    ]) {
      expect(admitAiOrigin(raw, []), raw).toBeNull();
    }
  });
});

describe("Egress.llmFetchFor", () => {
  it("refuses an unlisted private origin with a fixed message that names the setting, not the URL", async () => {
    const { egress, ledger } = makeJobEgress(harness());

    const exit = await Effect.runPromiseExit(
      egress.llmFetchFor("http://127.0.0.1:8080/v1")
    );

    if (!Exit.isFailure(exit)) throw new Error("expected a refusal");
    expect(JSON.stringify(exit.cause)).toContain("ai_origin");
    expect(JSON.stringify(exit.cause)).not.toContain("127.0.0.1");
    expect(ledger.count()).toBe(0);
  });

  it("reaches a listed private origin the public path would refuse, and records it hash-only", async () => {
    const { port, hits } = await modelServer(answer);
    const origin = `http://127.0.0.1:${port}`;
    // The default address policy: the public door blocks loopback.
    const client = harness({ overrides: { isBlocked: isBlockedAddress } });
    await expect(client.fetch(`${origin}/v1/chat`)).rejects.toMatchObject({
      reason: "address",
    });
    const { egress, ledger } = makeJobEgress(client, {
      privateAiOrigins: [origin],
    });

    const llmFetch = await Effect.runPromise(egress.llmFetchFor(origin));
    const res = await llmFetch(`${origin}/v1/chat`, {
      method: "POST",
      body: '{"prompt":"private evidence text"}',
    });

    expect(await res.text()).toBe('{"completion":"secret model text"}');
    expect(hits).toEqual(["/v1/chat"]);
    const [call] = ledger.drain();
    expect(call).toMatchObject({
      transport: "http",
      method: "POST",
      url: `${origin}/v1/chat`,
      outcome: "response",
      status: 200,
      requestBody: {
        state: "hashed",
        sha256: sha256('{"prompt":"private evidence text"}'),
      },
      body: {
        state: "hashed",
        reason: "hash_only",
        sha256: sha256('{"completion":"secret model text"}'),
        bytes: Buffer.byteLength('{"completion":"secret model text"}'),
      },
    });
    expect(call?.body).not.toHaveProperty("data");
  });

  it("refuses a redirect from a listed private origin and never follows it", async () => {
    const { port } = await modelServer(redirect);
    const origin = `http://127.0.0.1:${port}`;
    const { egress, ledger } = makeJobEgress(
      harness({ overrides: { isBlocked: isBlockedAddress } }),
      { privateAiOrigins: [origin] }
    );
    const llmFetch = await Effect.runPromise(egress.llmFetchFor(origin));

    await expect(llmFetch(`${origin}/v1/chat`)).rejects.toMatchObject({
      _tag: "BlockedTargetError",
      reason: "redirect",
    });
    expect(ledger.drain()[0]).toMatchObject({
      outcome: "failed",
      failure: { tag: "BlockedTargetError", reason: "redirect" },
    });
  });

  it("sends a public origin through the shared client, hash-only, and refuses its redirect", async () => {
    const ok = await modelServer(answer);
    const moved = await modelServer(redirect);
    // `public.test` resolves to loopback in the test client, whose policy admits only that server.
    const { egress, ledger } = makeJobEgress(harness());
    const okOrigin = `http://public.test:${ok.port}`;
    const movedOrigin = `http://public.test:${moved.port}`;

    const okFetch = await Effect.runPromise(egress.llmFetchFor(okOrigin));
    const res = await okFetch(`${okOrigin}/v1/chat`, {
      method: "POST",
      body: "{}",
    });
    expect(await res.text()).toContain("secret model text");

    const movedFetch = await Effect.runPromise(egress.llmFetchFor(movedOrigin));
    await expect(movedFetch(`${movedOrigin}/v1/chat`)).rejects.toMatchObject({
      reason: "redirect",
    });

    const [first, second] = ledger.drain();
    expect(first?.body).toMatchObject({ state: "hashed", reason: "hash_only" });
    expect(second).toMatchObject({
      outcome: "failed",
      failure: { reason: "redirect" },
    });
  });

  it("a public origin's address is still checked at connect time", async () => {
    const { egress } = makeJobEgress(harness());
    const llmFetch = await Effect.runPromise(
      egress.llmFetchFor("https://internal.test")
    );

    await expect(
      llmFetch("https://internal.test/v1/chat")
    ).rejects.toMatchObject({ _tag: "BlockedTargetError", reason: "resolved" });
  });

  it("refuses a request to any origin but the admitted one", async () => {
    const { port, hits } = await modelServer(answer);
    const origin = `http://127.0.0.1:${port}`;
    const { egress } = makeJobEgress(harness(), { privateAiOrigins: [origin] });
    const llmFetch = await Effect.runPromise(egress.llmFetchFor(origin));

    await expect(
      llmFetch(`http://127.0.0.1:${port + 1}/v1/chat`)
    ).rejects.toMatchObject({ reason: "ai_origin" });
    await expect(
      llmFetch(`http://public.test:${port}/v1/chat`)
    ).rejects.toMatchObject({ reason: "ai_origin" });
    expect(hits).toEqual([]);
  });
});
