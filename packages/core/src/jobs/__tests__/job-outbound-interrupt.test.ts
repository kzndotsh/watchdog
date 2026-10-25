import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

import { Cause, Effect, Exit, Fiber, FiberMap, Layer } from "effect";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  fetchUnshortenEffect,
  httpClientLayer,
  isBlockedAddress,
  outboundClientLayerWith,
} from "@watchdog/tools/http";
import { unrecordedEgressLayer } from "@watchdog/tools/testing";

import { JobFibers } from "../job-fibers";

// The shared setup routes undici's fetch to the global one for MSW; this test needs the
// real transport so the loopback server sees the connection the Job's request opened.
vi.unmock("undici");

const LOOPBACK = "127.0.0.1";
const PROMPT_MS = 1500;

const servers: Server[] = [];

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      async (server) =>
        new Promise<void>((resolve) => {
          server.closeAllConnections();
          server.close(() => {
            resolve();
          });
        })
    )
  );
});

/** A loopback server that never answers `/hang`; `closed()` turns true when the client drops it. */
async function hangingServer() {
  let arrive: () => void = () => undefined;
  let closed = false;
  const arrived = new Promise<void>((resolve) => {
    arrive = resolve;
  });
  const server = createServer((req, res) => {
    if (req.url !== "/hang") {
      res.end();
      return;
    }
    res.on("close", () => {
      closed = true;
    });
    arrive();
  });
  servers.push(server);
  await new Promise<void>((resolve) => {
    server.listen(0, LOOPBACK, resolve);
  });
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://${LOOPBACK}:${port}/hang`,
    arrived,
    closed: () => closed,
  };
}

const outbound = httpClientLayer.pipe(
  Layer.provide(unrecordedEgressLayer),
  Layer.provide(
    outboundClientLayerWith({
      resolve: async () => [{ address: LOOPBACK, family: 4 }],
      isBlocked: (address) => address !== LOOPBACK && isBlockedAddress(address),
    })
  )
);

describe("a timed-out Job's outbound request", () => {
  it("ends promptly when JobFibers aborts the Job fiber", async () => {
    const server = await hangingServer();
    const jobId = "job-outbound-1";

    const exit = await Effect.runPromise(
      Effect.gen(function* abortJobGen() {
        const fibers = yield* JobFibers;
        // The Cap's collect step: an outbound request under the Job fiber.
        const fiber = yield* FiberMap.run(
          fibers.map,
          jobId
        )(
          fetchUnshortenEffect(server.url, new AbortController().signal, {
            userAgent: "watchdog-test",
          }).pipe(Effect.provide(outbound))
        );
        yield* Effect.promise(async () => server.arrived);

        const started = Date.now();
        // What pg-boss `job.signal` and the cancel poll do (`interruptOnQueueSignal`).
        expect(
          yield* fibers.abort(jobId, {
            cause: "cap_timeout",
            detail: "Timed out after 1s",
          })
        ).toBe(true);
        const ended = yield* Fiber.await(fiber);
        expect(Date.now() - started).toBeLessThan(PROMPT_MS);
        expect((yield* fibers.attemptFor(jobId).stop.peek)?.cause).toBe(
          "cap_timeout"
        );
        return ended;
      }).pipe(Effect.scoped, Effect.provide(JobFibers.layer))
    );

    expect(Exit.isFailure(exit) && Cause.hasInterruptsOnly(exit.cause)).toBe(
      true
    );
    await vi.waitFor(
      () => {
        expect(server.closed()).toBe(true);
      },
      { timeout: PROMPT_MS }
    );
  });
});
