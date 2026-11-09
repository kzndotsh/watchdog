import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createServer, type Server } from "node:net";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  FETCH_BAD_PORTS,
  type ListenableServer,
  listenFetchable,
} from "../loopback-port";

const servers: Server[] = [];

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        // oxlint-disable-next-line promise/avoid-new -- wraps the callback close API
        new Promise<void>((resolve) => {
          server.close(() => {
            resolve();
          });
        })
    )
  );
});

/** A stand-in server: each `listen(0)` reports the next port in `ports`. */
function scriptedServer(ports: number[]) {
  const calls = { listens: 0, closes: 0 };
  let current: number | null = null;
  const server: ListenableServer = {
    listen: (_port, host, listening) => {
      calls.listens += 1;
      current = ports.shift() ?? null;
      expect(host).toBe("127.0.0.1");
      listening();
    },
    address: () =>
      current === null
        ? null
        : { port: current, address: "127.0.0.1", family: "IPv4" },
    close: (closed) => {
      calls.closes += 1;
      current = null;
      closed();
    },
    once: () => undefined,
    off: () => undefined,
  };
  return { server, calls };
}

describe("listenFetchable", () => {
  it("listens on loopback and returns a port fetch will call", async () => {
    const server = createServer();
    servers.push(server);
    const port = await listenFetchable(server);
    expect(port).toBeGreaterThan(0);
    expect(FETCH_BAD_PORTS.has(port)).toBe(false);
  });

  it("fails after a bounded number of bad ports instead of hanging", async () => {
    const { server } = scriptedServer(Array.from({ length: 30 }, () => 6000));
    await expect(listenFetchable(server)).rejects.toThrow(/fetch bad port/);
  });

  it("gives up each fetch bad port it is handed and listens again", async () => {
    const { server, calls } = scriptedServer([6000, 10_080, 41_234]);
    expect(await listenFetchable(server)).toBe(41_234);
    expect(calls).toEqual({ listens: 3, closes: 2 });
  });
});

describe("test servers", () => {
  it("never listen on an ephemeral port without listenFetchable", () => {
    const root = path.resolve(import.meta.dirname, "../../../..");
    const files = execFileSync(
      "git",
      ["ls-files", "--", "*__tests__/*.ts", "*__tests__/*.tsx"],
      { cwd: root, encoding: "utf-8" }
    )
      .split("\n")
      .filter((file) => file !== "");
    // An empty listing would pass vacuously: this file itself must be among those scanned.
    expect(files).toContain(
      "packages/test-kit/src/__tests__/loopback-port.test.ts"
    );
    const offenders = files.filter(
      (file) =>
        !file.endsWith("loopback-port.test.ts") &&
        /\.listen\(\s*0\s*[,)]/.test(
          readFileSync(path.join(root, file), "utf-8")
        )
    );
    expect(offenders).toEqual([]);
  });
});
