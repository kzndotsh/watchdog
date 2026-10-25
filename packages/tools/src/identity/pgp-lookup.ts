import { Effect } from "effect";
import type { HttpClient } from "effect/http";

import type { ToolsTag } from "../errors/tagged-errors";
import { watchdogUserAgent } from "../errors/user-agent";
import { httpVendorError } from "../errors/vendor-errors";
import { fetchBytesEffect } from "../http/fetch-bytes";
import { nowIsoStringEffect } from "../infra/clock";
import { parseHkpMrIndex, type HkpKey } from "./pgp-hkp";
import { keepKeysOnDomain, mergeServerKeys } from "./pgp-merge";
import {
  pgpLookupSnapshotSchema,
  type PgpLookupSnapshot,
  type PgpQueryInput,
  type PgpServerResult,
} from "./pgp-schema";
import {
  PGP_KEYSERVERS,
  hkpIndexUrl,
  skipReason,
  type PgpKeyserver,
} from "./pgp-servers";

export { parseHkpMrIndex } from "./pgp-hkp";
export {
  pgpKeySchema,
  pgpLookupSnapshotSchema,
  type PgpKeyHit,
  type PgpLookupSnapshot,
  type PgpQueryInput,
  type PgpQueryKind,
} from "./pgp-schema";

export type PgpLookupOptions = {
  userAgent?: string;
  /** Own deadline of each server's request. Default 12 s. */
  serverTimeoutMs?: number;
  /** Servers queried at once. Default 3. */
  concurrency?: number;
  /** Servers to ask. Default: all of `PGP_KEYSERVERS`. */
  servers?: readonly PgpKeyserver[];
};

const DEFAULT_SERVER_TIMEOUT_MS = 12_000;
const DEFAULT_CONCURRENCY = 3;
const MAX_RESPONSE_BYTES = 1_000_000;

type ServerOutcome = {
  readonly result: PgpServerResult;
  readonly keys: readonly HkpKey[];
};

function outcome(
  host: string,
  status: PgpServerResult["status"],
  detail: string | null,
  keys: readonly HkpKey[] = []
): ServerOutcome {
  return { result: { host, status, keyCount: keys.length, detail }, keys };
}

function interpretBody(host: string, body: string): ServerOutcome {
  const keys = parseHkpMrIndex(body);
  if (keys.length > 0) return outcome(host, "ok", null, keys);
  const recognized = /^info:/m.test(body) || body.trim() === "";
  return recognized
    ? outcome(host, "empty", null)
    : outcome(host, "error", "unrecognized response");
}

function queryServer(
  server: PgpKeyserver,
  query: PgpQueryInput,
  signal: AbortSignal,
  options: { userAgent: string; timeoutMs: number }
): Effect.Effect<ServerOutcome, never, HttpClient.HttpClient> {
  const skipped = skipReason(server, query);
  if (skipped !== null) {
    return Effect.succeed(outcome(server.host, "skipped", skipped));
  }
  return fetchBytesEffect(hkpIndexUrl(server.host, query), signal, {
    userAgent: options.userAgent,
    maxBytes: MAX_RESPONSE_BYTES,
    accept: "text/plain",
  }).pipe(
    Effect.timeoutOption(options.timeoutMs),
    Effect.map((response) => {
      if (response._tag === "None") {
        return outcome(
          server.host,
          "timeout",
          `no answer in ${options.timeoutMs} ms`
        );
      }
      const res = response.value;
      if (res.ok) {
        return interpretBody(server.host, new TextDecoder().decode(res.bytes));
      }
      // HKP answers 404 when no key matches.
      if (res.status === 404) return outcome(server.host, "empty", null);
      return outcome(
        server.host,
        "error",
        res.status === 0 ? "request failed" : `HTTP ${res.status}`
      );
    })
  );
}

/**
 * Ask the HTTPS keyservers about one query and merge their answers.
 *
 * A server that does not support the query kind is `skipped` without a
 * request. The rest run concurrently (bounded) with a deadline each, so a slow
 * or dead server is a `timeout` or `error` status in the snapshot, not a
 * failed run. Only when every server that was asked failed does the lookup
 * fail, so a total outage is never cached as "no keys". Each server gets one
 * request per run.
 */
export function fetchPgpLookupEffect(
  query: PgpQueryInput,
  signal: AbortSignal,
  options?: PgpLookupOptions
): Effect.Effect<PgpLookupSnapshot, ToolsTag, HttpClient.HttpClient> {
  return Effect.gen(function* fetchPgpLookupGen() {
    const queriedAt = yield* nowIsoStringEffect;
    const userAgent =
      options?.userAgent ?? watchdogUserAgent("identity.pgp.lookup");
    const outcomes = yield* Effect.forEach(
      options?.servers ?? PGP_KEYSERVERS,
      (server) =>
        queryServer(server, query, signal, {
          userAgent,
          timeoutMs: options?.serverTimeoutMs ?? DEFAULT_SERVER_TIMEOUT_MS,
        }),
      { concurrency: options?.concurrency ?? DEFAULT_CONCURRENCY }
    );

    const asked = outcomes.filter((o) => o.result.status !== "skipped");
    const answered = asked.some(
      (o) => o.result.status === "ok" || o.result.status === "empty"
    );
    if (asked.length > 0 && !answered) {
      return yield* httpVendorError(
        "PGP keyservers",
        502,
        "No PGP keyserver answered"
      );
    }

    const merged = mergeServerKeys(
      outcomes.map((o) => ({ host: o.result.host, keys: o.keys })),
      Date.parse(queriedAt)
    );
    return pgpLookupSnapshotSchema.parse({
      query: query.value,
      queryKind: query.kind,
      queriedAt,
      servers: outcomes.map((o) => o.result),
      keys:
        query.kind === "domain"
          ? keepKeysOnDomain(merged, query.value)
          : merged,
    });
  });
}
