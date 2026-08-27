import {
  closestWaybackTimestamp as closestWaybackTimestampTool,
  waybackArchiveUrl,
} from "@watchdog/tools";

import { URL_ENRICH_UA } from "./types";

export { waybackArchiveUrl };

/** Cap wrapper — injects OPSEC UA into tools CDX helper. */
export async function closestWaybackTimestamp(
  url: string,
  signal: AbortSignal
): Promise<string | null> {
  return await closestWaybackTimestampTool(url, signal, URL_ENRICH_UA);
}
