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
 * undici 8 negotiates HTTP/2 by default (ALPN); the outbound client stays on HTTP/1.1,
 * the transport its body cap, abort and per-hop checks were written and tested against.
 */
const HTTP1_ONLY = { allowH2: false } as const;

/** `RequestInit` plus the per-call limits. `redirect: "manual"` returns the first 3xx unfollowed. */
export type SafeFetchInit = RequestInit & { readonly limits?: OutboundLimits };

type SafeFetchDeps = {
  /** The transport. Default: `fetch` of the `undici` package that supplies the dispatcher. */
  readonly fetch?: typeof undiciFetch;
  readonly resolve?: HostResolver;
  readonly isBlocked?: AddressPolicy;
  /** Egress proxy URL, read per call. Default: `WD_EGRESS_PROXY`. */
  readonly proxyUrl?: () => string | undefined;
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

/** Closes a dispatcher after its in-flight requests finish; a failed close changes nothing. */
async function retire(dispatcher: Dispatcher): Promise<void> {
  try {
    await dispatcher.close();
  } catch {
    // Already closed or failing to close: nothing to recover.
  }
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
 * With an egress proxy the proxy connects, so the connection-time address
 * validation cannot apply; on every hop the scheme, literal-IP and host-name
 * checks still run, and the name is resolved locally as a best effort and
 * refused when any answer is not public (a resolution failure proceeds to the
 * proxy).
 * `deps` exists for tests; production code uses the exported `safeFetch`.
 */
export function createSafeFetch(
  deps: SafeFetchDeps = {}
): (input: string | URL, init?: SafeFetchInit) => Promise<Response> {
  const isBlocked = deps.isBlocked ?? isBlockedAddress;
  const resolve = deps.resolve ?? systemResolver;
  const lookup = createSafeLookup(resolve, isBlocked);
  const send = deps.fetch ?? undiciFetch;
  const proxyUrl = deps.proxyUrl ?? (() => egressProxyFromEnv());
  // One dispatcher per proxy setting; a changed setting retires the old one.
  let current: { key: string; dispatcher: Dispatcher } | undefined;

  function dispatcherFor(proxy: string | undefined): Dispatcher {
    const key = proxy ?? "";
    if (current?.key === key) return current.dispatcher;
    const dispatcher: Dispatcher =
      proxy === undefined
        ? new Agent({
            ...HTTP1_ONLY,
            connect: { lookup, timeout: CONNECT_TIMEOUT_MS },
          })
        : new ProxyAgent({
            ...HTTP1_ONLY,
            uri: requireProxyUrl(proxy).href,
            // undici 8 forwards plain-http targets in absolute form unless told to tunnel;
            // keep the CONNECT tunnel every target used under undici 7.
            proxyTunnel: true,
            connectTimeout: CONNECT_TIMEOUT_MS,
          });
    const retired = current?.dispatcher;
    current = { key, dispatcher };
    // In-flight requests finish on the retired dispatcher before it closes.
    if (retired !== undefined) void retire(retired);
    return dispatcher;
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
        const res = await send(url, {
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
  };
}

/** The one outbound `fetch` of Caps and tools: default policy, system resolver, optional egress proxy. */
export const safeFetch = createSafeFetch();
