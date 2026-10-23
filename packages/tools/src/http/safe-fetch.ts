import { setTimeout as delay } from "node:timers/promises";

import {
  Agent,
  Headers as UndiciHeaders,
  ProxyAgent,
  fetch as undiciFetch,
  type Dispatcher,
  type RequestInit as UndiciRequestInit,
} from "undici";

import {
  BlockedTargetError,
  OutboundLimitError,
} from "../errors/tagged-errors";
import { isBlockedAddress } from "./blocked-address";
import { cappedResponse, declaredLength, discardBody } from "./capped-body";
import {
  assertAllowedTarget,
  assertResolvesPublic,
  bareHost,
  createSafeLookup,
  egressProxyFromEnv,
  requireProxyUrl,
  systemResolver,
  type AddressPolicy,
  type HostResolver,
} from "./outbound-policy";
import { isRedirectResponse, resolveRedirectUrl } from "./redirect";

/** Bounds of one outbound call. Every field has a default; a call may override any. */
export type OutboundLimits = {
  /** Largest response body read, in bytes. */
  readonly maxBytes?: number;
  /** Deadline for the whole call (all hops and the body), separate from the Cap's own timeout. */
  readonly timeoutMs?: number;
  /** Largest number of redirect hops followed. */
  readonly maxRedirects?: number;
  /** At `maxBytes`: stop and return what was read (`true`) or fail (`false`, default). */
  readonly truncate?: boolean;
};

export const DEFAULT_OUTBOUND_LIMITS = {
  maxBytes: 8 * 1024 * 1024,
  timeoutMs: 30_000,
  maxRedirects: 5,
  truncate: false,
} as const satisfies Required<OutboundLimits>;

const CONNECT_TIMEOUT_MS = 10_000;

/**
 * The direct pool negotiates HTTP/2 by ALPN and falls back to HTTP/1.1. The body cap, the
 * deadline, caller abort and the per-hop checks are tested over both (`safe-fetch.test.ts`).
 * The egress-proxy pool stays on HTTP/1.1 (`allowH2: false`).
 */
const DIRECT_PROTOCOLS = { allowH2: true } as const;
const PROXY_PROTOCOLS = { allowH2: false } as const;

/** Bounded retry of one hop: methods and failures that are safe to send again. */
export type RetryPolicy = {
  /** Largest number of sends per hop, the first included. */
  readonly maxAttempts: number;
  /** Wait before the first retry; doubles each time, capped at `MAX_RETRY_DELAY_MS`. */
  readonly baseDelayMs: number;
};

const DEFAULT_RETRY_POLICY = {
  maxAttempts: 3,
  baseDelayMs: 250,
} as const satisfies RetryPolicy;

const MAX_RETRY_DELAY_MS = 2000;
const RETRYABLE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const RETRYABLE_STATUSES = new Set([502, 503, 504]);
/** Transport failures where the peer dropped the link or never accepted it. */
const RETRYABLE_ERROR_CODES = new Set([
  "ECONNRESET",
  "UND_ERR_SOCKET",
  "UND_ERR_CONNECT_TIMEOUT",
]);

/**
 * True only for a transient transport failure. A protection's refusal (blocked address,
 * limit) or an abort anywhere in the cause chain is never transient.
 */
function isTransientError(error: unknown): boolean {
  let current: unknown = error;
  let transient = false;
  for (let depth = 0; depth < 6 && current instanceof Error; depth += 1) {
    if (
      current instanceof BlockedTargetError ||
      current instanceof OutboundLimitError ||
      current.name === "AbortError" ||
      current.name === "TimeoutError"
    ) {
      return false;
    }
    if (
      "code" in current &&
      typeof current.code === "string" &&
      RETRYABLE_ERROR_CODES.has(current.code)
    ) {
      transient = true;
    }
    current = current.cause;
  }
  return transient;
}

function retryDelayMs(policy: RetryPolicy, retriesDone: number): number {
  return Math.min(
    MAX_RETRY_DELAY_MS,
    policy.baseDelayMs * 2 ** (retriesDone - 1)
  );
}

/** `RequestInit` plus the per-call limits. `redirect: "manual"` returns the first 3xx unfollowed. */
export type SafeFetchInit = RequestInit & { readonly limits?: OutboundLimits };

/** The hardened outbound `fetch`. */
export type SafeFetch = (
  input: string | URL,
  init?: SafeFetchInit
) => Promise<Response>;

