/**
 * GET /api/v1/cases/:caseId/export.zip
 *
 * Downloads a zip of all entity markdown files + evidence for the Case.
 * Auth: session cookie or API key.
 */
import { createFileRoute } from "@tanstack/react-router";
import { Effect } from "effect";
import { zipSync, strToU8 } from "fflate";

import { createApiContext } from "@/auth/api-context.server";
import { runApp } from "@watchdog/api";
import {
  getCaseByIdEffect,
  readArtifactBytesEffect,
  renderCaseExportEffect,
  type DomainTag,
} from "@watchdog/core";

function safeFilename(label: string): string {
  return (
    label
      // oxlint-disable-next-line eslint/no-control-regex -- intentionally strips filesystem-illegal control chars
      .replaceAll(/[<>:"/\\|?*\u0000-\u001F]/g, "_")
      .replaceAll(/\s+/g, "-")
      .slice(0, 80)
  );
}

function evidenceExt(mime: string | null, label: string | null): string {
  if (label) {
    const e = /\.[a-z0-9]+$/i.exec(label)?.[0];
    if (e) return e;
  }
  const map: Record<string, string> = {
    "application/json": ".json",
    "text/plain": ".txt",
    "text/html": ".html",
    "application/pdf": ".pdf",
    "image/png": ".png",
    "image/jpeg": ".jpg",
  };
  return map[mime?.split(";")[0]?.trim() ?? ""] ?? ".bin";
}

type EvidenceZipPart =
  | { kind: "none" }
  | { kind: "skipped" }
  | { kind: "file"; path: string; bytes: Uint8Array };

function evidenceZipPartEffect(
  caseSlug: string,
  ev: {
    id: string;
    uri: string | null;
    label: string | null;
    sourceUrl: string | null;
    mime: string | null;
    text: string | null;
    kind: string;
  }
): Effect.Effect<EvidenceZipPart> {
  const prefix = ev.id.slice(0, 8);
  const labelBase = safeFilename(ev.label ?? ev.sourceUrl ?? ev.id.slice(0, 8));
  if (ev.uri) {
    const uri = ev.uri;
    return readArtifactBytesEffect(uri).pipe(
      Effect.map((bytes) => {
        const ext = evidenceExt(ev.mime, ev.label);
        return {
          kind: "file" as const,
          path: `${caseSlug}/evidence/${prefix}--${labelBase}${ext}`,
          bytes,
        };
      }),
      Effect.orElseSucceed((): EvidenceZipPart => ({ kind: "skipped" }))
    );
  }
  if (ev.text && ev.kind !== "attestation") {
    return Effect.succeed({
      kind: "file",
      path: `${caseSlug}/evidence/${prefix}--${labelBase}.txt`,
      bytes: strToU8(ev.text),
    });
  }
  return Effect.succeed({ kind: "none" });
}

type CaseExportZipResult =
  | { kind: "missing_case" }
  | { kind: "empty" }
  | {
      kind: "ok";
      zipInput: Record<string, Uint8Array>;
      caseSlug: string;
      markdownFiles: number;
      evidenceIncluded: number;
      evidenceSkipped: number;
    };

function caseExportZipEffect(
  caseId: string
): Effect.Effect<CaseExportZipResult, DomainTag> {
  return Effect.gen(function* caseExportZipGen() {
    const activeCase = yield* getCaseByIdEffect(caseId).pipe(
      Effect.catchTag("NotFoundError", () => Effect.succeed(null))
    );
    if (activeCase === null) {
      return { kind: "missing_case" as const };
    }
    const caseSlug = activeCase.slug;
    const { files: mdFiles, evidenceRows } =
      yield* renderCaseExportEffect(caseId);
    if (mdFiles.size === 0) {
      return { kind: "empty" as const };
    }

    const zipInput: Record<string, Uint8Array> = {};
    for (const [path, content] of mdFiles) {
      zipInput[`${caseSlug}/${path}`] = strToU8(content);
    }

    const parts = yield* Effect.forEach(
      evidenceRows,
      (ev) => evidenceZipPartEffect(caseSlug, ev),
      { concurrency: "unbounded" }
    );
    let evidenceIncluded = 0;
    let evidenceSkipped = 0;
    for (const part of parts) {
      switch (part.kind) {
        case "file": {
          zipInput[part.path] = part.bytes;
          evidenceIncluded += 1;
          break;
        }
        case "skipped": {
          evidenceSkipped += 1;
          break;
        }
        case "none": {
          break;
        }
        default: {
          const _exhaustive: never = part;
          return _exhaustive;
        }
      }
    }

    return {
      kind: "ok" as const,
      zipInput,
      caseSlug,
      markdownFiles: mdFiles.size,
      evidenceIncluded,
      evidenceSkipped,
    };
  });
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

        const { caseId } = params;
        const exported = await runApp(caseExportZipEffect(caseId));
        if (exported.kind === "missing_case") {
          return new Response("Not Found", { status: 404 });
        }
        if (exported.kind === "empty") {
          return new Response("No entities to export", { status: 404 });
        }

        ctx.log?.set({
          case: { caseId },
          export: {
            kind: "zip",
            markdownFiles: exported.markdownFiles,
            evidenceIncluded: exported.evidenceIncluded,
            evidenceSkipped: exported.evidenceSkipped,
          },
        });

        const zipped = zipSync(exported.zipInput, { level: 6 });
        const ts = new Date()
          .toISOString()
          .slice(0, 16)
          .replaceAll(/[-T:]/g, "");
        const filename = `${exported.caseSlug}-${ts}.zip`;

        return new Response(zipped, {
          headers: {
            "Content-Type": "application/zip",
            "Content-Disposition": `attachment; filename="${filename}"`,
            "Cache-Control": "no-cache",
          },
        });
      },
    },
  },
});
