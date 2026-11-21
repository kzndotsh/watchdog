import { ResponseHeadersPlugin } from "@orpc/server/plugins";

import type { ApiContext } from "./context";

/**
 * The oRPC handler plugins the API needs beside the web app's own (coercion, reference docs):
 * `ResponseHeadersPlugin` gives procedures `context.resHeaders`, which is how a refused Job start
 * sends `Retry-After`. The web handler and the tests that read response headers share this list.
 */
export function responsePlugins() {
  return [new ResponseHeadersPlugin<ApiContext>()];
}
