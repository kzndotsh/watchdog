import { Effect } from "effect";
import type { HttpClient } from "effect/unstable/http";
import { z } from "zod";

import { dnsOrEmpty, runAbortableResolver } from "../dns/abortable-resolver";
import { mapToolsCatch } from "../errors/map-tools-tag";
import type { ToolsTag } from "../errors/tagged-errors";
import { validationToolsError } from "../errors/tools-error";

export const cymruMhrLookupSnapshotSchema = z.object({
  hash: z.string().min(1),
  queriedAt: z.string().min(1),
  source: z.literal("hash.cymru.com"),
  found: z.boolean(),
  lastSeenEpoch: z.number().int().nullable(),
  detectionPct: z.number().nullable(),
});

export type CymruMhrLookupSnapshot = z.infer<
  typeof cymruMhrLookupSnapshotSchema
>;

/** Normalize + validate a hex hash string for MHR (MD5/SHA1/SHA256 only). */
export function normalizeCymruMhrHash(raw: string): string {
  const hash = raw.trim().toLowerCase();
  if (!/^[a-f0-9]+$/.test(hash)) {
    throw validationToolsError(`Invalid hex hash: ${raw}`);
  }
  return hash;
}

/** DNS query name labels — SHA256 splits into two 32-char labels (DNS limits). */
function labelsForHash(hash: string): string {
  switch (hash.length) {
    case 32:
    case 40: {
      return hash;
    }
    case 64: {
      return `${hash.slice(0, 32)}.${hash.slice(32)}`;
    }
    default: {
      throw validationToolsError(
        `Unsupported hash length ${hash.length} for Team Cymru MHR (expected MD5/SHA1/SHA256)`
      );
    }
  }
}

/** TXT body is `"<unix-epoch> <av-hit-percent>"`. */
export function parseTxtAnswer(records: string[][]): {
  lastSeenEpoch: number | null;
  detectionPct: number | null;
} {
  const joined = records
    .map((parts) => parts.join(""))
    .join(" ")
    .trim();
  const match = /^(\d+)\s+(\d+)$/.exec(joined);
  const epochRaw = match?.[1];
  const pctRaw = match?.[2];
  if (epochRaw === undefined || pctRaw === undefined) {
    return { lastSeenEpoch: null, detectionPct: null };
  }
  return {
    lastSeenEpoch: Math.trunc(Number(epochRaw)),
    detectionPct: Math.trunc(Number(pctRaw)),
  };
}

/**
 * Team Cymru Malware Hash Registry — DNS TXT lookup.
 * `dig +short {labels}.hash.cymru.com TXT` — NXDOMAIN/no-answer = not known malware.
 * @see https://hash.cymru.com/docs_dns
 */
export function fetchCymruMhrLookupEffect(
  hashRaw: string,
  signal: AbortSignal
): Effect.Effect<CymruMhrLookupSnapshot, ToolsTag, HttpClient.HttpClient> {
  return Effect.gen(function* fetchCymruMhrLookupGen() {
    const hash = yield* Effect.try({
      try: () => normalizeCymruMhrHash(hashRaw),
      catch: mapToolsCatch,
    });
    const domain = `${labelsForHash(hash)}.hash.cymru.com`;
    return yield* runAbortableResolver(
      signal,
      "Team Cymru MHR lookup aborted",
      (resolver) =>
        Effect.gen(function* fetchCymruMhrDnsGen() {
          const answers = yield* dnsOrEmpty(
            () => resolver.resolveTxt(domain),
            [] as string[][]
          );
          const { lastSeenEpoch, detectionPct } = parseTxtAnswer(answers);
          return cymruMhrLookupSnapshotSchema.parse({
            hash,
            queriedAt: new Date().toISOString(),
            source: "hash.cymru.com",
            found: answers.length > 0,
            lastSeenEpoch,
            detectionPct,
          });
        })
    );
  });
}
