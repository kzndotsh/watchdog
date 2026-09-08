import type { z } from "zod";

import type { CapInterpretOpts, CapInterpretResult } from "@watchdog/cap-sdk";
import type { WaybackFetchSnapshot } from "@watchdog/tools";

import { interpretIdentifierBatches } from "../../lib/collect/interpret-identifier-batches";
import { urlSeedBatch } from "../../lib/collect/query-seed-batches";
import type { waybackFetchInput } from "./input";

type Input = z.infer<typeof waybackFetchInput>;

export function interpretWaybackFetchReport(
  report: WaybackFetchSnapshot,
  opts: CapInterpretOpts<Input>
): CapInterpretResult {
  const text = `Wayback fetch ${report.timestamp} for ${report.url}: status=${report.status} bytes=${report.byteLength}`;
  return interpretIdentifierBatches({
    entityId: opts.input.entityId,
    batches: [...urlSeedBatch(report.url)],
    claimText: text,
    noEntitySummary:
      "Wayback snapshot captured; no Entity to attach Identifiers",
  });
}
