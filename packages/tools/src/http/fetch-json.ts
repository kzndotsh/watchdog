import { Effect, Result } from "effect";
import { HttpBody, HttpClient } from "effect/http";
import type { HttpMethod } from "effect/http/HttpMethod";

import { isToolsTag } from "../errors/map-tools-catch";
import {
  HttpVendorError,
  OutboundLimitError,
  ParseVendorError,
  RateLimitedError,
  ValidationVendorError,
  type ToolsTag,
} from "../errors/tagged-errors";
import { isRecord } from "../parse/coerce";
import { abortWhen } from "./abort-when";
import { withOutboundLimits } from "./http-client-layer";
import type { OutboundLimits } from "./safe-fetch";
import { transportFailure } from "./transport-error";

export type FetchJsonObjectInput = {
  url: string | URL;
  init?: RequestInit;
  signal: AbortSignal;
  service: string;
  subject: string;
  /** Default: HTTP 2xx. Override when a vendor treats other statuses as success. */
  acceptStatus?: (status: number) => boolean;
  /** Per-call byte limit, timeout or redirect count; defaults live in `DEFAULT_OUTBOUND_LIMITS`. */
  limits?: OutboundLimits;
};

function parseRetryAfterMs(header: string | undefined): number | undefined {
  if (header === undefined || header === "") return undefined;
  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.trunc(seconds * 1000);
  }
  const dateMs = Date.parse(header);
  if (Number.isNaN(dateMs)) return undefined;
  return Math.max(0, dateMs - Date.now());
}

/** How many times a 429 is retried before the call fails as rate-limited. */
export const RATE_LIMIT_RETRIES = 3;

/**
 * The longest one call waits on 429s in total, across its retries. A wait that would pass it fails
 * the call as rate-limited at once: waiting out a long `Retry-After` could outlast the Job (a Cap's
 * timeout is often 30 s, and a Cap may make several calls) and holds a worker slot meanwhile.
 */
const RATE_LIMIT_MAX_WAIT_MS = 5000;

/** The wait before retry `attempt` (0-based): the vendor's `Retry-After`, else exponential from 200 ms. */
function rateLimitWaitMs(error: RateLimitedError, attempt: number): number {
  return (
    error.retryAfterMs ?? Math.min(200 * 2 ** attempt, RATE_LIMIT_MAX_WAIT_MS)
  );
}

/** Retry a 429 at most `RATE_LIMIT_RETRIES` times, waiting at most `RATE_LIMIT_MAX_WAIT_MS` in all. */
function retryAfterRateLimit<A, R>(
  effect: Effect.Effect<A, ToolsTag, R>
): Effect.Effect<A, ToolsTag, R> {
  return Effect.gen(function* retryAfterRateLimitGen() {
    let waitedMs = 0;
    for (let attempt = 0; ; attempt += 1) {
      const result = yield* Effect.result(effect);
      if (Result.isSuccess(result)) return result.success;
      const error = result.failure;
      if (error._tag !== "RateLimitedError" || attempt >= RATE_LIMIT_RETRIES) {
        return yield* error;
      }
      const waitMs = rateLimitWaitMs(error, attempt);
      if (waitedMs + waitMs > RATE_LIMIT_MAX_WAIT_MS) return yield* error;
      yield* Effect.sleep(waitMs);
      waitedMs += waitMs;
    }
  });
}

function mapHttpFailure(service: string) {
  return (raw: unknown) => {
    const error = transportFailure(raw);
    if (isToolsTag(error)) return error;
    return new HttpVendorError({ service, status: 0 });
  };
}

function headersFromInit(
  init: RequestInit | undefined
): Record<string, string> {
  const headers: Record<string, string> = {};
  const incoming = init?.headers;
  if (incoming instanceof Headers) {
    for (const [key, value] of incoming.entries()) {
      headers[key] = value;
    }
    return headers;
  }
  if (Array.isArray(incoming)) {
    for (const [key, value] of incoming) {
      headers[key] = value;
    }
    return headers;
  }
  if (incoming !== undefined) {
    for (const [key, value] of Object.entries(incoming)) {
      if (value !== undefined) headers[key] = value;
    }
  }
  return headers;
}

function headerValue(
  headers: Record<string, string>,
  name: string
): string | undefined {
  const wanted = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === wanted) return value;
  }
  return undefined;
}

function httpBodyFromInit(
  init: RequestInit | undefined,
  headers: Record<string, string>
): HttpBody.HttpBody | undefined {
  const raw = init?.body;
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw === "string") {
    return HttpBody.text(
      raw,
      headerValue(headers, "content-type") ?? "application/json"
    );
  }
  if (raw instanceof Uint8Array) {
    return HttpBody.uint8Array(
      raw,
      headerValue(headers, "content-type") ?? "application/octet-stream"
    );
  }
  if (raw instanceof ArrayBuffer) {
    return HttpBody.uint8Array(
      new Uint8Array(raw),
      headerValue(headers, "content-type") ?? "application/octet-stream"
    );
  }
  return HttpBody.raw(raw);
}

