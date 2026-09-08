import type { z } from "zod";

import type { CapInterpretOpts, CapInterpretResult } from "@watchdog/cap-sdk";
import { normalizeIdentifierPlatform } from "@watchdog/schemas";
import type { OembedSnapshot } from "@watchdog/tools";

import { interpretIdentifierBatches } from "../../lib/collect/interpret-identifier-batches";
import {
  URL_IDENTIFIER_BATCH_LIMIT,
  urlValuesBatch,
} from "../../lib/collect/query-seed-batches";
import type { mediaOembedInput } from "./input";

type Input = z.infer<typeof mediaOembedInput>;

function handlePlatform(report: OembedSnapshot): string | undefined {
  if (report.vendor) return report.vendor;
  const fromProvider = normalizeIdentifierPlatform(report.providerName ?? "");
  return fromProvider === "" ? undefined : fromProvider;
}

function summarize(report: OembedSnapshot): string {
  const vendor = report.vendor ?? "unknown";
  if (report.error) {
    return `oEmbed ${vendor} ${report.url}: ${report.error}`;
  }
  const bits: string[] = [];
  if (report.title) bits.push(`title=${report.title}`);
  if (report.authorName) bits.push(`author=${report.authorName}`);
  if (report.authorUrl) bits.push(`author_url=${report.authorUrl}`);
  return `oEmbed ${vendor} ${report.url}${bits.length > 0 ? `: ${bits.join("; ")}` : ""}`;
}

/** Pure interpret — handle + URL Identifiers when Entity set. */
export function interpretOembedReport(
  report: OembedSnapshot,
  opts: CapInterpretOpts<Input>
): CapInterpretResult {
  const platform = handlePlatform(report);
  const handleValues =
    platform && report.authorName
      ? [
          report.authorName.startsWith("@")
            ? report.authorName
            : `@${report.authorName}`,
        ]
      : [];
  const urlValues = [report.authorUrl, report.url].filter(
    (v): v is string => v !== null && v !== ""
  );
  return interpretIdentifierBatches({
    entityId: opts.input.entityId,
    batches: [
      {
        type: "handle",
        values: handleValues,
        platform,
      },
      ...urlValuesBatch(urlValues, { limit: URL_IDENTIFIER_BATCH_LIMIT }),
    ],
    claimText: summarize(report),
    noEntitySummary: "Media oEmbed captured; no Entity to attach",
  });
}
