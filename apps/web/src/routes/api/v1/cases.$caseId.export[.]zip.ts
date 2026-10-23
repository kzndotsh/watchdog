import { createFileRoute } from "@tanstack/react-router";

import { createApiContext } from "@/auth/api-context.server";
import { caseExportDownloadPath } from "@/shared/lib/api-urls";
import {
  actorKeyIdFromContext,
  actorLabelFromContext,
  jobStartLimitResponse,
  runApp,
} from "@watchdog/api";
import {
  measureCaseExportEffect,
  startCaseExportJobEffect,
  writeCaseExportZipEffect,
  type ZipSink,
} from "@watchdog/core/export";
/**
 * GET /api/v1/cases/:caseId/export.zip
 *
 * A Case whose Evidence is under `WD_EXPORT_INLINE_MAX_MB` is streamed as a zip: the response
 * body is written as the archive is built, so memory does not grow with the Case. A bigger Case
 * answers 202 with the id of an export Job (`system.case_export`) that builds the archive on the
 * worker; `…/exports/:jobId` is its status and, once it is ready, its expiring download link.
 * Auth: session cookie or API key (`cases:read`).
 */
import {
  type CaseId,
  parseTrimmedCaseId,
  requireScope,
} from "@watchdog/schemas/shared";

type ExportBody = {
  readonly readable: ReadableStream<Uint8Array>;
  readonly sink: ZipSink;
  readonly abort: (reason: unknown) => Promise<void>;
};

/** A response body fed by the export: a write waits while the client is not reading. */
function exportBody(): ExportBody {
  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>(
    undefined,
    { highWaterMark: 1 },
    { highWaterMark: 0 }
  );
  const writer = writable.getWriter();
  return {
    readable,
    sink: {
      write: async (chunk) => writer.write(chunk),
      end: async () => writer.close(),
    },
    abort: async (reason) => {
      try {
        await writer.abort(reason);
      } catch {
        // The client already hung up: nothing is reading.
      }
    },
  };
}

type ExportLog = { set: (fields: Record<string, unknown>) => void } | undefined;

/**
 * Run the export into the body. A failure after the headers went out cannot change the status:
 * it breaks the body, so the client sees a failed download, never a short archive that looks
 * complete.
 */
async function pumpExport(
  caseId: CaseId,
  body: ExportBody,
  log: ExportLog
): Promise<void> {
  try {
    const stats = await runApp(writeCaseExportZipEffect(caseId, body.sink));
    log?.set({
      case: { caseId },
      export: {
        kind: "zip",
        markdownFiles: stats.markdownFiles,
        evidenceIncluded: stats.evidenceIncluded,
        evidenceSkipped: stats.evidenceSkipped,
      },
    });
  } catch (error) {
    await body.abort(error);
  }
}

function exportFilename(caseSlug: string): string {
  const ts = new Date().toISOString().slice(0, 16).replaceAll(/[-T:]/g, "");
  return `${caseSlug}-${ts}.zip`;
}

export const Route = createFileRoute("/api/v1/cases/$caseId/export.zip")({
  server: {
    handlers: {
      GET: async ({
        request,
        params,
      }: {
        request: Request;
        params: { caseId: string };
      }) => {
        const ctx = await createApiContext(request);
        if (!ctx.actor) return new Response("Unauthorized", { status: 401 });
        if (!ctx.actor.organizationId) {
          return new Response("Forbidden", { status: 403 });
        }
        const denied = requireScope(ctx.credential, "cases:read");
        if (denied) return denied;

        // Route params are plain strings: brand at the edge, 404 when not a case id.
        const caseId: CaseId | null = parseTrimmedCaseId(params.caseId);
        if (caseId === null) {
          return new Response("Not Found", { status: 404 });
        }
        const { organizationId } = ctx.actor;
        const measured = await runApp(
          measureCaseExportEffect(caseId, organizationId)
        );
        if (measured.kind === "missing_case") {
          return new Response("Not Found", { status: 404 });
        }

        if (measured.overLimit) {
          const started = await runApp(
            startCaseExportJobEffect({
              caseId,
              organizationId,
              actorId: ctx.actor.userId,
              actorLabel: actorLabelFromContext({
                actor: ctx.actor,
                credential: ctx.credential,
              }),
              actorKeyId: actorKeyIdFromContext({
                actor: ctx.actor,
                credential: ctx.credential,
              }),
            })
          ).catch((error: unknown) => {
            // The export Job is a start like any other: over the limit it is 429 + Retry-After.
            const refused = jobStartLimitResponse(error);
            if (refused === null) throw error;
            return refused;
          });
          if (started instanceof Response) return started;
          const statusUrl = caseExportDownloadPath(caseId, started.jobId);
          ctx.log?.set({
            case: { caseId },
            export: {
              kind: "job",
              jobId: started.jobId,
              joined: !started.created,
            },
          });
          return Response.json(
            {
              jobId: started.jobId,
              status: started.status,
              statusUrl,
              message:
                "This Case is too large to download directly. The export runs as a Job; poll statusUrl, or watch Recent activity, for the download link.",
            },
            {
              status: 202,
              headers: { Location: statusUrl, "Retry-After": "30" },
            }
          );
        }

        const body = exportBody();
        void pumpExport(caseId, body, ctx.log);

        return new Response(body.readable, {
          headers: {
            "Content-Type": "application/zip",
            "Content-Disposition": `attachment; filename="${exportFilename(measured.caseSlug)}"`,
            "Cache-Control": "no-cache",
          },
        });
      },
    },
  },
});
