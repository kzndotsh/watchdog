import { performance } from "node:perf_hooks";

import { createLogger } from "evlog";
import { describe, expect, it } from "vitest";

import {
  serverTimingHeader,
  shouldEmitServerTiming,
  startRequestTiming,
  timedDbCall,
  withServerTiming,
} from "../request-timing";
import { runWithRequestLogger } from "../storage";

const sleep = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

describe("timedDbCall", () => {
  it("counts calls and sums their time for the current request", async () => {
    const logger = createLogger();
    const timing = await runWithRequestLogger(logger, async () => {
      const snapshot = startRequestTiming(logger);
      await timedDbCall(() => sleep(15));
      await timedDbCall(() => sleep(15));
      await timedDbCall(() => Promise.resolve(1));
      return snapshot();
    });
    expect(timing.db.queries).toBe(3);
    expect(timing.db.ms).toBeGreaterThanOrEqual(25);
    expect(timing.durationMs).toBeGreaterThanOrEqual(timing.db.ms);
  });

  it("returns the call's value and rethrows its error, still counting it", async () => {
    const logger = createLogger();
    await runWithRequestLogger(logger, async () => {
      const snapshot = startRequestTiming(logger);
      await expect(timedDbCall(() => Promise.resolve("row"))).resolves.toBe(
        "row"
      );
      await expect(
        timedDbCall(() => Promise.reject(new Error("boom")))
      ).rejects.toThrow("boom");
      expect(snapshot().db.queries).toBe(2);
    });
  });

  it("keeps concurrent requests apart", async () => {
    const a = createLogger();
    const b = createLogger();
    const run = (logger: typeof a, calls: number) =>
      runWithRequestLogger(logger, async () => {
        const snapshot = startRequestTiming(logger);
        await Promise.all(
          Array.from({ length: calls }, () => timedDbCall(() => sleep(1)))
        );
        return snapshot().db.queries;
      });
    const [countA, countB] = await Promise.all([run(a, 2), run(b, 5)]);
    expect(countA).toBe(2);
    expect(countB).toBe(5);
  });

  it("runs the call untouched outside a request", async () => {
    await expect(timedDbCall(() => Promise.resolve(7))).resolves.toBe(7);
  });

  it("does not count inside a logger that never started timing", async () => {
    const logger = createLogger();
    await runWithRequestLogger(logger, async () => {
      await expect(timedDbCall(() => Promise.resolve(7))).resolves.toBe(7);
    });
    // A later request on a fresh logger starts from zero.
    const next = createLogger();
    const queries = await runWithRequestLogger(next, async () => {
      const snapshot = startRequestTiming(next);
      return snapshot().db.queries;
    });
    expect(queries).toBe(0);
  });

  it("costs well under a millisecond per call", async () => {
    const logger = createLogger();
    const calls = 20_000;
    const noop = () => Promise.resolve();
    const baseline = performance.now();
    await Promise.all(Array.from({ length: calls }, () => noop()));
    const baselineMs = performance.now() - baseline;
    const timedMs = await runWithRequestLogger(logger, async () => {
      startRequestTiming(logger);
      const start = performance.now();
      await Promise.all(Array.from({ length: calls }, () => timedDbCall(noop)));
      return performance.now() - start;
    });
    // Loose bound (CI noise): the added cost per call stays below 0.05 ms,
    // orders of magnitude under a database round trip.
    expect((timedMs - baselineMs) / calls).toBeLessThan(0.05);
  });
});

describe("Server-Timing", () => {
  it("formats db and app durations", () => {
    expect(
      serverTimingHeader({ durationMs: 40.2, db: { queries: 3, ms: 12.5 } })
    ).toBe("db;dur=12.5, app;dur=40.2");
  });

  it("is off in production and on in dev and test", () => {
    expect(shouldEmitServerTiming("production")).toBe(false);
    expect(shouldEmitServerTiming("development")).toBe(true);
    expect(shouldEmitServerTiming("test")).toBe(true);
  });

  it("sets the header on a mutable response", async () => {
    const response = withServerTiming(new Response("ok"), "db;dur=1");
    expect(response.headers.get("Server-Timing")).toBe("db;dur=1");
    expect(await response.text()).toBe("ok");
  });

  it("rebuilds an immutable response around the same body", async () => {
    const immutable = Response.redirect("http://localhost/x", 302);
    const response = withServerTiming(immutable, "db;dur=2");
    expect(response.headers.get("Server-Timing")).toBe("db;dur=2");
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("http://localhost/x");
  });
});
