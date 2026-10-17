import { Agent, ProxyAgent, type Dispatcher } from "undici";

import {
  BlockedTargetError,
  OutboundLimitError,
} from "../errors/tagged-errors";
import { isBlockedAddress } from "./blocked-address";
import { cappedResponse, declaredLength, discardBody } from "./capped-body";
import {
  assertAllowedTarget,
  createSafeLookup,
  egressProxyFromEnv,
  systemResolver,
  type AddressPolicy,
  type HostResolver,
} from "./outbound-policy";

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

/** `RequestInit` plus the per-call limits. `redirect: "manual"` returns the first 3xx unfollowed. */
export type SafeFetchInit = RequestInit & { readonly limits?: OutboundLimits };

type SafeFetchDeps = {
  readonly resolve?: HostResolver;
  readonly isBlocked?: AddressPolicy;
  /** Egress proxy URL, read per call. Default: `WD_EGRESS_PROXY`. */
  readonly proxyUrl?: () => string | undefined;
};

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
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

function parseProxy(raw: string): URL {
  try {
    const proxy = new URL(raw);
    if (proxy.protocol === "http:" || proxy.protocol === "https:") return proxy;
  } catch {
    // falls through to the typed refusal
  }
  throw new BlockedTargetError({ reason: "proxy" });
}

function urlOf(input: string | URL | Request): URL {
  if (typeof input === "string") return new URL(input);
  if (input instanceof URL) return input;
  return new URL(input.url);
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
  headers: Headers,
  body: RequestInit["body"],
  crossOrigin: boolean
): { method: string; headers: Headers; body: RequestInit["body"] } | null {
  const toGet =
    status === 303
      ? method !== "HEAD"
      : (status === 301 || status === 302) && method === "POST";
  if (!toGet && !isReusableBody(body)) return null;
  const kept = new Headers();
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
 * Builds the hardened outbound `fetch`. Guarantees, for every call:
 * - only http(s) targets; literal IP hosts and `localhost` names are checked
 *   before any socket opens;
 * - a host name is resolved once, every returned address is validated, and the
 *   socket connects to a validated address (the connection `lookup` hook), so
 *   nothing is resolved again between check and connect;
 * - redirects are followed manually and each hop repeats the checks above,
 *   up to `maxRedirects`; credentials are not forwarded to another origin;
 * - the body is streamed and read only up to `maxBytes`;
 * - the whole call has its own deadline (`timeoutMs`).
 * With an egress proxy the proxy resolves and connects, so only the scheme,
 * literal-IP and `localhost` checks (on every hop) still apply locally.
 * `deps` exists for tests; production code uses the exported `safeFetch`.
 */
export function createSafeFetch(
  deps: SafeFetchDeps = {}
): (input: string | URL | Request, init?: SafeFetchInit) => Promise<Response> {
  const isBlocked = deps.isBlocked ?? isBlockedAddress;
  const lookup = createSafeLookup(deps.resolve ?? systemResolver, isBlocked);
  const proxyUrl = deps.proxyUrl ?? (() => egressProxyFromEnv());
  const dispatchers = new Map<string, Dispatcher>();

  function dispatcherFor(proxy: string | undefined): Dispatcher {
    const key = proxy ?? "";
    const existing = dispatchers.get(key);
    if (existing !== undefined) return existing;
    const created: Dispatcher =
      proxy === undefined
        ? new Agent({ connect: { lookup, timeout: CONNECT_TIMEOUT_MS } })
        : new ProxyAgent({
            uri: parseProxy(proxy).href,
            connect: { timeout: CONNECT_TIMEOUT_MS },
          });
    dispatchers.set(key, created);
    return created;
  }

  return async function safeFetch(input, init = {}) {
    const limits = { ...DEFAULT_OUTBOUND_LIMITS, ...init.limits };
    const proxy = proxyUrl();
    const dispatcher = dispatcherFor(proxy);
    const controller = new AbortController();
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
    };
    const mapError = (error: unknown): unknown =>
      controller.signal.aborted &&
      controller.signal.reason instanceof OutboundLimitError
        ? controller.signal.reason
        : typedCause(error);

    try {
      let url = urlOf(input);
      let method = (init.method ?? "GET").toUpperCase();
      let headers = new Headers(init.headers);
      let body = init.body;
      // Each hop depends on the response of the previous one.
      /* oxlint-disable no-await-in-loop */
      for (let hop = 0; ; hop += 1) {
        assertAllowedTarget(url, isBlocked);
        const res = await fetch(url, {
          method,
          headers,
          body,
          signal,
          redirect: "manual",
          dispatcher,
        } as RequestInit);
        const location = res.headers.get("location");
        const follow =
          init.redirect !== "manual" &&
          REDIRECT_STATUSES.has(res.status) &&
          location !== null;
        if (!follow) {
          const declared = declaredLength(res.headers);
          if (
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
          next = new URL(location, url);
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
  };
}

/** The one outbound `fetch` of Caps and tools: default policy, system resolver, optional egress proxy. */
export const safeFetch = createSafeFetch();
