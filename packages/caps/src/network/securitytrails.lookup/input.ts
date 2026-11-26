import { z } from "zod";

import {
  SECURITYTRAILS_DNS_TYPES,
  securityTrailsDnsTypeSchema,
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
  const unknown = [...picked].filter(
    (t) => !(SECURITYTRAILS_DNS_TYPES as readonly unknown[]).includes(t)
  );
  return [...known, ...unknown];
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
      .optional()
      .describe("DNS history record types (a, aaaa, mx, ns, soa, txt)")
  ),
});

export const DEFAULT_SECURITYTRAILS_RECORD_TYPES = ["a"] as const;
