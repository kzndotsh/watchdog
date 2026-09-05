/**
 * export-sync.ts — File system sync for the live Export shadow workspace.
 *
 * Writes rendered entity markdown + evidence files to:
 *   <WD_EXPORT_DIR>/<case-slug>/{persons,infras,orgs}/<entity-slug>.md
 *   <WD_EXPORT_DIR>/<case-slug>/evidence/<id-prefix>--<label>.ext
 */

import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import nodePath from "node:path";

import { Data, Effect, Fiber, SynchronizedRef } from "effect";

import type { EvidenceRow } from "@watchdog/db";
import { env } from "@watchdog/env/server";

import { readArtifactBytesEffect } from "./blob";
import { errorMessage } from "./domain-error";
import { renderCaseExportEffect, renderEntityMarkdownEffect } from "./export";
import { logProcess, logSwallowed } from "./process-log";
import { domainMessageOf } from "./tagged-errors";

export class ExportIOError extends Data.TaggedError("ExportIOError")<{
  readonly reason: string;
}> {}

function mapExportCatch(error: unknown): ExportIOError {
  if (error instanceof ExportIOError) return error;
  return new ExportIOError({ reason: errorMessage(error) });
}

function exportRoot(): string {
  return (
    env.WD_EXPORT_DIR ??
    nodePath.join(new URL("../../../../export", import.meta.url).pathname)
  );
}

function writeEffect(
  path: string,
  content: string | Uint8Array
): Effect.Effect<void, ExportIOError> {
  return Effect.tryPromise({
    try: async () => {
      await mkdir(nodePath.dirname(path), { recursive: true });
      await writeFile(path, content);
    },
    catch: mapExportCatch,
  });
}

