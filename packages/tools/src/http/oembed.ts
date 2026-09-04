import { Effect } from "effect";
import type { HttpClient } from "effect/unstable/http";
import { z } from "zod";

import type { ToolsTag } from "../errors/tagged-errors";
import { fetchBytesEffect } from "./fetch-bytes";

export const OEMBED_VENDORS = [
  "youtube",
  "vimeo",
  "flickr",
  "soundcloud",
  "tiktok",
  "spotify",
] as const;

export type OembedVendor = (typeof OEMBED_VENDORS)[number];

export const oembedSnapshotSchema = z.object({
  url: z.string().min(1),
  queriedAt: z.string().min(1),
  vendor: z.enum(OEMBED_VENDORS).nullable(),
  title: z.string().nullable(),
  authorName: z.string().nullable(),
  authorUrl: z.string().nullable(),
  providerName: z.string().nullable(),
  thumbnailUrl: z.string().nullable(),
  type: z.string().nullable(),
  error: z.string().optional(),
});

export type OembedSnapshot = z.infer<typeof oembedSnapshotSchema>;

const HOST_SUFFIX: Record<OembedVendor, readonly string[]> = {
  youtube: ["youtube.com", "youtu.be", "youtube-nocookie.com"],
  vimeo: ["vimeo.com"],
  flickr: ["flickr.com", "flic.kr"],
  soundcloud: ["soundcloud.com"],
  tiktok: ["tiktok.com"],
  spotify: ["spotify.com"],
};

const OEMBED_ENDPOINTS: Record<OembedVendor, string> = {
  youtube: "https://www.youtube.com/oembed?format=json&url=",
  vimeo: "https://vimeo.com/api/oembed.json?url=",
  flickr: "https://www.flickr.com/services/oembed?format=json&url=",
  soundcloud: "https://soundcloud.com/oembed?format=json&url=",
  tiktok: "https://www.tiktok.com/oembed?url=",
  spotify: "https://open.spotify.com/oembed?url=",
};

const oembedJsonSchema = z.object({
  title: z.string().optional(),
  author_name: z.string().optional(),
  author_url: z.string().optional(),
  provider_name: z.string().optional(),
  thumbnail_url: z.string().optional(),
  type: z.string().optional(),
});

function hostMatches(hostname: string, suffix: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  return host === suffix || host.endsWith(`.${suffix}`);
}

export function matchOembedVendor(url: string): OembedVendor | null {
  try {
    const host = new URL(url).hostname;
    for (const vendor of OEMBED_VENDORS) {
      if (HOST_SUFFIX[vendor].some((suffix) => hostMatches(host, suffix))) {
        return vendor;
      }
    }
  } catch {
    return null;
  }
  return null;
}

export function isOembedUrl(url: string): boolean {
  return matchOembedVendor(url) !== null;
}

function oembedEndpoint(vendor: OembedVendor, url: string): string {
  return `${OEMBED_ENDPOINTS[vendor]}${encodeURIComponent(url)}`;
}

function emptySnap(
  url: string,
  queriedAt: string,
  error: string,
  vendor: OembedVendor | null = null
): OembedSnapshot {
  return {
    url,
    queriedAt,
    vendor,
    title: null,
    authorName: null,
    authorUrl: null,
    providerName: null,
    thumbnailUrl: null,
    type: null,
    error,
  };
}

function snapshotFromJson(
  url: string,
  queriedAt: string,
  vendor: OembedVendor,
  data: z.infer<typeof oembedJsonSchema>
): OembedSnapshot {
  return {
    url,
    queriedAt,
    vendor,
    title: data.title ?? null,
    authorName: data.author_name ?? null,
    authorUrl: data.author_url ?? null,
    providerName: data.provider_name ?? null,
    thumbnailUrl: data.thumbnail_url ?? null,
    type: data.type ?? null,
  };
}

const MAX_OEMBED_BYTES = 64_000;

interface OembedOptions {
  userAgent: string;
}

export function fetchOembedEffect(
  url: string,
  signal: AbortSignal,
  options: OembedOptions
): Effect.Effect<OembedSnapshot, ToolsTag, HttpClient.HttpClient> {
  return Effect.gen(function* fetchOembedGen() {
    const queriedAt = new Date().toISOString();
    const vendor = matchOembedVendor(url);
    if (vendor === null) {
      return emptySnap(url, queriedAt, "Unsupported oEmbed host");
    }

    const endpoint = oembedEndpoint(vendor, url);
    const res = yield* fetchBytesEffect(endpoint, signal, {
      userAgent: options.userAgent,
      maxBytes: MAX_OEMBED_BYTES,
      accept: "application/json",
    });
    if (!res.ok) {
      return emptySnap(
        url,
        queriedAt,
        res.error ?? `HTTP ${res.status}`,
        vendor
      );
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(new TextDecoder().decode(res.bytes));
    } catch {
      return emptySnap(url, queriedAt, "Invalid oEmbed JSON", vendor);
    }

    const json = oembedJsonSchema.safeParse(parsed);
    if (!json.success) {
      return emptySnap(url, queriedAt, "Unexpected oEmbed JSON shape", vendor);
    }

    return snapshotFromJson(url, queriedAt, vendor, json.data);
  });
}