/** The outbound `fetch` and the connection pools behind it; `close` ends the pools. */
export type OutboundTransport = {
  readonly fetch: SafeFetch;
  /**
   * Closes every pool, waiting up to `graceMs` for in-flight requests to finish and
   * aborting what is left. Idempotent. After it, `fetch` rejects.
   */
  readonly close: (graceMs?: number) => Promise<void>;
};

/** Longest wait for in-flight requests when the pools close. */
const POOL_CLOSE_GRACE_MS = 5000;

export type SafeFetchDeps = {
  /** The transport. Default: `fetch` of the `undici` package that supplies the dispatcher. */
  readonly fetch?: typeof undiciFetch;
  /** Builds a pool for a proxy setting (`undefined`: direct). Default: the validating `Agent` / `ProxyAgent`. */
  readonly createDispatcher?: (proxy: string | undefined) => Dispatcher;
  readonly resolve?: HostResolver;
  readonly isBlocked?: AddressPolicy;
  /** Egress proxy URL, read per call. Default: `WD_EGRESS_PROXY`. */
  readonly proxyUrl?: () => string | undefined;
  /** Retry bounds for idempotent requests. Default: `DEFAULT_RETRY_POLICY`. */
  readonly retry?: RetryPolicy;
  /** Tests only: extra trusted CA (PEM) for a loopback TLS server. Does not touch `lookup`. */
  readonly extraCa?: string;
};

/** Headers that may follow a redirect to another origin (credentials never do). */
const CROSS_ORIGIN_HEADERS = new Set([
  "accept",
  "accept-encoding",
  "accept-language",
  "cache-control",
  "range",
  "user-agent",
]);

function originOf(url: URL): string {
  return url.origin;
}

function typedCause(error: unknown): unknown {
  let current: unknown = error;
  for (let depth = 0; depth < 6 && current instanceof Error; depth += 1) {
    if (
      current instanceof BlockedTargetError ||
      current instanceof OutboundLimitError
    ) {
      return current;
    }
    current = current.cause;
  }
  return error;
}

function urlOf(input: string | URL): URL {
  return typeof input === "string" ? new URL(input) : input;
}

type BodyInitReusable =
  | string
  | URLSearchParams
  | Blob
  | ArrayBuffer
  | ArrayBufferView
  | FormData;

function isReusableBody(
  body: unknown
): body is BodyInitReusable | null | undefined {
  return !(body instanceof ReadableStream);
}

function nextRequest(
  status: number,
  method: string,
  headers: UndiciHeaders,
  body: UndiciRequestInit["body"],
  crossOrigin: boolean
): {
  method: string;
  headers: UndiciHeaders;
  body: UndiciRequestInit["body"];
} | null {
  const toGet =
    status === 303
      ? method !== "HEAD"
      : (status === 301 || status === 302) && method === "POST";
  if (!toGet && !isReusableBody(body)) return null;
  // A request body is never re-sent to a different origin.
  if (!toGet && crossOrigin && body !== undefined && body !== null) return null;
  const kept = new UndiciHeaders();
  for (const [name, value] of headers) {
    const lower = name.toLowerCase();
    if (crossOrigin && !CROSS_ORIGIN_HEADERS.has(lower)) continue;
    if (toGet && lower.startsWith("content-")) continue;
    kept.set(name, value);
  }
  return toGet
    ? { method: "GET", headers: kept, body: undefined }
    : { method, headers: kept, body };
}

/**
 * Builds the hardened outbound `fetch` and its connection pools. Guarantees, for every call:
 * - only http(s) targets; literal IP hosts and `localhost` names are checked
 *   before any socket opens;
 * - a host name is resolved once, every returned address is validated, and the
 *   socket connects to a validated address (the connection `lookup` hook), so
 *   nothing is resolved again between check and connect;
 * - redirects are followed manually and each hop repeats the checks above,
 *   up to `maxRedirects`; credentials are not forwarded to another origin;
 * - the body is streamed and read only up to `maxBytes`;
 * - the whole call has its own deadline (`timeoutMs`).
 * With an egress proxy the proxy connects, so the connection-time address
 * validation cannot apply; on every hop the scheme, literal-IP and host-name
 * checks still run, and the name is resolved locally as a best effort and
 * refused when any answer is not public (a resolution failure proceeds to the
 * proxy).
 * The pools belong to the caller: `close` ends them (the scoped Layer in
 * `outbound-client.ts` does it when its scope closes). `deps` exists for tests.
 */
