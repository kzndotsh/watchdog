import { Effect } from "effect";
import type { HttpClient } from "effect/unstable/http";
import { z } from "zod";

import { MissingCredentialError, type ToolsTag } from "../errors/tagged-errors";
import { watchdogUserAgent } from "../errors/user-agent";
import { fetchJsonObjectEffect } from "../http/fetch-json";

export const urlscanSubmitVisibilitySchema = z.enum([
  "public",
  "unlisted",
  "private",
]);

export const urlscanSubmitSnapshotSchema = z.object({
  url: z.string().min(1),
  visibility: urlscanSubmitVisibilitySchema,
  queriedAt: z.string().min(1),
  source: z.literal("urlscan.io"),
  uuid: z.string().nullable(),
  resultUrl: z.string().nullable(),
  apiUrl: z.string().nullable(),
  message: z.string().nullable(),
  accepted: z.boolean(),
});

export type UrlscanSubmitVisibility = z.infer<
  typeof urlscanSubmitVisibilitySchema
>;
export type UrlscanSubmitSnapshot = z.infer<typeof urlscanSubmitSnapshotSchema>;

/**
 * Submit a URL for a live urlscan.io browser scan.
 * POST https://urlscan.io/api/v1/scan/
 * @see https://urlscan.io/docs/api/
 */
export function submitUrlscanEffect(
  url: string,
  apiKey: string,
  visibility: UrlscanSubmitVisibility,
  signal: AbortSignal,
  options?: { userAgent?: string }
): Effect.Effect<UrlscanSubmitSnapshot, ToolsTag, HttpClient.HttpClient> {
  return Effect.gen(function* submitUrlscanGen() {
    const key = apiKey.trim();
    if (!key) {
      return yield* new MissingCredentialError({ slot: "URLSCAN_API_KEY" });
    }
    const target = url.trim();
    const ua =
      options?.userAgent ?? watchdogUserAgent("network.urlscan.submit");

    const { body } = yield* fetchJsonObjectEffect({
      url: "https://urlscan.io/api/v1/scan/",
      signal,
      service: "URLScan",
      subject: target,
      init: {
        method: "POST",
        headers: {
          "API-Key": key,
          "Content-Type": "application/json",
          "User-Agent": ua,
        },
        body: JSON.stringify({ url: target, visibility }),
      },
    });
    const uuid =
      typeof body.uuid === "string" && body.uuid !== "" ? body.uuid : null;

    return urlscanSubmitSnapshotSchema.parse({
      url: target,
      visibility,
      queriedAt: new Date().toISOString(),
      source: "urlscan.io",
      uuid,
      resultUrl: typeof body.result === "string" ? body.result : null,
      apiUrl: typeof body.api === "string" ? body.api : null,
      message: typeof body.message === "string" ? body.message : null,
      accepted: uuid !== null,
    });
  });
}
