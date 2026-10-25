import { Clock, Effect } from "effect";
import type { HttpClient } from "effect/http";

import type { ToolsTag } from "@watchdog/tools/errors";
import { DEFAULT_OUTBOUND_LIMITS } from "@watchdog/tools/http";
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
/** The outbound client's per-call deadline: how long one fetch can take. */
const FETCH_TIMEOUT_MS = DEFAULT_OUTBOUND_LIMITS.timeoutMs;
/** Left after the last fetch for its artifact upload, the summary and the report. */
const UPLOAD_RESERVE_MS = 15_000;
/** Per capture; a larger body is cut here and marked `bodyTruncated`. */
const VERSION_MAX_BYTES = 1_048_576;

type Upload = (input: {
  bytes: Uint8Array;
  mime: string;
  name?: string;
}) => Effect.Effect<CapArtifact, ToolsTag>;

/**
 * The window fetches may start in: from the start of the whole run (the CDX calls come first)
 * to the Job's `timeoutMs` less one fetch's timeout and the upload reserve, so the last fetch
 * and the report still end inside the Job.
 */
export type FetchBudget = {
  startedAt: number;
  timeoutMs: number;
  fetchTimeoutMs?: number;
  reserveMs?: number;
};

function mayStartFetch(now: number, budget: FetchBudget): boolean {
  const fetchMs = budget.fetchTimeoutMs ?? FETCH_TIMEOUT_MS;
  const reserveMs = budget.reserveMs ?? UPLOAD_RESERVE_MS;
  return now + fetchMs + reserveMs <= budget.startedAt + budget.timeoutMs;
}

export type CollectVersionsParams = {
  url: string;
  rows: readonly WaybackCdxRow[];
  signal: AbortSignal;
  userAgent: string;
  upload: Upload;
  log: (message: string) => void;
  budget: FetchBudget;
  delayMs?: number;
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
 * Fetch each listed version in time order and store its raw bytes as the artifact, untouched.
 * A version is dropped when its comparison copy (decoded, Wayback furniture stripped) matches an
 * earlier one's (CDX digests can differ while the page agrees); the rest are stored as artifacts and describe each change against the version before. A failed fetch is recorded
 * and the run goes on; after a 429 the remaining fetches are skipped rather than hammered.
 */
export function collectVersions(
  params: CollectVersionsParams
): Effect.Effect<CollectedVersions, ToolsTag, HttpClient.HttpClient> {
  const delayMs = params.delayMs ?? FETCH_DELAY_MS;
  return Effect.gen(function* collectVersionsGen() {
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
      if (!first && delayMs > 0) yield* Effect.sleep(delayMs);
      first = false;
      const now = yield* Clock.currentTimeMillis;
      if (!mayStartFetch(now, params.budget)) {
        out.failed.push({
          timestamp,
          reason: "skipped_time_budget",
          status: null,
        });
        continue;
      }

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
      const stored = result.bytes;
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

      const text = pageTextOf(stored, result.contentType);
      const mime =
        result.contentType ?? row.mimetype ?? "application/octet-stream";
      const artifactName = `page-${timestamp}.${extensionFor(mime)}`;
      out.artifacts.push(
        yield* params.upload({
          bytes: stored,
          mime,
          name: artifactName,
        })
      );
      out.versions.push({
        timestamp,
        original: row.original,
        archiveUrl: capture.archiveUrl,
        digest: row.digest ?? null,
        rawSha256: prepared.rawSha256,
        contentHash: prepared.contentHash,
        mimetype: row.mimetype ?? result.contentType,
        byteLength: stored.byteLength,
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
