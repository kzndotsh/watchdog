import { useEffect } from "react";

import { isServerFailure } from "@/lib/utils";
import { reloadOnceForStaleChunk } from "@/shared/lib/chunk-reload";
import { reportClientError } from "@/shared/lib/client-error-reporter";

/**
 * Side effects of an error boundary showing: a stale-chunk failure reloads the page once; any other
 * failure is reported (a server failure was already logged where it happened, so it is not).
 */
export function useRouteErrorRecovery(error: unknown): void {
  useEffect(() => {
    if (reloadOnceForStaleChunk(error)) return;
    if (!isServerFailure(error)) reportClientError(error, "render");
  }, [error]);
}
