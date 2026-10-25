import { Effect } from "effect";
import type { HttpClient } from "effect/http";
import { z } from "zod";

import { MissingCredentialError, type ToolsTag } from "../errors/tagged-errors";
import { watchdogUserAgent } from "../errors/user-agent";
import { fetchJsonObjectEffect } from "../http/fetch-json";
import { nowIsoStringEffect } from "../infra/clock";
import { classifyBreachQuery } from "../parse/classify-breach-query";
import { asString, isRecord } from "../parse/coerce";
import {
  credentialAttrsSchema,
  credentialPair,
  credentialReuse,
  credentialReuseSchema,
  type CredentialFingerprint,
  type CredentialHandling,
} from "./credentials";

const TABLES_CAP = 15;
const ENTRIES_CAP = 100;

const SNUSBASE_TYPE = {
  email: "email",
  ip: "lastip",
  domain: "_domain",
  username: "username",
} as const;

export const snusbaseTableCountSchema = z.object({
  name: z.string(),
  count: z.number().int(),
});

export const snusbaseEntrySchema = z.object({
  table: z.string().min(1),
  email: z.string().nullable(),
  username: z.string().nullable(),
  password: z.string().nullable(),
  hash: z.string().nullable(),
  lastip: z.string().nullable(),
  name: z.string().nullable(),
  host: z.string().nullable(),
  domain: z.string().nullable(),
});

/** An entry with its credentials cut to attributes (`safe` mode): no password, no hash. */
export const snusbaseSafeEntrySchema = snusbaseEntrySchema
  .omit({ password: true, hash: true })
  .extend({
    password: credentialAttrsSchema,
    hash: credentialAttrsSchema,
  });

const snusbaseSnapshotBase = z.object({
  query: z.string().min(1),
  kind: z.enum(["email", "ip", "domain", "username"]),
  queriedAt: z.string().min(1),
  source: z.literal("api.snusbase.com"),
  found: z.boolean(),
  total: z.number().int(),
  tables: z.array(snusbaseTableCountSchema),
  sampleCount: z.number().int(),
  /** Passwords or hashes shared by several records of this result (fingerprints only). */
  reuse: z.array(credentialReuseSchema),
});

/** `full` keeps the recovered values; `safe` keeps their attributes only. */
export const snusbaseLookupSnapshotSchema = z.discriminatedUnion(
  "credentialMode",
  [
    snusbaseSnapshotBase.extend({
      credentialMode: z.literal("full"),
      entries: z.array(snusbaseEntrySchema),
    }),
    snusbaseSnapshotBase.extend({
      credentialMode: z.literal("safe"),
      entries: z.array(snusbaseSafeEntrySchema),
    }),
  ]
);

export type SnusbaseTableCount = z.infer<typeof snusbaseTableCountSchema>;
export type SnusbaseEntry = z.infer<typeof snusbaseEntrySchema>;
export type SnusbaseSafeEntry = z.infer<typeof snusbaseSafeEntrySchema>;
export type SnusbaseLookupSnapshot = z.infer<
  typeof snusbaseLookupSnapshotSchema
>;

function safeEntryOf(
  entry: SnusbaseEntry,
  fingerprint: CredentialFingerprint
): SnusbaseSafeEntry {
  const { password, hash, ...rest } = entry;
  const pair = credentialPair(password, hash, fingerprint);
  return { ...rest, password: pair.password, hash: pair.hash };
}

/**
 * Cut a snapshot's credentials to attributes: a `full` snapshot becomes a `safe` one (the
 * Export's redaction), a `safe` snapshot is returned as it is. It is the transform the Cap's own
 * `safe` mode uses, so the attributes match.
 */
export function redactSnusbaseSnapshot(
  snapshot: SnusbaseLookupSnapshot,
  fingerprint: CredentialFingerprint
): SnusbaseLookupSnapshot {
  if (snapshot.credentialMode === "safe") return snapshot;
  const entries = snapshot.entries.map((entry) =>
    safeEntryOf(entry, fingerprint)
  );
  return {
    ...snapshot,
    credentialMode: "safe",
    entries,
    // Recomputed from the entries just written: the stored list was made under the key of its
    // time, and a key change since would leave groups that match no entry.
    reuse: credentialReuse(
      entries.map((entry) => ({ password: entry.password, hash: entry.hash }))
    ),
  };
}

