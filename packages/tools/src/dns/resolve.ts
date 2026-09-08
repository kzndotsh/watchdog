import { Effect } from "effect";

import { mapToolsCatch } from "../errors/map-tools-tag";
import type { ToolsTag } from "../errors/tagged-errors";
import { validationToolsError } from "../errors/tools-error";
import { classifyIpOrHost } from "../parse/classify-ip-or-host";
import { dnsOrEmpty, runAbortableResolver } from "./abortable-resolver";
import { dnsRecordsSchema, type DnsRecords } from "./schema";

export type { DnsRecords };

function normalizeDnsLookupHost(raw: string): string {
  const classified = classifyIpOrHost(raw);
  if (classified.kind === "ip") {
    throw validationToolsError(
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

/** Resolve A/AAAA/MX/TXT/NS; cancels the Node resolver on abort. */
export function resolveDnsRecordsEffect(
  host: string,
  signal: AbortSignal
): Effect.Effect<DnsRecords, ToolsTag> {
  return Effect.gen(function* resolveDnsRecordsGen() {
    const normalizedHost = yield* normalizeDnsLookupHostEffect(host);
    return yield* runAbortableResolver(
      signal,
      "DNS lookup aborted",
      (resolver) =>
        Effect.gen(function* resolveDnsRecordsResolverGen() {
          const [a, aaaa, mx, txt, ns] = yield* Effect.all(
            [
              dnsOrEmpty(
                () => resolver.resolve4(normalizedHost),
                [] as string[]
              ),
              dnsOrEmpty(
                () => resolver.resolve6(normalizedHost),
                [] as string[]
              ),
              dnsOrEmpty(
                () => resolver.resolveMx(normalizedHost),
                [] as { exchange: string; priority: number }[]
              ),
              dnsOrEmpty(
                () => resolver.resolveTxt(normalizedHost),
                [] as string[][]
              ),
              dnsOrEmpty(
                () => resolver.resolveNs(normalizedHost),
                [] as string[]
              ),
            ],
            { concurrency: "unbounded" }
          );
          return dnsRecordsSchema.parse({
            host: normalizedHost,
            a,
            aaaa,
            mx,
            txt,
            ns,
          });
        })
    );
  });
}
