import { createFileRoute } from "@tanstack/react-router";
import { Effect } from "effect";

import { createApiContext } from "@/auth/api-context.server";
import { runApp } from "@watchdog/api";
/**
 * GET /api/v1/cases/:caseId/exports/:jobId
 *
 * The status and the download link of a large Case export (the Job `export.zip` answers 202
 * with). Ready: 302 to a short-lived signed URL of the archive. Not ready: 202. Ended without an
 * archive: 409. Past `WD_EXPORT_LINK_TTL_HOURS` after it finished: 410.
 * Auth: session cookie or API key (`cases:read`).
 */
import { caseExportLinkEffect } from "@watchdog/core/export";
import {
  parseTrimmedCaseId,
  parseTrimmedUuid,
  requireScope,
} from "@watchdog/schemas/shared";

export const Route = createFileRoute("/api/v1/cases/$caseId/exports/$jobId")({
  server: {
    handlers: {
      GET: async ({
        request,
        params,
      }: {
        request: Request;
        params: { caseId: string; jobId: string };
      }) => {
        const ctx = await createApiContext(request);
        if (!ctx.actor) return new Response("Unauthorized", { status: 401 });
        if (!ctx.actor.organizationId) {
          return new Response("Forbidden", { status: 403 });
        }
        const denied = requireScope(ctx.credential, "cases:read");
        if (denied) return denied;

        const caseId = parseTrimmedCaseId(params.caseId);
        const jobId = parseTrimmedUuid(params.jobId);
        if (caseId === null || jobId === null) {
          return new Response("Not Found", { status: 404 });
        }
        const link = await runApp(
          caseExportLinkEffect({
            caseId,
            organizationId: ctx.actor.organizationId,
            jobId,
          }).pipe(Effect.catchTag("NotFoundError", () => Effect.succeed(null)))
        );
        if (link === null) return new Response("Not Found", { status: 404 });

        switch (link.kind) {
          case "pending": {
            return Response.json(
              { jobId, status: link.status },
              { status: 202, headers: { "Retry-After": "30" } }
            );
          }
          case "ended": {
            return Response.json(
              { jobId, status: link.status, error: link.error },
              { status: 409 }
            );
          }
          case "expired": {
            return Response.json(
              {
                jobId,
                error: "The download link has expired.",
                expiredAt: link.expiredAt,
              },
              { status: 410 }
            );
          }
          case "ready": {
            return new Response(null, {
              status: 302,
              headers: {
                Location: link.url,
                "Cache-Control": "no-store",
                "X-Export-Expires": link.expiresAt,
              },
            });
          }
          default: {
            return link satisfies never;
          }
        }
      },
    },
  },
});
