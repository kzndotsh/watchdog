import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import type { AddressInfo } from "node:net";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  BlockedTargetError,
  OutboundLimitError,
} from "../../errors/tagged-errors";
import { isBlockedAddress } from "../blocked-address";
import {
  egressProxyFromEnv,
  type HostResolver,
  type ResolvedAddress,
} from "../outbound-policy";
import { createSafeFetch, safeFetch } from "../safe-fetch";

/** The test servers listen on loopback: the only address the test policy lets through. */
const TEST_SERVER_ADDRESS = "127.0.0.1";

function allowOnlyTestServer(address: string): boolean {
  return address !== TEST_SERVER_ADDRESS && isBlockedAddress(address);
}

const records: Record<string, ResolvedAddress[]> = {
  "public.test": [{ address: TEST_SERVER_ADDRESS, family: 4 }],
  "internal.test": [{ address: "10.0.0.5", family: 4 }],
  "metadata.test": [{ address: "169.254.169.254", family: 4 }],
  "loopback6.test": [{ address: "::1", family: 6 }],
  "mapped.test": [{ address: "::ffff:10.0.0.5", family: 6 }],
  "mixed.test": [
    { address: TEST_SERVER_ADDRESS, family: 4 },
    { address: "10.0.0.5", family: 4 },
  ],
  "empty.test": [],
};

type Harness = {
  readonly lookups: string[];
  readonly fetch: ReturnType<typeof createSafeFetch>;
};

function harness(proxyUrl?: string): Harness {
  const lookups: string[] = [];
  const resolve: HostResolver = (host) => {
    lookups.push(host);
    return Promise.resolve(records[host] ?? []);
  };
  return {
    lookups,
    fetch: createSafeFetch({
      resolve,
      isBlocked: allowOnlyTestServer,
      proxyUrl: () => proxyUrl,
    }),
  };
}

function listen(
  handler: (req: IncomingMessage, res: ServerResponse) => void
): Promise<{ server: Server; port: number }> {
  const server = createServer(handler);
  // oxlint-disable-next-line promise/avoid-new -- wraps the callback listen API
  return new Promise((resolve) => {
    server.listen(0, TEST_SERVER_ADDRESS, () => {
      resolve({ server, port: (server.address() as AddressInfo).port });
    });
  });
}

function close(server: Server): Promise<void> {
  // oxlint-disable-next-line promise/avoid-new -- wraps the callback close API
  return new Promise((resolve) => {
    server.closeAllConnections();
    server.close(() => {
      resolve();
    });
  });
}

let origin: string;
let port: number;
function headersSeenByOther(): IncomingMessage["headers"] | undefined {
  return seenByOther.headers;
}

let main: Server;
let other: Server;
let otherPort: number;
let streamClosed: Promise<void>;
let markStreamClosed: () => void;
const seenByOther: { headers: IncomingMessage["headers"] | undefined } = {
  headers: undefined,
};

function route(req: IncomingMessage, res: ServerResponse): void {
  const { pathname } = new URL(req.url ?? "/", "http://x");
  switch (pathname) {
    case "/ok": {
      res.writeHead(200, { "content-type": "text/plain" });
      res.end("hello");
      return;
    }
    case "/to-ok": {
      res.writeHead(302, { location: "/ok" });
      res.end();
      return;
    }
    case "/to-metadata": {
      res.writeHead(302, { location: "http://169.254.169.254/latest/meta" });
      res.end();
      return;
    }
    case "/to-mapped": {
      res.writeHead(302, { location: "http://[::ffff:10.0.0.5]/" });
      res.end();
      return;
    }
    case "/to-ipv6-loopback": {
      res.writeHead(302, { location: "http://[::1]/" });
      res.end();
      return;
    }
    case "/to-name": {
      res.writeHead(302, { location: `http://internal.test:${port}/ok` });
      res.end();
      return;
    }
    case "/to-file": {
      res.writeHead(302, { location: "file:///etc/hosts" });
      res.end();
      return;
    }
    case "/to-other": {
      res.writeHead(302, { location: `http://127.0.0.1:${otherPort}/headers` });
      res.end();
      return;
    }
    case "/loop": {
      res.writeHead(302, { location: "/loop" });
      res.end();
      return;
    }
    case "/big": {
      res.writeHead(200, { "content-type": "application/octet-stream" });
      res.on("close", () => {
        markStreamClosed();
      });
      const chunk = Buffer.alloc(64 * 1024, 97);
      const pump = () => {
        while (!res.destroyed && res.write(chunk)) {
          // keep writing until the client backs off or goes away
        }
        if (!res.destroyed) res.once("drain", pump);
      };
      pump();
      return;
    }
    case "/declared-big": {
      res.writeHead(200, { "content-length": String(50 * 1024 * 1024) });
      res.write("start");
      break;
    }
    case "/stall-headers": {
      // Never answers: the request is left pending on purpose.
      break;
    }
    case "/stall-body": {
      res.writeHead(200, { "content-length": "1000" });
      res.write("partial");
      return;
    }
    default: {
      res.writeHead(404);
      res.end();
    }
  }
}