export function safeFilename(label: string): string {
  return (
    label
      // oxlint-disable-next-line eslint/no-control-regex -- intentionally strips filesystem-illegal control chars
      .replaceAll(/[<>:"/\\|?*\u0000-\u001F]/g, "_")
      .replaceAll(/\s+/g, "-")
      .slice(0, 80)
  );
}

function evidenceExt(mime: string | null, label: string | null): string {
  if (label !== null) {
    const ext = nodePath.extname(label);
    if (ext) return ext;
  }
  if (mime === null) return ".bin";
  const map: Record<string, string> = {
    "application/json": ".json",
    "text/plain": ".txt",
    "text/html": ".html",
    "text/markdown": ".md",
    "application/pdf": ".pdf",
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/gif": ".gif",
    "image/webp": ".webp",
  };
  const base = mime.split(";")[0]?.trim() ?? "";
  return map[base] ?? ".bin";
}

interface EvidenceExportCounts {
  included: number;
  skipped: number;
}

type EvidenceWriteOutcome = "included" | "skipped" | "none";

function writeUriEvidenceFileEffect(
  caseId: string,
  evidenceDir: string,
  ev: EvidenceRow
): Effect.Effect<EvidenceWriteOutcome> {
  const prefix = ev.id.slice(0, 8);
  const labelBase = safeFilename(ev.label ?? ev.sourceUrl ?? ev.id.slice(0, 8));
  if (!ev.uri) return Effect.succeed("skipped");
  const uri = ev.uri;
  return Effect.gen(function* writeUriEvidenceGen() {
    const bytes = yield* readArtifactBytesEffect(uri);
    const ext = evidenceExt(ev.mime, ev.label);
    const filename = `${prefix}--${labelBase}${ext}`;
    yield* writeEffect(nodePath.join(evidenceDir, filename), bytes);
    return "included" as const;
  }).pipe(
    Effect.tapError((error) =>
      Effect.sync(() => {
        logSwallowed("export-sync.evidence_skip", error, {
          caseId,
          evidenceId: ev.id,
        });
      })
    ),
    Effect.catch(() => Effect.succeed("skipped" as const))
  );
}

function writeInlineEvidenceFileEffect(
  evidenceDir: string,
  ev: EvidenceRow
): Effect.Effect<void, ExportIOError> {
  const prefix = ev.id.slice(0, 8);
  const labelBase = safeFilename(ev.label ?? ev.sourceUrl ?? ev.id.slice(0, 8));
  const filename = `${prefix}--${labelBase}.txt`;
  if (ev.text === null || ev.text === undefined) return Effect.void;
  return writeEffect(nodePath.join(evidenceDir, filename), ev.text);
}

function writeOneEvidenceFileEffect(
  caseId: string,
  evidenceDir: string,
  ev: EvidenceRow
): Effect.Effect<EvidenceWriteOutcome, ExportIOError> {
  if (ev.uri !== null) {
    return writeUriEvidenceFileEffect(caseId, evidenceDir, ev);
  }
  if (ev.text !== null && ev.text !== "" && ev.kind !== "attestation") {
    return writeInlineEvidenceFileEffect(evidenceDir, ev).pipe(
      Effect.as("included" as const)
    );
  }
  return Effect.succeed("none");
}

function writeCaseEvidenceFilesEffect(
  caseId: string,
  evidenceDir: string,
  evidenceRows: EvidenceRow[]
): Effect.Effect<EvidenceExportCounts, ExportIOError> {
  return Effect.gen(function* writeCaseEvidenceFilesGen() {
    const outcomes = yield* Effect.forEach(
      evidenceRows,
      (ev) => writeOneEvidenceFileEffect(caseId, evidenceDir, ev),
      { concurrency: "unbounded" }
    );
    const counts: EvidenceExportCounts = { included: 0, skipped: 0 };
    for (const outcome of outcomes) {
      if (outcome === "included") counts.included += 1;
      else if (outcome === "skipped") counts.skipped += 1;
    }
    return counts;
  });
}

export function writeEntityExportEffect(
  entityId: string
): Effect.Effect<void, ExportIOError> {
  return Effect.gen(function* writeEntityExportGen() {
    const exported = yield* renderEntityMarkdownEffect(entityId).pipe(
      Effect.mapError(
        (error) => new ExportIOError({ reason: domainMessageOf(error) })
      )
    );
    if (!exported) return;
    const kindDir = `${exported.kind}s`;
    const path = nodePath.join(
      exportRoot(),
      exported.caseSlug,
      kindDir,
      `${exported.entitySlug}.md`
    );
    yield* writeEffect(path, exported.markdown);
  });
}

export function writeCaseExportEffect(
  caseId: string
): Effect.Effect<void, ExportIOError> {
  return Effect.gen(function* writeCaseExportGen() {
    const { files: mdFiles, evidenceRows } = yield* renderCaseExportEffect(
      caseId
    ).pipe(
      Effect.mapError(
        (error) => new ExportIOError({ reason: domainMessageOf(error) })
      )
    );
    if (mdFiles.size === 0) return;

    const caseMd = mdFiles.get("CASE.md") ?? "";
    const match = /^slug: (.+)$/m.exec(caseMd);
    const caseSlug = match?.[1]?.trim();
    if (caseSlug === undefined || caseSlug === "") return;

    const root = nodePath.join(exportRoot(), caseSlug);

    yield* Effect.forEach(
      [...mdFiles],
      ([relPath, content]) =>
        writeEffect(nodePath.join(root, relPath), content),
      { concurrency: "unbounded" }
    );

    const evidenceDir = nodePath.join(root, "evidence");
    yield* Effect.tryPromise({
      try: () => mkdir(evidenceDir, { recursive: true }),
      catch: mapExportCatch,
    });

    const { included: evidenceIncluded, skipped: evidenceSkipped } =
      yield* writeCaseEvidenceFilesEffect(caseId, evidenceDir, evidenceRows);

    if (evidenceSkipped > 0) {
      yield* Effect.sync(() => {
        logProcess("export-sync", "evidence blob skips during case export", {
          caseId,
          evidenceIncluded,
          evidenceSkipped,
        });
      });
    }
  });
}

interface ExportCoalesceState {
  dirty: Set<string>;
  inFlight: Map<string, Fiber.Fiber<void>>;
}

const exportCoalesce = SynchronizedRef.makeUnsafe({
  dirty: new Set<string>(),
  inFlight: new Map<string, Fiber.Fiber<void>>(),
});

function withDirty(
  state: ExportCoalesceState,
  caseId: string
): ExportCoalesceState {
  return { dirty: new Set([...state.dirty, caseId]), inFlight: state.inFlight };
}

function writeExportEffect(
  caseId: string,
  writeExport: (id: string) => Effect.Effect<void, ExportIOError>
): Effect.Effect<void> {
  return writeExport(caseId).pipe(
    Effect.tapError((error) =>
      Effect.sync(() => {
        logSwallowed("export-sync.write", error, { caseId });
      })
    ),
    Effect.ignore
  );
}

function exportLoop(
  caseId: string,
  writeExport: (id: string) => Effect.Effect<void, ExportIOError>
): Effect.Effect<void> {
  return Effect.gen(function* exportLoopGen() {
    while (true) {
      const step = yield* SynchronizedRef.modify(exportCoalesce, (current) => {
        if (current.dirty.has(caseId)) {
          const dirty = new Set(current.dirty);
          dirty.delete(caseId);
          return ["write", { dirty, inFlight: current.inFlight }] as const;
        }
        const inFlight = new Map(current.inFlight);
        inFlight.delete(caseId);
        return ["done", { dirty: current.dirty, inFlight }] as const;
      });
      if (step === "done") {
        break;
      }
      yield* writeExportEffect(caseId, writeExport);
    }
  });
}

function claimExportJoin(
  caseId: string,
  writeExport: (id: string) => Effect.Effect<void, ExportIOError>
): Effect.Effect<Effect.Effect<void>> {
  return SynchronizedRef.modifyEffect(exportCoalesce, (state) => {
    const marked = withDirty(state, caseId);
    const existing = marked.inFlight.get(caseId);
    if (existing !== undefined) {
      return Effect.succeed([Fiber.join(existing), marked] as const);
    }

    return Effect.gen(function* startExportFiberGen() {
      const fiber = yield* exportLoop(caseId, writeExport).pipe(
        Effect.forkDetach({ startImmediately: true })
      );
      const inFlight = new Map([...marked.inFlight, [caseId, fiber]]);
      return [Fiber.join(fiber), { dirty: marked.dirty, inFlight }] as const;
    });
  });
}

/**
 * Schedule a Case export write. Concurrent calls for the same case coalesce
 * into one in-flight write, then at most one follow-up if more events arrived.
 * `writeExport` is injectable so unit tests can assert coalesce without MinIO.
 *
 * Marks dirty and starts-or-joins the write fiber when this function is
 * called, not when the returned Effect is interpreted. Fire-and-forget
 * (`void Effect.runPromise(scheduleCaseExportEffect(id))`) must coalesce
 * concurrent marks before the caller yields.
 */
export function scheduleCaseExportEffect(
  caseId: string,
  writeExport: (
    id: string
  ) => Effect.Effect<void, ExportIOError> = writeCaseExportEffect
): Effect.Effect<void> {
  return Effect.runSync(claimExportJoin(caseId, writeExport));
}

function exportDirForSlug(slug: string): string | null {
  const root = nodePath.resolve(exportRoot());
  const dir = nodePath.resolve(root, slug);
  if (dir === root || !dir.startsWith(`${root}${nodePath.sep}`)) {
    return null;
  }
  return dir;
}

/** Best-effort: drop the live Export shadow dir for a deleted Case. */
export function removeCaseExportDirEffect(
  slug: string
): Effect.Effect<void, ExportIOError> {
  const dir = exportDirForSlug(slug);
  if (dir === null) return Effect.void;
  return Effect.tryPromise({
    try: () => rm(dir, { recursive: true, force: true }),
    catch: mapExportCatch,
  });
}

/** Best-effort: move the Export shadow dir when a Case slug changes. */
export function renameCaseExportDirEffect(
  fromSlug: string,
  toSlug: string
): Effect.Effect<void, ExportIOError> {
  if (fromSlug === toSlug) return Effect.void;
  const from = exportDirForSlug(fromSlug);
  const to = exportDirForSlug(toSlug);
  if (from === null || to === null) return Effect.void;
  return Effect.gen(function* renameCaseExportDirGen() {
    yield* Effect.tryPromise({
      try: () => rm(to, { recursive: true, force: true }),
      catch: mapExportCatch,
    });
    yield* Effect.tryPromise({
      try: async () => {
        try {
          await rename(from, to);
        } catch (error) {
          if (
            error instanceof Error &&
            "code" in error &&
            error.code === "ENOENT"
          ) {
            return;
          }
          throw error;
        }
      },
      catch: mapExportCatch,
    });
  });
}
