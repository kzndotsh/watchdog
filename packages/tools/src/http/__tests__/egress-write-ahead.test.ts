import { createHash } from "node:crypto";

import { Effect } from "effect";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Egress, makeJobEgress } from "../egress";
import type { ProviderCall } from "../provider-call";
import { createServedCache } from "../served-cache";
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

const sha256 = (data: string) =>
  createHash("sha256").update(data).digest("hex");

async function serve(onRequest: () => void, body = '{"ok":true}') {
  const { server, port } = await listenPlain((_req, res) => {
    onRequest();
    res.writeHead(200, { "content-type": "application/json" });
    res.end(body);
  });
  cleanups.push(async () => closePlain(server));
  return `http://${TEST_SERVER_ADDRESS}:${port}`;
}

function job(options?: Parameters<typeof makeJobEgress>[1]) {
  const { fetch, fetchPrivateOrigin } = harness();
  return makeJobEgress({ fetch, fetchPrivateOrigin }, options);
}

describe("the write-ahead hook", () => {
  it("saves the request side of a call before anything is sent", async () => {
    const events: string[] = [];
    const seen: ProviderCall[] = [];
    const origin = await serve(() => events.push("sent"));
    let saveFinished: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      saveFinished = resolve;
    });
    const { egress } = job({
      onCallStart: async (call) => {
        seen.push(call);
        // The save is held open: a door that did not wait would reach the server meanwhile.
        await gate;
        events.push("saved");
      },
    });

    const pending = egress.fetch(`${origin}/v1/host?key=abcd1234efgh`);
    await expect.poll(() => seen.length).toBe(1);
    await expect(
      expect.poll(() => events.length, { timeout: 200, interval: 20 }).toBe(1)
    ).rejects.toThrow();
    expect(events).toEqual([]);

    saveFinished();
    await (await pending).text();

    expect(events).toEqual(["saved", "sent"]);
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({
      method: "GET",
      url: `${origin}/v1/host?key=[redacted]`,
      outcome: "pending",
      body: { state: "none" },
    });
    expect(seen[0]?.id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("does not send a call whose request side could not be saved", async () => {
    const sent: string[] = [];
    const origin = await serve(() => sent.push("sent"));
    const { egress, ledger } = job({
      onCallStart: async () => {
        throw new Error("database is down");
      },
    });

    await expect(egress.fetch(`${origin}/x`)).rejects.toThrow(
      "database is down"
    );

    expect(sent).toEqual([]);
    expect(ledger.drain()).toMatchObject([
      { outcome: "failed", failure: { tag: "Error" } },
    ]);
  });

  it("gives every call its own id and keeps them in the order the calls began", async () => {
    const origin = await serve(() => undefined);
    const { egress, ledger } = job();
    await (await egress.fetch(`${origin}/a`)).text();
    await (await egress.fetch(`${origin}/b`)).text();

    const calls = ledger.drain();
    expect(calls.map((call) => call.seq)).toEqual([0, 1]);
    expect(new Set(calls.map((call) => call.id)).size).toBe(2);
  });
});

describe("the Job body policy", () => {
  it("hashes and keeps nothing when the Job is hash-only", async () => {
    const payload = "breach rows ".repeat(50);
    const origin = await serve(() => undefined, payload);
    const { egress, ledger } = job({ bodyPolicy: "hash_only" });

    expect(await (await egress.fetch(`${origin}/x`)).text()).toBe(payload);

    const [call] = ledger.drain();
    expect(call?.body).toEqual({
      state: "hashed",
      sha256: sha256(payload),
      bytes: Buffer.byteLength(payload),
      reason: "hash_only",
    });
  });

  it("applies to a DNS call too", () => {
    const { ledger } = job({ bodyPolicy: "hash_only" });
    const call = ledger.beginDirect({
      transport: "dns",
      method: "A",
      url: "dns:example.test?type=A",
      bodyKind: "dns_answer_json",
    });
    call.answered({ status: 0, body: new TextEncoder().encode("[]") });

    expect(ledger.drain()[0]?.body).toMatchObject({
      state: "hashed",
      reason: "hash_only",
    });
  });
});

describe("a call served from an in-process cache", () => {
  it("names the original call and carries its body hash", async () => {
    const origin = await serve(() => undefined, "feed body");
    const first = job();
    await (await first.egress.fetch(`${origin}/feed`)).text();
    const source = first.egress.servedSource(`${origin}/feed`);
    expect(source).toMatchObject({
      callId: first.ledger.drain()[0]?.id,
      method: "GET",
      status: 200,
      body: { sha256: sha256("feed body"), bytes: 9 },
    });

    const started: ProviderCall[] = [];
    const second = job({
      onCallStart: async (call) => {
        started.push(call);
      },
    });
    await Effect.runPromise(second.egress.recordServed(source));

    const [served] = second.ledger.drain();
    expect(served).toMatchObject({
      outcome: "served_from",
      servedFrom: source?.callId,
      status: 200,
      hops: [{ attempts: 0 }],
      body: {
        state: "hashed",
        sha256: sha256("feed body"),
        bytes: 9,
        reason: "served_from",
      },
    });
    expect(served?.id).not.toBe(source?.callId);
    expect(started.map((call) => call.id)).toEqual([served?.id]);
  });

  it("gives a cache that kept a value a hit that records the original call", async () => {
    let hits = 0;
    const origin = await serve(() => {
      hits += 1;
    }, "feed body");
    const url = `${origin}/feed`;
    const cache = createServedCache<string>(60_000);
    const load = (egress: ReturnType<typeof job>["egress"]) =>
      Effect.gen(function* loadGen() {
        const cached = yield* cache.get("feed");
        if (cached !== undefined) return cached;
        const text = yield* Effect.promise(async () =>
          (await egress.fetch(url)).text()
        );
        yield* cache.set("feed", text, url);
        return text;
      }).pipe(Effect.provideService(Egress, egress));

    const first = job();
    expect(await Effect.runPromise(load(first.egress))).toBe("feed body");
    const second = job();
    expect(await Effect.runPromise(load(second.egress))).toBe("feed body");

    expect(hits).toBe(1);
    const [original] = first.ledger.drain();
    const [served, ...rest] = second.ledger.drain();
    expect(rest).toEqual([]);
    expect(served).toMatchObject({
      outcome: "served_from",
      servedFrom: original?.id,
    });
  });

  it("offers no source for a call whose body was not read to the end", async () => {
    const origin = await serve(() => undefined, "x".repeat(10_000));
    const { egress } = job();
    const res = await egress.fetch(`${origin}/big`);
    await res.body?.cancel();

    expect(egress.servedSource(`${origin}/big`)).toBeUndefined();
  });
});
