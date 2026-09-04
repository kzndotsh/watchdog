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
  getEntityByCaseSlugEffect,
  renderEntityMarkdownEffect,
  type DomainTag,
} from "@watchdog/core";

type EntityExportMdResult =
  | { kind: "missing" }
  | { kind: "ok"; markdown: string };

function entityExportMdEffect(
  caseId: string,
  slug: string
): Effect.Effect<EntityExportMdResult, DomainTag> {
  return Effect.gen(function* entityExportMdGen() {
    const entity = yield* getEntityByCaseSlugEffect(caseId, slug).pipe(
      Effect.catchTag("NotFoundError", () => Effect.succeed(null))
    );
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

        const { caseId, slug } = params;
        const exported = await runApp(entityExportMdEffect(caseId, slug));
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
