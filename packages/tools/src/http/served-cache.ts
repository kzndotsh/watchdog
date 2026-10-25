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

export function createServedCache<T>(ttlMs: number): ServedCache<T> {
  const cache = createTtlCache<{
    value: T;
    source: ServedSource | undefined;
  }>(ttlMs);
  return {
    get: (key) =>
      Effect.gen(function* servedCacheGetGen() {
        const hit = cache.get(key);
        if (hit !== undefined) {
          const egress = yield* Egress;
          yield* egress.recordServed(hit.source);
        }
        return hit?.value;
      }),
    set: (key, value, url) =>
      Effect.gen(function* servedCacheSetGen() {
        const egress = yield* Egress;
        cache.set(key, { value, source: egress.servedSource(url) });
      }),
  };
}
