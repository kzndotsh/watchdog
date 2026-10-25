import type { z } from "zod";

import type { PgpKeyHit, PgpLookupSnapshot } from "@watchdog/tools/identity";

import {
  interpretIdentifierBatches,
  type IdentifierBatch,
} from "../../lib/collect/interpret-identifier-batches";
import {
  EMAIL_IDENTIFIER_BATCH_LIMIT,
  identifierTruncationNote,
  querySeedBatches,
} from "../../lib/collect/query-seed-batches";
import type { CapInterpretOpts, CapInterpretResult } from "../../sdk";
import type { pgpLookupInput } from "./input";

type PgpInput = z.infer<typeof pgpLookupInput>;

const PGP_KEY_LIMIT = 20;
const FLAGGED_KEYS_LISTED = 5;

/** The Identifier the query itself is, when it is one. A name is not. */
function seedBatches(report: PgpLookupSnapshot): readonly IdentifierBatch[] {
  switch (report.queryKind) {
    case "email":
    case "domain": {
      return querySeedBatches(report.query, report.queryKind);
    }
    case "key_id":
    case "fingerprint": {
      return [{ type: "pgp", values: [report.query] }];
    }
    case "name": {
      return [];
    }
    default: {
      const exhaustive: never = report.queryKind;
      return exhaustive;
    }
  }
}

function keyLabel(key: PgpKeyHit): string {
  return key.fingerprint ?? key.keyId;
}

function listed(keys: readonly PgpKeyHit[]): string {
  const shown = keys.slice(0, FLAGGED_KEYS_LISTED).map(keyLabel).join(", ");
  const more = keys.length - FLAGGED_KEYS_LISTED;
  return more > 0 ? `${shown} and ${more} more` : shown;
}

/** What the servers did, so a partial failure reads as one. */
function serversNote(report: PgpLookupSnapshot): string {
  const asked = report.servers.filter((s) => s.status !== "skipped");
  const answered = asked.filter(
    (s) => s.status === "ok" || s.status === "empty"
  );
  const failed = asked
    .filter((s) => s.status === "error" || s.status === "timeout")
    .map((s) => `${s.host} ${s.status}`);
  const base = `${answered.length} of ${asked.length} keyservers answered`;
  return failed.length === 0 ? base : `${base}; ${failed.join(", ")}`;
}

/** Revoked and expired keys stay Evidence; the Claim says which they are. */
function flagsNote(keys: readonly PgpKeyHit[]): string {
  const revoked = keys.filter((key) => key.revoked);
  const expired = keys.filter((key) => key.expired && !key.revoked);
  const parts = [
    revoked.length > 0 ? `revoked: ${listed(revoked)}` : "",
    expired.length > 0 ? `expired: ${listed(expired)}` : "",
  ].filter((part) => part !== "");
  return parts.length === 0 ? "" : `; ${parts.join("; ")}`;
}

function summarize(report: PgpLookupSnapshot, emailCount: number): string {
  const keysNote = identifierTruncationNote(report.keys.length, PGP_KEY_LIMIT);
  const emailNote =
    emailCount > EMAIL_IDENTIFIER_BATCH_LIMIT
      ? ` (showing ${EMAIL_IDENTIFIER_BATCH_LIMIT} of ${emailCount} emails in Identifiers)`
      : "";
  return `PGP for ${report.query}: ${report.keys.length} key(s) (${serversNote(report)})${flagsNote(report.keys)}${keysNote}${emailNote}`;
}

/**
 * Pure interpret: the query as an Identifier when it is an email, domain, key
 * id or fingerprint, the email addresses in the keys' User IDs, and each
 * key's fingerprint (its key id when no server gave one). Revoked and
 * expired keys are proposed like any other and named in the Claim.
 */
export function interpretPgpLookupReport(
  report: PgpLookupSnapshot,
  opts: CapInterpretOpts<PgpInput>
): CapInterpretResult {
  const emails = [
    ...new Set(
      report.keys.flatMap((key) =>
        key.uids.flatMap((uid) => (uid.email === null ? [] : [uid.email]))
      )
    ),
  ];
  return interpretIdentifierBatches({
    entityId: opts.input.entityId,
    batches: [
      ...seedBatches(report),
      { type: "email", values: emails },
      {
        type: "pgp",
        values: report.keys.map(keyLabel),
        limit: PGP_KEY_LIMIT,
      },
    ],
    claimText: summarize(report, emails.length),
    noEntitySummary: "PGP lookup captured; no Entity to attach Identifiers",
  });
}
