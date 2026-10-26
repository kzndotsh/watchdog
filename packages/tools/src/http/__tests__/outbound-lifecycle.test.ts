import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import type { AddressInfo } from "node:net";

import { Effect, Exit, Fiber, Layer } from "effect";
import { HttpClient } from "effect/http";
import { Agent } from "undici";
import { afterEach, describe, expect, it, vi } from "vitest";

import { isBlockedAddress } from "../blocked-address";
import { unrecordedEgressLayer } from "../egress";
import { httpClientLayer } from "../http-client-layer";
import { fetchHttpProbeEffect } from "../http-probe";
import { OutboundClient, outboundClientLayerWith } from "../outbound-client";
import { createOutboundTransport, type SafeFetchDeps } from "../safe-fetch";
import { fetchUnshortenEffect } from "../unshorten";

// The shared setup routes undici's fetch to the global one for MSW; the lifecycle
// tests need the real transport so a loopback server sees the sockets.
vi.unmock("undici");

const LOOPBACK = "127.0.0.1";
/** Longest an interrupted request may take to reach the server as a closed connection. */
const PROMPT_MS = 1500;

/** Loopback is the one address the test policy lets through. */
const loopbackDeps: SafeFetchDeps = {
  resolve: async () => [{ address: LOOPBACK, family: 4 }],
  isBlocked: (address) => address !== LOOPBACK && isBlockedAddress(address),
};

type Seen = {
  readonly path: string;
  /** True once the client dropped the connection (or the response finished). */
  readonly closed: () => boolean;
};

type Loopback = {
  readonly origin: string;
  readonly port: string;
  readonly requests: Seen[];
  /** Resolves with the request for `path` once the server has received it. */
  readonly arrived: (path: string) => Promise<Seen>;
};

const servers: Server[] = [];

async function stopServer(server: Server): Promise<void> {
  return new Promise<void>((resolve) => {
    server.closeAllConnections();
    server.close(() => {
      resolve();
    });
  });
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map(stopServer));
});

/** A server whose routes either answer (the response ends) or `"hold"` the request open forever. */
async function loopback(
  route: (req: IncomingMessage, res: ServerResponse) => "hold" | undefined
): Promise<Loopback> {
  const requests: Seen[] = [];
  const waiting = new Map<string, ((seen: Seen) => void)[]>();
  const server = createServer((req, res) => {
    let closed = false;
    res.on("close", () => {
      closed = true;
    });
    const seen: Seen = { path: req.url ?? "", closed: () => closed };
    requests.push(seen);
    for (const notify of waiting.get(seen.path) ?? []) notify(seen);
    if (route(req, res) !== "hold") res.end();
  });
  servers.push(server);
  await new Promise<void>((resolve) => {
    server.listen(0, LOOPBACK, resolve);
  });
  const { port } = server.address() as AddressInfo;
  return {
    origin: `http://${LOOPBACK}:${port}`,
    port: String(port),
    requests,
    arrived: async (path) => {
      const existing = requests.find((seen) => seen.path === path);
      if (existing !== undefined) return existing;
      return new Promise<Seen>((resolve) => {
        waiting.set(path, [...(waiting.get(path) ?? []), resolve]);
      });
    },
  };
}

/** Waits (polling) until the server saw the client drop `seen`'s connection. */
async function expectDropped(seen: Seen): Promise<void> {
  await vi.waitFor(
    () => {
      expect(seen.closed()).toBe(true);
    },
    { timeout: PROMPT_MS }
  );
}

/** Interrupts `fiber` and returns its exit and how long that took. */
async function interrupt<A, E>(fiber: Fiber.Fiber<A, E>) {
  const started = Date.now();
  const exit = await Effect.runPromise(
    Fiber.interrupt(fiber).pipe(Effect.flatMap(() => Fiber.await(fiber)))
  );
  return { exit, elapsedMs: Date.now() - started };
}

const clientLayer = httpClientLayer.pipe(
  Layer.provide(unrecordedEgressLayer),
  Layer.provide(outboundClientLayerWith(loopbackDeps))
);

