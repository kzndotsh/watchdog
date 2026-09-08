import type { z } from "zod";

import type { CapInterpretOpts, CapInterpretResult } from "@watchdog/cap-sdk";

import { interpretIdentifierBatches } from "../../lib/collect/interpret-identifier-batches";
import {
  identifierTruncationNote,
  querySeedBatches,
} from "../../lib/collect/query-seed-batches";
import { validatedIdentifierValue } from "../../lib/collect/validated-identifier-value";
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
  const emailValue = validatedIdentifierValue("email", report.query);
  const pgpValue = validatedIdentifierValue("pgp", report.query);
  const pgpValues = [
    ...(pgpValue === null ? [] : [pgpValue]),
    ...report.keys.map((key) => key.fingerprint),
  ];

  return interpretIdentifierBatches({
    entityId: opts.input.entityId,
    batches: [
      ...(emailValue === null ? [] : querySeedBatches(emailValue, "email")),
      { type: "pgp", values: pgpValues, limit: PGP_KEY_LIMIT },
    ],
    claimText: summarize(report),
    noEntitySummary: "PGP lookup captured; no Entity to attach Identifiers",
  });
}
