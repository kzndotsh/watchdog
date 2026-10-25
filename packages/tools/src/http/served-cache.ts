import { Effect } from "effect";

import { createTtlCache } from "../cache/ttl-memory";
import type { ToolsTag } from "../errors/tagged-errors";
import { Egress } from "./egress";
import type { ServedSource } from "./provider-call";

/**
 * A per-process TTL cache for a value built from one public download (a blocklist, a feed),
 * shared by every Job in the process. It keeps the call that fetched the value beside it, so a
 * Job served from the cache still has a call behind its Evidence: a hit records a `served_from`
 * outcome in that Job's ledger naming the original call (`Egress.recordServed`), and a Job that
 * fetched the value stores the call it made (`Egress.servedSource`).
 *
 * An entry is not served until the call behind it is confirmed saved (`markCallsSaved`, which
 * core calls once the Job's outcomes and bodies are stored): otherwise a Job whose save failed
 * could be the origin of Evidence that points at a call that was never stored. Until then, and
 * for good if the save fails, a lookup is a miss and the caller fetches again.
 */
export type ServedCache<T> = {
  /** The cached value, or `undefined`. A hit is recorded in the Job's ledger as served from the original call. */
  readonly get: (key: string) => Effect.Effect<T | undefined, ToolsTag, Egress>;
  /** Keeps `value`, built from the answer of this Job's call to `url`, with that call. */
  readonly set: (
    key: string,
    value: T,
    url: string
  ) => Effect.Effect<void, never, Egress>;
};

/** Calls kept by some cache whose outcome and body are not yet confirmed saved. */
const unsavedCalls = new Set<string>();

/** Core says these calls' outcomes and bodies are stored: entries built from them may be served. */
export function markCallsSaved(callIds: readonly string[]): void {
  for (const id of callIds) unsavedCalls.delete(id);
}

export function createServedCache<T>(ttlMs: number): ServedCache<T> {
  const cache = createTtlCache<{
    value: T;
    source: ServedSource | undefined;
  }>(ttlMs);
  /** The call behind each key's latest entry, so replacing it keeps `unsavedCalls` bounded. */
  const lastCallId = new Map<string, string>();
  return {
    get: (key) =>
      Effect.gen(function* servedCacheGetGen() {
        const entry = cache.get(key);
        const hit =
          entry !== undefined &&
          (entry.source === undefined || !unsavedCalls.has(entry.source.callId))
            ? entry
            : undefined;
        if (hit !== undefined) {
          const egress = yield* Egress;
          yield* egress.recordServed(hit.source);
        }
        return hit?.value;
      }),
    set: (key, value, url) =>
      Effect.gen(function* servedCacheSetGen() {
        const egress = yield* Egress;
        const source = egress.servedSource(url);
        // The entry it replaces (live or expired) is never served again: forget its call.
        const replaced = lastCallId.get(key);
        if (replaced !== undefined) unsavedCalls.delete(replaced);
        lastCallId.delete(key);
        if (source !== undefined) {
          unsavedCalls.add(source.callId);
          lastCallId.set(key, source.callId);
        }
        cache.set(key, { value, source });
      }),
  };
}
