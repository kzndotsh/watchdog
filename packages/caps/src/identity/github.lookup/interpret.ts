import type { z } from "zod";

import type { CapInterpretOpts, CapInterpretResult } from "@watchdog/cap-sdk";

import { interpretIdentifierBatches } from "../../lib/collect/interpret-identifier-batches";
import {
  URL_IDENTIFIER_BATCH_LIMIT,
  urlValuesBatch,
} from "../../lib/collect/query-seed-batches";
import type { githubLookupInput } from "./input";
import type { GithubUserSnapshot } from "./report-schema";

type GithubInput = z.infer<typeof githubLookupInput>;

function summarize(report: GithubUserSnapshot): string {
  if (!report.found) return `GitHub @${report.handle}: not found`;
  const bits: string[] = [`url=${report.url ?? "?"}`];
  if (report.name) bits.push(`name=${report.name}`);
  if (report.blog) bits.push(`blog=${report.blog}`);
  if (report.company) bits.push(`company=${report.company}`);
  if (report.location) bits.push(`loc=${report.location}`);
  if (report.publicRepos !== null) bits.push(`repos=${report.publicRepos}`);
  return `GitHub @${report.handle}: ${bits.join("; ")}`;
}

/** Pure interpret — report is GithubUserSnapshot JSON from run. */
export function interpretGithubLookupReport(
  report: GithubUserSnapshot,
  opts: CapInterpretOpts<GithubInput>
): CapInterpretResult {
  return interpretIdentifierBatches({
    entityId: opts.input.entityId,
    batches: [
      {
        type: "handle",
        values: [report.handle],
        platform: "github",
      },
      ...urlValuesBatch(
        report.found
          ? [report.url, report.blog].filter(
              (value): value is string =>
                value !== null && value !== undefined && value !== ""
            )
          : [],
        { limit: URL_IDENTIFIER_BATCH_LIMIT }
      ),
    ],
    claimText: summarize(report),
    noEntitySummary: "GitHub lookup completed; no Entity to attach",
  });
}
