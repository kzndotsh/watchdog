import { Resolver } from "node:dns/promises";

import { Effect } from "effect";

import { mapToolsCatch } from "../errors/map-tools-tag";
import { ParseVendorError, type ToolsTag } from "../errors/tagged-errors";
import { abortedToolsError } from "../errors/tools-error";

export function assertNotAborted(
  signal: AbortSignal,
  abortMessage: string
): void {
  if (signal.aborted) throw abortedToolsError(abortMessage);
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
    throw abortedToolsError(abortMessage);
  }
  signal.addEventListener("abort", onAbort, { once: true });
  return {
    resolver,
    cleanup: () => {
      signal.removeEventListener("abort", onAbort);
    },
  };
}

/** NXDOMAIN / SERVFAIL / cancel → `empty`; abort is re-checked after the body. */
export function dnsOrEmpty<A>(
  tryFn: () => Promise<A>,
  empty: A
): Effect.Effect<A> {
  return Effect.tryPromise({
    try: tryFn,
    catch: (cause) =>
      new ParseVendorError({ service: "dns", subject: String(cause) }),
  }).pipe(Effect.orElseSucceed(() => empty));
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
