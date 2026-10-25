import { isBreachCap } from "./descriptor";

/**
 * What a Job keeps of a Cap's provider responses in storage (the raw body; the hash and size
 * are always kept). Omitted: the default keep limit applies (`DEFAULT_KEEP_LIMITS` in
 * `@watchdog/tools/http`). `hash_only` keeps no body; `{ maxBytes }` sets this Cap's per-call
 * limit, over which the hash is kept and the body is withheld.
 */
export type RawResponsePolicy = {
  readonly keep: "hash_only" | { readonly maxBytes: number };
};

/** The body policy a Job applies to one Cap's calls. */
export type CapBodyPolicy =
  | { readonly kind: "keep"; readonly maxBytes: number | undefined }
  | { readonly kind: "hash_only" };

/**
 * How a Cap's response bodies are stored. A `breach.*` Cap is fingerprint-only whatever it
 * declares: the owner decided not to collect the bodies of breach and leak corpora, and
 * deriving it from the id means a new breach Cap needs no second declaration (see
 * `isBreachCap`). Model calls are hash-only at the door, whatever the Cap says.
 */
export function capBodyPolicy(cap: {
  id: string;
  rawResponse?: RawResponsePolicy;
}): CapBodyPolicy {
  if (isBreachCap(cap)) return { kind: "hash_only" };
  const keep = cap.rawResponse?.keep;
  if (keep === "hash_only") return { kind: "hash_only" };
  return { kind: "keep", maxBytes: keep?.maxBytes };
}
