import { z } from "zod";

import { ValidationVendorError } from "../errors/tagged-errors";
import {
  defineJsonProvider,
  type JsonProviderContext,
} from "../http/define-json-provider";
import { classifyBreachQuery } from "../parse/classify-breach-query";
import { asString, isRecord } from "../parse/coerce";
import {
  credentialAttrsSchema,
  credentialPair,
  credentialReuse,
  credentialReuseSchema,
  type CredentialFingerprint,
  type CredentialHandling,
  type CredentialPair,
} from "./credentials";

const DATABASE_NAMES_CAP = 20;
const ENTRIES_CAP = 100;

export const dehashedEntrySchema = z.object({
  databaseName: z.string().nullable(),
  email: z.string().nullable(),
  username: z.string().nullable(),
  ipAddress: z.string().nullable(),
  name: z.string().nullable(),
  phone: z.string().nullable(),
  password: z.string().nullable(),
  hashedPassword: z.string().nullable(),
});

/** An entry with its credentials cut to attributes (`safe` mode): no password, no hash. */
export const dehashedSafeEntrySchema = dehashedEntrySchema
  .omit({ password: true, hashedPassword: true })
  .extend({
    password: credentialAttrsSchema,
    hashedPassword: credentialAttrsSchema,
  });

const dehashedSnapshotBase = z.object({
  query: z.string().min(1),
  kind: z.enum(["email", "ip", "domain", "username", "query"]),
  queriedAt: z.string().min(1),
  source: z.literal("api.dehashed.com"),
  found: z.boolean(),
  total: z.number().int(),
  balance: z.number().int().nullable(),
  databases: z.array(z.string()),
  sampleCount: z.number().int(),
  /** Passwords or hashes shared by several records of this result (fingerprints only). */
  reuse: z.array(credentialReuseSchema),
});

/** `full` keeps the recovered values; `safe` keeps their attributes only. */
export const dehashedLookupSnapshotSchema = z.discriminatedUnion(
  "credentialMode",
  [
    dehashedSnapshotBase.extend({
      credentialMode: z.literal("full"),
      entries: z.array(dehashedEntrySchema),
    }),
    dehashedSnapshotBase.extend({
      credentialMode: z.literal("safe"),
      entries: z.array(dehashedSafeEntrySchema),
    }),
  ]
);

export type DehashedEntry = z.infer<typeof dehashedEntrySchema>;
export type DehashedSafeEntry = z.infer<typeof dehashedSafeEntrySchema>;
export type DehashedLookupSnapshot = z.infer<
  typeof dehashedLookupSnapshotSchema
>;

/** The entry as `safe` mode stores it: every field but the credentials as it was. */
function toSafeEntry(
  entry: DehashedEntry,
  pair: CredentialPair
): DehashedSafeEntry {
  const { password: _password, hashedPassword: _hash, ...rest } = entry;
  return { ...rest, password: pair.password, hashedPassword: pair.hash };
}

function safeEntryOf(
  entry: DehashedEntry,
  fingerprint: CredentialFingerprint
): DehashedSafeEntry {
  return toSafeEntry(
    entry,
    credentialPair(entry.password, entry.hashedPassword, fingerprint)
  );
}

/**
 * Cut a snapshot's credentials to attributes: a `full` snapshot becomes a `safe` one (the
 * Export's redaction), a `safe` snapshot is returned as it is. It is the transform the Cap's own
 * `safe` mode uses, so the attributes match.
 */
export function redactDehashedSnapshot(
  snapshot: DehashedLookupSnapshot,
  fingerprint: CredentialFingerprint
): DehashedLookupSnapshot {
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
      entries.map((entry) => ({
        password: entry.password,
        hash: entry.hashedPassword,
      }))
    ),
  };
}

function classifyDehashedQuery(raw: string): {
  kind: "email" | "ip" | "domain" | "username" | "query";
  value: string;
} {
  const base = classifyBreachQuery(raw);
  if (base.kind !== "username") return base;
  if (/^[a-zA-Z0-9_.-]{1,64}$/.test(base.value)) return base;
  return { kind: "query", value: base.value };
}

function escapeDehashedQuoted(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
}

function quotedDehashedField(field: string, value: string): string {
  return `${field}:"${escapeDehashedQuoted(value)}"`;
}

