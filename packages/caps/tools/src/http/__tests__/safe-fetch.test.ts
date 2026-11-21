import type { IncomingMessage } from "node:http";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import {
  BlockedTargetError,
  OutboundLimitError,
  UnexpectedToolError,
} from "../../errors/tagged-errors";
import { egressProxyFromEnv } from "../outbound-policy";
import { safeFetch } from "../safe-fetch";
import {
  PROTOCOLS,
  harness,
  listenPlain,
  listenProtocol,
  closePlain,
  type Loopback,
  type Protocol,
} from "./helpers/loopback-server";
import { createRoute } from "./helpers/safe-fetch-routes";

// The shared setup routes undici's fetch to the global one for MSW; this file needs the
// real transport so the connection lookup hook is what decides where sockets go.
vi.unmock("undici");

/**
 * Every protection below runs over HTTP/1.1 and over HTTP/2 (TLS with ALPN `h2`, a
 * self-signed certificate made in the test and trusted by the test client only).
 */
describe.each(PROTOCOLS)("safeFetch over %s", (protocol: Protocol) => {
  let main: Loopback;
  let origin: string;
  let port: number;
  let scheme: string;
  let otherServer: Awaited<ReturnType<typeof listenPlain>>;
  const other: { seen: { headers: IncomingMessage["headers"] | undefined } } = {
    seen: { headers: undefined },
  };
  let markStreamClosed: () => void = () => undefined;

  /** A promise that settles when the server sees the `/big` response close. */
  function armStreamClosed(): Promise<void> {
    // oxlint-disable-next-line promise/avoid-new -- bridges a server event
    return new Promise<void>((resolve) => {
      markStreamClosed = resolve;
    });
  }

  const seenByOther = () => other.seen.headers;

  const client = () => harness({ ca: main.ca });

  beforeAll(async () => {
    otherServer = await listenPlain((req, res) => {
      other.seen.headers = req.headers;
      res.writeHead(200);
      res.end("other");
    });
    main = await listenProtocol(
      protocol,
      createRoute({
        otherPort: () => otherServer.port,
        port: () => port,
        onBigClosed: () => {
          markStreamClosed();
        },
      })
    );
    ({ origin, port, scheme } = main);
  });

  afterAll(async () => {
    await main.stop();
    await closePlain(otherServer.server);
  });

  it("returns the body of an allowed target", async () => {
    const { fetch } = client();
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

    it.each([
      "http://intranet/",
      "http://printer.lan/",
      "http://svc.internal/",
      "http://nas.local/",
      "http://router.home.arpa/",
    ])("refuses the non-public name %s without a lookup", async (target) => {
      const { fetch, lookups } = client();
      await expect(fetch(target)).rejects.toMatchObject({
        code: "blocked_target",
        reason: "host",
      });
      expect(lookups).toEqual([]);
    });

    it("words a name that resolved to a refused address like any other failure", async () => {
      const { fetch } = client();
      const resolved = await fetch(
        `${scheme}://internal.test:${port}/ok`
      ).catch((error: unknown) => error);
      const generic = new UnexpectedToolError({ cause: new Error("x") });
      expect((resolved as BlockedTargetError).message).toBe(generic.message);
      expect((resolved as BlockedTargetError).message).not.toMatch(
        /blocked|private|address/i
      );
      const literal = await fetch("http://10.0.0.5/").catch(
        (error: unknown) => error
      );
      expect((literal as BlockedTargetError).message).toMatch(
        /not publicly routable/
      );
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
      const { fetch, lookups } = client();
      await expect(
        fetch(`${scheme}://internal.test:${port}/ok`)
      ).rejects.toMatchObject({ code: "blocked_target", reason: "resolved" });
      expect(lookups).toEqual(["internal.test"]);
    });

    it.each(["metadata.test", "loopback6.test", "mapped.test", "empty.test"])(
      "refuses %s when it resolves to a blocked or no address",
      async (host) => {
        const { fetch } = client();
        await expect(
          fetch(`${scheme}://${host}:${port}/ok`)
        ).rejects.toBeInstanceOf(BlockedTargetError);
      }
    );

    it("refuses a host name when any one of its addresses is blocked", async () => {
      const { fetch } = client();
      await expect(
        fetch(`${scheme}://mixed.test:${port}/ok`)
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
      const { fetch, lookups } = client();
      const res = await fetch(`${scheme}://public.test:${port}/ok`);
      expect(await res.text()).toBe("hello");
      expect(lookups).toEqual(["public.test"]);
    });

    it("reaches a server through a name only the injected resolver knows", async () => {
      // `public.test` has no DNS record: the request can only succeed when the
      // transport honours the dispatcher's lookup hook.
      const { fetch } = client();
      const res = await fetch(`${scheme}://public.test:${port}/ok`);
      expect(res.status).toBe(200);
    });

    it("refuses a name the injected resolver maps to a blocked address with reason resolved, not a DNS error", async () => {
      const { fetch } = client();
      await expect(
        fetch(`${scheme}://internal.test:${port}/ok`)
      ).rejects.toMatchObject({ code: "blocked_target", reason: "resolved" });
    });
  });

  describe("redirects", () => {
    it("follows a redirect to an allowed target and reports the final URL", async () => {
      const { fetch } = client();
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
      const { fetch } = client();
      await expect(fetch(`${origin}${path}`)).rejects.toBeInstanceOf(
        BlockedTargetError
      );
    });

    it("stops after the configured number of hops", async () => {
      const { fetch } = client();
      await expect(
        fetch(`${origin}/loop`, { limits: { maxRedirects: 3 } })
      ).rejects.toMatchObject({ code: "outbound_limit", kind: "redirects" });
    });

    it("returns the first redirect unfollowed when asked for manual mode", async () => {
      const { fetch } = client();
      const res = await fetch(`${origin}/to-metadata`, { redirect: "manual" });
      expect(res.status).toBe(302);
      expect(res.headers.get("location")).toBe(
        "http://169.254.169.254/latest/meta"
      );
    });

    it("does not re-send a request body to another origin on a 307", async () => {
      const { fetch } = client();
      other.seen.headers = undefined;
      await expect(
        fetch(`${origin}/to-other-307`, { method: "POST", body: "payload" })
      ).rejects.toMatchObject({ code: "blocked_target", reason: "redirect" });
      expect(seenByOther()).toBeUndefined();
    });

    it("keeps the body for a 307 within the same origin", async () => {
      const { fetch } = client();
      const res = await fetch(`${origin}/to-same-307`, {
        method: "POST",
        body: "payload",
      });
      expect(await res.text()).toBe("payload");
    });

    it("does not forward credentials to another origin", async () => {
      const { fetch } = client();
      other.seen.headers = undefined;
      const res = await fetch(`${origin}/to-other`, {
        headers: {
          authorization: "Bearer secret",
          "x-api-key": "secret",
          "user-agent": "watchdog-test",
        },
      });
      expect(await res.text()).toBe("other");
      expect(seenByOther()?.authorization).toBeUndefined();
      expect(seenByOther()?.["x-api-key"]).toBeUndefined();
      expect(seenByOther()?.["user-agent"]).toBe("watchdog-test");
    });
  });

  describe("byte limit", () => {
    it("cuts off an endless body and releases the connection", async () => {
      const { fetch } = client();
      const streamClosed = armStreamClosed();
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
      const { fetch } = client();
      const streamClosed = armStreamClosed();
      const res = await fetch(`${origin}/big`, {
        limits: { maxBytes: 1000, truncate: true },
      });
      expect((await res.arrayBuffer()).byteLength).toBe(1000);
      await streamClosed;
    });

    it("does not apply the size check to a HEAD response", async () => {
      const { fetch } = client();
      const res = await fetch(`${origin}/declared-big`, {
        method: "HEAD",
        limits: { maxBytes: 1024 },
      });
      expect(res.status).toBe(200);
    });

    it("refuses a response that declares more than the limit before reading it", async () => {
      const { fetch } = client();
      await expect(
        fetch(`${origin}/declared-big`, { limits: { maxBytes: 1024 } })
      ).rejects.toBeInstanceOf(OutboundLimitError);
    });
  });

  describe("timeout", () => {
    it("gives up on a server that never sends headers", async () => {
      const { fetch } = client();
      await expect(
        fetch(`${origin}/stall-headers`, { limits: { timeoutMs: 200 } })
      ).rejects.toMatchObject({ code: "outbound_limit", kind: "timeout" });
    });

    it("gives up on a body that stalls part-way", async () => {
      const { fetch } = client();
      const res = await fetch(`${origin}/stall-body`, {
        limits: { timeoutMs: 300 },
      });
      await expect(res.text()).rejects.toMatchObject({
        code: "outbound_limit",
        kind: "timeout",
      });
    });

    it("keeps the caller's own abort signal working", async () => {
      const { fetch } = client();
      const controller = new AbortController();
      const pending = fetch(`${origin}/stall-headers`, {
        signal: controller.signal,
      });
      controller.abort();
      await expect(pending).rejects.toMatchObject({ name: "AbortError" });
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
