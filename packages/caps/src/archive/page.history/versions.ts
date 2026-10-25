import { Clock, Effect } from "effect";
import type { HttpClient } from "effect/http";

import type { ToolsTag } from "@watchdog/tools/errors";
import {
  fetchWaybackCaptureEffect,
  pageTextOf,
  prepareCapture,
  summarizeChange,
  type PageText,
  type WaybackCdxRow,
  type WaybackFailedVersion,
  type WaybackVersion,
} from "@watchdog/tools/wayback";

import type { CapArtifact } from "../../sdk";

/** Wayback is rate limited and shared: one fetch at a time with a pause between them. */
const FETCH_DELAY_MS = 500;
/** No new fetch starts after this long into the run, so the last one ends inside the Job. */
const FETCH_START_BUDGET_MS = 240_000;
/** Per capture; a larger body is cut here and marked `bodyTruncated`. */
const VERSION_MAX_BYTES = 1_048_576;

type Upload = (input: {
  bytes: Uint8Array;
  mime: string;
  name?: string;
}) => Effect.Effect<CapArtifact, ToolsTag>;

export type CollectVersionsParams = {
  url: string;
  rows: readonly WaybackCdxRow[];
  signal: AbortSignal;
  userAgent: string;
  upload: Upload;
  log: (message: string) => void;
  delayMs?: number;
  startBudgetMs?: number;
};

export type CollectedVersions = {
  versions: WaybackVersion[];
  duplicates: {
    timestamp: string;
    digest: string | null;
    duplicateOf: string;
  }[];
  failed: WaybackFailedVersion[];
  artifacts: CapArtifact[];
};

const EXTENSIONS: readonly [string, string][] = [
  ["html", "html"],
  ["json", "json"],
  ["pdf", "pdf"],
  ["png", "png"],
  ["jpeg", "jpg"],
  ["gif", "gif"],
  ["text/plain", "txt"],
  ["xml", "xml"],
];

function extensionFor(mime: string): string {
  const lower = mime.toLowerCase();
  return EXTENSIONS.find(([needle]) => lower.includes(needle))?.[1] ?? "bin";
}

function failureReason(status: number): WaybackFailedVersion["reason"] {
  if (status === 429) return "rate_limited";
  if (status === 0) return "fetch_failed";
  return "http_error";
}

/**
 * Fetch each listed version in time order, strip it, drop one whose stored content matches an
 * earlier version (CDX digests can differ while the stripped bytes agree), store the rest as
 * artifacts and describe each change against the version before. A failed fetch is recorded
 * and the run goes on; after a 429 the remaining fetches are skipped rather than hammered.
 */
export function collectVersions(
  params: CollectVersionsParams
): Effect.Effect<CollectedVersions, ToolsTag, HttpClient.HttpClient> {
  const delayMs = params.delayMs ?? FETCH_DELAY_MS;
  const budgetMs = params.startBudgetMs ?? FETCH_START_BUDGET_MS;
  return Effect.gen(function* collectVersionsGen() {
    const startedAt = yield* Clock.currentTimeMillis;
    const out: CollectedVersions = {
      versions: [],
      duplicates: [],
      failed: [],
      artifacts: [],
    };
    const seen = new Map<string, string>();
    let previous: PageText | null = null;
    let limited = false;
    let first = true;

    for (const row of params.rows) {
      const { timestamp } = row;
      if (limited) {
        out.failed.push({
          timestamp,
          reason: "skipped_rate_limited",
          status: null,
        });
        continue;
      }
      const now = yield* Clock.currentTimeMillis;
      if (now - startedAt > budgetMs) {
        out.failed.push({
          timestamp,
          reason: "skipped_time_budget",
          status: null,
        });
        continue;
      }
      if (!first && delayMs > 0) yield* Effect.sleep(delayMs);
      first = false;

      params.log(`fetching capture ${timestamp}`);
      const capture = yield* fetchWaybackCaptureEffect(
        params.url,
        timestamp,
        params.signal,
        { userAgent: params.userAgent, maxBytes: VERSION_MAX_BYTES }
      ).pipe(Effect.catch(() => Effect.succeed(null)));
      if (capture === null || !capture.result.ok) {
        const status = capture?.result.status ?? 0;
        const reason = failureReason(status);
        if (reason === "rate_limited") limited = true;
        out.failed.push({
          timestamp,
          reason,
          status: status === 0 ? null : status,
        });
        continue;
      }

      const { result } = capture;
      const prepared = prepareCapture(result.bytes, result.contentType);
      const earlier = seen.get(prepared.contentHash);
      if (earlier !== undefined) {
        out.duplicates.push({
          timestamp,
          digest: row.digest ?? null,
          duplicateOf: earlier,
        });
        continue;
      }
      seen.set(prepared.contentHash, timestamp);

      const text = pageTextOf(prepared.bytes, result.contentType);
      const mime =
        result.contentType ?? row.mimetype ?? "application/octet-stream";
      const artifactName = `page-${timestamp}.${extensionFor(mime)}`;
      out.artifacts.push(
        yield* params.upload({
          bytes: prepared.bytes,
          mime,
          name: artifactName,
        })
      );
      out.versions.push({
        timestamp,
        original: row.original,
        archiveUrl: capture.archiveUrl,
        digest: row.digest ?? null,
        contentHash: prepared.contentHash,
        mimetype: row.mimetype ?? result.contentType,
        byteLength: prepared.bytes.byteLength,
        bodyTruncated: capture.truncated,
        title: text?.title ?? null,
        textLength: text === null ? null : text.text.length,
        artifactName,
        change:
          previous === null && out.versions.length === 0
            ? null
            : summarizeChange(previous, text),
      });
      previous = text;
    }
    return out;
  });
}
