/**
 * GET /api/v1/cases/:caseId/entities/:slug/export.md
 *
 * Returns the entity as an Obsidian-style markdown note.
 * Auth: session cookie or API key.
 */
import { createFileRoute } from "@tanstack/react-router";
import { Effect } from "effect";

import { createApiContext } from "@/auth/api-context.server";
import { runApp } from "@watchdog/api";
import { getCaseByIdEffect } from "@watchdog/core/cases";
import type { DomainTag } from "@watchdog/core/errors";
import { renderEntityMarkdownEffect } from "@watchdog/core/export";
import { getEntityByCaseSlugEffect } from "@watchdog/core/graph";
import type { Db } from "@watchdog/core/infra";
import {
  type OrganizationId,
  parseTrimmedCaseId,
} from "@watchdog/schemas/shared";

type EntityExportMdResult =
  | { kind: "missing" }
  | { kind: "ok"; markdown: string };

function entityExportMdEffect(
  caseId: string,
  slug: string,
  organizationId: OrganizationId
): Effect.Effect<EntityExportMdResult, DomainTag, Db> {
  return Effect.gen(function* entityExportMdGen() {
    const scopedCaseId = parseTrimmedCaseId(caseId);
    if (scopedCaseId === null) {
      return { kind: "missing" as const };
    }
    const scopedCase = yield* getCaseByIdEffect(
      scopedCaseId,
      organizationId
    ).pipe(Effect.catchTag("NotFoundError", () => Effect.succeed(null)));
    if (scopedCase === null) {
      return { kind: "missing" as const };
    }
    const entity = yield* getEntityByCaseSlugEffect(
      scopedCaseId,
      organizationId,
      slug
    ).pipe(Effect.catchTag("NotFoundError", () => Effect.succeed(null)));

    if (entity === null) {
      return { kind: "missing" as const };
    }
    const exported = yield* renderEntityMarkdownEffect(entity.id);
    if (!exported) {
      return { kind: "missing" as const };
    }
    return { kind: "ok" as const, markdown: exported.markdown };
  });
}

export const Route = createFileRoute(
  "/api/v1/cases/$caseId/entities/$slug/export.md"
)({
  server: {
    handlers: {
      GET: async ({
        request,
        params,
      }: {
        request: Request;
        params: { caseId: string; slug: string };
      }) => {
        const ctx = await createApiContext(request);
        if (!ctx.actor) {
          return new Response("Unauthorized", { status: 401 });
        }
        if (!ctx.actor.organizationId) {
          return new Response("Forbidden", { status: 403 });
        }

        const { caseId, slug } = params;
        const exported = await runApp(
          entityExportMdEffect(caseId, slug, ctx.actor.organizationId)
        );
        if (exported.kind === "missing") {
          return new Response("Not Found", { status: 404 });
        }

        return new Response(exported.markdown, {
          headers: {
            "Content-Type": "text/markdown; charset=utf-8",
            "Content-Disposition": `attachment; filename="${slug}-${new Date().toISOString().slice(0, 16).replaceAll(/[-T:]/g, "")}.md"`,
            "Cache-Control": "no-cache",
          },
        });
      },
    },
  },
});
