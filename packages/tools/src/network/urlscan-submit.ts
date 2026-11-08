import { z } from "zod";

import { defineJsonProvider } from "../http/define-json-provider";
import { normalizeHttpUrl } from "../http/normalize-http-url";
import { assertAllowedTarget } from "../http/outbound-policy";

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

type UrlscanSubmitOptions = {
  userAgent: string;
  visibility: UrlscanSubmitVisibility;
};

const submitUrlscan = defineJsonProvider({
  service: "URLScan",
  schema: urlscanSubmitSnapshotSchema,
  key: { header: "API-Key" },
  normalize: (raw) => {
    const normalized = normalizeHttpUrl(raw);
    assertAllowedTarget(new URL(normalized));
    return normalized;
  },
  request: (target, { visibility }: UrlscanSubmitOptions) => ({
    url: "https://urlscan.io/api/v1/scan/",
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: target, visibility }),
  }),
  toSnapshot: ({ subject: target, queriedAt, body, options }) => {
    const uuid =
      typeof body.uuid === "string" && body.uuid !== "" ? body.uuid : null;
    return {
      url: target,
      visibility: options.visibility,
      queriedAt,
      source: "urlscan.io" as const,
      uuid,
      resultUrl: typeof body.result === "string" ? body.result : null,
      apiUrl: typeof body.api === "string" ? body.api : null,
      message: typeof body.message === "string" ? body.message : null,
      accepted: uuid !== null,
    };
  },
});

/**
 * Submit a URL for a live urlscan.io browser scan.
 * POST https://urlscan.io/api/v1/scan/
 * @see https://urlscan.io/docs/api/
 */
export function submitUrlscanEffect(
  url: string,
  key: string,
  visibility: UrlscanSubmitVisibility,
  signal: AbortSignal,
  options: { userAgent: string }
) {
  return submitUrlscan(url, key, signal, { ...options, visibility });
}
