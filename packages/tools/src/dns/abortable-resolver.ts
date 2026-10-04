import { Resolver } from "node:dns/promises";

import { Data, Effect } from "effect";

import { mapToolsCatch } from "../errors/map-tools-catch";
import type { ToolsTag } from "../errors/tagged-errors";
import { abortedError } from "../errors/vendor-errors";

class BenignDnsError extends Data.TaggedError("BenignDnsError")<{
  readonly cause: unknown;
}> {
  readonly code = "dns_benign" as const;
}

const BENIGN_DNS_ERROR_CODES = new Set(["ENOTFOUND", "ENODATA", "ESERVFAIL"]);

function isBenignDnsFailure(cause: unknown): boolean {
  if (typeof cause !== "object" || cause === null) return false;
  const record = cause as { code?: string; name?: string };
  if (record.code !== undefined && BENIGN_DNS_ERROR_CODES.has(record.code)) {
    return true;
  }
  return record.name === "AbortError";
}

export function assertNotAborted(
  signal: AbortSignal,
  abortMessage: string
): void {
  if (signal.aborted) throw abortedError(abortMessage);
}

export function withAbortableResolver(
  signal: AbortSignal,
  abortMessage: string
): { resolver: Resolver; cleanup: () => void } {
  const resolver = new Resolver();
  const onAbort = () => {
    try {
      resolver.cancel();
    } catch {
      // already cancelled / idle
    }
  };
  if (signal.aborted) {
    onAbort();
    throw abortedError(abortMessage);
  }
  signal.addEventListener("abort", onAbort, { once: true });
  return {
    resolver,
    cleanup: () => {
      signal.removeEventListener("abort", onAbort);
    },
  };
}

/** NXDOMAIN / SERVFAIL / cancel → `empty`; other resolver faults propagate. */
export function dnsOrEmpty<A>(
  tryFn: () => Promise<A>,
  empty: A
): Effect.Effect<A, ToolsTag> {
  return Effect.tryPromise({
    try: tryFn,
    catch: (error: unknown): ToolsTag | BenignDnsError =>
      isBenignDnsFailure(error)
        ? new BenignDnsError({ cause: error })
        : mapToolsCatch(error),
  }).pipe(Effect.catchTag("BenignDnsError", () => Effect.succeed(empty)));
}

export function runAbortableResolver<A>(
  signal: AbortSignal,
  abortMessage: string,
  body: (resolver: Resolver) => Effect.Effect<A, ToolsTag>
): Effect.Effect<A, ToolsTag> {
  return Effect.suspend(() =>
    Effect.try({
      try: () => withAbortableResolver(signal, abortMessage),
      catch: mapToolsCatch,
    }).pipe(
      Effect.flatMap(({ resolver, cleanup }) =>
        body(resolver).pipe(
          Effect.flatMap((value) =>
            Effect.try({
              try: () => {
                assertNotAborted(signal, abortMessage);
                return value;
              },
              catch: mapToolsCatch,
            })
          ),
          Effect.ensuring(
            Effect.sync(() => {
              cleanup();
            })
          )
        )
      )
    )
  );
}
