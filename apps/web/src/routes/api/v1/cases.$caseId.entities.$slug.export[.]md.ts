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
import {
  getCaseByIdEffect,
  getEntityByCaseSlugEffect,
  renderEntityMarkdownEffect,
  type DomainTag,
} from "@watchdog/core";

type EntityExportMdResult =
  | { kind: "missing" }
  | { kind: "ok"; markdown: string };

function entityExportMdEffect(
  caseId: string,
  slug: string,
  organizationId: string
): Effect.Effect<EntityExportMdResult, DomainTag> {
  return Effect.gen(function* entityExportMdGen() {
    const scopedCase = yield* getCaseByIdEffect(caseId, organizationId).pipe(
      Effect.catchTag("NotFoundError", () => Effect.succeed(null))
    );
    if (scopedCase === null) {
      return { kind: "missing" as const };
    }
    const entity = yield* getEntityByCaseSlugEffect(
      caseId,
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
