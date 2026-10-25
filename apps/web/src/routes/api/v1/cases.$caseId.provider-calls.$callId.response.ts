import { createFileRoute } from "@tanstack/react-router";
import { Effect } from "effect";

import { createApiContext } from "@/auth/api-context.server";
import { providerResponseHeaders } from "@/lib/provider-response-headers.server";
import { runApp } from "@watchdog/api";
/**
 * GET /api/v1/cases/:caseId/provider-calls/:callId/response
 *
 * The raw response a provider sent to a Job, when it was stored (`body_state = stored`). It is
 * always an attachment of generic bytes (`application/octet-stream`, `nosniff`), never rendered
 * by the browser: the provider's own content type lives in the call's record, not in this
 * response. A call that is not in the caller's organization's Case, has no stored body or does
 * not exist is the same 404.
 * Auth: session cookie or API key (`cases:read`).
 */
import { getProviderCallResponseEffect } from "@watchdog/core/jobs";
import {
  parseTrimmedCaseId,
  parseTrimmedUuid,
  requireScope,
} from "@watchdog/schemas/shared";

export const Route = createFileRoute(
  "/api/v1/cases/$caseId/provider-calls/$callId/response"
)({
  server: {
    handlers: {
      GET: async ({
        request,
        params,
      }: {
        request: Request;
        params: { caseId: string; callId: string };
      }) => {
        const ctx = await createApiContext(request);
        if (!ctx.actor) return new Response("Unauthorized", { status: 401 });
        if (!ctx.actor.organizationId) {
          return new Response("Forbidden", { status: 403 });
        }
        const denied = requireScope(ctx.credential, "cases:read");
        if (denied) return denied;

        const caseId = parseTrimmedCaseId(params.caseId);
        const callId = parseTrimmedUuid(params.callId);
        if (caseId === null || callId === null) {
          return new Response("Not Found", { status: 404 });
        }
        const response = await runApp(
          getProviderCallResponseEffect(
            caseId,
            ctx.actor.organizationId,
            callId
          ).pipe(Effect.catchTag("NotFoundError", () => Effect.succeed(null)))
        );
        if (response === null)
          return new Response("Not Found", { status: 404 });

        // A copy into a plain ArrayBuffer, which is what `BodyInit` accepts.
        return new Response(Uint8Array.from(response.bytes), {
          headers: providerResponseHeaders(callId, response),
        });
      },
    },
  },
});
