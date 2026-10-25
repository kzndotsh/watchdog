/**
 * The Job's DNS door, below `Egress.resolve` (`egress.ts`): the only code that talks to the
 * resolver. Private to the egress module; vendor code asks `Egress.resolve`, which records
 * the answer. The resolver is cancelled when the caller's signal aborts or the fiber is
 * interrupted.
 */
import { Resolver } from "node:dns/promises";
import { isIP } from "node:net";

import { Effect } from "effect";

import { mapToolsCatch } from "../errors/map-tools-catch";
import type { ToolsTag } from "../errors/tagged-errors";
import { abortedError, validationVendorError } from "../errors/vendor-errors";
import { normalizeHost } from "../whois/normalize";

export type DnsRecordType = "A" | "AAAA" | "MX" | "TXT" | "NS" | "PTR";

export type MxRecord = { readonly exchange: string; readonly priority: number };

/** The parsed answer the resolver returns for each record type. */
export type DnsAnswers = {
  readonly A: string[];
  readonly AAAA: string[];
  readonly MX: MxRecord[];
  readonly TXT: string[][];
  readonly NS: string[];
  readonly PTR: string[];
};

/** A parsed answer and the response code it came with (0 NOERROR, 2 SERVFAIL, 3 NXDOMAIN). */
export type DnsOutcome<T extends DnsRecordType> = {
  readonly answers: DnsAnswers[T];
  readonly rcode: number;
};

const RCODE_NOERROR = 0;
const RCODE_SERVFAIL = 2;
const RCODE_NXDOMAIN = 3;

/** A name that is an answer rather than a fault: the resolver's code, as the response code. */
const BENIGN_DNS_RCODES: Readonly<Record<string, number>> = {
  ENOTFOUND: RCODE_NXDOMAIN,
  ENODATA: RCODE_NOERROR,
  ESERVFAIL: RCODE_SERVFAIL,
};

const QUERIES: {
  readonly [T in DnsRecordType]: (
    resolver: Resolver,
    name: string
  ) => Promise<DnsAnswers[T]>;
} = {
  A: async (resolver, name) => resolver.resolve4(name),
  AAAA: async (resolver, name) => resolver.resolve6(name),
  MX: async (resolver, name) => resolver.resolveMx(name),
  TXT: async (resolver, name) => resolver.resolveTxt(name),
  NS: async (resolver, name) => resolver.resolveNs(name),
  PTR: async (resolver, name) => resolver.reverse(name),
};

const EMPTY_ANSWERS: { readonly [T in DnsRecordType]: DnsAnswers[T] } = {
  A: [],
  AAAA: [],
  MX: [],
  TXT: [],
  NS: [],
  PTR: [],
};

/** Labels may start with `_` (`_dmarc`, `_domainkey`): service names, not host names. */
const DNS_NAME_RE =
  /^(?=.{1,253}$)(?:[a-z0-9_](?:[a-z0-9_-]{0,61}[a-z0-9_])?\.)*[a-z0-9_](?:[a-z0-9_-]{0,61}[a-z0-9_])?$/;

/**
 * The name a query is sent and recorded under: the tools host normalizer (`normalizeHost`:
 * case, trailing dot, scheme, port) for a name, the address itself for a PTR query. A name
 * that does not fit DNS syntax is a `ValidationVendorError`.
 */
export function dnsQueryName(
  type: DnsRecordType,
  raw: string
): Effect.Effect<string, ToolsTag> {
  return Effect.try({
    try: () => {
      const name = type === "PTR" ? raw.trim() : normalizeHost(raw);
      const valid = type === "PTR" ? isIP(name) !== 0 : DNS_NAME_RE.test(name);
      if (!valid) throw validationVendorError("Invalid DNS name");
      return name;
    },
    catch: mapToolsCatch,
  });
}

const abort = () => abortedError("DNS lookup aborted");

function byKey(a: readonly [string, unknown], b: readonly [string, unknown]) {
  if (a[0] < b[0]) return -1;
  return a[0] > b[0] ? 1 : 0;
}

function errorCode(cause: unknown): string | undefined {
  if (typeof cause !== "object" || cause === null || !("code" in cause)) {
    return undefined;
  }
  return typeof cause.code === "string" ? cause.code : undefined;
}

/**
 * One query on the system resolver. NXDOMAIN, no data and SERVFAIL are answers (an empty
 * answer with their response code); any other resolver fault fails. An abort rethrows as
 * `AbortedError` (a defect), whichever way the resolver reports the cancel.
 */
export function queryDns<T extends DnsRecordType>(
  type: T,
  name: string,
  signal: AbortSignal
): Effect.Effect<DnsOutcome<T>, ToolsTag> {
  return Effect.tryPromise({
    try: async (interrupt) => {
      const stop = AbortSignal.any([signal, interrupt]);
      if (stop.aborted) throw abort();
      const resolver = new Resolver();
      const onAbort = () => {
        try {
          resolver.cancel();
        } catch {
          // already cancelled / idle
        }
      };
      stop.addEventListener("abort", onAbort, { once: true });
      try {
        const answers = await QUERIES[type](resolver, name);
        if (stop.aborted) throw abort();
        return { answers, rcode: RCODE_NOERROR };
      } catch (error) {
        if (stop.aborted) throw abort();
        const code = errorCode(error);
        const rcode = code === undefined ? undefined : BENIGN_DNS_RCODES[code];
        if (rcode === undefined) throw error;
        return { answers: EMPTY_ANSWERS[type], rcode };
      } finally {
        stop.removeEventListener("abort", onAbort);
      }
    },
    catch: mapToolsCatch,
  });
}

/** Canonical JSON: object keys sorted at every depth, no whitespace; arrays keep their order. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  }
  if (typeof value === "object" && value !== null) {
    const entries = Object.entries(value)
      .sort(byKey)
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`);
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value);
}
