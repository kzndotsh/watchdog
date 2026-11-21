import { Effect } from "effect";

import { mapToolsCatch } from "../errors/map-tools-catch";
import type { ToolsTag } from "../errors/tagged-errors";
import { validationVendorError } from "../errors/vendor-errors";
import { Egress } from "../http/egress";
import { classifyIpOrHost } from "../parse/classify-ip-or-host";
import { dedupeResolvedIps } from "./reverse";
import { dnsRecordsSchema, type DnsRecords } from "./schema";

export type { DnsRecords };

function normalizeDnsLookupHost(raw: string): string {
  const classified = classifyIpOrHost(raw);
  if (classified.kind === "ip") {
    throw validationVendorError(
      `DNS forward lookup requires a hostname: ${raw}`
    );
  }
  return classified.value;
}

/** Effect wrapper — invalid host → tagged `ToolsTag`, not a defect. */
export function normalizeDnsLookupHostEffect(
  raw: string
): Effect.Effect<string, ToolsTag> {
  return Effect.try({
    try: () => normalizeDnsLookupHost(raw),
    catch: mapToolsCatch,
  });
}

/** Resolve A/AAAA/MX/TXT/NS through the Job's `Egress`; cancels the resolver on abort. */
export function resolveDnsRecordsEffect(
  host: string,
  signal: AbortSignal
): Effect.Effect<DnsRecords, ToolsTag, Egress> {
  return Effect.gen(function* resolveDnsRecordsGen() {
    const name = yield* normalizeDnsLookupHostEffect(host);
    const egress = yield* Egress;
    const [a, aaaa, mx, txt, ns] = yield* Effect.all(
      [
        egress.resolve({ type: "A", name }, signal),
        egress.resolve({ type: "AAAA", name }, signal),
        egress.resolve({ type: "MX", name }, signal),
        egress.resolve({ type: "TXT", name }, signal),
        egress.resolve({ type: "NS", name }, signal),
      ],
      { concurrency: "unbounded" }
    );
    return dnsRecordsSchema.parse({
      host: name,
      a: dedupeResolvedIps(a),
      aaaa: dedupeResolvedIps(aaaa),
      mx,
      txt,
      ns,
    });
  });
}
