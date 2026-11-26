import { z } from "zod";

import {
  SECURITYTRAILS_DNS_TYPES,
  securityTrailsDnsTypeSchema,
  type SecurityTrailsDnsType,
} from "#tools/network";
import { hostSeedSchema } from "@watchdog/domain/schemas/caps";
import { optionalUuidSchema } from "@watchdog/domain/schemas/shared";

/** Lowercased, deduplicated and in canonical order, so the same choice shares one cache entry. */
function canonicalTypes(value: unknown): unknown {
  if (!Array.isArray(value)) return value;
  const items: readonly unknown[] = value;
  const picked = new Set<unknown>(
    items.map((t) => (typeof t === "string" ? t.trim().toLowerCase() : t))
  );
  const known = SECURITYTRAILS_DNS_TYPES.filter((t) => picked.has(t));
  const unrecognized = [...picked].filter(
    (t) => !(SECURITYTRAILS_DNS_TYPES as readonly unknown[]).includes(t)
  );
  return [...known, ...unrecognized];
}

export const securityTrailsLookupInput = z.object({
  host: hostSeedSchema.describe("Domain"),
  entityId: optionalUuidSchema,
  /** One quota query each; A when omitted. */
  recordTypes: z.preprocess(
    canonicalTypes,
    z
      .array(securityTrailsDnsTypeSchema)
      .min(1)
      /** In the schema, so an omitted choice and an explicit `["a"]` share one cache entry. */
      .default((): SecurityTrailsDnsType[] => ["a"])
      .describe("DNS history record types (a, aaaa, mx, ns, soa, txt)")
  ),
});
