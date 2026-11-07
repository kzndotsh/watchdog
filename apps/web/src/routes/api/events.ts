/**
 * GET /api/events: the organization-wide activity stream (SSE). The handler is
 * `openActivityStream` in `@/lib/activity-stream.server`; this file only wires it to the
 * router and adds CORS.
 */
import { createFileRoute } from "@tanstack/react-router";

import { openActivityStream } from "@/lib/activity-stream.server";
import {
  applyWatchdogCors,
  corsPreflightResponse,
} from "@/lib/api-cors.server";

export const Route = createFileRoute("/api/events")({
  server: {
    handlers: {
      OPTIONS: async ({ request }: { request: Request }) =>
        (await corsPreflightResponse(request)) ??
        new Response(null, { status: 204 }),
      // Every answer, 401 included, carries CORS headers for a trusted origin only.
      GET: async ({ request }: { request: Request }) =>
        applyWatchdogCors(request, await openActivityStream(request)),
    },
  },
});