function classifySnusbaseQuery(raw: string): {
  kind: "email" | "ip" | "domain" | "username";
  value: string;
  type: string;
} {
  const { kind, value } = classifyBreachQuery(raw);
  return { kind, value, type: SNUSBASE_TYPE[kind] };
}

function mapRow(table: string, raw: unknown): SnusbaseEntry | null {
  if (!isRecord(raw)) return null;
  return snusbaseEntrySchema.parse({
    table,
    email: asString(raw.email),
    username: asString(raw.username),
    password: asString(raw.password),
    hash: asString(raw.hash),
    lastip: asString(raw.lastip),
    name: asString(raw.name),
    host: asString(raw.host),
    domain: asString(raw._domain) ?? asString(raw.domain),
  });
}

function snusbaseEntryHasSubstance(entry: SnusbaseEntry): boolean {
  return (
    entry.email !== null ||
    entry.username !== null ||
    entry.password !== null ||
    entry.hash !== null ||
    entry.lastip !== null ||
    entry.name !== null ||
    entry.host !== null ||
    entry.domain !== null
  );
}

function flattenSearchResults(results: unknown): {
  tables: SnusbaseTableCount[];
  entries: SnusbaseEntry[];
} {
  const tables: SnusbaseTableCount[] = [];
  const entries: SnusbaseEntry[] = [];
  if (!isRecord(results)) {
    return { tables, entries };
  }
  for (const [table, value] of Object.entries(results)) {
    if (!Array.isArray(value)) continue;
    tables.push({ name: table, count: value.length });
    for (const row of value) {
      if (entries.length >= ENTRIES_CAP) break;
      const mapped = mapRow(table, row);
      if (mapped !== null && snusbaseEntryHasSubstance(mapped)) {
        entries.push(mapped);
      }
    }
    if (entries.length >= ENTRIES_CAP) break;
  }
  tables.sort((a, b) => b.count - a.count);
  return { tables: tables.slice(0, TABLES_CAP), entries };
}

/**
 * Snusbase breach/combolist search (email / IP / domain / username).
 * POST https://api.snusbase.com/data/search — header `Auth`.
 * @see https://docs.snusbase.com/
 */

type SnusbaseOptions = {
  userAgent?: string;
  /** Required: a lookup never decides for itself whether to keep a password. */
  credentials: CredentialHandling;
};

export function fetchSnusbaseLookupEffect(
  queryRaw: string,
  apiKey: string,
  signal: AbortSignal,
  options: SnusbaseOptions
): Effect.Effect<SnusbaseLookupSnapshot, ToolsTag, HttpClient.HttpClient> {
  return Effect.gen(function* fetchSnusbaseLookupGen() {
    const queriedAt = yield* nowIsoStringEffect;
    const key = apiKey.trim();
    if (!key) {
      return yield* new MissingCredentialError({ slot: "SNUSBASE_API_KEY" });
    }

    const { kind, value, type } = classifySnusbaseQuery(queryRaw);
    const ua = options.userAgent ?? watchdogUserAgent("breach.snusbase.lookup");

    const { body } = yield* fetchJsonObjectEffect({
      url: "https://api.snusbase.com/data/search",
      init: {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          Auth: key,
          "User-Agent": ua,
        },
        body: JSON.stringify({ terms: [value], types: [type] }),
      },
      signal,
      service: "Snusbase",
      subject: value,
      acceptStatus: (status) => status < 400,
    });
    const { tables, entries } = flattenSearchResults(body.results);
    const total =
      typeof body.size === "number"
        ? body.size
        : tables.reduce((sum, t) => sum + t.count, 0);

    const { mode, fingerprint } = options.credentials;
    const base = {
      query: value,
      kind,
      queriedAt,
      source: "api.snusbase.com" as const,
      found: entries.length > 0,
      total,
      tables,
      sampleCount: entries.length,
      reuse: credentialReuse(
        entries.map((entry) =>
          credentialPair(entry.password, entry.hash, fingerprint)
        )
      ),
    };
    return snusbaseLookupSnapshotSchema.parse(
      mode === "full"
        ? { ...base, credentialMode: "full", entries }
        : {
            ...base,
            credentialMode: "safe",
            entries: entries.map((entry) => safeEntryOf(entry, fingerprint)),
          }
    );
  });
}
