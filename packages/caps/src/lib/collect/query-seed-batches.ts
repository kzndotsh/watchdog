import type { IdentifierType } from "@watchdog/schemas";

import { withSeedHost } from "./eligible-domain-hosts";
import type { IdentifierBatch } from "./interpret-identifier-batches";
import { validatedIdentifierValue } from "./validated-identifier-value";

export type QuerySeedKind =
  | "ip"
  | "domain"
  | "url"
  | "email"
  | "hash"
  | "other";

/** Default per-batch Identifier cap for related domain hostnames. */
export const DOMAIN_IDENTIFIER_BATCH_LIMIT = 80;

/** Default per-batch Identifier cap for related URL rows. */
export const URL_IDENTIFIER_BATCH_LIMIT = 40;

/** Default per-batch Identifier cap for related email rows. */
export const EMAIL_IDENTIFIER_BATCH_LIMIT = 40;

/** Default per-batch Identifier cap for related handle rows. */
export const HANDLE_IDENTIFIER_BATCH_LIMIT = 40;

/** Claim suffix when proposed Identifiers are capped below the report total. */
export function identifierTruncationNote(total: number, limit: number): string {
  return total > limit ? ` (showing ${limit} of ${total} in Identifiers)` : "";
}

function batchValueCount(batches: readonly IdentifierBatch[]): number {
  return batches.reduce((count, batch) => count + batch.values.length, 0);
}

function pushUniqueValidated(
  seen: Set<string>,
  values: string[],
  type: IdentifierType,
  raw: string
): void {
  const value = validatedIdentifierValue(type, raw);
  if (value === null || seen.has(value)) return;
  seen.add(value);
  values.push(value);
}

function valuesBatch(
  type: IdentifierType,
  raws: readonly string[],
  opts?: { limit?: number }
): readonly IdentifierBatch[] {
  const values: string[] = [];
  const seen = new Set<string>();
  for (const raw of raws) {
    pushUniqueValidated(seen, values, type, raw);
  }
  if (values.length === 0) return [];
  return [
    {
      type,
      values,
      ...(opts?.limit === undefined ? {} : { limit: opts.limit }),
    },
  ];
}

/** Single-batch helper for caps that consume one IP seed. */
export function ipSeedBatch(ip: string): readonly IdentifierBatch[] {
  const value = validatedIdentifierValue("ip", ip);
  if (value === null) return [];
  return [{ type: "ip", values: [value] }];
}

/** Multi-value IP batch — dedupes and skips invalid addresses. */
export function ipValuesBatch(
  ips: readonly string[],
  opts?: { limit?: number }
): readonly IdentifierBatch[] {
  return valuesBatch("ip", ips, opts);
}

/** Multi-value domain batch — dedupes and skips invalid hostnames. */
export function domainValuesBatch(
  domains: readonly string[],
  opts?: { limit?: number }
): readonly IdentifierBatch[] {
  return valuesBatch("domain", domains, opts);
}

/** Multi-value email batch — dedupes and skips invalid addresses. */
export function emailValuesBatch(
  emails: readonly string[],
  opts?: { limit?: number }
): readonly IdentifierBatch[] {
  return valuesBatch("email", emails, opts);
}

/** Single-batch helper for caps that consume one URL seed. */
export function urlSeedBatch(url: string): readonly IdentifierBatch[] {
  const value = validatedIdentifierValue("url", url);
  if (value === null) return [];
  return [{ type: "url", values: [value] }];
}

/** Multi-value URL batch — dedupes and skips invalid URLs. */
export function urlValuesBatch(
  urls: readonly string[],
  opts?: { limit?: number }
): readonly IdentifierBatch[] {
  return valuesBatch("url", urls, opts);
}

/** Eligible domain Identifiers after wildcard filtering and validation. */
export function eligibleDomainCount(domains: readonly string[]): number {
  return batchValueCount(domainValuesBatch(domains));
}

/** Eligible IP Identifiers after dedupe and validation. */
export function eligibleIpCount(ips: readonly string[]): number {
  return batchValueCount(ipValuesBatch(ips));
}

/** Domain hosts safe for playbook handoff bags (same gate as domainValuesBatch). */
export function eligibleHandoffHosts(
  seedHost: string,
  domains: readonly string[]
): string[] {
  const batches = domainValuesBatch(withSeedHost(seedHost, domains));
  const values = batches[0]?.values ?? [];
  return values.flatMap((value) => (typeof value === "string" ? [value] : []));
}

/** Eligible URL Identifiers after dedupe and validation. */
export function eligibleUrlCount(urls: readonly string[]): number {
  return batchValueCount(urlValuesBatch(urls));
}

/** Eligible email Identifiers after dedupe and validation. */
export function eligibleEmailCount(emails: readonly string[]): number {
  return batchValueCount(emailValuesBatch(emails));
}

/** File-hash playbook seeds map to `other` Identifiers (no dedicated hash type). */
export function hashSeedBatch(hash: string): readonly IdentifierBatch[] {
  const value = validatedIdentifierValue("other", hash);
  if (value === null) return [];
  return [{ type: "other", values: [value] }];
}

/** Propose the queried indicator when kind maps to a graph Identifier type. */
export function querySeedBatches(
  query: string,
  kind: QuerySeedKind
): readonly IdentifierBatch[] {
  if (kind === "other") return [];
  if (kind === "hash") {
    const value = validatedIdentifierValue("other", query);
    if (value === null) return [];
    return [{ type: "other", values: [value] }];
  }
  const value = validatedIdentifierValue(kind, query);
  if (value === null) return [];
  return [{ type: kind, values: [value] }];
}
