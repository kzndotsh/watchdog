/**
 * GET /api/v1/cases/:caseId/entities/:slug/export.md
 *
 * Returns the entity as an Obsidian-style markdown note.
 * Auth: session cookie or API key (`cases:read`).
 */
import { createFileRoute } from "@tanstack/react-router";
import { Effect } from "effect";

import { createApiContext } from "@/auth/api-context.server";
import {
  type CaseId,
  type OrganizationId,
  parseTrimmedCaseId,
  requireScope,
} from "@watchdog/domain/schemas/shared";
import { runAppAs } from "@watchdog/server/api";
import { getCaseByIdEffect } from "@watchdog/server/core/cases";
import type { DomainTag } from "@watchdog/server/core/errors";
import { renderEntityMarkdownEffect } from "@watchdog/server/core/export";
import { getEntityByCaseSlugEffect } from "@watchdog/server/core/graph";
import { inOrganization, type Db } from "@watchdog/server/core/infra";

type EntityExportMdResult =
  | { kind: "missing" }
  | { kind: "ok"; markdown: string };

function entityExportMdEffect(
  caseId: CaseId,
  slug: string,
  organizationId: OrganizationId
): Effect.Effect<EntityExportMdResult, DomainTag, Db> {
  // The whole read in the caller's organization (row-level security): the rendering reads the
  // Entity's Claims, which only a scoped statement sees.
  const program = Effect.gen(function* entityExportMdGen() {
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
  return inOrganization(organizationId, program);
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
        const denied = requireScope(ctx.credential, "cases:read");
        if (denied) return denied;

        const { slug } = params;
        // Route params are plain strings: brand at the edge, 404 when not a case id.
        const caseId = parseTrimmedCaseId(params.caseId);
        if (caseId === null) {
          return new Response("Not Found", { status: 404 });
        }
        const exported = await runAppAs(
          ctx.credential,
          "cases:read"
        )(entityExportMdEffect(caseId, slug, ctx.actor.organizationId));
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
