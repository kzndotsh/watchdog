import type { z } from "zod";

import type { CapInterpretOpts, CapInterpretResult } from "@watchdog/cap-sdk";

import { interpretIdentifierBatches } from "../../lib/collect/interpret-identifier-batches";
import {
  EMAIL_IDENTIFIER_BATCH_LIMIT,
  HANDLE_IDENTIFIER_BATCH_LIMIT,
  URL_IDENTIFIER_BATCH_LIMIT,
  emailValuesBatch,
  eligibleEmailCount,
  identifierTruncationNote,
  urlValuesBatch,
} from "../../lib/collect/query-seed-batches";
import type { gravatarLookupInput } from "./input";
import type { GravatarLookupSnapshot } from "./report-schema";

type GravatarInput = z.infer<typeof gravatarLookupInput>;

const URL_LIMIT = URL_IDENTIFIER_BATCH_LIMIT;
const EMAIL_LIMIT = EMAIL_IDENTIFIER_BATCH_LIMIT;
const HANDLE_LIMIT = HANDLE_IDENTIFIER_BATCH_LIMIT;

function summarize(
  report: GravatarLookupSnapshot,
  urlTotal: number,
  handleTotal: number,
  emailTotal: number
): string {
  if (!report.found) {
    return `Gravatar for ${report.email}: no public profile`;
  }
  const bits: string[] = [];
  if (report.displayName) bits.push(`name=${report.displayName}`);
  if (report.preferredUsername) bits.push(`user=${report.preferredUsername}`);
  if (report.location) bits.push(`loc=${report.location}`);
  bits.push(`accounts=${report.accounts.length}`);
  const emailNote = identifierTruncationNote(emailTotal, EMAIL_LIMIT).trim();
  if (emailNote !== "") bits.push(emailNote.replaceAll(/^\(|\)$/g, ""));
  if (handleTotal > HANDLE_LIMIT) {
    bits.push(`showing ${HANDLE_LIMIT} of ${handleTotal} handles`);
  }
  if (urlTotal > URL_LIMIT) {
    bits.push(`showing ${URL_LIMIT} of ${urlTotal} urls`);
  }
  return `Gravatar for ${report.email}: ${bits.join("; ")}`;
}

/** Pure interpret — email + optional handle / url Identifiers when Entity set. */
export function interpretGravatarLookupReport(
  report: GravatarLookupSnapshot,
  opts: CapInterpretOpts<GravatarInput>
): CapInterpretResult {
  const urlValues = (
    report.found
      ? [report.profileUrl, ...report.accounts.map((account) => account.url)]
      : []
  ).filter(
    (value): value is string =>
      value !== null && value !== undefined && value !== ""
  );
  const urlTotal = urlValues.length;
  const emailCandidates = report.found
    ? [report.email, ...report.emails]
    : [report.email];
  const emailTotal = eligibleEmailCount(emailCandidates);
  const accountHandles = report.found
    ? report.accounts.filter((account) => account.username)
    : [];
  const handleTotal =
    (report.found && report.preferredUsername ? 1 : 0) + accountHandles.length;
  const preferredHandleBudget =
    report.found && report.preferredUsername ? 1 : 0;
  const accountHandleBudget = Math.max(0, HANDLE_LIMIT - preferredHandleBudget);
  const cappedAccountHandles = accountHandles.slice(0, accountHandleBudget);

  return interpretIdentifierBatches({
    entityId: opts.input.entityId,
    batches: [
      ...emailValuesBatch(emailCandidates, { limit: EMAIL_LIMIT }),
      ...(report.found && report.preferredUsername
        ? [
            {
              type: "handle" as const,
              values: [report.preferredUsername],
              platform: "gravatar",
            },
          ]
        : []),
      ...cappedAccountHandles.flatMap((account) =>
        account.username
          ? [
              {
                type: "handle" as const,
                values: [account.username],
                platform: account.shortname ?? "gravatar",
                limit: 1,
              },
            ]
          : []
      ),
      ...urlValuesBatch(urlValues, { limit: URL_LIMIT }),
    ],
    claimText: summarize(report, urlTotal, handleTotal, emailTotal),
    noEntitySummary:
      "Gravatar lookup captured; no Entity to attach Identifiers",
  });
}