export function createOutboundTransport(
  deps: SafeFetchDeps = {}
): OutboundTransport {
  const isBlocked = deps.isBlocked ?? isBlockedAddress;
  const resolve = deps.resolve ?? systemResolver;
  const lookup = createSafeLookup(resolve, isBlocked);
  const send = deps.fetch ?? undiciFetch;
  const proxyUrl = deps.proxyUrl ?? (() => egressProxyFromEnv());
  const retryPolicy = deps.retry ?? DEFAULT_RETRY_POLICY;
  // One pool per proxy setting, all closed together by `close`.
  const pools = new Map<string, Dispatcher>();
  // Calls whose response (body included) is still open: aborted when the grace ends.
  const active = new Set<AbortController>();
  let closing: Promise<void> | undefined;
  // Aborted when `close` starts: a call waiting to retry ends then, not after shutdown.
  const shutdown = new AbortController();

  function createDispatcher(proxy: string | undefined): Dispatcher {
    if (deps.createDispatcher !== undefined)
      return deps.createDispatcher(proxy);
    return proxy === undefined
      ? new Agent({
          ...DIRECT_PROTOCOLS,
          connect: {
            lookup,
            timeout: CONNECT_TIMEOUT_MS,
            ...(deps.extraCa === undefined ? {} : { ca: deps.extraCa }),
          },
        })
      : new ProxyAgent({
          ...PROXY_PROTOCOLS,
          uri: requireProxyUrl(proxy).href,
          // undici 8 forwards plain-http targets in absolute form unless told to tunnel;
          // keep the CONNECT tunnel every target used under undici 7.
          proxyTunnel: true,
          connectTimeout: CONNECT_TIMEOUT_MS,
        });
  }

  function dispatcherFor(proxy: string | undefined): Dispatcher {
    if (closing !== undefined) {
      throw new Error("The outbound client is closed");
    }
    const key = proxy ?? "";
    const existing = pools.get(key);
    if (existing !== undefined) return existing;
    const dispatcher = createDispatcher(proxy);
    pools.set(key, dispatcher);
    return dispatcher;
  }

  async function closePools(graceMs: number): Promise<void> {
    const dispatchers = [...pools.values()];
    const stopTimer = new AbortController();
    const late = delay(graceMs, "late" as const, { signal: stopTimer.signal });
    const drained = Promise.allSettled(
      dispatchers.map(async (dispatcher) => dispatcher.close())
    ).then(() => "closed" as const);
    const outcome = await Promise.race([drained, late]);
    stopTimer.abort();
    try {
      await late;
    } catch {
      // The grace timer was cancelled because the pools drained first.
    }
    if (outcome === "late") {
      // Destroying a closing pool leaves its in-flight calls hanging, so the calls still
      // open are aborted: each ends at once and releases its connection.
      for (const controller of active) {
        controller.abort(new Error("The outbound client is closed"));
      }
      await drained;
    }
    pools.clear();
  }

  const close = async (graceMs: number = POOL_CLOSE_GRACE_MS) => {
    shutdown.abort(new Error("The outbound client is closed"));
    closing ??= closePools(graceMs);
    return closing;
  };

  /**
   * One hop, sent again only for GET/HEAD/OPTIONS after a transient failure (reset
   * connection, connect timeout, 502/503/504), at most `maxAttempts` sends with backoff.
   * Never after a refusal or an abort: those are not transient, and a stopped `signal`
   * ends the wait. Every send opens its connection through the validating `lookup`.
   */
  async function backoff(attempt: number, signal: AbortSignal): Promise<void> {
    try {
      await delay(retryDelayMs(retryPolicy, attempt), undefined, {
        signal: AbortSignal.any([signal, shutdown.signal]),
      });
    } catch (error) {
      throw signal.aborted ? error : shutdown.signal.reason;
    }
  }

  async function sendWithRetry(
    url: URL,
    request: UndiciRequestInit & { signal: AbortSignal; method: string }
  ): ReturnType<typeof undiciFetch> {
    const { method, signal } = request;
    const maxAttempts = RETRYABLE_METHODS.has(method)
      ? Math.max(1, retryPolicy.maxAttempts)
      : 1;
    /* oxlint-disable no-await-in-loop */
    for (let n = 1; ; n += 1) {
      let res: Awaited<ReturnType<typeof undiciFetch>>;
      try {
        res = await send(url, request);
      } catch (error) {
        if (n >= maxAttempts || signal.aborted || !isTransientError(error)) {
          throw error;
        }
        await backoff(n, signal);
        continue;
      }
      if (n >= maxAttempts || !RETRYABLE_STATUSES.has(res.status)) return res;
      await discardBody(res.body);
      await backoff(n, signal);
    }
    /* oxlint-enable no-await-in-loop */
  }

  async function outboundFetch(input: string | URL, init: SafeFetchInit = {}) {
    const limits = { ...DEFAULT_OUTBOUND_LIMITS, ...init.limits };
    const proxy = proxyUrl();
    const dispatcher = dispatcherFor(proxy);
    const controller = new AbortController();
    active.add(controller);
    const timer = setTimeout(() => {
      controller.abort(
        new OutboundLimitError({ kind: "timeout", limit: limits.timeoutMs })
      );
    }, limits.timeoutMs);
    const signal =
      init.signal === undefined || init.signal === null
        ? controller.signal
        : AbortSignal.any([init.signal, controller.signal]);
    const settle = () => {
      clearTimeout(timer);
      active.delete(controller);
    };
    const mapError = (error: unknown): unknown =>
      controller.signal.aborted &&
      controller.signal.reason instanceof OutboundLimitError
        ? controller.signal.reason
        : typedCause(error);

    try {
      let url = urlOf(input);
      let method = (init.method ?? "GET").toUpperCase();
      // The Headers and body values handed to the transport must come from the same
      // undici copy as its dispatcher; they are rebuilt here from the caller's init.
      let headers = new UndiciHeaders([...new Headers(init.headers)]);
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- same runtime body types, distinct declaration files
      let body = (init.body ?? undefined) as UndiciRequestInit["body"];
      // Each hop depends on the response of the previous one.
      /* oxlint-disable no-await-in-loop */
      for (let hop = 0; ; hop += 1) {
        assertAllowedTarget(url, isBlocked);
        if (proxy !== undefined) {
          await assertResolvesPublic(bareHost(url), resolve, isBlocked);
        }
        const res = await sendWithRetry(url, {
          method,
          headers,
          body,
          signal,
          redirect: "manual",
          dispatcher,
        });
        const location = res.headers.get("location");
        const follow =
          init.redirect !== "manual" &&
          isRedirectResponse(res.status, location);
        if (!follow) {
          const declared = declaredLength(res.headers);
          if (
            method !== "HEAD" &&
            !limits.truncate &&
            declared !== undefined &&
            declared > limits.maxBytes
          ) {
            await discardBody(res.body);
            throw new OutboundLimitError({
              kind: "bytes",
              limit: limits.maxBytes,
            });
          }
          return cappedResponse(res, url.href, {
            maxBytes: limits.maxBytes,
            truncate: limits.truncate,
            onSettled: settle,
            abort: () => {
              controller.abort();
            },
            mapError,
          });
        }
        await discardBody(res.body);
        if (hop >= limits.maxRedirects) {
          throw new OutboundLimitError({
            kind: "redirects",
            limit: limits.maxRedirects,
          });
        }
        let next: URL;
        try {
          next = new URL(resolveRedirectUrl(url.href, location));
        } catch {
          throw new BlockedTargetError({ reason: "redirect" });
        }
        const request = nextRequest(
          res.status,
          method,
          headers,
          body,
          originOf(next) !== originOf(url)
        );
        if (request === null) {
          throw new BlockedTargetError({ reason: "redirect" });
        }
        ({ method, headers, body } = request);
        url = next;
      }
      /* oxlint-enable no-await-in-loop */
    } catch (error) {
      settle();
      throw mapError(error);
    }
  }

  return { fetch: outboundFetch, close };
}

/** The outbound `fetch` of `createOutboundTransport`, for tests that never open a pool they must close. */
export function createSafeFetch(deps: SafeFetchDeps = {}): SafeFetch {
  return createOutboundTransport(deps).fetch;
}

/**
 * Tests only: a default-policy `fetch` whose pools are never closed, so no
 * production code may use it. Caps and tools reach the network through the scoped
 * `OutboundClient` (`outbound-client.ts`).
 */
export const safeFetch = createSafeFetch();