describe("the outbound pools are a scoped resource", () => {
  /** An `Agent` per proxy setting, each recording its `close` (which still runs). */
  function spyPools() {
    const created: (string | undefined)[] = [];
    const closes: { proxy: string | undefined; calls: () => number }[] = [];
    const deps: SafeFetchDeps = {
      ...loopbackDeps,
      createDispatcher: (proxy) => {
        created.push(proxy);
        const agent = new Agent({ allowH2: false });
        const close = vi.spyOn(agent, "close");
        closes.push({ proxy, calls: () => close.mock.calls.length });
        return agent;
      },
    };
    const closed = () =>
      closes.flatMap((entry) => (entry.calls() > 0 ? [entry.proxy] : []));
    return { deps, created, closed };
  }

  it("closes every pool, awaited, when the Layer's scope closes", async () => {
    const server = await loopback(() => undefined);
    const pools = spyPools();
    const proxied = "http://proxy.test:3128";
    let proxy: string | undefined;
    const layer = outboundClientLayerWith({
      ...pools.deps,
      proxyUrl: () => proxy,
    });

    await Effect.runPromise(
      Effect.gen(function* usePools() {
        const outbound = yield* OutboundClient;
        yield* Effect.promise(async () => {
          const res = await outbound.fetch(`${server.origin}/a`);
          await res.arrayBuffer();
        });
        proxy = proxied;
        // The fake pool for the proxy setting sends direct; only that it is a second pool matters.
        yield* Effect.promise(async () => {
          const res = await outbound.fetch(`${server.origin}/b`);
          await res.arrayBuffer();
        });
        expect(pools.created).toEqual([undefined, proxied]);
        expect(pools.closed()).toEqual([]);
      }).pipe(Effect.provide(layer))
    );

    expect(pools.closed()).toHaveLength(2);
    expect(pools.closed()).toContain(undefined);
    expect(pools.closed()).toContain(proxied);
  });

  it("builds no pool up front and closes none while the scope is open", async () => {
    const pools = spyPools();
    await Effect.runPromise(
      Effect.gen(function* idle() {
        yield* OutboundClient;
        expect(pools.created).toEqual([]);
      }).pipe(Effect.provide(outboundClientLayerWith(pools.deps)))
    );
    expect(pools.closed()).toEqual([]);
  });

  it("rejects a request made after the scope closed instead of opening a new pool", async () => {
    const server = await loopback(() => undefined);
    const pools = spyPools();
    const outbound = await Effect.runPromise(
      Effect.gen(function* grabClient() {
        return yield* OutboundClient;
      }).pipe(Effect.provide(outboundClientLayerWith(pools.deps)))
    );
    await expect(outbound.fetch(`${server.origin}/late`)).rejects.toThrow(
      /closed/
    );
    expect(pools.created).toEqual([]);
    expect(server.requests).toEqual([]);
  });

  it("closes the sockets a pool kept alive", async () => {
    const sockets: IncomingMessage["socket"][] = [];
    const watched = await loopback((req) => {
      sockets.push(req.socket);
      return undefined;
    });
    const transport = createOutboundTransport(loopbackDeps);
    const res = await transport.fetch(`${watched.origin}/keepalive`);
    await res.arrayBuffer();
    expect(sockets).toHaveLength(1);
    expect(sockets[0]?.destroyed).toBe(false);

    await transport.close();
    await vi.waitFor(
      () => {
        expect(sockets[0]?.destroyed).toBe(true);
      },
      { timeout: PROMPT_MS }
    );
  });

  it("aborts a request still in flight once the grace period ends", async () => {
    const server = await loopback(() => "hold");
    const transport = createOutboundTransport(loopbackDeps);
    const pending = transport.fetch(`${server.origin}/stuck`).then(
      () => "answered",
      () => "failed"
    );
    const seen = await server.arrived("/stuck");

    const started = Date.now();
    await transport.close(50);
    expect(Date.now() - started).toBeLessThan(PROMPT_MS);
    expect(await pending).toBe("failed");
    await expectDropped(seen);
  });
});

describe("fiber interruption reaches the outbound request", () => {
  it("aborts a plain fetch in flight and ends the fiber promptly", async () => {
    const server = await loopback(() => "hold");
    const fiber = Effect.runFork(
      Effect.gen(function* plainFetch() {
        const client = yield* HttpClient.HttpClient;
        return yield* client.get(`${server.origin}/plain`);
      }).pipe(Effect.provide(clientLayer))
    );
    const seen = await server.arrived("/plain");

    const { exit, elapsedMs } = await interrupt(fiber);
    expect(Exit.isFailure(exit)).toBe(true);
    expect(elapsedMs).toBeLessThan(PROMPT_MS);
    await expectDropped(seen);
  });

  it("aborts the hop of the unshorten tool that is in flight, and follows no further", async () => {
    const server = await loopback((req, res) => {
      if (req.url === "/start") {
        res.writeHead(302, { location: "/stuck" });
        return undefined;
      }
      return req.url === "/stuck" ? "hold" : undefined;
    });
    const fiber = Effect.runFork(
      fetchUnshortenEffect(
        `${server.origin}/start`,
        new AbortController().signal,
        { userAgent: "watchdog-test" }
      ).pipe(Effect.provide(clientLayer))
    );
    const stuck = await server.arrived("/stuck");
    expect(server.requests.map((seen) => seen.path)).toEqual([
      "/start",
      "/stuck",
    ]);

    const { exit, elapsedMs } = await interrupt(fiber);
    expect(Exit.isFailure(exit)).toBe(true);
    expect(elapsedMs).toBeLessThan(PROMPT_MS);
    await expectDropped(stuck);
    expect(server.requests.map((seen) => seen.path)).toEqual([
      "/start",
      "/stuck",
    ]);
  });

  it("aborts an unshorten hop when the Cap's own signal aborts", async () => {
    const server = await loopback(() => "hold");
    const controller = new AbortController();
    const fiber = Effect.runFork(
      fetchUnshortenEffect(`${server.origin}/signal`, controller.signal, {
        userAgent: "watchdog-test",
      }).pipe(Effect.provide(clientLayer))
    );
    const seen = await server.arrived("/signal");

    controller.abort();
    await vi.waitFor(
      () => {
        expect(fiber.pollUnsafe()).toBeDefined();
      },
      { timeout: PROMPT_MS }
    );
    await expectDropped(seen);
  });

  it("aborts an http-probe request in flight", async () => {
    const server = await loopback(() => "hold");
    const fiber = Effect.runFork(
      fetchHttpProbeEffect(
        `${LOOPBACK}:${server.port}`,
        new AbortController().signal,
        { userAgent: "watchdog-test", preferHttps: false }
      ).pipe(Effect.provide(clientLayer))
    );
    const seen = await server.arrived("/");

    await interrupt(fiber);
    await expectDropped(seen);
  });
});
