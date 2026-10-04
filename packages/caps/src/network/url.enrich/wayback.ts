import { closestWaybackTimestampEffect as closestWaybackTimestampToolEffect } from "@watchdog/tools";

import { URL_ENRICH_UA } from "./types";

/** Cap wrapper — injects OPSEC UA into tools CDX helper. */
export function closestWaybackTimestampEffect(
  url: string,
  signal: AbortSignal
) {
  return closestWaybackTimestampToolEffect(url, signal, URL_ENRICH_UA);
}
