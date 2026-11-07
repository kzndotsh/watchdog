/**
 * GET /api/v1/cases/:caseId/export.zip: wiring only. The handler, with the export's rules, is
 * `serveCaseExport` in `@/lib/case-export.server`.
 */
import { createFileRoute } from "@tanstack/react-router";

import { serveCaseExport } from "@/lib/case-export.server";

export const Route = createFileRoute("/api/v1/cases/$caseId/export.zip")({
  server: {
    handlers: {
      GET: async ({
        request,
        params,
      }: {
        request: Request;
        params: { caseId: string };
      }) => serveCaseExport(request, params),
    },
  },
});
