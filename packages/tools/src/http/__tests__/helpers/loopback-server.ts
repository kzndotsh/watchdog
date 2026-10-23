import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import {
  createSecureServer,
  type Http2SecureServer,
  type Http2ServerRequest,
} from "node:http2";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";

import { isBlockedAddress } from "../../blocked-address";
import type { HostResolver, ResolvedAddress } from "../../outbound-policy";
import {
  createSafeFetch,
  type RetryPolicy,
  type SafeFetchDeps,
} from "../../safe-fetch";

/** The test servers listen on loopback: the only address the test policy lets through. */
export const TEST_SERVER_ADDRESS = "127.0.0.1";

/** The wire protocols the protection tests run over. */
export type Protocol = "http/1.1" | "h2";
export const PROTOCOLS: readonly Protocol[] = ["http/1.1", "h2"];

export type Req = IncomingMessage | Http2ServerRequest;
/** The part of a response that HTTP/1.1 `ServerResponse` and HTTP/2 compat share. */
export type Res = {
  writeHead: (status: number, headers?: Record<string, string>) => unknown;
  write: (chunk: string | Buffer) => boolean;
  end: (chunk: string) => unknown;
  on: (event: "close" | "drain", listener: () => void) => unknown;
  once: (event: "close" | "drain", listener: () => void) => unknown;
  /** HTTP/1.1: the response is destroyed. */
  readonly destroyed?: boolean;
  /** HTTP/2: the stream the response writes to. */
  readonly stream?: { readonly destroyed: boolean };
};
export type Handler = (req: Req, res: Res) => void;

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

export type Harness = {
  readonly lookups: string[];
  readonly fetch: ReturnType<typeof createSafeFetch>;
};

export type HarnessOptions = {
  readonly proxyUrl?: string;
  /** PEM of the loopback TLS server's certificate, trusted by this client only. */
  readonly ca?: string;
  readonly retry?: RetryPolicy;
  readonly overrides?: Partial<SafeFetchDeps>;
};

/** A client whose resolver and address policy know only the loopback test server. */
export function harness(options: HarnessOptions = {}): Harness {
  const lookups: string[] = [];
  const resolve: HostResolver = (host) => {
    lookups.push(host);
    if (host === "error.test") return Promise.reject(new Error("ENOTFOUND"));
    return Promise.resolve(records[host] ?? []);
  };
  return {
    lookups,
    fetch: createSafeFetch({
      resolve,
      isBlocked: allowOnlyTestServer,
      proxyUrl: () => options.proxyUrl,
      extraCa: options.ca,
      // Tests wait as little as possible between attempts.
      retry: options.retry ?? { maxAttempts: 3, baseDelayMs: 1 },
      ...options.overrides,
    }),
  };
}

export type TestCert = { readonly key: string; readonly cert: string };

let cached: TestCert | undefined;

/**
 * A self-signed certificate for loopback and the test host names, made once per process
 * with the `openssl` binary (no network, nothing checked in). Trusted only through the
 * client's `extraCa`.
 */
export function testCert(): TestCert {
  if (cached !== undefined) return cached;
  const dir = mkdtempSync(path.join(tmpdir(), "wd-loopback-tls-"));
  try {
    const keyPath = path.join(dir, "key.pem");
    const certPath = path.join(dir, "cert.pem");
    execFileSync(
      "openssl",
      [
        "req",
        "-x509",
        "-newkey",
        "ec",
        "-pkeyopt",
        "ec_paramgen_curve:prime256v1",
        "-nodes",
        "-keyout",
        keyPath,
        "-out",
        certPath,
        "-days",
        "2",
        "-subj",
        "/CN=localhost",
        "-addext",
        `subjectAltName=IP:${TEST_SERVER_ADDRESS},DNS:localhost,DNS:public.test`,
      ],
      { stdio: "ignore" }
    );
    cached = {
      key: readFileSync(keyPath, "utf-8"),
      cert: readFileSync(certPath, "utf-8"),
    };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  return cached;
}

export type Loopback = {
  readonly port: number;
  /** `http` or `https`. */
  readonly scheme: "http" | "https";
  /** `scheme://127.0.0.1:port`. */
  readonly origin: string;
  readonly ca: string | undefined;
  readonly stop: () => Promise<void>;
};

type AnyServer = Server | Http2SecureServer;

function listenOn(server: AnyServer): Promise<number> {
  // oxlint-disable-next-line promise/avoid-new -- wraps the callback listen API
  return new Promise((resolve) => {
    server.listen(0, TEST_SERVER_ADDRESS, () => {
      resolve((server.address() as AddressInfo).port);
    });
  });
}

function stopServer(server: AnyServer): Promise<void> {
  // oxlint-disable-next-line promise/avoid-new -- wraps the callback close API
  return new Promise((resolve) => {
    if ("closeAllConnections" in server) server.closeAllConnections();
    server.close(() => {
      resolve();
    });
    // An HTTP/2 server has no `closeAllConnections`: its sessions are ended by the clients.
  });
}

/** A plain HTTP/1.1 server (also used for proxies and the redirect target). */
export async function listenPlain(
  handler: (req: IncomingMessage, res: ServerResponse) => void
): Promise<{ server: Server; port: number }> {
  const server = createServer(handler);
  return { server, port: await listenOn(server) };
}

export async function closePlain(server: Server): Promise<void> {
  await stopServer(server);
}

/** The handler behind `protocol`: a plain HTTP/1.1 server, or TLS that offers only `h2`. */
export async function listenProtocol(
  protocol: Protocol,
  handler: Handler
): Promise<Loopback> {
  if (protocol === "http/1.1") {
    const server = createServer(handler);
    const port = await listenOn(server);
    return {
      port,
      scheme: "http",
      origin: `http://${TEST_SERVER_ADDRESS}:${port}`,
      ca: undefined,
      stop: async () => stopServer(server),
    };
  }
  const { key, cert } = testCert();
  const sessions = new Set<{ destroy: () => void }>();
  const server = createSecureServer(
    { key, cert, allowHTTP1: false, ALPNProtocols: ["h2"] },
    handler
  );
  server.on("session", (session) => {
    sessions.add(session);
    session.on("close", () => sessions.delete(session));
  });
  const port = await listenOn(server);
  return {
    port,
    scheme: "https",
    origin: `https://${TEST_SERVER_ADDRESS}:${port}`,
    ca: cert,
    stop: async () => {
      for (const session of sessions) session.destroy();
      await stopServer(server);
    },
  };
}

/** True once the peer closed or reset this response's connection or stream. */
export function responseGone(res: Res): boolean {
  return res.stream?.destroyed ?? res.destroyed ?? false;
}
