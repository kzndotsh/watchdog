import { Effect } from "effect";
import type { HttpClient } from "effect/http";

import { mapToolsCatch } from "../errors/map-tools-catch";
import type { ToolsTag } from "../errors/tagged-errors";
import { fetchBytesEffect, type FetchBytesResult } from "../http/fetch-bytes";
import { nowIsoStringEffect } from "../infra/clock";
import { normalizeWaybackUrl } from "./normalize-url";
import {
  waybackFetchSnapshotSchema,
  type WaybackFetchSnapshot,
} from "./schema";

const DEFAULT_MAX_BYTES = 512_000;

/** The raw capture: Wayback's `id_` mode returns the original bytes, no toolbar or rewriting. */
export function waybackArchiveUrl(timestamp: string, url: string): string {
  return `https://web.archive.org/web/${timestamp}id_/${url}`;
}

type CaptureOptions = {
  userAgent: string;
  maxBytes?: number;
};

export type WaybackCapture = {
  url: string;
  timestamp: string;
  archiveUrl: string;
  result: FetchBytesResult;
  /** The body reached `maxBytes`, so it may have been cut. */
  truncated: boolean;
};

/** One raw capture with its bytes. A failed fetch is a result with `ok: false`, not an error. */
export function fetchWaybackCaptureEffect(
  url: string,
  timestamp: string,
  signal: AbortSignal,
  options: CaptureOptions
): Effect.Effect<WaybackCapture, ToolsTag, HttpClient.HttpClient> {
  return Effect.gen(function* fetchWaybackCaptureGen() {
    const normalizedUrl = yield* Effect.try({
      try: () => normalizeWaybackUrl(url),
      catch: mapToolsCatch,
    });
    const archiveUrl = waybackArchiveUrl(timestamp, normalizedUrl);
    const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
    const result = yield* fetchBytesEffect(archiveUrl, signal, {
      userAgent: options.userAgent,
      maxBytes,
      accept: "text/html,text/plain,*/*",
    });
    return {
      url: normalizedUrl,
      timestamp,
      archiveUrl,
      result,
      truncated: result.bytes.byteLength >= maxBytes,
    };
  });
}

/** Fetch a Wayback raw snapshot body (id_ URL). */
export function fetchWaybackSnapshotEffect(
  url: string,
  timestamp: string,
  signal: AbortSignal,
  options: CaptureOptions
): Effect.Effect<WaybackFetchSnapshot, ToolsTag, HttpClient.HttpClient> {
  return Effect.gen(function* fetchWaybackSnapshotGen() {
    const queriedAt = yield* nowIsoStringEffect;
    const capture = yield* fetchWaybackCaptureEffect(
      url,
      timestamp,
      signal,
      options
    );
    const { result: res } = capture;
    const bodyPreview = new TextDecoder().decode(res.bytes).slice(0, 8000);
    return waybackFetchSnapshotSchema.parse({
      url: capture.url,
      timestamp,
      archiveUrl: capture.archiveUrl,
      queriedAt,
      status: res.status,
      ok: res.ok,
      contentType: res.contentType,
      bodyPreview,
      byteLength: res.bytes.byteLength,
      ...(res.ok ? {} : { error: res.error ?? `HTTP ${res.status}` }),
    });
  });
}
