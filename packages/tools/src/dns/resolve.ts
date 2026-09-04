import { Effect } from "effect";

import type { ToolsTag } from "../errors/tagged-errors";
import { dnsOrEmpty, runAbortableResolver } from "./abortable-resolver";
import type { DnsRecords } from "./schema";

export type { DnsRecords };

/** Resolve A/AAAA/MX/TXT/NS; cancels the Node resolver on abort. */
export function resolveDnsRecordsEffect(
  host: string,
  signal: AbortSignal
): Effect.Effect<DnsRecords, ToolsTag> {
  return runAbortableResolver(signal, "DNS lookup aborted", (resolver) =>
    Effect.gen(function* resolveDnsRecordsGen() {
      const [a, aaaa, mx, txt, ns] = yield* Effect.all(
        [
          dnsOrEmpty(() => resolver.resolve4(host), [] as string[]),
          dnsOrEmpty(() => resolver.resolve6(host), [] as string[]),
          dnsOrEmpty(
            () => resolver.resolveMx(host),
            [] as { exchange: string; priority: number }[]
          ),
          dnsOrEmpty(() => resolver.resolveTxt(host), [] as string[][]),
          dnsOrEmpty(() => resolver.resolveNs(host), [] as string[]),
        ],
        { concurrency: "unbounded" }
      );
      return { host, a, aaaa, mx, txt, ns };
    })
  );
}
