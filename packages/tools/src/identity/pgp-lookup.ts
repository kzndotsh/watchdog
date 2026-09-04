import { Effect } from "effect";
import type { HttpClient } from "effect/unstable/http";
import { z } from "zod";

import { ValidationVendorError, type ToolsTag } from "../errors/tagged-errors";
import { watchdogUserAgent } from "../errors/user-agent";
import { fetchBytesEffect } from "../http/fetch-bytes";

export const pgpKeySchema = z.object({
  /** Key id / fingerprint string from HKP index (may be short id). */
  fingerprint: z.string(),
  uids: z.array(z.string()),
  created: z.string().nullable(),
  expires: z.string().nullable(),
});

export const pgpLookupSnapshotSchema = z.object({
  query: z.string().min(1),
  queriedAt: z.string().min(1),
  source: z.string().nullable(),
  keys: z.array(pgpKeySchema),
});

export type PgpKeyHit = z.infer<typeof pgpKeySchema>;
export type PgpLookupSnapshot = z.infer<typeof pgpLookupSnapshotSchema>;

const KEYSERVERS = [
  "https://keys.openpgp.org",
  "https://keyserver.ubuntu.com",
] as const;

function epochIso(raw: string | undefined): string | null {
  const text = (raw ?? "").trim();
  if (!text || text === "0") return null;
  const n = Number(text);
  if (!Number.isFinite(n)) return null;
  try {
    return new Date(n * 1000).toISOString();
  } catch {
    return null;
  }
}

/** Parse machine-readable HKP index (info:/pub:/uid: lines). */
export function parseHkpMrIndex(body: string): PgpKeyHit[] {
  const keys: PgpKeyHit[] = [];
  let current: PgpKeyHit | null = null;
  for (const line of body.split(/\r?\n/)) {
    if (line.startsWith("pub:")) {
      if (current !== null) keys.push(current);
      const parts = line.split(":");
      current = {
        fingerprint: parts[4] ?? "",
        uids: [],
        created: epochIso(parts[5]),
        expires: epochIso(parts[6]),
      };
    } else if (line.startsWith("uid:") && current !== null) {
      const parts = line.split(":");
      const uid = parts[1] ?? "";
      if (uid !== "") current.uids.push(uid);
    }
  }
  if (current !== null) keys.push(current);
  return keys.filter((k) => k.fingerprint !== "");
}

/**
 * HKP lookup across public keyservers (keys.openpgp.org first).
 * Query: email, fingerprint, or key id.
 */

interface PgpLookupOptions {
  userAgent?: string;
}
export function fetchPgpLookupEffect(
  queryRaw: string,
  signal: AbortSignal,
  options?: PgpLookupOptions
): Effect.Effect<PgpLookupSnapshot, ToolsTag, HttpClient.HttpClient> {
  return Effect.gen(function* fetchPgpLookupGen() {
    const query = queryRaw.trim();
    if (!query) {
      return yield* new ValidationVendorError({
        message: "PGP query required",
      });
    }
    const ua = options?.userAgent ?? watchdogUserAgent("identity.pgp.lookup");

    let source: string | null = null;
    let keys: PgpKeyHit[] = [];

    for (const base of KEYSERVERS) {
      const url = `${base}/pks/lookup?op=index&options=mr&search=${encodeURIComponent(query)}`;
      const result = yield* fetchBytesEffect(url, signal, {
        userAgent: ua,
        maxBytes: 512_000,
        accept: "text/plain",
      });
      if (!result.ok) continue;
      const text = new TextDecoder().decode(result.bytes);
      const parsed = parseHkpMrIndex(text);
      if (parsed.length > 0) {
        keys = parsed;
        source = base;
        break;
      }
    }

    return pgpLookupSnapshotSchema.parse({
      query,
      queriedAt: new Date().toISOString(),
      source,
      keys,
    });
  });
}
