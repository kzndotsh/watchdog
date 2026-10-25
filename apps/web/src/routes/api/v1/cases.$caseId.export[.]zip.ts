import { createFileRoute } from "@tanstack/react-router";

import { createApiContext } from "@/auth/api-context.server";
import {
  BREACH_CREDENTIALS_PARAM,
  caseExportDownloadPath,
  RAW_BODIES_PARAM,
} from "@/shared/lib/api-urls";
import {
  actorKeyIdFromContext,
  actorLabelFromContext,
  jobStartLimitResponse,
  refusalResponse,
  runApp,
} from "@watchdog/api";
import {
  caseExportSettings,
  measureCaseExportEffect,
  requireBreachCredentialOptInEffect,
  requireRawBodyOptInEffect,
  startCaseExportJobEffect,
  writeCaseExportZipEffect,
  type CaseExportOptions,
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
 *
 * The archive always carries `provider-calls.jsonl`, `ATTRIBUTION.md` and `VERIFY.md`. Raw
 * provider responses are added only with `?rawBodies=1`, which a signed-in owner or admin may
 * ask for (403 for a key or anyone else), and then only the ones each host's terms allow.
 *
 * Breach Evidence (files of `breach.*` Caps) is written with its credential fields cut to
 * attributes (present, kind, length, fingerprint). `?breachCredentials=1` keeps the stored
 * passwords and hashes instead: the same owner-or-admin gate (403 for a key or anyone else), and
 * 400 unless the instance runs `WD_BREACH_CAPS=full`.
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
  log: ExportLog,
  options: CaseExportOptions
): Promise<void> {
  try {
    const stats = await runApp(
      writeCaseExportZipEffect(caseId, body.sink, caseExportSettings(), options)
    );
    log?.set({
      case: { caseId },
      export: {
        kind: "zip",
        markdownFiles: stats.markdownFiles,
        evidenceIncluded: stats.evidenceIncluded,
        evidenceSkipped: stats.evidenceSkipped,
        providerCalls: stats.providerCalls,
        rawBodiesIncluded: stats.rawBodiesIncluded,
        rawBodiesWithheld: stats.rawBodiesWithheld,
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
        // The per-Export opt-in for raw provider responses: a signed-in owner or admin only. A
        // key, a member and anyone else is refused here, before anything is measured or built.
        const query = new URL(request.url).searchParams;
        const shouldIncludeRawBodies = query.get(RAW_BODIES_PARAM) === "1";
        const shouldIncludeBreachCredentials =
          query.get(BREACH_CREDENTIALS_PARAM) === "1";
        const options: CaseExportOptions = {
          shouldIncludeRawBodies,
          shouldIncludeBreachCredentials,
        };
        const optIn = {
          organizationId,
          actorId: ctx.actor.userId,
          viaApiKey: ctx.credential.kind === "apiKey",
        };
        for (const gate of [
          shouldIncludeRawBodies ? requireRawBodyOptInEffect(optIn) : null,
          shouldIncludeBreachCredentials
            ? requireBreachCredentialOptInEffect(optIn)
            : null,
        ]) {
          if (gate === null) continue;
          // oxlint-disable-next-line eslint/no-await-in-loop -- the first refusal ends the request
          const refused = await runApp(gate).then(
            () => null,
            (error: unknown) => {
              const response = refusalResponse(error);
              if (response === null) throw error;
              return response;
            }
          );
          if (refused !== null) return refused;
        }
        const measured = await runApp(
          measureCaseExportEffect(
            caseId,
            organizationId,
            caseExportSettings(),
            options
          )
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
              shouldIncludeRawBodies,
              shouldIncludeBreachCredentials,
            })
          ).catch((error: unknown) => {
            // The export Job is a start like any other: over the limit it is 429 + Retry-After.
            // An open export with other options is a 409 the caller retries after it ends.
            const refused =
              jobStartLimitResponse(error) ?? refusalResponse(error);
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
        void pumpExport(caseId, body, ctx.log, options);

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