function buildDehashedQuery(
  kind: "email" | "ip" | "domain" | "username" | "query",
  value: string
): string {
  switch (kind) {
    case "email": {
      return quotedDehashedField("email", value);
    }
    case "ip": {
      return quotedDehashedField("ip_address", value);
    }
    case "domain": {
      return quotedDehashedField("domain", value);
    }
    case "username": {
      return quotedDehashedField("username", value);
    }
    case "query": {
      if (/[()"]|\sOR\s|\sAND\s/i.test(value)) {
        throw new ValidationVendorError({
          message: `Invalid DeHashed query: ${value}`,
        });
      }
      return value;
    }
    default: {
      const _exhaustive: never = kind;
      throw new ValidationVendorError({
        message: `Unhandled DeHashed query kind: ${String(_exhaustive)}`,
      });
    }
  }
}

function extractDatabases(entries: DehashedEntry[]): string[] {
  const seen = new Set<string>();
  for (const entry of entries) {
    if (entry.databaseName && !seen.has(entry.databaseName)) {
      seen.add(entry.databaseName);
      if (seen.size >= DATABASE_NAMES_CAP) break;
    }
  }
  return [...seen];
}

function mapEntry(raw: unknown): DehashedEntry | null {
  if (!isRecord(raw)) return null;
  return dehashedEntrySchema.parse({
    databaseName: asString(raw.database_name),
    email: asString(raw.email),
    username: asString(raw.username),
    ipAddress: asString(raw.ip_address),
    name: asString(raw.name),
    phone: asString(raw.phone),
    password: asString(raw.password),
    hashedPassword: asString(raw.hashed_password),
  });
}

function dehashedEntryHasSubstance(entry: DehashedEntry): boolean {
  return (
    entry.databaseName !== null ||
    entry.email !== null ||
    entry.username !== null ||
    entry.ipAddress !== null ||
    entry.name !== null ||
    entry.phone !== null ||
    entry.password !== null ||
    entry.hashedPassword !== null
  );
}

/**
 * DeHashed breach-corpus search (email / IP / domain / username).
 * POST https://api.dehashed.com/v2/search — header `DeHashed-Api-Key`.
 * @see https://docs.dehashed.com/
 */

type DehashedOptions = {
  userAgent: string;
  /** Required: a lookup never decides for itself whether to keep a password. */
  credentials: CredentialHandling;
};

/** DeHashed accepts any status below 400; `fetch` follows redirects, so only a stray 3xx reaches here. */
const REDIRECT_STATUSES = Array.from({ length: 100 }, (_, i) => 300 + i);

type DehashedSubject = {
  kind: "email" | "ip" | "domain" | "username" | "query";
  value: string;
  query: string;
};

function normalizeDehashedQuery(raw: string): DehashedSubject {
  const { kind, value } = classifyDehashedQuery(raw);
  if (value === "") {
    throw new ValidationVendorError({ message: "DeHashed query is empty" });
  }
  try {
    return { kind, value, query: buildDehashedQuery(kind, value) };
  } catch (error) {
    if (error instanceof ValidationVendorError) throw error;
    throw new ValidationVendorError({
      message: "Invalid DeHashed query",
      // The thrown message can echo the query value: keep the class only.
      cause: error instanceof Error ? error.name : typeof error,
    });
  }
}

function dehashedSnapshot({
  subject: { kind, value },
  queriedAt,
  body,
  options,
}: JsonProviderContext<DehashedSubject, DehashedOptions>) {
  const rawEntries = Array.isArray(body.entries) ? body.entries : [];
  const entries: DehashedEntry[] = [];
  for (const raw of rawEntries.slice(0, ENTRIES_CAP)) {
    const mapped = mapEntry(raw);
    if (mapped !== null && dehashedEntryHasSubstance(mapped)) {
      entries.push(mapped);
    }
  }
  const total = typeof body.total === "number" ? body.total : entries.length;
  const balance = typeof body.balance === "number" ? body.balance : null;
  const databases = extractDatabases(entries);

  const { mode, fingerprint } = options.credentials;
  const base = {
    query: value,
    kind,
    queriedAt,
    source: "api.dehashed.com" as const,
    found: entries.length > 0,
    total,
    balance,
    databases,
    sampleCount: entries.length,
    reuse: credentialReuse(
      entries.map((entry) =>
        credentialPair(entry.password, entry.hashedPassword, fingerprint)
      )
    ),
  };
  return mode === "full"
    ? { ...base, credentialMode: "full" as const, entries }
    : {
        ...base,
        credentialMode: "safe" as const,
        entries: entries.map((entry) => safeEntryOf(entry, fingerprint)),
      };
}

export const fetchDehashedLookupEffect = defineJsonProvider({
  service: "DeHashed",
  schema: dehashedLookupSnapshotSchema,
  key: { header: "DeHashed-Api-Key" },
  normalize: normalizeDehashedQuery,
  request: ({ query }, _options: DehashedOptions) => ({
    url: "https://api.dehashed.com/v2/search",
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query,
      page: 1,
      size: ENTRIES_CAP,
      de_dupe: true,
      wildcard: false,
    }),
  }),
  notFoundStatuses: REDIRECT_STATUSES,
  notFound: dehashedSnapshot,
  toSnapshot: dehashedSnapshot,
});
