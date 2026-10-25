import type { z } from "zod";

import {
  dehashedLookupSnapshotSchema,
  hudsonrockLookupSnapshotSchema,
  leakradarLookupSnapshotSchema,
  redactDehashedSnapshot,
  redactSnusbaseSnapshot,
  snusbaseLookupSnapshotSchema,
  type CredentialFingerprint,
} from "@watchdog/tools/breach";
import { hibpLookupSnapshotSchema } from "@watchdog/tools/identity";

import { isBreachCap } from "../sdk";

/** Parses a breach artifact with the Cap's own snapshot schema and returns it redacted, as JSON text. */
type Redactor = (
  value: unknown,
  fingerprint: CredentialFingerprint
) => string | null;

/** A Cap whose snapshot carries no credentials: parsed (so unknown content is refused) and kept. */
function unchanged(schema: z.ZodType): Redactor {
  return (value) => {
    const parsed = schema.safeParse(value);
    return parsed.success ? JSON.stringify(parsed.data, null, 2) : null;
  };
}

/**
 * One entry per breach Cap, and `credential-modes.test.ts` fails for a `breach.*` Cap without
 * one: a new breach Cap has to say how its Evidence is redacted before it can ship.
 */
const REDACTORS: Readonly<Record<string, Redactor>> = {
  "breach.dehashed.lookup": (value, fingerprint) => {
    const parsed = dehashedLookupSnapshotSchema.safeParse(value);
    return parsed.success
      ? JSON.stringify(
          redactDehashedSnapshot(parsed.data, fingerprint),
          null,
          2
        )
      : null;
  },
  "breach.snusbase.lookup": (value, fingerprint) => {
    const parsed = snusbaseLookupSnapshotSchema.safeParse(value);
    return parsed.success
      ? JSON.stringify(
          redactSnusbaseSnapshot(parsed.data, fingerprint),
          null,
          2
        )
      : null;
  },
  "breach.hibp.lookup": unchanged(hibpLookupSnapshotSchema),
  "breach.hudsonrock.lookup": unchanged(hudsonrockLookupSnapshotSchema),
  "breach.leakradar.lookup": unchanged(leakradarLookupSnapshotSchema),
};

/** Ids of the breach Caps that have a redactor (for the test that every breach Cap has one). */
export function breachRedactorIds(): string[] {
  return Object.keys(REDACTORS);
}

/**
 * A breach Cap's stored artifact as an Export may carry it: credential fields cut to their
 * safe-mode attributes (present, kind, length, fingerprint) through the transform the Cap's own
 * `safe` mode uses. `null` when the Cap is not a breach Cap with a redactor, or the artifact does
 * not match the Cap's snapshot schema: the Export then withholds the file, never writes it as is.
 */
export function redactBreachArtifact(
  capabilityId: string,
  value: unknown,
  fingerprint: CredentialFingerprint
): string | null {
  if (!isBreachCap({ id: capabilityId })) return null;
  const redactor = REDACTORS[capabilityId];
  return redactor === undefined ? null : redactor(value, fingerprint);
}
