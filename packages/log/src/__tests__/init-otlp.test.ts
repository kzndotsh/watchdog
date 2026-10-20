import { mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { createServer } from "node:http";
import type { Socket } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createLogger } from "@watchdog/log";

import { initWatchdogLogger } from "../init.ts";

function drainBody(dir: string): string {
  return readdirSync(dir)
    .filter((name) => name.endsWith(".jsonl"))
    .map((name) => readFileSync(path.join(dir, name), "utf-8"))
    .join("\n");
}

describe("initWatchdogLogger with an OTLP receiver that hangs", () => {
  const drainDir = mkdtempSync(path.join(tmpdir(), "wd-log-otlp-"));
  const sockets = new Set<Socket>();
  let hits = 0;
  // never answers
  const server = createServer(() => {
    hits += 1;
  });

  beforeAll(async () => {
    server.on("connection", (socket) => {
      sockets.add(socket);
      socket.on("close", () => sockets.delete(socket));
    });
    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", resolve);
    });
    const address = server.address();
    if (address === null || typeof address === "string") {
      throw new Error("receiver has no port");
    }
    initWatchdogLogger({
      service: "test-otlp",
      drainDir,
      pretty: false,
      otlp: {
        endpoint: `http://127.0.0.1:${address.port}`,
        release: "2.0.0",
        environment: "test",
      },
    });
  });

  afterAll(async () => {
    for (const socket of sockets) socket.destroy();
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  it("still writes every event to the file drain, without waiting", async () => {
    const started = performance.now();
    for (let i = 0; i < 60; i += 1) {
      const log = createLogger({ scope: `otlp-hang-${i}` });
      log.info("request", { requestId: `req-${i}` });
      log.emit();
    }
    expect(performance.now() - started).toBeLessThan(1000);

    await expect
      .poll(() => drainBody(drainDir).split("otlp-hang-").length - 1, {
        timeout: 3000,
      })
      .toBe(60);
    // 60 events fill a batch of 50: the exporter really tried the receiver.
    await expect.poll(() => hits, { timeout: 3000 }).toBeGreaterThan(0);
  });
});
