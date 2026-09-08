import type { z } from "zod";

import type { CapInterpretOpts, CapInterpretResult } from "@watchdog/cap-sdk";
import { validateIdentifierValue } from "@watchdog/schemas";

import { interpretIdentifierBatches } from "../../lib/collect/interpret-identifier-batches";
import {
  identifierTruncationNote,
  querySeedBatches,
} from "../../lib/collect/query-seed-batches";
import type { pgpLookupInput } from "./input";
import type { PgpLookupSnapshot } from "./report-schema";

type PgpInput = z.infer<typeof pgpLookupInput>;

const PGP_KEY_LIMIT = 20;

function summarize(report: PgpLookupSnapshot): string {
  const src = report.source ?? "none";
  const note = identifierTruncationNote(report.keys.length, PGP_KEY_LIMIT);
  return `PGP for ${report.query}: ${report.keys.length} key(s) via ${src}${note}`;
}

/** Pure interpret — seed email (when query is an email) + pgp fingerprints as Identifiers. */
export function interpretPgpLookupReport(
  report: PgpLookupSnapshot,
  opts: CapInterpretOpts<PgpInput>
): CapInterpretResult {
  const emailSeed = validateIdentifierValue("email", report.query);
  const pgpSeed = validateIdentifierValue("pgp", report.query);
  const pgpValues = [
    ...(pgpSeed.ok ? [pgpSeed.value] : []),
    ...report.keys.map((key) => key.fingerprint),
  ];

  return interpretIdentifierBatches({
    entityId: opts.input.entityId,
    batches: [
      ...(emailSeed.ok ? querySeedBatches(emailSeed.value, "email") : []),
      { type: "pgp", values: pgpValues, limit: PGP_KEY_LIMIT },
    ],
    claimText: summarize(report),
    noEntitySummary: "PGP lookup captured; no Entity to attach Identifiers",
  });
}
