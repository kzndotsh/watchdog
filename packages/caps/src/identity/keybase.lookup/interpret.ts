import type { z } from "zod";

import type { CapInterpretOpts, CapInterpretResult } from "@watchdog/cap-sdk";

import { interpretIdentifierBatches } from "../../lib/collect/interpret-identifier-batches";
import {
  HANDLE_IDENTIFIER_BATCH_LIMIT,
  URL_IDENTIFIER_BATCH_LIMIT,
  domainValuesBatch,
  identifierTruncationNote,
  urlValuesBatch,
} from "../../lib/collect/query-seed-batches";
import type { keybaseLookupInput } from "./input";
import type { KeybaseLookupSnapshot } from "./report-schema";

type KeybaseInput = z.infer<typeof keybaseLookupInput>;

const URL_LIMIT = URL_IDENTIFIER_BATCH_LIMIT;
const HANDLE_LIMIT = HANDLE_IDENTIFIER_BATCH_LIMIT;

function summarize(
  report: KeybaseLookupSnapshot,
  proofHandleTotal: number,
  primaryHandleTotal: number,
  urlTotal: number
): string {
  if (!report.found) {
    return `Keybase ${report.kind}=${report.query}: not found`;
  }
  const bits: string[] = [`@${report.username ?? "?"}`];
  if (report.fullName) bits.push(`name=${report.fullName}`);
  if (report.proofs.length > 0) {
    bits.push(
      `proofs=${report.proofs
        .map((p) => p.platform)
        .slice(0, 8)
        .join(",")}`
    );
  }
  const primaryNote = identifierTruncationNote(
    primaryHandleTotal,
    HANDLE_LIMIT
  ).trim();
  if (primaryNote !== "") bits.push(primaryNote.replaceAll(/^\(|\)$/g, ""));
  if (proofHandleTotal > HANDLE_LIMIT) {
    bits.push(`showing ${HANDLE_LIMIT} of ${proofHandleTotal} proof handles`);
  }
  const urlNote = identifierTruncationNote(urlTotal, URL_LIMIT).trim();
  if (urlNote !== "") bits.push(urlNote.replaceAll(/^\(|\)$/g, ""));
  if (report.pgpFingerprints.length > 5) {
    bits.push(
      identifierTruncationNote(report.pgpFingerprints.length, 5)
        .trim()
        .replaceAll(/^\(|\)$/g, "")
    );
  } else if (report.pgpFingerprints.length > 0) {
    bits.push(`pgp=${report.pgpFingerprints.length}`);
  }
  return `Keybase: ${bits.join("; ")}`;
}

function keybaseHandleValues(report: KeybaseLookupSnapshot): string[] {
  if (report.kind !== "username") {
    return report.found && report.username
      ? [report.username, ...report.extraUsernames]
      : [];
  }
  const primary = report.found
    ? (report.username ?? report.query)
    : report.query;
  return report.found ? [primary, ...report.extraUsernames] : [primary];
}

/** Pure interpret — Keybase handle + optional pgp / crypto / url / domain. */
export function interpretKeybaseLookupReport(
  report: KeybaseLookupSnapshot,
  opts: CapInterpretOpts<KeybaseInput>
): CapInterpretResult {
  const urlValues = (
    report.found
      ? [report.profileUrl, ...report.proofs.map((proof) => proof.url)]
      : []
  ).filter((value): value is string => value !== null && value !== "");

  const primaryHandleValues = keybaseHandleValues(report);
  const proofHandleCandidates = report.proofs.filter(
    (proof) => report.found && proof.username
  );
  const proofHandleBudget = Math.max(
    0,
    HANDLE_LIMIT - Math.min(primaryHandleValues.length, HANDLE_LIMIT)
  );
  const cappedProofHandles = proofHandleCandidates.slice(0, proofHandleBudget);

  return interpretIdentifierBatches({
    entityId: opts.input.entityId,
    batches: [
      {
        type: "handle",
        values: primaryHandleValues,
        platform: "keybase",
        limit: HANDLE_LIMIT,
      },
      ...cappedProofHandles.flatMap((proof) =>
        proof.username
          ? [
              {
                type: "handle" as const,
                values: [proof.username],
                platform: proof.platform,
                limit: 1,
              },
            ]
          : []
      ),
      {
        type: "pgp",
        values: report.found ? report.pgpFingerprints : [],
        limit: 5,
      },
      {
        type: "crypto",
        values: report.found ? report.bitcoinAddresses : [],
        limit: 5,
      },
      ...urlValuesBatch(urlValues, { limit: URL_LIMIT }),
      ...domainValuesBatch(report.kind === "domain" ? [report.query] : []),
    ],
    claimText: summarize(
      report,
      proofHandleCandidates.length,
      primaryHandleValues.length,
      urlValues.length
    ),
    noEntitySummary: "Keybase lookup captured; no Entity to attach Identifiers",
  });
}
