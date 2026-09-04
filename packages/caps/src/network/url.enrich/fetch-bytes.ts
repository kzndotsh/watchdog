import { fetchBytesEffect as fetchBytesToolEffect } from "@watchdog/tools";

import {
  ACCEPT_MARKDOWN_FIRST,
  URL_ENRICH_MAX_BYTES,
  URL_ENRICH_UA,
} from "./types";

/** Cap wrapper — injects OPSEC UA / limits / Accept into tools.fetchBytes. */
export function fetchBytesEffect(
  url: string,
  signal: AbortSignal,
  accept: string = ACCEPT_MARKDOWN_FIRST
) {
  return fetchBytesToolEffect(url, signal, {
    userAgent: URL_ENRICH_UA,
    maxBytes: URL_ENRICH_MAX_BYTES,
    accept,
  });
}
