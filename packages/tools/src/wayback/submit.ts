import { Effect } from "effect";
import type { HttpClient } from "effect/unstable/http";

import { mapToolsCatch } from "../errors/map-tools-tag";
import type { ToolsTag } from "../errors/tagged-errors";
import { watchdogUserAgent } from "../errors/user-agent";
import { fetchBytesEffect } from "../http/fetch-bytes";
import { nowIsoStringEffect } from "../infra/clock";
import { normalizeWaybackUrl } from "./normalize-url";
import {
  archiveSubmitSnapshotSchema,
  type ArchiveSubmitSnapshot,
} from "./submit-schema";

export {
  archiveSubmitSnapshotSchema,
  archiveSubmitResultSchema,
  type ArchiveSubmitSnapshot,
  type ArchiveSubmitResult,
} from "./submit-schema";

/**
 * Push a URL to Wayback Save Page Now.
 * Creates a public archive record — Cap must declare third_party egress.
 */

interface SubmitOptions {
  userAgent?: string;
}
export function submitWaybackSaveEffect(
  url: string,
  signal: AbortSignal,
  options?: SubmitOptions
): Effect.Effect<ArchiveSubmitSnapshot, ToolsTag, HttpClient.HttpClient> {
  return Effect.gen(function* submitWaybackSaveGen() {
    const queriedAt = yield* nowIsoStringEffect;
    const target = yield* Effect.try({
      try: () => normalizeWaybackUrl(url),
      catch: mapToolsCatch,
    });
    const saveUrl = `https://web.archive.org/save/${target}`;
    const ua = options?.userAgent ?? watchdogUserAgent("archive.url.submit");

    let status: number | null = null;
    let archiveUrl: string | null = null;
    let detail: string | null = null;
    let accepted = false;

    const result = yield* fetchBytesEffect(saveUrl, signal, {
      userAgent: ua,
      maxBytes: 512_000,
      accept: "*/*",
    });

    if (result.status === 0) {
      accepted = false;
      detail = result.error ?? "fetch failed";
    } else {
      status = result.status;
      archiveUrl = result.finalUrl.includes("web.archive.org/web/")
        ? result.finalUrl
        : `https://web.archive.org/web/*/${encodeURI(target)}`;
      accepted = result.status < 500;
      detail = `HTTP ${result.status}`;
    }

    return archiveSubmitSnapshotSchema.parse({
      url: target,
      queriedAt,
      results: [
        {
          service: "wayback",
          accepted,
          archiveUrl,
          detail,
          status,
        },
      ],
    });
  });
}
