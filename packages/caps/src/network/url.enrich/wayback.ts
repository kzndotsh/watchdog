import {
  closestWaybackTimestampEffect as closestWaybackTimestampToolEffect,
  waybackArchiveUrl,
} from "@watchdog/tools";

import { URL_ENRICH_UA } from "./types";

export { waybackArchiveUrl };

/** Cap wrapper — injects OPSEC UA into tools CDX helper. */
export function closestWaybackTimestampEffect(
  url: string,
  signal: AbortSignal
) {
  return closestWaybackTimestampToolEffect(url, signal, URL_ENRICH_UA);
}
