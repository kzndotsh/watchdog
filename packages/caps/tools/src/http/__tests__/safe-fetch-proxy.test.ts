import { createServer } from "node:http";

import { describe, expect, it, vi } from "vitest";

import { BlockedTargetError } from "../../errors/tagged-errors";
import {
  TEST_SERVER_ADDRESS,
  closePlain,
  harness,
  listenPlain,
} from "./helpers/loopback-server";

vi.unmock("undici");

// The egress-proxy pool stays on HTTP/1.1.
describe("safeFetch egress proxy", () => {
  it("sends every request through the proxy", async () => {
    const seen: string[] = [];
    // The proxy accepts the tunnel the client opens, then serves the tunneled request itself.
    const tunneled = createServer((req, res) => {
      seen.push(`${req.method} ${req.headers.host}${req.url}`);
      res.writeHead(200);
      res.end("via-proxy");
    });
    const proxy = await listenPlain((_req, res) => {
      res.writeHead(502);
      res.end();
    });
    proxy.server.on("connect", (req, socket) => {
      seen.push(`CONNECT ${req.url}`);
      socket.write("HTTP/1.1 200 Connection Established\r\n\r\n");
      tunneled.emit("connection", socket);
    });
    try {
      const { fetch, lookups } = harness({
        proxyUrl: `http://${TEST_SERVER_ADDRESS}:${proxy.port}`,
      });
      const res = await fetch("http://target.example/path?q=1");
      expect(await res.text()).toBe("via-proxy");
      expect(seen).toEqual([
        "CONNECT target.example:80",
        "GET target.example/path?q=1",
      ]);
      // Best-effort local resolution still ran, and an unknown name proceeds to the proxy.
      expect(lookups).toEqual(["target.example"]);
    } finally {
      await closePlain(proxy.server);
      await closePlain(tunneled);
    }
  });

  it("still refuses literal private targets and bad schemes locally", async () => {
    const seen: string[] = [];
    const proxy = await listenPlain((req, res) => {
      seen.push(req.url ?? "");
      res.writeHead(200);
      res.end();
    });
    try {
      const { fetch } = harness({
        proxyUrl: `http://${TEST_SERVER_ADDRESS}:${proxy.port}`,
      });
      await expect(fetch("http://10.0.0.1/")).rejects.toBeInstanceOf(
        BlockedTargetError
      );
      await expect(fetch("http://localhost/")).rejects.toBeInstanceOf(
        BlockedTargetError
      );
      await expect(fetch("file:///etc/hosts")).rejects.toBeInstanceOf(
        BlockedTargetError
      );
      expect(seen).toEqual([]);
    } finally {
      await closePlain(proxy.server);
    }
  });

  it("refuses a name that resolves to a refused address, and the non-public names, before the proxy sees them", async () => {
    const seen: string[] = [];
    const proxy = await listenPlain((req, res) => {
      seen.push(req.url ?? "");
      res.writeHead(200);
      res.end();
    });
    proxy.server.on("connect", (req, socket) => {
      seen.push(`CONNECT ${req.url}`);
      socket.destroy();
    });
    try {
      const { fetch } = harness({
        proxyUrl: `http://${TEST_SERVER_ADDRESS}:${proxy.port}`,
      });
      await expect(fetch("http://internal.test/")).rejects.toMatchObject({
        reason: "resolved",
      });
      await expect(fetch("http://intranet/")).rejects.toMatchObject({
        reason: "host",
      });
      await expect(fetch("http://printer.lan/")).rejects.toMatchObject({
        reason: "host",
      });
      expect(seen).toEqual([]);
    } finally {
      await closePlain(proxy.server);
    }
  });

  it("lets the proxy try a name this host cannot resolve", async () => {
    const seen: string[] = [];
    const proxy = await listenPlain((_req, res) => {
      res.writeHead(502);
      res.end();
    });
    proxy.server.on("connect", (req, socket) => {
      seen.push(`CONNECT ${req.url}`);
      socket.end("HTTP/1.1 502 Bad Gateway\r\n\r\n");
    });
    try {
      const { fetch } = harness({
        proxyUrl: `http://${TEST_SERVER_ADDRESS}:${proxy.port}`,
      });
      // The tunnel is refused by this test proxy; the point is that it was attempted.
      await expect(fetch("http://error.test/")).rejects.toBeDefined();
      expect(seen).toEqual(["CONNECT error.test:80"]);
    } finally {
      await closePlain(proxy.server);
    }
  });

  it("fails closed when the proxy setting is not an http(s) URL", async () => {
    const { fetch } = harness({ proxyUrl: "socks5://127.0.0.1:1080" });
    await expect(fetch("http://127.0.0.1:1/ok")).rejects.toMatchObject({
      code: "blocked_target",
      reason: "proxy",
    });
  });
});
