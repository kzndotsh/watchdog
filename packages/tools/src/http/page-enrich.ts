import { Effect } from "effect";
import type { HttpClient } from "effect/unstable/http";
import { z } from "zod";

import type { ToolsTag } from "../errors/tagged-errors";
import { extractTitle } from "../html/to-text";
import { fetchBytesEffect } from "./fetch-bytes";

export const pageEnrichSnapshotSchema = z.object({
  url: z.string().min(1),
  finalUrl: z.string(),
  queriedAt: z.string().min(1),
  status: z.number(),
  ok: z.boolean(),
  title: z.string().nullable(),
  meta: z.object({
    description: z.string().nullable(),
    ogTitle: z.string().nullable(),
    ogDescription: z.string().nullable(),
    ogImage: z.string().nullable(),
    twitterCard: z.string().nullable(),
    canonical: z.string().nullable(),
  }),
  trackers: z.array(
    z.object({
      vendor: z.string(),
      evidence: z.string(),
    })
  ),
  error: z.string().optional(),
});

export type PageEnrichSnapshot = z.infer<typeof pageEnrichSnapshotSchema>;

function metaContent(html: string, propertyOrName: string): string | null {
  const re = new RegExp(
    `<meta[^>]*(?:property|name)=["']${propertyOrName}["'][^>]*content=["']([^"']*)["']`,
    "i"
  );
  const alt = new RegExp(
    `<meta[^>]*content=["']([^"']*)["'][^>]*(?:property|name)=["']${propertyOrName}["']`,
    "i"
  );
  return html.match(re)?.[1] ?? html.match(alt)?.[1] ?? null;
}

function linkHref(html: string, rel: string): string | null {
  const re = new RegExp(
    `<link[^>]*rel=["'][^"']*${rel}[^"']*["'][^>]*href=["']([^"']+)["']`,
    "i"
  );
  const alt = new RegExp(
    `<link[^>]*href=["']([^"']+)["'][^>]*rel=["'][^"']*${rel}[^"']*["']`,
    "i"
  );
  return html.match(re)?.[1] ?? html.match(alt)?.[1] ?? null;
}

const TRACKER_PATTERNS: { vendor: string; re: RegExp }[] = [
  {
    vendor: "google-analytics",
    re: /www\.google-analytics\.com|gtag\/js|G-[A-Z0-9]+|UA-\d+-\d+/i,
  },
  {
    vendor: "google-tag-manager",
    re: /googletagmanager\.com\/gtm\.js|GTM-[A-Z0-9]+/i,
  },
  { vendor: "facebook-pixel", re: /connect\.facebook\.net|fbq\s*\(/i },
  { vendor: "hotjar", re: /static\.hotjar\.com|hjid/i },
  { vendor: "segment", re: /cdn\.segment\.com/i },
  { vendor: "mixpanel", re: /cdn\.mxpnl\.com|mixpanel/i },
];

/** Live HTML → title/meta + tracker hints. */

interface PageEnrichOptions {
  userAgent: string;
  maxBytes?: number;
}
export function fetchPageEnrichEffect(
  url: string,
  signal: AbortSignal,
  options: PageEnrichOptions
): Effect.Effect<PageEnrichSnapshot, ToolsTag, HttpClient.HttpClient> {
  return Effect.gen(function* fetchPageEnrichGen() {
    const res = yield* fetchBytesEffect(url, signal, {
      userAgent: options.userAgent,
      maxBytes: options.maxBytes ?? 512_000,
      accept: "text/html,application/xhtml+xml,*/*",
    });
    if (!res.ok) {
      return pageEnrichSnapshotSchema.parse({
        url,
        finalUrl: res.finalUrl,
        queriedAt: new Date().toISOString(),
        status: res.status,
        ok: false,
        title: null,
        meta: {
          description: null,
          ogTitle: null,
          ogDescription: null,
          ogImage: null,
          twitterCard: null,
          canonical: null,
        },
        trackers: [],
        error: res.error ?? `HTTP ${res.status}`,
      });
    }

    const html = new TextDecoder().decode(res.bytes);
    const trackers = TRACKER_PATTERNS.filter((t) => t.re.test(html)).map(
      (t) => ({
        vendor: t.vendor,
        evidence: t.re.source.slice(0, 80),
      })
    );

    return pageEnrichSnapshotSchema.parse({
      url,
      finalUrl: res.finalUrl,
      queriedAt: new Date().toISOString(),
      status: res.status,
      ok: true,
      title: extractTitle(html) ?? null,
      meta: {
        description: metaContent(html, "description"),
        ogTitle: metaContent(html, "og:title"),
        ogDescription: metaContent(html, "og:description"),
        ogImage: metaContent(html, "og:image"),
        twitterCard: metaContent(html, "twitter:card"),
        canonical: linkHref(html, "canonical"),
      },
      trackers,
    });
  });
}