function isHttpMethod(value: string): value is HttpMethod {
  switch (value) {
    case "GET":
    case "POST":
    case "PUT":
    case "DELETE":
    case "PATCH":
    case "HEAD":
    case "OPTIONS":
    case "TRACE":
    case "QUERY": {
      return true;
    }
    default: {
      return false;
    }
  }
}

function jsonBodyFailure(
  cause: unknown,
  status: number,
  input: Pick<FetchJsonObjectInput, "service" | "subject">
): Effect.Effect<null, OutboundLimitError | ParseVendorError> {
  const failure = transportFailure(cause);
  if (failure instanceof OutboundLimitError) return Effect.fail(failure);
  if (status >= 200 && status < 300) {
    return Effect.fail(
      new ParseVendorError({ service: input.service, subject: input.subject })
    );
  }
  return Effect.succeed(null);
}

export function fetchJsonUnknownEffect(
  input: FetchJsonObjectInput
): Effect.Effect<
  { readonly status: number; readonly body: unknown },
  ToolsTag,
  HttpClient.HttpClient
> {
  const acceptStatus =
    input.acceptStatus ?? ((status: number) => status >= 200 && status < 300);
  const requestUrl = typeof input.url === "string" ? input.url : input.url.href;

  const request = Effect.gen(function* fetchJsonRawGen() {
    const client = yield* HttpClient.HttpClient;
    const headers = headersFromInit(input.init);
    const methodRaw = (input.init?.method ?? "GET").trim().toUpperCase();
    if (!isHttpMethod(methodRaw)) {
      return yield* new ValidationVendorError({
        message: `unsupported HTTP method: ${methodRaw}`,
      });
    }
    const method = methodRaw;
    if (method === "OPTIONS" || method === "TRACE" || method === "QUERY") {
      return yield* new ValidationVendorError({
        message: `unsupported HTTP method: ${method}`,
      });
    }
    const body = httpBodyFromInit(input.init, headers);
    const options = body === undefined ? { headers } : { headers, body };
    let res;
    switch (method) {
      case "POST": {
        res = yield* client.post(requestUrl, options);
        break;
      }
      case "PUT": {
        res = yield* client.put(requestUrl, options);
        break;
      }
      case "PATCH": {
        res = yield* client.patch(requestUrl, options);
        break;
      }
      case "DELETE": {
        res = yield* client.del(requestUrl, options);
        break;
      }
      case "HEAD": {
        res = yield* client.head(requestUrl, { headers });
        break;
      }
      case "GET": {
        res = yield* client.get(requestUrl, { headers });
        break;
      }
      default: {
        const _exhaustive: never = method;
        return _exhaustive;
      }
    }

    if (res.status === 429 || !acceptStatus(res.status)) {
      // Read and drop the body of a refused response, so its connection is released now and not
      // when the call times out (a 429 is retried, and every retry would hold another).
      yield* Effect.ignore(res.text);
    }
    if (res.status === 429) {
      const retryAfter = res.headers["retry-after"];
      return yield* new RateLimitedError({
        service: input.service,
        subject: input.subject,
        retryAfterMs: parseRetryAfterMs(retryAfter),
      });
    }
    if (!acceptStatus(res.status)) {
      return yield* new HttpVendorError({
        service: input.service,
        status: res.status,
      });
    }

    const bodyUnknown = yield* res.json.pipe(
      Effect.catch((error) => jsonBodyFailure(error, res.status, input))
    );
    return { status: res.status, body: bodyUnknown };
  }).pipe(Effect.mapError(mapHttpFailure(input.service)));

  const bounded =
    input.limits === undefined
      ? request
      : withOutboundLimits(request, input.limits);
  return retryAfterRateLimit(bounded).pipe(
    Effect.raceFirst(abortWhen(input.signal))
  );
}

export function fetchJsonObjectEffect(
  input: FetchJsonObjectInput
): Effect.Effect<
  { readonly status: number; readonly body: Record<string, unknown> },
  ToolsTag,
  HttpClient.HttpClient
> {
  return fetchJsonUnknownEffect(input).pipe(
    Effect.flatMap((result) => {
      if (isRecord(result.body)) {
        return Effect.succeed({ status: result.status, body: result.body });
      }
      if (result.status >= 200 && result.status < 300) {
        return new ParseVendorError({
          service: input.service,
          subject: input.subject,
        });
      }
      return Effect.succeed({ status: result.status, body: {} });
    })
  );
}
