import { Effect } from "effect";
import type { HttpClient } from "effect/unstable/http";
import { z } from "zod";

import {
  MissingCredentialError,
  ValidationVendorError,
  type ToolsTag,
} from "../errors/tagged-errors";
import { watchdogUserAgent } from "../errors/user-agent";
import { fetchJsonObjectEffect } from "../http/fetch-json";
import { classifyBreachQuery } from "../parse/classify-breach-query";
import { asString, isRecord } from "../parse/coerce";

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

export const dehashedLookupSnapshotSchema = z.object({
  query: z.string().min(1),
  kind: z.enum(["email", "ip", "domain", "username", "query"]),
  queriedAt: z.string().min(1),
  source: z.literal("api.dehashed.com"),
  found: z.boolean(),
  total: z.number().int(),
  balance: z.number().int().nullable(),
  databases: z.array(z.string()),
  sampleCount: z.number().int(),
  entries: z.array(dehashedEntrySchema),
});

export type DehashedEntry = z.infer<typeof dehashedEntrySchema>;
export type DehashedLookupSnapshot = z.infer<
  typeof dehashedLookupSnapshotSchema
>;

function classifyDehashedQuery(raw: string): {
  kind: "email" | "ip" | "domain" | "username" | "query";
  value: string;
} {
  const base = classifyBreachQuery(raw);
  if (base.kind !== "username") return base;
  if (/^[a-zA-Z0-9_.-]{1,64}$/.test(base.value)) return base;
  return { kind: "query", value: base.value };
}

function buildDehashedQuery(
  kind: "email" | "ip" | "domain" | "username" | "query",
  value: string
): string {
  switch (kind) {
    case "email": {
      return `email:"${value}"`;
    }
    case "ip": {
      return `ip_address:"${value}"`;
    }
    case "domain": {
      return `domain:${value}`;
    }
    case "username": {
      return `username:${value}`;
    }
    case "query": {
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

/**
 * DeHashed breach-corpus search (email / IP / domain / username).
 * POST https://api.dehashed.com/v2/search — header `DeHashed-Api-Key`.
 * @see https://docs.dehashed.com/
 */

interface DehashedOptions {
  userAgent?: string;
}

export function fetchDehashedLookupEffect(
  queryRaw: string,
  apiKey: string,
  signal: AbortSignal,
  options?: DehashedOptions
): Effect.Effect<DehashedLookupSnapshot, ToolsTag, HttpClient.HttpClient> {
  return Effect.gen(function* fetchDehashedLookupGen() {
    const key = apiKey.trim();
    if (!key) {
      return yield* new MissingCredentialError({ slot: "DEHASHED_API_KEY" });
    }

    const { kind, value } = classifyDehashedQuery(queryRaw);
    const query = buildDehashedQuery(kind, value);
    const ua =
      options?.userAgent ?? watchdogUserAgent("breach.dehashed.lookup");

    const { body } = yield* fetchJsonObjectEffect({
      url: "https://api.dehashed.com/v2/search",
      init: {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "DeHashed-Api-Key": key,
          "User-Agent": ua,
        },
        body: JSON.stringify({
          query,
          page: 1,
          size: ENTRIES_CAP,
          de_dupe: true,
          wildcard: false,
        }),
      },
      signal,
      service: "DeHashed",
      subject: value,
      acceptStatus: (status) => status < 400,
    });
    const rawEntries = Array.isArray(body.entries) ? body.entries : [];
    const entries: DehashedEntry[] = [];
    for (const raw of rawEntries.slice(0, ENTRIES_CAP)) {
      const mapped = mapEntry(raw);
      if (mapped) entries.push(mapped);
    }
    const total = typeof body.total === "number" ? body.total : entries.length;
    const balance = typeof body.balance === "number" ? body.balance : null;
    const databases = extractDatabases(entries);

    return dehashedLookupSnapshotSchema.parse({
      query: value,
      kind,
      queriedAt: new Date().toISOString(),
      source: "api.dehashed.com",
      found: total > 0,
      total,
      balance,
      databases,
      sampleCount: entries.length,
      entries,
    });
  });
}
