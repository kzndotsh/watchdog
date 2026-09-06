import { createWatchdogClient, type WatchdogClient } from "@watchdog/client";

import { loadCliEnv } from "./env";

export { emit, emitList, emitOk, fail, truncText, wrapCommandTree } from "./io";

export function getConfig() {
  const env = loadCliEnv();
  return { apiUrl: env.WD_API_URL, apiKey: env.WD_API_KEY };
}

/** Shared typed OpenAPI client for this CLI process. */
export function api(): WatchdogClient {
  const { apiUrl, apiKey } = getConfig();
  return createWatchdogClient({ baseUrl: apiUrl, apiKey });
}
