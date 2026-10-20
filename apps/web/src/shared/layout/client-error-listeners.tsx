import { useEffect } from "react";

import { installClientErrorHandlers } from "@/shared/lib/client-error-reporter";

/** Mounts the page-wide error listeners (unhandled errors and rejections, stale-chunk reload). */
export function ClientErrorListeners() {
  useEffect(() => installClientErrorHandlers(), []);
  return null;
}