beforeAll(async () => {
  ({ server: main, port } = await listen(route));
  origin = `http://${TEST_SERVER_ADDRESS}:${port}`;
  ({ server: other, port: otherPort } = await listen((req, res) => {
    seenByOther.headers = req.headers;
    res.writeHead(200);
    res.end("other");
  }));
});

afterAll(async () => {
  await close(main);
  await close(other);
});

describe("safeFetch", () => {
  it("returns the body of an allowed target", async () => {
    const { fetch } = harness();
    const res = await fetch(`${origin}/ok`);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("hello");
    expect(res.url).toBe(`${origin}/ok`);
  });

  describe("blocked targets", () => {
    it.each([
      "http://127.0.0.1/",
      "http://0.0.0.0/",
      "http://10.1.2.3/",
      "http://169.254.169.254/latest/meta-data",
      "http://100.64.0.1/",
      "http://192.168.0.1/",
      "http://172.16.0.1/",
      "http://[::1]/",
      "http://[::]/",
      "http://[fe80::1]/",
      "http://[fd00::1]/",
      "http://[::ffff:127.0.0.1]/",
      "http://[::ffff:7f00:1]/",
      "http://[::ffff:a00:1]/",
      "http://[64:ff9b::7f00:1]/",
      "http://2130706433/",
      "http://0x7f.1/",
      "http://localhost/",
      "http://api.localhost/",
    ])("refuses %s before opening a connection", async (target) => {
      await expect(safeFetch(target)).rejects.toMatchObject({
        code: "blocked_target",
        reason: expect.stringMatching(/^(address|host)$/),
      });
    });

    it("refuses a scheme other than http and https", async () => {
      await expect(safeFetch("file:///etc/hosts")).rejects.toMatchObject({
        reason: "scheme",
      });
      await expect(safeFetch("ftp://example.com/")).rejects.toMatchObject({
        reason: "scheme",
      });
    });

    it("refuses a host name that resolves to a private address", async () => {
      const { fetch, lookups } = harness();
      await expect(
        fetch(`http://internal.test:${port}/ok`)
      ).rejects.toMatchObject({ code: "blocked_target", reason: "address" });
      expect(lookups).toEqual(["internal.test"]);
    });

    it.each(["metadata.test", "loopback6.test", "mapped.test", "empty.test"])(
      "refuses %s when it resolves to a blocked or no address",
      async (host) => {
        const { fetch } = harness();
        await expect(fetch(`http://${host}:${port}/ok`)).rejects.toBeInstanceOf(
          BlockedTargetError
        );
      }
    );

    it("refuses a host name when any one of its addresses is blocked", async () => {
      const { fetch } = harness();
      await expect(
        fetch(`http://mixed.test:${port}/ok`)
      ).rejects.toBeInstanceOf(BlockedTargetError);
    });

    it("carries a fixed message that does not echo the target", async () => {
      const error = await safeFetch("http://10.9.8.7/secret-path").catch(
        (error: unknown) => error
      );
      expect(error).toBeInstanceOf(BlockedTargetError);
      expect((error as BlockedTargetError).message).not.toMatch(
        /10\.9\.8\.7|secret-path/
      );
    });
  });

  describe("address pinning", () => {
    it("connects to the validated address and resolves the name once per request", async () => {
      const { fetch, lookups } = harness();
      const res = await fetch(`http://public.test:${port}/ok`);
      expect(await res.text()).toBe("hello");
      expect(lookups).toEqual(["public.test"]);
    });
  });

  describe("redirects", () => {
    it("follows a redirect to an allowed target and reports the final URL", async () => {
      const { fetch } = harness();
      const res = await fetch(`${origin}/to-ok`);
      expect(await res.text()).toBe("hello");
      expect(res.url).toBe(`${origin}/ok`);
    });

    it.each([
      "/to-metadata",
      "/to-mapped",
      "/to-ipv6-loopback",
      "/to-name",
      "/to-file",
    ])("refuses a redirect to a blocked target (%s)", async (path) => {
      const { fetch } = harness();
      await expect(fetch(`${origin}${path}`)).rejects.toBeInstanceOf(
        BlockedTargetError
      );
    });

    it("stops after the configured number of hops", async () => {
      const { fetch } = harness();
      await expect(
        fetch(`${origin}/loop`, { limits: { maxRedirects: 3 } })
      ).rejects.toMatchObject({ code: "outbound_limit", kind: "redirects" });
    });

    it("returns the first redirect unfollowed when asked for manual mode", async () => {
      const { fetch } = harness();
      const res = await fetch(`${origin}/to-metadata`, { redirect: "manual" });
      expect(res.status).toBe(302);
      expect(res.headers.get("location")).toBe(
        "http://169.254.169.254/latest/meta"
      );
    });

    it("does not forward credentials to another origin", async () => {
      const { fetch } = harness();
      seenByOther.headers = undefined;
      const res = await fetch(`${origin}/to-other`, {
        headers: {
          authorization: "Bearer secret",
          "x-api-key": "secret",
          "user-agent": "watchdog-test",
        },
      });
      expect(await res.text()).toBe("other");
      expect(headersSeenByOther()?.authorization).toBeUndefined();
      expect(headersSeenByOther()?.["x-api-key"]).toBeUndefined();
      expect(headersSeenByOther()?.["user-agent"]).toBe("watchdog-test");
    });
  });

  describe("byte limit", () => {
    it("cuts off an endless body and releases the connection", async () => {
      const { fetch } = harness();
      streamClosed = new Promise<void>((resolve) => {
        markStreamClosed = resolve;
      });
      const res = await fetch(`${origin}/big`, {
        limits: { maxBytes: 100_000 },
      });
      await expect(res.arrayBuffer()).rejects.toMatchObject({
        code: "outbound_limit",
        kind: "bytes",
        limit: 100_000,
      });
      await streamClosed;
    });

    it("returns exactly the limit when truncating", async () => {
      const { fetch } = harness();
      streamClosed = new Promise<void>((resolve) => {
        markStreamClosed = resolve;
      });
      const res = await fetch(`${origin}/big`, {
        limits: { maxBytes: 1000, truncate: true },
      });
      expect((await res.arrayBuffer()).byteLength).toBe(1000);
      await streamClosed;
    });

    it("refuses a response that declares more than the limit before reading it", async () => {
      const { fetch } = harness();
      await expect(
        fetch(`${origin}/declared-big`, { limits: { maxBytes: 1024 } })
      ).rejects.toBeInstanceOf(OutboundLimitError);
    });
  });

  describe("timeout", () => {
    it("gives up on a server that never sends headers", async () => {
      const { fetch } = harness();
      await expect(
        fetch(`${origin}/stall-headers`, { limits: { timeoutMs: 200 } })
      ).rejects.toMatchObject({ code: "outbound_limit", kind: "timeout" });
    });

    it("gives up on a body that stalls part-way", async () => {
      const { fetch } = harness();
      const res = await fetch(`${origin}/stall-body`, {
        limits: { timeoutMs: 300 },
      });
      await expect(res.text()).rejects.toMatchObject({
        code: "outbound_limit",
        kind: "timeout",
      });
    });

    it("keeps the caller's own abort signal working", async () => {
      const { fetch } = harness();
      const controller = new AbortController();
      const pending = fetch(`${origin}/stall-headers`, {
        signal: controller.signal,
      });
      controller.abort();
      await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    });
  });

  describe("egress proxy", () => {
    it("sends every request through the proxy without resolving the target locally", async () => {
      const seen: string[] = [];
      // The proxy accepts the tunnel the client opens, then serves the tunneled request itself.
      const tunneled = createServer((req, res) => {
        seen.push(`${req.method} ${req.headers.host}${req.url}`);
        res.writeHead(200);
        res.end("via-proxy");
      });
      const proxy = await listen((_req, res) => {
        res.writeHead(502);
        res.end();
      });
      proxy.server.on("connect", (req, socket) => {
        seen.push(`CONNECT ${req.url}`);
        socket.write("HTTP/1.1 200 Connection Established\r\n\r\n");
        tunneled.emit("connection", socket);
      });
      try {
        const { fetch, lookups } = harness(
          `http://${TEST_SERVER_ADDRESS}:${proxy.port}`
        );
        const res = await fetch("http://target.example/path?q=1");
        expect(await res.text()).toBe("via-proxy");
        expect(seen).toEqual([
          "CONNECT target.example:80",
          "GET target.example/path?q=1",
        ]);
        expect(lookups).toEqual([]);
      } finally {
        await close(proxy.server);
        await close(tunneled);
      }
    });

    it("still refuses literal private targets and bad schemes locally", async () => {
      const seen: string[] = [];
      const proxy = await listen((req, res) => {
        seen.push(req.url ?? "");
        res.writeHead(200);
        res.end();
      });
      try {
        const { fetch } = harness(
          `http://${TEST_SERVER_ADDRESS}:${proxy.port}`
        );
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
        await close(proxy.server);
      }
    });

    it("fails closed when the proxy setting is not an http(s) URL", async () => {
      const { fetch } = harness("socks5://127.0.0.1:1080");
      await expect(fetch(`${origin}/ok`)).rejects.toMatchObject({
        code: "blocked_target",
        reason: "proxy",
      });
    });
  });
});

describe("egressProxyFromEnv", () => {
  it("reads WD_EGRESS_PROXY and treats blank as unset", () => {
    expect(egressProxyFromEnv({ WD_EGRESS_PROXY: " http://p:3128 " })).toBe(
      "http://p:3128"
    );
    expect(egressProxyFromEnv({ WD_EGRESS_PROXY: "  " })).toBeUndefined();
    expect(egressProxyFromEnv({})).toBeUndefined();
  });
});
