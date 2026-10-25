import { Effect } from "effect";
import type { z } from "zod";

import {
  RateLimitedError,
  ValidationVendorError,
  watchdogUserAgent,
} from "@watchdog/tools/errors";
import {
  fetchWaybackLookupEffect,
  waybackHistorySnapshotSchema,
  type WaybackHistorySnapshot,
} from "@watchdog/tools/wayback";

import { uploadJsonReportPair } from "../../lib/collect/upload-json-report-pair";
import type { CapContext, CapRun } from "../../sdk";
import { PAGE_HISTORY_DEFAULT_VERSIONS, type pageHistoryInput } from "./input";
import { collectVersions, type CollectVersionsParams } from "./versions";

export const PAGE_HISTORY_CAP_ID = "archive.page.history";
const PAGE_HISTORY_SUMMARY_ARTIFACT = "page-history.json";

type Input = z.infer<typeof pageHistoryInput>;

/** Test seam: the pacing a run uses. A Job takes the defaults. */
export type PageHistoryPacing = Pick<
  CollectVersionsParams,
  "delayMs" | "startBudgetMs"
>;

function noneFetched(
  snapshot: WaybackHistorySnapshot
): RateLimitedError | ValidationVendorError {
  if (snapshot.failed.some((f) => f.reason === "rate_limited")) {
    return new RateLimitedError({
      service: "Wayback",
      subject: "capture fetch",
    });
  }
  const reasons = [...new Set(snapshot.failed.map((f) => f.reason))].join(",");
  return new ValidationVendorError({
    message: "No Wayback capture could be fetched",
    cause: `failed=${snapshot.failed.length} reasons=${reasons}`,
  });
}

export function runPageHistory(
  ctx: CapContext<Input>,
  pacing: PageHistoryPacing = {}
): CapRun {
  return Effect.gen(function* pageHistoryRun() {
    const userAgent = watchdogUserAgent(PAGE_HISTORY_CAP_ID);
    const maxVersions = ctx.input.maxVersions ?? PAGE_HISTORY_DEFAULT_VERSIONS;
    ctx.log(`Wayback page history ${ctx.input.url} (max ${maxVersions})`);

    // One row past the limit tells us whether more distinct versions exist.
    const lookup = yield* fetchWaybackLookupEffect(ctx.input.url, ctx.signal, {
      userAgent,
      limit: maxVersions + 1,
      distinctOnly: true,
      statusFilter: "ok",
      ...(ctx.input.after === undefined ? {} : { after: ctx.input.after }),
      ...(ctx.input.before === undefined ? {} : { before: ctx.input.before }),
    });
    const listed = lookup.rows.slice(0, maxVersions);
    const collected = yield* collectVersions({
      url: lookup.url,
      rows: listed,
      signal: ctx.signal,
      userAgent,
      upload: ctx.uploadArtifact,
      log: ctx.log,
      ...pacing,
    });

    const snapshot = waybackHistorySnapshotSchema.parse({
      url: lookup.url,
      queriedAt: lookup.queriedAt,
      source: "web.archive.org",
      after: ctx.input.after ?? null,
      before: ctx.input.before ?? null,
      maxVersions,
      versionsListed: listed.length,
      totalCaptures: lookup.totalCaptures,
      versions: collected.versions,
      duplicates: collected.duplicates,
      failed: collected.failed,
      isTruncated: lookup.rows.length > maxVersions,
    });
    // A duplicate needs an earlier stored version, so none stored means every fetch failed.
    if (listed.length > 0 && snapshot.versions.length === 0) {
      return yield* noneFetched(snapshot);
    }

    const { report, artifact } = yield* uploadJsonReportPair(
      ctx.uploadArtifact,
      snapshot,
      PAGE_HISTORY_SUMMARY_ARTIFACT
    );
    ctx.log(
      `versions=${snapshot.versions.length} duplicates=${snapshot.duplicates.length} failed=${snapshot.failed.length}`
    );
    return { artifacts: [report, artifact, ...collected.artifacts] };
  });
}
